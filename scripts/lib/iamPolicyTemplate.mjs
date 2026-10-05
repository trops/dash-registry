/**
 * The SSR compute role's policy is kept in the repo as a template: ARNs use
 * ${AWS_ACCOUNT_ID} instead of the real account ID (this repo is public), and
 * the apply script fills it in from the caller's AWS credentials.
 */
export const ACCOUNT_PLACEHOLDER = "${AWS_ACCOUNT_ID}";

/**
 * Fill the account ID into the policy template.
 * @param {string} template  policy JSON with ${AWS_ACCOUNT_ID} placeholders
 * @param {string} accountId 12-digit AWS account ID
 * @returns {string} the policy JSON to apply
 */
export function renderPolicy(template, accountId) {
  if (typeof accountId !== "string" || !/^\d{12}$/.test(accountId)) {
    throw new Error(`Expected a 12-digit AWS account ID, got "${accountId}"`);
  }
  const rendered = template.split(ACCOUNT_PLACEHOLDER).join(accountId);
  JSON.parse(rendered); // must be valid JSON before it goes to AWS
  return rendered;
}
