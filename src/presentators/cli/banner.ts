import { getBanner } from "../../utils/logo/banner";
import { loadRoutingConfigOnce } from "../../execution/routing-config";
import { detectModelGrade, type ModelGrade } from "../../config/model/model-grade-detector";
import { renderTinyBraille } from "../../utils/logo/tiny-braille";
import type { Provider } from "../../config/types";

export function printBanner(text = "CCPROXY", color: "cyan" | "green" | "magenta" | "blue" = "cyan"): void {
  console.log(getBanner(text, { color }));
}


export async function printProviderInfoLine(): Promise<void> {
  const cfg = await loadRoutingConfigOnce();
  
  // Get all providers
  const providers = cfg.providers || {};
  const defaultProviderId = cfg.defaults?.providerId || "default";
  const defaultModel = cfg.defaults?.model;
  
  // Print info for each provider
  for (const [providerId, provider] of Object.entries(providers)) {
    const isDefault = providerId === defaultProviderId;
    const providerType = provider.type;
    if (!providerType) continue;
    
    const model = provider.model || defaultModel;
    if (!model) continue;
    
    // Detect model grade using the existing detector
    const grade = detectModelGrade(model);
    
    // Fun decorative messages based on grade (provider-agnostic)
    const gradeMessages: Record<ModelGrade, string[]> = {
      high: [
        "Maximum capability mode engaged",
        "Ultra-performance neural engine active",
        "Running at peak computational capacity",
        "Advanced reasoning circuits online",
        "Hyperdimensional processing enabled",
        "Quantum-enhanced cognition active",
        "Premium neural pathways initialized",
        "Operating at maximum intelligence"
      ],
      mid: [
        "Balanced performance mode active",
        "Standard processing engaged",
        "Efficient reasoning systems online",
        "Optimal resource allocation active",
        "Core intelligence modules ready",
        "Stable cognitive systems initialized",
        "Production-ready neural state",
        "Reliable processing pathways online"
      ],
      low: [
        "Efficient lightweight mode active",
        "Quick response systems engaged",
        "Streamlined processing online",
        "Resource-optimized state ready",
        "Fast neural pathways initialized",
        "Compact intelligence core active",
        "Speed-optimized circuits engaged",
        "Rapid inference mode online"
      ]
    };
    
    // Pick a random message based on grade
    const messages = gradeMessages[grade];
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    // Use different colors for different providers
    const colors: Record<string, string> = {
      openai: "\x1b[32m",    // green
      claude: "\x1b[36m",    // cyan
      gemini: "\x1b[34m",    // blue
      grok: "\x1b[35m",      // magenta
      groq: "\x1b[33m",      // yellow
    };
    
    const color = colors[providerType] || "\x1b[37m"; // default white
    const resetColor = "\x1b[0m";
    
    // Render provider name in tiny Braille
    const brailleProviderName = renderTinyBraille(providerType, 1);
    const brailleLines = brailleProviderName.split('\n');
    
    // Print Braille provider name with color
    for (const line of brailleLines) {
      console.log(`${color}${line}${resetColor}`);
    }
    
    // Build the info line
    const providerDisplay = providerId === "default" ? providerType.toUpperCase() : `${providerType.toUpperCase()} (${providerId})`;
    const infoLine = `+ ${providerDisplay}: ${message}`;
    
    // Highlight default provider
    if (isDefault) {
      console.log(`${color}${infoLine} [DEFAULT]${resetColor}`);
    } else {
      console.log(`${color}${infoLine}${resetColor}`);
    }
    
    // Add spacing between providers
    console.log();
  }
}
