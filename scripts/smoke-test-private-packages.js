#!/usr/bin/env node
/**
 * smoke-test-private-packages.js
 *
 * End-to-end smoke test for the Phase 1 private-packages + entitlements
 * feature. Exercises every gated path against a live registry, verifies
 * 404s for denied access, grants + revokes entitlements, and prints a
 * pass/fail report.
 *
 * Prerequisites:
 *   1. A private test package already published under the owner's scope
 *      (e.g. "@<username>/private-smoke-test@0.0.1" with "visibility":
 *      "private" in its manifest).
 *   2. ENABLE_PRIVATE_PACKAGES=true set in the Amplify environment.
 *   3. Owner's Cognito access token (JWT) — get it from the browser by
 *      visiting the registry while signed in and running in the console:
 *         (await (await fetch('/api/auth/me')).json())._debug_token
 *      OR copy it from the Authorization header in DevTools Network tab.
 *
 * Usage:
 *   REGISTRY_URL=https://main.d919rwhuzp7rj.amplifyapp.com \
 *   OWNER_TOKEN=eyJra... \
 *   SCOPE=trops \
 *   NAME=private-smoke-test \
 *   [GRANTEE_TOKEN=eyJra...] \
 *   [GRANTEE_USER_ID=12345...] \
 *   node scripts/smoke-test-private-packages.js
 *
 * The GRANTEE_* vars are optional. When present, the full grant-→-install-
 * →-revoke cycle is tested against a second user account. When absent,
 * the script verifies only the owner and anonymous paths.
 */

const REGISTRY_URL =
    process.env.REGISTRY_URL || "https://main.d919rwhuzp7rj.amplifyapp.com";
const OWNER_TOKEN = process.env.OWNER_TOKEN;
const SCOPE = process.env.SCOPE;
const NAME = process.env.NAME;
const GRANTEE_TOKEN = process.env.GRANTEE_TOKEN || null;
const GRANTEE_USER_ID = process.env.GRANTEE_USER_ID || null;

if (!OWNER_TOKEN || !SCOPE || !NAME) {
    console.error(
        "Missing required env vars. Set OWNER_TOKEN, SCOPE, and NAME.",
    );
    console.error("See the header comment in this file for usage.");
    process.exit(1);
}

// --- Test runner ---

const results = [];
let failed = 0;

