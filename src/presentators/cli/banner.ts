import { getBanner } from "../../utils/logo/banner";
import { loadRoutingConfigOnce } from "../../execution/routing-config";

export function printBanner(text = "CCPROXY", color: "cyan" | "green" | "magenta" = "cyan"): void {
  console.log(getBanner(text, { color }));
}

export async function printProviderInfoLine(): Promise<void> {
  const cfg = await loadRoutingConfigOnce();
  const defaultProvider = cfg.providers?.default;
  if (defaultProvider) {
    const providerName = defaultProvider.type || "openai";
    console.log(`\x1b[36m+ ${providerName.toUpperCase()}\x1b[0m`);
  }
}
