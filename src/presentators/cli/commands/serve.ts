import { startHonoServer } from "../../http/server";
import { createClaudeApp } from "../../http/app";
import { createOpenAIApp } from "../../http/app-openai";
import type { ServeOptions } from "../types";

export async function cmdServe(options: ServeOptions): Promise<void> {
  const { api = "claude", port: portOption, config, configOverrides } = options;

  const app = api === "openai" ? createOpenAIApp() : createClaudeApp();
  
  // Default port based on API mode: 8082 for Claude, 8085 for OpenAI
  const defaultPort = api === "openai" ? 8085 : 8082;
  const port = portOption ?? process.env.PORT ?? defaultPort;
  
  await startHonoServer(app, { 
    port,
    configPath: config,
    configOverrides,
  });
}
