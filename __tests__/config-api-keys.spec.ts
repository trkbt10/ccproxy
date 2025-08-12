import { describe, test, expect } from "bun:test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { expandConfig } from "../src/config/expansion";
import type { RoutingConfig, Provider } from "../src/config/types";
import { selectApiKey } from "../src/adapters/providers/shared/select-api-key";
import { buildOpenAICompatibleClientForClaude } from "../src/adapters/providers/claude/openai-compatible";

describe("Config API key ingestion", () => {
  const tmpDir = path.join(process.cwd(), "__tests__", "fixtures");
  const cfgPath = path.join(tmpDir, "routing.config.json");

  async function writeConfig(json: unknown) {
    if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });
    await writeFile(cfgPath, JSON.stringify(json, null, 2), "utf8");
    return cfgPath;
  }

  function withEnv<T>(pairs: Record<string, string | undefined>, fn: () => T): T {
    const prev: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(pairs)) {
      prev[k] = process.env[k];
      if (typeof v === "undefined") delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (typeof v === "undefined") delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  test("direct apiKey per provider is used", async () => {
    const cfg: RoutingConfig = {
      providers: {
        open: { type: "openai", apiKey: "sk-openai-abc" },
        cla: { type: "claude", apiKey: "ak-claude-xyz" },
        groq: { type: "groq", apiKey: "gq-key" },
        grok: { type: "grok", apiKey: "xai-key" },
        gem: { type: "gemini", apiKey: "gm-key" },
      },
      tools: [],
    };
    const p = await writeConfig(cfg);
    const raw = JSON.parse(await readFile(p, "utf8")) as RoutingConfig;
    const expanded = expandConfig(raw);
    expect(selectApiKey(expanded.providers!.open, undefined)).toBe("sk-openai-abc");
    expect(selectApiKey(expanded.providers!.cla, undefined)).toBe("ak-claude-xyz");
    expect(selectApiKey(expanded.providers!.groq, undefined)).toBe("gq-key");
    expect(selectApiKey(expanded.providers!.grok, undefined)).toBe("xai-key");
    expect(selectApiKey(expanded.providers!.gem, undefined)).toBe("gm-key");
  });

  test("keyByModelPrefix selects longest matching prefix", async () => {
    const cfg: RoutingConfig = {
      providers: {
        open: {
          type: "openai",
          api: {
            keyByModelPrefix: {
              "gpt-": "openai-gpt-key",
              "gpt-4o-": "openai-4o-key",
            },
          },
        },
      },
      tools: [],
    };
    const p = await writeConfig(cfg);
    const expanded = expandConfig(JSON.parse(await readFile(p, "utf8")) as RoutingConfig);
    const provider = expanded.providers!.open;
    expect(selectApiKey(provider, "gpt-4o-mini")).toBe("openai-4o-key");
    expect(selectApiKey(provider, "gpt-3.5-turbo")).toBe("openai-gpt-key");
  });

  test("env expansion in apiKey fields via ${VAR} and default", async () => {
    const cfg: RoutingConfig = {
      providers: {
        open: { type: "openai", apiKey: "${OPENAI_API_KEY:-sk-fallback}" },
        cla: { type: "claude", apiKey: "${ANTHROPIC_API_KEY}" },
      },
      tools: [],
    };
    const p = await writeConfig(cfg);
    const run = () => expandConfig(JSON.parse(require('node:fs').readFileSync(p, 'utf8')) as RoutingConfig);

    withEnv({ OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: "ak-live" }, () => {
      const expanded = run();
      expect(selectApiKey(expanded.providers!.open, undefined)).toBe("sk-fallback");
      expect(selectApiKey(expanded.providers!.cla, undefined)).toBe("ak-live");
    });
    withEnv({ OPENAI_API_KEY: "sk-env", ANTHROPIC_API_KEY: "ak-env" }, () => {
      const expanded = run();
      expect(selectApiKey(expanded.providers!.open, undefined)).toBe("sk-env");
      expect(selectApiKey(expanded.providers!.cla, undefined)).toBe("ak-env");
    });
  });

  // No env fallback: selection only uses provider config
  test("no env fallback when config lacks keys", () => {
    const providerOpen: Provider = { type: "openai" };
    const providerClaude: Provider = { type: "claude" };
    expect(selectApiKey(providerOpen, undefined)).toBeNull();
    expect(selectApiKey(providerClaude, undefined)).toBeNull();
  });

  test("Claude client builder requires key in provider config", () => {
    const providerFromConfig: Provider = { type: "claude", apiKey: "ak-config" };
    const client1 = buildOpenAICompatibleClientForClaude(providerFromConfig, "claude-3-5-sonnet-20241022");
    expect(typeof client1.responses.create).toBe("function");
    const providerNoKey: Provider = { type: "claude" };
    expect(() => buildOpenAICompatibleClientForClaude(providerNoKey, "claude-3-5-sonnet-20241022")).toThrow();
  });
});
