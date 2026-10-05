import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderPolicy, ACCOUNT_PLACEHOLDER } from "./iamPolicyTemplate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(
  join(here, "..", "..", "infra", "iam", "DashRegistrySSRComputeRole.policy.json"),
  "utf8",
);
const readme = readFileSync(
  join(here, "..", "..", "infra", "iam", "README.md"),
  "utf8",
);

describe("SSR compute role policy template", () => {
  it("keeps the AWS account ID out of the repo", () => {
    // No 12-digit account IDs in ARNs — only the placeholder.
    expect(template).not.toMatch(/arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{12}:/);
    expect(readme).not.toMatch(/\b\d{12}\b/);
    expect(template).toContain(ACCOUNT_PLACEHOLDER);
  });

  it("renders every placeholder into valid policy JSON", () => {
    const out = renderPolicy(template, "123456789012");
    expect(out).not.toContain(ACCOUNT_PLACEHOLDER);
    const doc = JSON.parse(out);
    expect(doc.Version).toBe("2012-10-17");
    expect(out).toContain("arn:aws:dynamodb:us-east-1:123456789012:table/dash-registry-Packages");
  });

  it("refuses a missing or malformed account ID", () => {
    expect(() => renderPolicy(template, "")).toThrow(/account ID/);
    expect(() => renderPolicy(template, "12345")).toThrow(/account ID/);
    expect(() => renderPolicy(template, "12345678901a")).toThrow(/account ID/);
  });

  it("refuses a template that isn't valid JSON once rendered", () => {
    expect(() => renderPolicy("{ not json", "123456789012")).toThrow();
  });
});
