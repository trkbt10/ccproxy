// server.ts
import { serve } from "@hono/node-server";
import app from "./index.js";

const port = parseInt("8082") || 8082; // Default port if not set in environment

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
