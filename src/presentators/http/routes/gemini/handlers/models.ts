import type { Context } from "hono";
import type { RoutingConfig } from "../../../../../config/types";
import { buildOpenAICompatibleClient } from "../../../../../adapters/providers/openai-client";

export const createModelsHandler = (routingConfig: RoutingConfig) => {
  return async (c: Context) => {
    const requestId = c.get("requestId");
    console.log(`[Request ${requestId}] Gemini models request`);

    // Get the default provider
    const providerId = routingConfig.defaults?.providerId || "default";
    const provider = routingConfig.providers?.[providerId];
    if (!provider) {
      // Return empty model list if no provider configured
      return c.json({ models: [] });
    }

    try {
      // Create OpenAI client and get available models
      const openai = buildOpenAICompatibleClient(provider);
      const modelsResponse = await openai.models.list();
      
      // Convert OpenAI model format to Gemini format
      const models = modelsResponse.data.map((model: any) => ({
        name: `models/${model.id}`,
        baseModelId: model.id,
        version: "001",
        displayName: model.id,
        description: `Model ${model.id} from ${providerId} provider`,
        inputTokenLimit: 32768, // Default values
        outputTokenLimit: 8192,
        supportedGenerationMethods: ["generateContent", "streamGenerateContent"],
        temperature: 0.9,
        topP: 1.0,
        topK: 40
      }));

      return c.json({ models });
    } catch (error) {
      console.error(`[Request ${requestId}] Error fetching models:`, error);
      // Return empty model list on error
      return c.json({ models: [] });
    }
  };
};