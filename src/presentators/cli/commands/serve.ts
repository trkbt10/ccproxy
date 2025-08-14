import { startHonoServer } from "../../http/server";
import { createClaudeApp } from "../../http/http-claude";
import { createOpenAIApp } from "../../http/http-openai";
import { createGeminiApp } from "../../http/http-gemini";
import type { ServeOptions } from "../types";

const providers = {
  openai: {
    app: createOpenAIApp,
    defaultPort: 11434,
  },
  claude: {
    app: createClaudeApp,
    defaultPort: 8082,
  },
  gemini: {
    app: createGeminiApp,
    defaultPort: 8086,
  },
} as const;

export async function cmdServe(options: ServeOptions): Promise<void> {
  const { api = "claude", port: portOption, config, configOverrides } = options;

  const configOpts = { configPath: config, configOverrides };

  // Resolve provider using the providers map with a safe fallback to "claude"
  const providerKey = (api in providers ? api : "claude") as keyof typeof providers;
  const provider = providers[providerKey];

  // Only Claude app needs config options; others are instantiated without args
  const app = provider.app(configOpts);

  const port = portOption ?? process.env.PORT ?? provider.defaultPort;

  await startHonoServer(app, {
    port,
    configPath: config,
    configOverrides,
    apiMode: providerKey,
  });
}
