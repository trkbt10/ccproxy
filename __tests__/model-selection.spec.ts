import { describe, it, expect } from "bun:test";
import { detectModelGrade } from "../src/tools/model/model-grade-detector";
import {
  mapModelToProvider,
  resolveModelForProvider,
} from "../src/adapters/providers/shared/model-mapper";
import type { RoutingConfig, Provider } from "../src/config/types";

function makeConfig(partial?: Partial<RoutingConfig>): RoutingConfig {
  const base: RoutingConfig = {
    defaults: { providerId: "default", model: "gpt-4o-mini" },
    modelMapping: {
      byProviderType: {
        gemini: {
          byGrade: {
            high: "gemini-2.5-pro",
            mid: "gemini-1.5-flash",
            low: "gemini-1.5-flash-8b",
          },
          aliases: {
            "gpt-4o-mini": "gemini-2.0-flash-lite",
          },
        },
        groq: {
          byGrade: {
            high: "mixtral-8x7b-32768",
            mid: "llama3-70b-8192",
            low: "llama3-8b-8192",
          },
        },
        grok: {
          byGrade: {
            high: "grok-3",
            mid: "grok-2-1212",
            low: "grok-3-mini",
          },
        },
        claude: {
          byGrade: {
            high: "claude-3-5-opus-20241022",
            mid: "claude-3-5-sonnet-20241022",
            low: "claude-3-5-haiku-20241022",
          },
        },
        openai: {
          byGrade: {
            high: "gpt-4o",
            mid: "gpt-4o-mini",
            low: "gpt-4o-mini",
          },
        },
      },
    },
    logging: { enabled: false },
    providers: {},
    tools: [],
  };
  return { ...base, ...(partial || {}) };
}

describe("Model selection via model-grade-detector", () => {
  it("alias mapping has priority over grade mapping", () => {
    const cfg = makeConfig();
    const out = mapModelToProvider({
      targetProviderType: "gemini",
      sourceModel: "gpt-4o-mini",
      routingConfig: cfg,
    });
    expect(out).toBe("gemini-2.0-flash-lite"); // alias should win
  });

  it("grade-based mapping selects by detected grade", () => {
    const cfg = makeConfig();
    // gpt-4o-mini is graded as low by detector
    expect(detectModelGrade("gpt-4o-mini")).toBe("low");
    const outGemini = mapModelToProvider({
      targetProviderType: "gemini",
      sourceModel: "gpt-4o-mini",
      routingConfig: cfg,
    });
    // alias exists for gemini (above), so validate with grok instead for grade mapping
    const outGrok = mapModelToProvider({
      targetProviderType: "grok",
      sourceModel: "gpt-4o-mini",
      routingConfig: cfg,
    });
    expect(outGrok).toBe("grok-3-mini");
  });

  it("uses defaults.model grade when source model omitted", () => {
    const cfg = makeConfig({
      defaults: { providerId: "default", model: "gpt-4o" },
    });
    // defaults.model is high → pick high for target
    expect(detectModelGrade("gpt-4o")).toBe("high");
    const outClaude = mapModelToProvider({
      targetProviderType: "claude",
      routingConfig: cfg,
    });
    expect(outClaude).toBe("claude-3-5-opus-20241022");
  });

  it("resolveModelForProvider picks by grade from live list when provided", async () => {
    const cfg = makeConfig();
    const provider: Provider = { type: "gemini" };
    const available = [
      "models/gemini-1.5-flash",
      "gemini-2.5-pro",
      "gemini-1.5-flash-8b",
      "gemini-2.0-flash-lite",
    ];
    const picked = await resolveModelForProvider({
      provider,
      sourceModel: "gpt-4o-mini", // low grade
      routingConfig: cfg,
      listAvailableModels: async () => available,
    });
    expect(
      available.map((m) => m.replace(/^models\//, "")).includes(picked)
    ).toBe(true);
    expect(detectModelGrade(picked)).toBe("low");
  });

  it("resolveModelForProvider falls back to grade mapping when listing fails", async () => {
    const cfg = makeConfig();
    const provider: Provider = { type: "grok" };
    const picked = await resolveModelForProvider({
      provider,
      sourceModel: "gpt-4o-mini", // low
      routingConfig: cfg,
      listAvailableModels: async () => {
        throw new Error("boom");
      },
    });
    expect(picked).toBe("grok-3-mini");
  });

  it("normalize model name: strips models/ prefix before mapping", () => {
    const cfg = makeConfig();
    const out = mapModelToProvider({
      targetProviderType: "gemini",
      sourceModel: "models/gpt-4o-mini",
      routingConfig: cfg,
    });
    // alias still matches after normalization
    expect(out).toBe("gemini-2.0-flash-lite");
  });
});
