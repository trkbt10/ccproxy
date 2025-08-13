import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type {
  Response as OpenAIResponse,
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { RoutingConfig } from "../../../../../config/types";
import { buildOpenAICompatibleClient } from "../../../../../adapters/providers/openai-client";
import { isOpenAIResponse, isResponseEventStream } from "../../../../../adapters/providers/openai-generic/guards";
import { extractToolNamesFromResponses, selectProviderForOpenAI } from "../../../../../execution/openai-tool-model-selector";

type Plan =
  | { type: "json"; getBody: () => Promise<OpenAIResponse> }
  | { type: "stream"; stream: AsyncIterable<ResponseStreamEvent> };

export function createResponsesHandler(routing: RoutingConfig) {
  return async (c: Context) => {
    const requestId = c.get("requestId");
    const abortController = c.get("abortController");
    const req = (await c.req.json()) as ResponseCreateParams;
    const stream = !!req.stream;
    console.log(`🟢 [Request ${requestId}] new /v1/responses stream=${stream}`);

    const toolNames = extractToolNamesFromResponses(req);
    const { providerId, model } = selectProviderForOpenAI(routing, { model: req.model as string, toolNames });
    const provider = routing.providers?.[providerId];
    if (!provider && providerId !== "default") {
      throw new Error(`Provider '${providerId}' not found`);
    }
    const client = buildOpenAICompatibleClient(provider!, model);

    if (stream) {
      return streamSSE(c, async (sse) => {
        const iterable = await client.responses.create(
          { ...req, stream: true },
          abortController ? { signal: abortController.signal } : undefined,
        );
        if (!isResponseEventStream(iterable)) throw new Error("Expected ResponseStreamEvent iterable");
        try {
          for await (const ev of iterable) {
            await sse.writeSSE({ data: JSON.stringify(ev) });
          }
        } finally {
          // No explicit [DONE] for Responses API, just end the stream
        }
      });
    }

    const resp = await client.responses.create(
      { ...req, stream: false },
      abortController ? { signal: abortController.signal } : undefined,
    );
    if (!isOpenAIResponse(resp)) throw new Error("Expected OpenAIResponse");
    return c.json(resp);
  };
}
