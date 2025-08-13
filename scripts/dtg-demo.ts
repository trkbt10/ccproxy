// Demo script: generate + execute a dynamic tool in one file
// Storage selectable via env: DTG_STORAGE=fs|mem (default: mem)
// FS output goes under .serena/dynamic-tools-demo to avoid polluting src

// demo uses manager.prepareToolForScenario which returns exec()
import { prepareToolForScenario } from "../src/tools/dynamic-tool-generation/manager";
import { createMemoryStorage } from "../src/tools/dynamic-tool-generation/storage/memory";
import { createFileSystemStorage } from "../src/tools/dynamic-tool-generation/storage/fs";
import type { Provider } from "../src/config/types";
import type { ToolStorage } from "../src/tools/dynamic-tool-generation/types";
import { buildSumScenario } from "./dtg-demo/tools/sum/scenario";
import { buildTextAnalyzerScenario } from "./dtg-demo/tools/text-analyzer/scenario";

function getEnv(name: string, def?: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : def;
}

function buildProvider(): { provider: Provider; model: string } {
  const type = (getEnv("DTG_PROVIDER", "openai") as Provider["type"]) || "openai";
  const model = getEnv("DTG_MODEL", "gpt-4o-mini")!;
  const baseURL = getEnv("DTG_BASE_URL");
  // Basic key selection by provider
  const apiKey =
    getEnv("DTG_API_KEY") ||
    (type === "openai"
      ? getEnv("OPENAI_API_KEY")
      : type === "claude"
      ? getEnv("ANTHROPIC_API_KEY")
      : type === "gemini"
      ? getEnv("GOOGLE_API_KEY")
      : type === "grok"
      ? getEnv("XAI_API_KEY")
      : getEnv("DTG_API_KEY"));
  if (!apiKey) throw new Error("Missing API key: set DTG_API_KEY or provider-specific key");
  const provider: Provider = { type, baseURL, apiKey };
  return { provider, model };
}

async function main() {
  const storageMode = getEnv("DTG_STORAGE", "mem");
  const storage: ToolStorage =
    storageMode === "fs" ? createFileSystemStorage(".tmp/dynamic-tools-demo") : createMemoryStorage();

  const { provider, model } = buildProvider();

  // Choose scenario(s)
  const scenario = getEnv("DTG_SCENARIO", "all");
  const scenarios = [] as Array<ReturnType<typeof buildSumScenario> | ReturnType<typeof buildTextAnalyzerScenario>>;
  if (scenario === "sum" || scenario === "all") scenarios.push(buildSumScenario());
  if (scenario === "text" || scenario === "all") scenarios.push(buildTextAnalyzerScenario());

  for (const sc of scenarios) {
    console.log("[dtg-demo] prepare tool...", {
      name: sc.key.functionName,
      storage: storageMode,
      model: model,
      provider: provider.type,
    });
    const prepared = await prepareToolForScenario(sc, { provider, model, storage });
    console.log("[dtg-demo] executing prepared tool...", { name: sc.key.functionName });
    const result = await prepared.exec(sc.sampleInput, { requestId: `demo:${sc.key.functionName}` });
    console.log("[dtg-demo] result:", result, "meta:", prepared.meta);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main().catch((e) => {
  console.error("[dtg-demo] error:", e);
  process.exit(1);
});
