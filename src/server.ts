// Claude-focused server entry
// This entrypoint starts the Hono app configured for Claude-compatible flows.
import app from "./index.js";
import { startHonoServer } from "./presentators/http/server";

await startHonoServer(app);
