/**
 * The current Claude models, as the Dash app reads them (GET /api/models).
 *
 * Dash keeps its model list fresh from this file without an app update:
 * a new model shows up in every picker, "Latest <family>" moves to the
 * newest of a family, and a retired model moves to what replaces it.
 * Update it when Anthropic releases or retires a model.
 *
 * Per model: `family` (what "Latest Opus" follows), newest first within a
 * family; `status` current | older | retiring | retired; `retiresOn`
 * (YYYY-MM-DD) for a retiring one; `replacedBy` for a retired one;
 * `tier` fast | balanced | deep (the first of a tier is the one recommended
 * for it); `reasoning: "effort"` when it takes an effort setting;
 * `pricing` USD per million tokens. `retired` maps model ids Anthropic no
 * longer serves to what replaces them ("latest:<family>" or an exact id).
 *
 * The app checks every entry (dash-core electron/llm/modelList.js) and
 * keeps its last good list when this one can't be read.
 */

export interface ListedModel {
  value: string;
  label: string;
  family: string;
  status: "current" | "older" | "retiring" | "retired";
  tier?: "fast" | "balanced" | "deep";
  reasoning?: "effort" | null;
  pricing?: { input: number; output: number };
  retiresOn?: string;
  replacedBy?: string;
}

export interface ModelList {
  version: 1;
  updated: string;
  providers: {
    anthropic: { models: ListedModel[]; retired: Record<string, string> };
  };
}

export const MODEL_LIST: ModelList = {
  version: 1,
  updated: "2026-11-15",
  providers: {
    anthropic: {
      models: [
        {
          value: "claude-opus-5-5",
          label: "Claude Opus 5.5",
          family: "opus",
          status: "current",
          tier: "deep",
          reasoning: "effort",
          pricing: { input: 4, output: 20 },
        },
        {
          value: "claude-sonnet-5-5",
          label: "Claude Sonnet 5.5",
          family: "sonnet",
          status: "current",
          tier: "balanced",
          reasoning: "effort",
          pricing: { input: 2, output: 10 },
        },
        {
          value: "claude-haiku-5-5",
          label: "Claude Haiku 5.5",
          family: "haiku",
          status: "current",
          tier: "fast",
          reasoning: "effort",
          pricing: { input: 0.1, output: 0.5 },
        },
        {
          value: "claude-fable-5-2",
          label: "Claude Fable 5.2",
          family: "fable",
          status: "current",
          tier: "deep",
          reasoning: "effort",
          pricing: { input: 10, output: 50 },
        },
        {
          value: "claude-fable-5-1",
          label: "Claude Fable 5.1",
          family: "fable",
          status: "older",
          tier: "deep",
          reasoning: "effort",
          pricing: { input: 10, output: 50 },
        },
        {
          value: "claude-opus-4-8",
          label: "Claude Opus 4.8",
          family: "opus",
          status: "older",
          tier: "deep",
          reasoning: "effort",
          pricing: { input: 5, output: 25 },
        },
        {
          value: "claude-opus-4-7",
          label: "Claude Opus 4.7",
          family: "opus",
          status: "older",
          tier: "deep",
          reasoning: "effort",
          pricing: { input: 5, output: 25 },
        },
        {
          value: "claude-sonnet-4-6",
          label: "Claude Sonnet 4.6",
          family: "sonnet",
          status: "older",
          tier: "balanced",
          reasoning: "effort",
          pricing: { input: 3, output: 15 },
        },
        {
          value: "claude-haiku-4-5",
          label: "Claude Haiku 4.5",
          family: "haiku",
          status: "older",
          tier: "fast",
          reasoning: null,
          pricing: { input: 1, output: 5 },
        },
      ],
      retired: {
        "claude-sonnet-4-20250514": "latest:sonnet",
        "claude-opus-4-20250514": "latest:opus",
        "claude-opus-4-1-20250805": "latest:opus",
        "claude-3-7-sonnet-20250219": "latest:sonnet",
        "claude-3-5-sonnet-20241022": "latest:sonnet",
        "claude-3-5-sonnet-20240620": "latest:sonnet",
        "claude-3-5-haiku-20241022": "latest:haiku",
        "claude-3-opus-20240229": "latest:opus",
        "claude-fable-5": "latest:fable",
      },
    },
  },
};
