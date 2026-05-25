/**
 * Runtime loader for the registry root signing keypair.
 *
 * The keypair is provisioned once via `scripts/init-publisher-root-key.mjs`
 * and stored in AWS SSM Parameter Store as SecureString at:
 *
 *   /dash-registry/PUBLISHER_ROOT_PRIVATE_KEY  (base64 Ed25519)
 *   /dash-registry/PUBLISHER_ROOT_PUBLIC_KEY   (base64 Ed25519)
 *
 * The Next.js API route handlers that issue or verify publisher certs
 * call `getRegistryRootKeys()` on each invocation; the result is cached
 * in-process for `CACHE_TTL_MS` to avoid hitting SSM per request.
 *
 * Local development override: set `REGISTRY_ROOT_PRIVATE_KEY` and
 * `REGISTRY_ROOT_PUBLIC_KEY` env vars; SSM is not consulted when both
 * are present.
 */
import {
    SSMClient,
    GetParameterCommand,
    GetParametersCommand,
} from "@aws-sdk/client-ssm";

const PRIVATE_KEY_PARAM = "/dash-registry/PUBLISHER_ROOT_PRIVATE_KEY";
const PUBLIC_KEY_PARAM = "/dash-registry/PUBLISHER_ROOT_PUBLIC_KEY";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedKeys {
    privateKey: string;
    publicKey: string;
    expiresAt: number;
}

let cache: CachedKeys | null = null;
let ssm: SSMClient | null = null;

function getSsmClient(): SSMClient {
    if (!ssm) {
        ssm = new SSMClient({
            region: process.env.AWS_REGION || "us-east-1",
        });
    }
    return ssm;
}

export interface RegistryRootKeys {
    privateKey: string; // base64
    publicKey: string; // base64
}

/**
 * Returns the registry root signing keys, cached for CACHE_TTL_MS.
 * Throws if neither env vars nor SSM resolves both parameters.
 */
export async function getRegistryRootKeys(): Promise<RegistryRootKeys> {
    const envPriv = process.env.REGISTRY_ROOT_PRIVATE_KEY;
    const envPub = process.env.REGISTRY_ROOT_PUBLIC_KEY;
    if (envPriv && envPub) {
        return { privateKey: envPriv, publicKey: envPub };
    }

    const now = Date.now();
    if (cache && cache.expiresAt > now) {
        return { privateKey: cache.privateKey, publicKey: cache.publicKey };
    }

    const client = getSsmClient();
    const result = await client.send(
        new GetParametersCommand({
            Names: [PRIVATE_KEY_PARAM, PUBLIC_KEY_PARAM],
            WithDecryption: true,
        }),
    );

    const params = new Map<string, string>();
    for (const p of result.Parameters || []) {
        if (p.Name && p.Value) params.set(p.Name, p.Value);
    }

    const privateKey = params.get(PRIVATE_KEY_PARAM);
    const publicKey = params.get(PUBLIC_KEY_PARAM);

    if (!privateKey || !publicKey) {
        const missing = [
            !privateKey && PRIVATE_KEY_PARAM,
            !publicKey && PUBLIC_KEY_PARAM,
        ]
            .filter(Boolean)
            .join(", ");
        throw new Error(
            `Registry root key not provisioned. Missing SSM parameter(s): ${missing}. ` +
                `Run scripts/init-publisher-root-key.mjs to provision.`,
        );
    }

    cache = { privateKey, publicKey, expiresAt: now + CACHE_TTL_MS };
    return { privateKey, publicKey };
}

/**
 * Public-key-only variant for the public revocation-status endpoint
 * and any other read-only verifiers (avoids touching the private-key
 * parameter at all, even cached).
 */
export async function getRegistryRootPublicKey(): Promise<string> {
    const env = process.env.REGISTRY_ROOT_PUBLIC_KEY;
    if (env) return env;

    const now = Date.now();
    if (cache && cache.expiresAt > now) return cache.publicKey;

    const client = getSsmClient();
    const result = await client.send(
        new GetParameterCommand({
            Name: PUBLIC_KEY_PARAM,
            WithDecryption: true,
        }),
    );
    const publicKey = result.Parameter?.Value;
    if (!publicKey) {
        throw new Error(
            `Registry root public key not provisioned. ` +
                `Run scripts/init-publisher-root-key.mjs to provision.`,
        );
    }
    return publicKey;
}

/**
 * Test/dev helper: reset the in-process cache. Not exported on the
 * public API surface; consumers should not call this in production.
 */
export function _resetCacheForTests(): void {
    cache = null;
}
