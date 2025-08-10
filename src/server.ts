// server.ts
import { serve } from "@hono/node-server";
import app from "./index.js";
import { printCcproxyBanner } from "./utils/logo/banner";
import { loadRoutingConfigOnce } from "./execution/routing-config";
import { printStartupInfo } from "./utils/info/startup-info";
import { extractEndpoints } from "./utils/info/hono-endpoints";

const port = parseInt(process.env.PORT || "8082", 10) || 8082;

printCcproxyBanner();

serve(
  {
    fetch: app.fetch,
    port,
  },
  async (info) => {
    const cfg = await loadRoutingConfigOnce();
    const eps = extractEndpoints(app as any);
    await printStartupInfo(info.port, cfg, eps);
  }
);
