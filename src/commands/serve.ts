import { serve } from "@hono/node-server";
import app from "../index";
import { loadRoutingConfigOnce } from "../execution/routing-config";
import { printStartupInfo } from "../utils/info/startup-info";
import { extractEndpoints } from "../utils/info/hono-endpoints";
import { getArgFlag } from "./utils";
import { getBanner } from "../utils/logo/banner";

export async function cmdServe(): Promise<void> {
  const portStr = getArgFlag("port");
  const port = portStr
    ? parseInt(portStr, 10)
    : parseInt(process.env.PORT || "8082", 10);
  serve({ fetch: app.fetch, port }, async (info) => {
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
    
    const eps = extractEndpoints(app);
    await printStartupInfo(info.port, cfg, eps);
  });
}
