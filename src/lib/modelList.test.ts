import { describe, it, expect } from "vitest";
import { MODEL_LIST } from "./modelList";
import { GET } from "../app/api/models/route";

const ID = /^[a-z0-9][a-z0-9.\-]{1,80}$/;
const TARGET = /^(?:latest:[a-z]{2,20}|[a-z0-9][a-z0-9.\-]{1,80})$/;

describe("model list", () => {
  const { models, retired } = MODEL_LIST.providers.anthropic;

  it("is a list the app accepts", () => {
    expect(MODEL_LIST.version).toBe(1);
    expect(MODEL_LIST.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const ids = new Set<string>();
    for (const m of models) {
      expect(m.value).toMatch(ID);
      expect(m.family).toMatch(/^[a-z]{2,20}$/);
      expect(["current", "older", "retiring", "retired"]).toContain(m.status);
      expect(ids.has(m.value)).toBe(false);
      ids.add(m.value);
    }
    for (const [from, to] of Object.entries(retired)) {
      expect(from).toMatch(ID);
      expect(to).toMatch(TARGET);
      expect(ids.has(from)).toBe(false);
    }
  });

  it("every family's newest comes first and still runs", () => {
    const families = new Set(models.map((m) => m.family));
    for (const f of families) {
      const first = models.find((m) => m.family === f);
      expect(first && first.status).toBe("current");
    }
  });

  it("every retired model points at a family or model that's listed", () => {
    const families = new Set(models.map((m) => m.family));
    const ids = new Set(models.map((m) => m.value));
    for (const to of Object.values(retired)) {
      if (to.startsWith("latest:")) {
        expect(families.has(to.slice("latest:".length))).toBe(true);
      } else {
        expect(ids.has(to)).toBe(true);
      }
    }
  });

  it("GET /api/models serves it, cached for an hour", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(await res.json()).toEqual(MODEL_LIST);
  });
});
