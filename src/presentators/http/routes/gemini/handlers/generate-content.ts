import type { Context } from "hono";
import type { RoutingConfig } from "../../../../../config/types";
import type { GeminiGenerateContentRequest } from "../../../../../adapters/message-converter/openai-to-gemini/types";
import { buildOpenAICompatibleClient } from "../../../../../adapters/providers/openai-client";
import { geminiToOpenAI } from "../../../../../adapters/message-converter/openai-to-gemini/request-converter";
import { openAIToGemini } from "../../../../../adapters/message-converter/openai-to-gemini/response-converter";

export const createGenerateContentHandler = (routingConfig: RoutingConfig) => {
  return async (c: Context) => {
    const requestId = c.get("requestId");
    const abortController = c.get("abortController");
    const modelFromPath = c.get("geminiModel") || c.req.param("model");

    console.log(
      `\n    🟢 [Request ${requestId}] new /generateContent for model ${modelFromPath} at ${new Date().toISOString()}`
    );

    try {
      const geminiReq = (await c.req.json()) as GeminiGenerateContentRequest;
      console.log(`[Request ${requestId}] Incoming Gemini Request:`, JSON.stringify(geminiReq, null, 2));

      // Convert Gemini request to OpenAI format
      const openAIReq = geminiToOpenAI(geminiReq, modelFromPath);
      console.log(`[Request ${requestId}] Converted to OpenAI format:`, JSON.stringify(openAIReq, null, 2));

      // Select provider - use default provider for now
      const providerId = routingConfig.defaults?.providerId || "default";
      const provider = routingConfig.providers?.[providerId];
      if (!provider) {
        throw new Error(`Provider '${providerId}' not found`);
      }

      // Create OpenAI client with model hint
      const openai = buildOpenAICompatibleClient(provider, modelFromPath);

      // Make the request
      const response = await openai.chat.completions.create(
        {
          ...openAIReq,
          stream: false,
        },
        {
          signal: abortController.signal,
        }
      );

      console.log(`[Request ${requestId}] OpenAI Response:`, JSON.stringify(response, null, 2));

      // Convert OpenAI response to Gemini format
      const geminiResponse = openAIToGemini(response, modelFromPath);

      console.log(`[Request ${requestId}] Converted to Gemini format:`, JSON.stringify(geminiResponse, null, 2));

      return c.json(geminiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Request cancelled by client" || abortController.signal.aborted) {
        console.log(`[Request ${requestId}] Request was cancelled`);
        return c.text("Request cancelled", 499 as Parameters<typeof c.text>[1]);
      }
      throw error;
    }
  };
};
