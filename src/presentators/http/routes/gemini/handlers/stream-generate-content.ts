import type { Context } from "hono";
import { stream } from "hono/streaming";
import type { RoutingConfig } from "../../../../../config/types";
import type { GeminiGenerateContentRequest } from "../../../../../adapters/message-converter/openai-to-gemini/types";
import { buildOpenAICompatibleClient } from "../../../../../adapters/providers/openai-client";
import { geminiToOpenAI } from "../../../../../adapters/message-converter/openai-to-gemini/request-converter";
import { openAIStreamToGemini } from "../../../../../adapters/message-converter/openai-to-gemini/stream-converter";
import { selectProvider } from "../../../../../execution/provider-selection";

export const createStreamGenerateContentHandler = (routingConfig: RoutingConfig) => {
  return async (c: Context) => {
    const requestId = c.get("requestId");
    const abortController = c.get("abortController");
    const modelFromPath = c.get("geminiModel") || c.req.param("model");
    const alt = c.req.query("alt");
    const isSSE = alt === "sse";

    console.log(
      `\n    🟢 [Request ${requestId}] new /streamGenerateContent for model ${modelFromPath} (SSE: ${isSSE}) at ${new Date().toISOString()}`
    );

    try {
      const geminiReq = (await c.req.json()) as GeminiGenerateContentRequest;
      console.log(`[Request ${requestId}] Incoming Gemini Request:`, JSON.stringify(geminiReq, null, 2));

      // Convert Gemini request to OpenAI format
      const openAIReq = geminiToOpenAI(geminiReq, modelFromPath);
      console.log(`[Request ${requestId}] Converted to OpenAI format:`, JSON.stringify(openAIReq, null, 2));

      // Select provider via unified logic
      const { providerId } = selectProvider(routingConfig, { explicitModel: modelFromPath, defaultModel: "gpt-4o-mini" });
      const provider = routingConfig.providers?.[providerId];
      if (!provider) {
        throw new Error(`Provider '${providerId}' not found`);
      }

      // Create OpenAI client with model hint
      const openai = buildOpenAICompatibleClient(provider, modelFromPath);

      // Make the streaming request
      const openAIStream = await openai.chat.completions.create(
        {
          ...openAIReq,
          stream: true,
        },
        {
          signal: abortController.signal,
        }
      );

      // Set appropriate headers for SSE
      if (isSSE) {
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");
      } else {
        c.header("Content-Type", "application/json");
      }

      // Stream the response
      return stream(c, async (stream) => {
        try {
          const geminiStream = openAIStreamToGemini(openAIStream, modelFromPath, isSSE);

          for await (const chunk of geminiStream) {
            if (abortController.signal.aborted) {
              break;
            }

            await stream.write(chunk);
          }
        } catch (error) {
          console.error(`[Request ${requestId}] Stream error:`, error);
          throw error;
        }
      });
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
