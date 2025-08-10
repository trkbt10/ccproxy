import type { RoutingConfig } from "../../config/types";
import { resolveConfigPath } from "../../config/paths";

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
  if (p.apiKey) auth.push("apiKey");
  if (p.api?.keyHeader) {
    const keys = p.api.keys ? Object.keys(p.api.keys).length : 0;
    auth.push(`keyHeader:${p.api.keyHeader}${keys ? `(${keys})` : ""}`);
  }
  if (p.api?.keyByModelPrefix) {
    const n = Object.keys(p.api.keyByModelPrefix).length;
    auth.push(`modelMap:${n}`);
  }
  if (auth.length === 0 && process.env.OPENAI_API_KEY) {
    auth.push("env");
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
  const defaultModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const lines: string[] = [
    `🚀 Server is running:  ${base}`,
    `📦 Config file:        ${cfgPath}`,
    `🔧 Providers:          ${providers.length} (${formatList(providers)})`,
    `🛠️  Tools:              ${tools.length} (${formatList(tools)})`,
    `🗂  Logging:            enabled=${log.enabled !== false}, events=${log.eventsEnabled === true}, dir=${log.dir || "./logs"}`,
    `🤖 Default model:      ${defaultModel}`,
    `📝 Endpoints:`,
  ];
  if (endpoints && endpoints.length > 0) {
    for (const e of endpoints) {
      lines.push(`   - ${e}`);
    }
  }

  if (providers.length > 0) {
    lines.push("🔧 Providers detail:");
    const maxProviders = 4;
    for (let i = 0; i < Math.min(maxProviders, providers.length); i++) {
      const id = providers[i];
      const p = (cfg.providers as NonNullable<typeof cfg.providers>)[id];
      lines.push(summarizeProvider(id, p));
    }
    if (providers.length > maxProviders) {
      lines.push(`   - ... +${providers.length - maxProviders} more`);
    }
  }

  if ((cfg.tools || []).length > 0) {
    lines.push("🛠️  Tools detail:");
    lines.push(...summarizeTools(cfg));
  }

  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}
