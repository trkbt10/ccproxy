import type { RoutingConfig } from "../../config/types";
import { resolveConfigPath } from "../../config/paths";
import { maskApiKey } from "../security/mask-sensitive";

function formatList(items: string[], max = 6): string {
  if (items.length === 0) return "-";
  const head = items.slice(0, max);
  const tail = items.length > max ? `, +${items.length - max} more` : "";
  return head.join(", ") + tail;
}

function summarizeProvider(id: string, p: NonNullable<RoutingConfig["providers"]>[string]): string {
  const parts: string[] = [];
  parts.push(`[${p.type}]`);
  if (p.baseURL) parts.push(`baseURL=${p.baseURL}`);
  // Auth strategies
  const auth: string[] = [];
  if (p.apiKey) auth.push(`apiKey:${maskApiKey(p.apiKey)}`);
  if (p.api?.keyHeader) {
    const keys = p.api.keys ? Object.keys(p.api.keys).length : 0;
    auth.push(`keyHeader:${p.api.keyHeader}${keys ? `(${keys})` : ""}`);
  }
  if (p.api?.keyByModelPrefix) {
    const n = Object.keys(p.api.keyByModelPrefix).length;
    auth.push(`modelMap:${n}`);
  }
  if (auth.length === 0 && process.env.OPENAI_API_KEY) {
    auth.push(`env:${maskApiKey(process.env.OPENAI_API_KEY)}`);
  }
  if (auth.length > 0) parts.push(`auth=${auth.join("|")}`);
  return `   - ${id} ${parts.join(" ")}`;
}

function summarizeTools(cfg: RoutingConfig, max = 6): string[] {
  const out: string[] = [];
  const tools = cfg.tools || [];
  for (let i = 0; i < Math.min(max, tools.length); i++) {
    const t = tools[i];
    const steps = (t.steps || []).map((s) => s.kind);
    const internal = steps.filter((k) => k === "internal").length;
    const resp = steps.filter((k) => k === "responses_model").length;
    out.push(`   - ${t.name} (internal:${internal}, responses:${resp})`);
  }
  if (tools.length > max) out.push(`   - ... +${tools.length - max} more`);
  return out;
}

export async function printStartupInfo(port: number, cfg: RoutingConfig, endpoints?: string[]): Promise<void> {
  const base = `http://localhost:${port}`;
  const cfgPath = resolveConfigPath();
  const providers = Object.keys(cfg.providers || {});
  const tools = (cfg.tools || []).map((t) => t.name);
  const log = cfg.logging || {};
  
  // Get default model from config tools if available, otherwise from env
  let defaultModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const toolsWithModel = (cfg.tools || []).filter(t => 
    t.steps?.some(s => s.kind === "responses_model" && s.model)
  );
  if (toolsWithModel.length > 0) {
    const firstModel = toolsWithModel[0].steps.find(s => s.kind === "responses_model" && s.model);
    if (firstModel && firstModel.kind === "responses_model" && firstModel.model) {
      defaultModel = firstModel.model;
    }
  }

  // Structure output into icon, label, and body sections
  const sections = [
    {
      icon: "🚀",
      label: "Server is running",
      body: base
    },
    {
      icon: "📦",
      label: "Config file",
      body: cfgPath
    },
    {
      icon: "🔧",
      label: "Providers",
      body: `${providers.length} (${formatList(providers)})`
    },
    {
      icon: "🛠️",
      label: "Tools",
      body: `${tools.length} (${formatList(tools)})`
    },
    {
      icon: "🗂",
      label: "Logging",
      body: `enabled=${log.enabled !== false}, events=${log.eventsEnabled === true}, dir=${log.dir || "./logs"}`
    },
    {
      icon: "🤖",
      label: "Default model",
      body: defaultModel
    }
  ];

  // Print main sections with aligned formatting
  const maxLabelLength = Math.max(...sections.map(s => s.label.length));
  for (const section of sections) {
    const paddedLabel = section.label.padEnd(maxLabelLength);
    console.log(`${section.icon} ${paddedLabel}  ${section.body}`);
  }

  // Print endpoints
  if (endpoints && endpoints.length > 0) {
    console.log("\n📝 Endpoints:");
    for (const e of endpoints) {
      console.log(`   - ${e}`);
    }
  }

  // Print provider details
  if (providers.length > 0) {
    console.log("\n🔧 Providers detail:");
    const maxProviders = 4;
    for (let i = 0; i < Math.min(maxProviders, providers.length); i++) {
      const id = providers[i];
      const p = (cfg.providers as NonNullable<typeof cfg.providers>)[id];
      console.log(summarizeProvider(id, p));
    }
    if (providers.length > maxProviders) {
      console.log(`   - ... +${providers.length - maxProviders} more`);
    }
  }

  // Print tool details
  if ((cfg.tools || []).length > 0) {
    console.log("\n🛠️  Tools detail:");
    const toolLines = summarizeTools(cfg);
    for (const line of toolLines) {
      console.log(line);
    }
  }
}
