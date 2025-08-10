import { serve } from "@hono/node-server";
import app from "../index";
import { printCcproxyBanner } from "../utils/logo/banner";
import { loadRoutingConfigOnce } from "../execution/routing-config";
import { printStartupInfo } from "../utils/info/startup-info";
import { extractEndpoints } from "../utils/info/hono-endpoints";
import { getArgFlag } from "./utils";

export async function cmdServe(): Promise<void> {
  const portStr = getArgFlag("port");
  const port = portStr ? parseInt(portStr, 10) : parseInt(process.env.PORT || "8082", 10);
  printCcproxyBanner();
  serve({ fetch: app.fetch, port }, async (info) => {
    const cfg = await loadRoutingConfigOnce();
    const eps = extractEndpoints(app as any);
    await printStartupInfo(info.port, cfg, eps);
  });
}