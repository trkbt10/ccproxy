// Gemini-focused server entry
// This entrypoint starts the Hono app configured for Gemini-compatible flows.
import { createGeminiApp } from "./presentators/http/http-gemini";
import { startHonoServer } from "./presentators/http/server";

const app = createGeminiApp();
await startHonoServer(app, { apiMode: "gemini" });
