# Publisher Signing

Widget packages published to the registry are signed by the publisher
and verified by every installer before mount. The threat model and
key-management architecture are described in
`~/.claude/plans/yes-i-do-like-lively-dream.md` (Phase 1 decision #4).
This document is the operator-facing reference for what's in this repo.

## Architecture

Two layers of Ed25519 keys.

```
        ┌─────────────────────────────────────┐
        │  Registry Root Keypair              │   one secret, held by us
        │  (priv in SSM, pub bundled in app)  │
        └──────────────┬──────────────────────┘
                       │ signs
                       ▼
        ┌─────────────────────────────────────┐
        │  Publisher Cert                     │   one per (publisher, machine)
        │  (signed statement: this pubkey     │
        │   belongs to this publisher)        │
        └──────────────┬──────────────────────┘
                       │ signs
                       ▼
        ┌─────────────────────────────────────┐
        │  ZIP signature                      │   one per widget version
        │  (Ed25519 over sha256(zip bytes))   │
        └─────────────────────────────────────┘
```

- **Registry root key** — single Ed25519 keypair owned by the registry
  operator. Provisioned once via `scripts/init-publisher-root-key.mjs`.
  Private half lives in SSM as a SecureString. Public half is bundled
  into the dash-electron binary as the only trust anchor.

- **Publisher key** — Ed25519 keypair generated locally on the
  publisher's machine the first time they click Publish. Private half
  is encrypted via Electron `safeStorage` and stored in
  `electron-store`. Public half is registered with the registry via
  `POST /api/publishers/keys/issue-cert`, which signs it with the
  registry root key and returns a `PublisherCert`.

- **ZIP signature** — created on the publisher's machine over
  `sha256(zip)` using the publisher's private key. Uploaded alongside
  the cert as part of `POST /api/publish`.

## Cert format

A `PublisherCert` is a JSON object with two top-level fields:

```json
{
  "body": {
    "v": 1,
    "publisher_id": "<cognito sub>",
    "public_key": "<base64 Ed25519>",
    "fingerprint": "<hex sha256(public_key bytes)>",
    "issued_at": "<ISO8601>",
    "expires_at": "<ISO8601, default +2y>"
  },
  "sig": "<base64 Ed25519 sig over canonical-JSON(body)>"
}
```

The signature is computed against a *canonical* JSON serialization of
the body (sorted keys, no whitespace) — see
`src/lib/crypto.ts:canonicalJsonStringify`.

The format is intentionally simple. We considered ASN.1 / X.509 and
rejected them: we don't need TLS interop, the cert is consumed only by
our own installer, and a small JSON envelope keeps the implementation
auditable.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/publishers/keys/issue-cert` | Cognito JWT | Body `{publicKey, machineLabel}`. Returns `{keyId, fingerprint, cert, createdAt}`. 409 if the fingerprint already exists. |
| POST | `/api/publishers/keys/revoke` | Cognito JWT | Body `{keyId}`. Idempotent. 404 if the caller doesn't own that key. |
| GET | `/api/publishers/keys/revocation-status?fingerprint=…` | Public | Installer's revocation check. Returns `{known, revoked, revokedAt}`. |
| POST | `/api/publish` | Cognito JWT | Now accepts optional form fields `signature`, `publisherCert`, `publisherKeyId`. Verifies before accepting. Becomes mandatory when `DASH_REGISTRY_REQUIRE_SIGNED_PUBLISH=true`. |
| GET | `/api/packages/:scope/:name/download` | Cognito JWT | Now surfaces `zipSignature`, `publisherCert`, `publisherKeyId`, `publisherFingerprint` alongside the download URL so the installer can verify. |

## Provisioning the registry root key

One-time. Run from a workstation with AWS credentials for the registry
account:

```bash
node scripts/init-publisher-root-key.mjs
```

The script:

1. Refuses to run if either SSM parameter already exists (rotation
   requires manual deletion in SSM first).
2. Generates an Ed25519 keypair locally.
3. Writes both halves to SSM SecureString:
   - `/dash-registry/PUBLISHER_ROOT_PRIVATE_KEY`
   - `/dash-registry/PUBLISHER_ROOT_PUBLIC_KEY`
4. Prints the public key to stdout for bundling into dash-electron.

## Local development

Set both env vars to override the SSM lookup:

```bash
REGISTRY_ROOT_PRIVATE_KEY="<base64>"
REGISTRY_ROOT_PUBLIC_KEY="<base64>"
```

Generate a throwaway pair for local dev:

```bash
node -e "
const ed = await import('@noble/ed25519');
const { sha512 } = await import('@noble/hashes/sha2');
ed.hashes.sha512 = m => sha512(m);
const priv = ed.utils.randomSecretKey();
const pub = await ed.getPublicKeyAsync(priv);
console.log('REGISTRY_ROOT_PRIVATE_KEY=' + Buffer.from(priv).toString('base64'));
console.log('REGISTRY_ROOT_PUBLIC_KEY=' + Buffer.from(pub).toString('base64'));
" --input-type=module
```

## Rollout

Phase 1A (this PR) ships with `DASH_REGISTRY_REQUIRE_SIGNED_PUBLISH`
defaulting to `false`. The registry accepts both signed and unsigned
publishes, but always verifies signed ones strictly. This lets the
dash-electron consumer side roll out without an outage.

Phase 1B (next PR, in dash-electron + dash-core): generate publisher
keys, sign at publish time, bundle the root public key, verify on
install.

Phase 1C: flip `DASH_REGISTRY_REQUIRE_SIGNED_PUBLISH=true` once the
last publisher version has rolled forward.

## Key rotation

To rotate the registry root key:

1. Issue a coordinated update to dash-electron that bundles BOTH the
   old and the new public key as trust anchors (verifier accepts a
   match against either).
2. Once the new dash-electron is widely installed, delete the old SSM
   parameters and re-run `init-publisher-root-key.mjs`.
3. Re-sign every existing publisher cert with the new root key (this
   is a backfill script not yet written; design TBD).
4. Once all publisher certs are re-issued, push another dash-electron
   update that drops the old trust anchor.

To rotate a publisher key: the publisher reinstalls dash-electron, or
visits Settings → Publishing → "Generate new signing key for this
machine." A fresh key is generated and registered; the old key
continues to verify already-published widgets until explicitly revoked.
