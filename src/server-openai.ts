// OpenAI-compat server entry
import { startHonoServer } from "./presentators/http/server";
import { createOpenAIApp } from "./presentators/http/http-openai";

const app = createOpenAIApp();
await startHonoServer(app, { apiMode: "openai" });
