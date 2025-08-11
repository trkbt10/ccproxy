import { getArgFlag, hasFlag } from "./utils";
import { startHonoServer } from "../../http/server";
import { createClaudeApp } from "../../http/app";
import { createOpenAIApp } from "../../http/app-openai";

export async function cmdServe(): Promise<void> {
  const portStr = getArgFlag("port");
  const api = (getArgFlag("api") || (hasFlag("openai") ? "openai" : undefined) || "claude").toLowerCase();

  const app = api === "openai" ? createOpenAIApp() : createClaudeApp();
  await startHonoServer(app, { port: portStr ?? undefined });
}
