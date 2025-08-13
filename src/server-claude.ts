// OpenAI-compat server entry
import { startHonoServer } from "./presentators/http/server";
import { createClaudeApp } from "./presentators/http/http-claude";

const app = createClaudeApp();
await startHonoServer(app);
