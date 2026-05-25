#!/usr/bin/env node
/**
 * Provision the registry root signing keypair for the publisher
 * signing flow. Generates an Ed25519 keypair locally (in this Node
 * process — the private key never goes over the network in cleartext)
 * and stores both halves in AWS SSM Parameter Store as SecureString.
 *
 * Idempotent — if either parameter is already present, the script
 * refuses to overwrite and exits non-zero. To rotate, delete the
 * existing parameters in SSM first.
 *
 * Usage:
 *   node scripts/init-publisher-root-key.mjs
 *
 * Required env:
 *   AWS_REGION                  (defaults to us-east-1)
 *   AWS credentials              (any of the standard chains:
 *                                 profile, role, env vars)
 *
 * After this runs, the dash-electron binary needs the printed
 * REGISTRY_ROOT_PUBLIC_KEY value bundled in as its trust anchor (see
 * docs/SIGNING.md for the rollout sequence).
 */
import {
    SSMClient,
    GetParameterCommand,
    PutParameterCommand,
    ParameterNotFound,
} from "@aws-sdk/client-ssm";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

// @noble/ed25519 v3 requires the consumer to wire SHA-512 explicitly.
ed.hashes.sha512 = (msg) => sha512(msg);

const PRIVATE_KEY_PARAM = "/dash-registry/PUBLISHER_ROOT_PRIVATE_KEY";
const PUBLIC_KEY_PARAM = "/dash-registry/PUBLISHER_ROOT_PUBLIC_KEY";

const ssm = new SSMClient({ region: process.env.AWS_REGION || "us-east-1" });

async function exists(name) {
    try {
        await ssm.send(
            new GetParameterCommand({ Name: name, WithDecryption: false }),
        );
        return true;
    } catch (err) {
        if (err instanceof ParameterNotFound) return false;
        if (err?.name === "ParameterNotFound") return false;
        throw err;
    }
}

async function putSecure(name, value) {
    await ssm.send(
        new PutParameterCommand({
            Name: name,
            Value: value,
            Type: "SecureString",
            Overwrite: false,
            Description:
                "Dash Registry publisher signing root key. " +
                "Provisioned by scripts/init-publisher-root-key.mjs.",
        }),
    );
}

async function main() {
    const [privExists, pubExists] = await Promise.all([
        exists(PRIVATE_KEY_PARAM),
        exists(PUBLIC_KEY_PARAM),
    ]);

    if (privExists || pubExists) {
        console.error(
            "Refusing to overwrite existing root key.\n" +
                `  ${PRIVATE_KEY_PARAM}: ${privExists ? "exists" : "missing"}\n` +
                `  ${PUBLIC_KEY_PARAM}:  ${pubExists ? "exists" : "missing"}\n` +
                "Delete both parameters in SSM if you intend to rotate.",
        );
        process.exit(1);
    }

    console.log("Generating Ed25519 keypair...");
    const privateBytes = ed.utils.randomSecretKey();
    const publicBytes = await ed.getPublicKeyAsync(privateBytes);

    const privateKey = Buffer.from(privateBytes).toString("base64");
    const publicKey = Buffer.from(publicBytes).toString("base64");

    console.log(`Writing ${PRIVATE_KEY_PARAM}...`);
    await putSecure(PRIVATE_KEY_PARAM, privateKey);
    console.log(`Writing ${PUBLIC_KEY_PARAM}...`);
    await putSecure(PUBLIC_KEY_PARAM, publicKey);

    console.log("\n✓ Root key provisioned.");
    console.log(
        "\nNext step: bundle the following PUBLIC key into the dash-electron",
    );
    console.log(
        "binary as the only trust anchor for publisher cert verification.",
    );
    console.log("\nREGISTRY_ROOT_PUBLIC_KEY:");
    console.log(publicKey);
    console.log("\n(The private key has been stored in SSM and is not echoed.)");
}

main().catch((err) => {
    console.error("Failed to provision root key:", err);
    process.exit(1);
});
