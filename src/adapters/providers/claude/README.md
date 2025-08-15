Claude Provider Adapter

Goal
- Provide Claude (Anthropic) integration that can drive the system through the OpenAI Responses API surface used internally.

Recommended Approach (Option A)
- Implement `openai-compatible.ts` that exports a function to build an `OpenAICompatibleClient` over Anthropic:
  - Convert Requests: OpenAI `ResponseCreateParams` → Chat params → Claude `messages.create` input
    - Use `providers/openai-generic/responses-adapter/input-converter.ts` + tool converters
    - Reuse `adapters/message-converter/openai-to-claude/chat-completion-request.ts`
  - Non-streaming: map Claude JSON to `OpenAIResponse`
  - Streaming: map Claude SSE events to `ResponseStreamEvent`
  - Update conversation state via `conversationStore`

Alternative (Option B)
- Implement `adapter-factory.ts` that returns `ProviderAdapter<ResponseCreateParams, OpenAIResponse | AsyncIterable<ResponseStreamEvent>>` and rely on `openai-compat/from-adapter.ts`.
- More coupling inside the adapter, but removes `buildProviderClient` special-casing.

Keys and Config
- Resolve keys via `providers/shared/select-api-key.ts` (fallback to `ANTHROPIC_API_KEY`).
- Respect `provider.baseURL` if present (maps to Anthropic SDK `baseURL`).

Next Steps
- Choose Option A or B.
- Implement conversions and event mapping.
- Wire `execution/routing-config.ts#buildProviderClient` for `type === "claude"` if using Option A.