function record(name, passed, detail) {
    results.push({ name, passed, detail });
    if (!passed) failed++;
    const icon = passed ? "\u2713" : "\u2717";
    const color = passed ? "\u001b[32m" : "\u001b[31m";
    const reset = "\u001b[0m";
    console.log(`  ${color}${icon}${reset} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path, { method = "GET", token, body } = {}) {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${REGISTRY_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
        json = await res.json();
    } catch {
        /* empty body is fine */
    }
    return { status: res.status, body: json };
}

async function expectStatus(label, { status }, expected) {
    const ok = status === expected;
    record(label, ok, ok ? `HTTP ${status}` : `HTTP ${status}, expected ${expected}`);
    return ok;
}

// --- Test sections ---

async function ownerPaths() {
    console.log("\n[owner paths]");
    const pkg = await request(`/api/packages/${SCOPE}/${NAME}`, {
        token: OWNER_TOKEN,
    });
    await expectStatus(
        "owner sees their private package metadata",
        pkg,
        200,
    );
    if (pkg.status === 200) {
        record(
            "package is marked private",
            pkg.body.visibility === "private",
            `visibility=${pkg.body.visibility}`,
        );
    }

    const dl = await request(
        `/api/packages/${SCOPE}/${NAME}/download`,
        { token: OWNER_TOKEN },
    );
    const downloadOk = await expectStatus(
        "owner can request a download URL",
        dl,
        200,
    );
    if (downloadOk && dl.body?.downloadUrl) {
        const url = dl.body.downloadUrl;
        const hasShortTTL = url.includes("X-Amz-Expires=60");
        record(
            "download URL uses 60s TTL (private)",
            hasShortTTL,
            hasShortTTL ? "X-Amz-Expires=60" : `URL: ${url.slice(0, 120)}`,
        );
    }
}

async function anonymousPaths() {
    console.log("\n[anonymous paths — should see nothing]");
    const pkg = await request(`/api/packages/${SCOPE}/${NAME}`);
    await expectStatus(
        "anonymous GET of private package returns 404",
        pkg,
        404,
    );

    const list = await request(`/api/packages`);
    if (list.status === 200 && Array.isArray(list.body?.packages)) {
        const found = list.body.packages.find(
            (p) => p.scope === SCOPE && p.name === NAME,
        );
        record(
            "private package is NOT in anonymous list",
            !found,
            found ? "leaked in listing!" : "not present",
        );
    } else {
        record("list endpoint responded", false, `HTTP ${list.status}`);
    }

    const dl = await request(`/api/packages/${SCOPE}/${NAME}/download`);
    await expectStatus(
        "anonymous download attempt returns 401",
        dl,
        401,
    );
}

async function granteeFlow() {
    console.log("\n[grantee flow — entitlement grant → install → revoke]");

    let granteeId = GRANTEE_USER_ID;
    if (!granteeId) {
        const me = await request("/api/auth/me", { token: GRANTEE_TOKEN });
        if (me.status !== 200) {
            record("resolve grantee identity", false, `HTTP ${me.status}`);
            return;
        }
        granteeId = me.body?.cognitoId || me.body?.sub || me.body?.userId;
        if (!granteeId) {
            record(
                "resolve grantee identity",
                false,
                "no sub/cognitoId in /api/auth/me response",
            );
            return;
        }
        record("resolved grantee identity", true, granteeId);
    }

    // Before grant: grantee should see 404
    let pkg = await request(`/api/packages/${SCOPE}/${NAME}`, {
        token: GRANTEE_TOKEN,
    });
    await expectStatus(
        "grantee sees 404 before entitlement",
        pkg,
        404,
    );

    // Grant
    const grant = await request(
        `/api/packages/${SCOPE}/${NAME}/entitlements`,
        {
            method: "POST",
            token: OWNER_TOKEN,
            body: {
                granteeType: "user",
                granteeId,
                source: "smoke-test",
            },
        },
    );
    const entitlementId = grant.body?.entitlement?.entitlementId;
    await expectStatus("owner can grant entitlement", grant, 201);
    record(
        "grant response includes entitlementId",
        !!entitlementId,
        entitlementId || "missing",
    );
    if (!entitlementId) return;

    // After grant: grantee sees 200
    pkg = await request(`/api/packages/${SCOPE}/${NAME}`, {
        token: GRANTEE_TOKEN,
    });
    await expectStatus(
        "grantee sees package after entitlement",
        pkg,
        200,
    );

    const dl = await request(
        `/api/packages/${SCOPE}/${NAME}/download`,
        { token: GRANTEE_TOKEN },
    );
    await expectStatus(
        "grantee can request download URL",
        dl,
        200,
    );

    // Revoke
    const revoke = await request(`/api/entitlements/${entitlementId}`, {
        method: "DELETE",
        token: OWNER_TOKEN,
    });
    await expectStatus("owner can revoke entitlement", revoke, 200);

    // After revoke: 404 again
    pkg = await request(`/api/packages/${SCOPE}/${NAME}`, {
        token: GRANTEE_TOKEN,
    });
    await expectStatus(
        "grantee sees 404 after revoke",
        pkg,
        404,
    );
}

// --- Main ---

(async () => {
    console.log(`Smoke-testing private packages against ${REGISTRY_URL}`);
    console.log(`Target package: @${SCOPE}/${NAME}`);

    try {
        await ownerPaths();
        await anonymousPaths();
        if (GRANTEE_TOKEN) {
            await granteeFlow();
        } else {
            console.log(
                "\n[grantee flow] — skipped (set GRANTEE_TOKEN to enable)",
            );
        }
    } catch (err) {
        console.error("\nFATAL:", err.message);
        process.exit(2);
    }

    console.log(
        `\n${results.length - failed}/${results.length} checks passed` +
            (failed > 0 ? ` (${failed} failed)` : ""),
    );
    process.exit(failed === 0 ? 0 : 1);
})();
