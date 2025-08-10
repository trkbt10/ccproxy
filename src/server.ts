// server.ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import app from "./index.js";
import { loadRoutingConfigOnce } from "./execution/routing-config";
import { printStartupInfo } from "./utils/info/startup-info";
import { extractEndpoints } from "./utils/info/hono-endpoints";
import { getBanner } from "./utils/logo/banner";

const port = parseInt(process.env.PORT || "8082", 10) || 8082;

function isHonoLike(obj: unknown): obj is Hono {
  return (
    !!obj &&
    typeof obj === "object" &&
    "route" in (obj as any) &&
    "on" in (obj as any)
  );
}

serve(
  {
    fetch: app.fetch,
    port,
  },
  async (info) => {
    const cfg = await loadRoutingConfigOnce();
    
    // Display banner with provider info
    const defaultProvider = cfg.providers?.default;
    let bannerText = "CCPROXY";
    console.log(getBanner(bannerText, { color: "cyan" }));
    console.log(); // Add line spacing after banner
    
    if (defaultProvider) {
      const providerName = defaultProvider.type || "openai";
      console.log(`\x1b[36m+ ${providerName.toUpperCase()}\x1b[0m`);
      console.log(); // Add line spacing after provider info
    }
    
    const eps = isHonoLike(app) ? extractEndpoints(app) : [];
    await printStartupInfo(info.port, cfg, eps);
  }
);
