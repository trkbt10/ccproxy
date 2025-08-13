import { startHonoServer } from "../../http/server";
import { createClaudeApp } from "../../http/http-claude";
import { createOpenAIApp } from "../../http/http-openai";
import { createGeminiApp } from "../../http/http-gemini";
import type { ServeOptions } from "../types";

export async function cmdServe(options: ServeOptions): Promise<void> {
  const { api = "claude", port: portOption, config, configOverrides } = options;

  const configOpts = { configPath: config, configOverrides };
  const app = api === "openai" ? createOpenAIApp() : 
              api === "gemini" ? createGeminiApp() :
              createClaudeApp(configOpts);

  // Default port based on API mode: 8082 for Claude, 8085 for OpenAI, 8086 for Gemini
  const defaultPort = api === "openai" ? 8085 : 
                     api === "gemini" ? 8086 :
                     8082;
  const port = portOption ?? process.env.PORT ?? defaultPort;

  await startHonoServer(app, {
    port,
    configPath: config,
    configOverrides,
    apiMode: api,
  });
}
