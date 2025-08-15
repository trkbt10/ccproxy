Provider Adapters Architecture

Overview
- Goal: Normalize different provider SDKs/HTTP APIs behind a small ProviderAdapter and optionally expose an OpenAI-compatible client used throughout the app.
- Key modules:
  - `providers/*/adapter-factory.ts`: returns a `ProviderAdapter<TInput, TOutput>` for the raw provider API.
  - `providers/openai-compat/*`: builds an OpenAI-compatible client where needed.
  - `providers/registry.ts`: chooses the right adapter for a provider type.
  - `execution/routing-config.ts#buildProviderClient`: returns an OpenAI-compatible client for a given provider.

Core Types
- `ProviderAdapter<TInput, TOutput>`:
  - `name: string` provider identifier
  - `generate(params: { model: string; input: TInput; signal?: AbortSignal }): Promise<TOutput>`
  - `stream?(params): AsyncGenerator<TOutput>` (optional, for providers with native streaming)
  - `listModels(): Promise<{ object: "list"; data: Array<{ id: string; object: "model" }> }>`
- `OpenAICompatibleClient` (used by the HTTP layer):
  - `responses.create(params, options?): Promise<OpenAIResponse | AsyncIterable<ResponseStreamEvent>>`
  - `models.list()`

Existing Patterns
- OpenAI (`providers/openai/adapter-factory.ts`):
  - Thin wrapper around the official SDK. `generate` directly calls `openai.responses.create`.
  - Used via `openai-compat/from-adapter.ts` to expose `OpenAICompatibleClient`.
- Gemini (`providers/gemini/adapter-factory.ts`):
  - Custom fetch client + streaming SSE parser.
  - Dedicated `openai-compatible` builders adapt Gemini output into OpenAI Responses API shapes.
  - Chosen in `buildProviderClient()` via a special case.
- Grok (`providers/grok/adapter-factory.ts`):
  - HTTP fetch + SSE parsing in the adapter.
  - Dedicated `openai-compatible` builder for Responses API compatibility.

Claude Provider Plan
Two viable approaches exist; choose based on integration needs and reuse preferences.

Option A — Dedicated OpenAI-Compatible Builder (recommended)
- Files (to add):
  - `providers/claude/openai-compatible.ts` (builds `OpenAICompatibleClient` using Anthropic SDK)
  - `providers/claude/claude-response-adapter.ts` (maps Claude JSON/stream events to OpenAI Responses `OpenAIResponse` / `ResponseStreamEvent`)
- Flow:
  1) Convert OpenAI Responses `ResponseCreateParams` → Chat Completion params using `providers/openai-generic/responses-adapter/input-converter.ts` and helpers.
  2) Convert Chat Completion params → Claude Messages request via `adapters/message-converter/openai-to-claude/chat-completion-request.ts`.
  3) Call Anthropic Messages API (streaming or non-streaming) with `ANTHROPIC_API_KEY` (or provider-config key via `selectApiKey`).
  4) Convert Claude responses/events → OpenAI Responses API shapes.
- Integration:
  - Add a special case in `buildProviderClient()` for `provider.type === "claude"` to call this builder (like Gemini/Grok).
  - Pros: Keeps `ProviderAdapter` simpler; compatibility logic is co-located and explicit.

Option B — Implement `ProviderAdapter` That Already Emits OpenAI Responses
- Files (to add):
  - `providers/claude/adapter-factory.ts`
- Flow:
  1) Inside `generate`, accept `ResponseCreateParams` (as `input`).
  2) Do the conversions (Responses → Chat → Claude request) and call Anthropic.
  3) Return `OpenAIResponse` or `AsyncIterable<ResponseStreamEvent>` directly.
- Integration:
  - Works with `openai-compat/from-adapter.ts` (no special case required).
  - Cons: Adapter becomes more complex; coupling conversions into adapter logic.

API Key Handling
- Use `providers/shared/select-api-key.ts` to resolve API keys from provider config, header-based selection, or envs.
- For Claude: resolve `ANTHROPIC_API_KEY` if not set on provider config.

Model Handling
- Pass `modelHint` from routing into the adapter/builder. Respect model mapping rules if needed (e.g., translating Claude models).

Streaming
- Prefer adapting provider-native streams to OpenAI Responses `ResponseStreamEvent` via a dedicated adapter (see `providers/openai-generic/responses-adapter/stream-handler.ts` as a reference for conversions from Chat Completions streams).

Testing Strategy
- Unit-test the transformation layers (Responses → Chat → Claude request; Claude events → OpenAI Responses events).
- Create minimal fixtures for Claude JSON and stream events to validate end-to-end mapping.

Implementation Checklist (Claude)
- [ ] Add `providers/claude/openai-compatible.ts` (Option A) or `providers/claude/adapter-factory.ts` (Option B).
- [ ] Implement Responses → Chat → Claude request conversion pipeline.
- [ ] Implement Claude JSON/stream → OpenAI Responses mapping.
- [ ] Wire `buildProviderClient()` to use the new builder for `type === "claude"`.
- [ ] Add docs and small tests for conversions and streaming.
