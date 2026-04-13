/**
 * Feature flags.
 *
 * Phase 1 of private packages ships dark — all new code paths are gated
 * behind ENABLE_PRIVATE_PACKAGES so public-package behavior is untouched
 * until the flag is flipped.
 */

export function isPrivatePackagesEnabled(): boolean {
  return process.env.ENABLE_PRIVATE_PACKAGES === "true";
}
