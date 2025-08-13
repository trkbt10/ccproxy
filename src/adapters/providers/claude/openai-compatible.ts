import Anthropic from "@anthropic-ai/sdk";
import type { 
  Response as OpenAIResponse, 
  ResponseCreateParams, 
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent, 
  ResponseInput,
  Tool
} from "openai/resources/responses/responses";
import type { Provider } from "../../../config/types";
import type { OpenAICompatibleClient } from "../openai-client-types";
import { selectApiKey } from "../shared/select-api-key";
import { convertResponseInputToMessagesLocal, convertToolsForChatLocal, convertToolChoiceForChatLocal } from "./input-converters";
import type { 
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletion,
  ChatCompletionChunk
} from "openai/resources/chat/completions";
import { claudeToOpenAIResponse, claudeToOpenAIStream, claudeToChatCompletion, claudeToChatCompletionStream } from "./openai-response-adapter";
import { chatCompletionToClaudeLocal } from "./request-converter";
// Conversation state updates are handled by the HTTP response processor
import type { Message as ClaudeMessage, MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import { resolveModelForProvider } from "../shared/model-mapper";
import type { ChatCompletionsCreateFn, ResponsesCreateFn } from "../openai-client-types";
import { convertChatCompletionToolToTool } from "./guards";

function buildChatParams(
  params: ResponseCreateParams
): ChatCompletionCreateParams {
  const messages: ChatCompletionCreateParams["messages"] = [];

  if (params.instructions) {
    messages.push({ role: "system", content: params.instructions });
  }
  if (params.input) {
    if (typeof params.input === "string") {
      messages.push({ role: "user", content: params.input });
    } else {
      if (!params.input) {
        messages.push({ role: "user", content: "" });
      } else {
        const converted = convertResponseInputToMessagesLocal(params.input);
        messages.push(...converted);
      }
    }
  }

  const chatParams: ChatCompletionCreateParams = {
    model: params.model || process.env.ANTHROPIC_MODEL || "",
    messages,
    stream: !!params.stream,
  };

  if (params.max_output_tokens != null)
    chatParams.max_tokens = params.max_output_tokens;
  if (params.temperature != null)
    chatParams.temperature = params.temperature;
  if (params.top_p != null) chatParams.top_p = params.top_p;
  if (params.tools) {
    const mapped = convertToolsForChatLocal(params.tools);
    if (mapped) chatParams.tools = mapped;
  }
  if (params.tool_choice) {
    const choice = convertToolChoiceForChatLocal(params.tool_choice);
    if (choice) chatParams.tool_choice = choice;
  }

  return chatParams;
}

export function buildOpenAICompatibleClientForClaude(
  provider: Provider,
  modelHint?: string
): OpenAICompatibleClient {
  const apiKey = selectApiKey(provider, modelHint);
  if (!apiKey) throw new Error("Missing Anthropic API key (configure provider.apiKey or api.keyByModelPrefix)");
  const resolvedKey: string = apiKey;
  const anthropic = new Anthropic({ apiKey: resolvedKey, baseURL: provider.baseURL });

  let boundConversationId: string | undefined;
  // No longer using per-conversation ID manager; conversions are deterministic

  // chat.completions.create overloads
  function chatCompletionsCreate(params: ChatCompletionCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<ChatCompletion>;
  function chatCompletionsCreate(params: ChatCompletionCreateParamsStreaming, options?: { signal?: AbortSignal }): Promise<AsyncIterable<ChatCompletionChunk>>;
  function chatCompletionsCreate(params: ChatCompletionCreateParams, options?: { signal?: AbortSignal }): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>>;
  async function chatCompletionsCreate(
    params: ChatCompletionCreateParams,
    options?: { signal?: AbortSignal }
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
          // Resolve model using live models list (type-safe, provider-driven)
          const resolvedModel = await resolveModelForProvider({
            provider,
            sourceModel: params.model,
            modelHint,
          });
          const claudeReq = chatCompletionToClaudeLocal({ ...params, model: resolvedModel });

          if (params.stream) {
            const streamAny = (await anthropic.messages.create(
              { ...claudeReq, stream: true },
              { signal: options?.signal }
            ));
            return claudeToChatCompletionStream(streamAny, resolvedModel);
          }

          const claudeResp = await anthropic.messages.create(
            { ...claudeReq, stream: false },
            { signal: options?.signal }
          );
          return claudeToChatCompletion(claudeResp, resolvedModel);
  }

  // responses.create overloads
  function responsesCreate(params: ResponseCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<OpenAIResponse>;
  function responsesCreate(params: ResponseCreateParamsStreaming, options?: { signal?: AbortSignal }): Promise<AsyncIterable<ResponseStreamEvent>>;
  function responsesCreate(params: ResponseCreateParams, options?: { signal?: AbortSignal }): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>>;
  async function responsesCreate(
    params: ResponseCreateParams,
    options?: { signal?: AbortSignal }
  ): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>> {
        const chatParams = buildChatParams(params);
        // Resolve model using live models list (type-safe, provider-driven)
        chatParams.model = await resolveModelForProvider({
          provider,
          sourceModel: chatParams.model,
          modelHint,
        });
        const claudeReq = chatCompletionToClaudeLocal(chatParams);

        if (chatParams.stream) {
          const streamAny = (await anthropic.messages.create(
            { ...claudeReq, stream: true },
            { signal: options?.signal }
          ));
          const openaiTools = chatParams.tools?.map(convertChatCompletionToolToTool).filter((t): t is Tool => t !== null);
          return claudeToOpenAIStream(streamAny, chatParams.model, openaiTools);
        }

        const claudeResp = await anthropic.messages.create(
          { ...claudeReq, stream: false },
          { signal: options?.signal }
        );
        const response = claudeToOpenAIResponse(claudeResp, chatParams.model);
        return response;
  }

  return {
    chat: {
      completions: {
        create: chatCompletionsCreate,
      },
    },
    responses: {
      create: responsesCreate,
    },
    models: {
      async list() {
        const models = await anthropic.models.list();
        const data = models.data.map((m) => ({
          id: m.id,
          object: "model" as const,
          created: m.created_at ? new Date(m.created_at).getTime() : undefined,
          owned_by: "anthropic",
        }));
        return { object: "list" as const, data };
      },
    },
    setConversationId(convId: string) {
      boundConversationId = convId;
    },
  };
}
