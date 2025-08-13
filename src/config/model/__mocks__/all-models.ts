/**
 * @file Test Mock Data for Model Grade Detection
 * Sources model lists from generated snapshots under __mocks__/snapshots
 * using provider adapters via the registry abstraction.
 *
 * WARNING: This file should NEVER be imported in production code.
 * It exists solely for testing purposes to verify the grade detection algorithm.
 */

// Generated snapshot imports (created by mock-models-generator.ts)
// These files are produced from real listModels() calls based on .env providers.
import OPENAI_SNAPSHOT from "./snapshots/openai.models.json" assert { type: "json" };
import GEMINI_SNAPSHOT from "./snapshots/gemini.models.json" assert { type: "json" };
import GROK_SNAPSHOT from "./snapshots/grok.models.json" assert { type: "json" };
import GROQ_SNAPSHOT from "./snapshots/groq.models.json" assert { type: "json" };
import CLAUDE_SNAPSHOT from "./snapshots/claude.models.json" assert { type: "json" };
import type { ModelArrayType } from "../../../types/common";

type Snapshot = { models: string[] };

export const OPENAI_MODELS = (OPENAI_SNAPSHOT as Snapshot)
  .models as readonly string[];
export const GEMINI_MODELS = (GEMINI_SNAPSHOT as Snapshot)
  .models as readonly string[];
export const GROK_MODELS = (GROK_SNAPSHOT as Snapshot)
  .models as readonly string[];
export const GROQ_MODELS = (GROQ_SNAPSHOT as Snapshot)
  .models as readonly string[];
export const ANTHROPIC_MODELS = (CLAUDE_SNAPSHOT as Snapshot)
  .models as readonly string[];

// Anthropic is currently provided via an OpenAI-compatible adapter path and
// uses a static list for tests.
// Note: ANTHROPIC_MODELS now comes from generated snapshot

// Narrow types helpful for tests
export type GrokModel = ModelArrayType<typeof GROK_MODELS>;
export type GeminiModel = ModelArrayType<typeof GEMINI_MODELS>;
export type GroqModel = ModelArrayType<typeof GROQ_MODELS>;
export type OpenAIModel = ModelArrayType<typeof OPENAI_MODELS>;
export type AnthropicModel = ModelArrayType<typeof ANTHROPIC_MODELS>;

export type AllModels =
  | GrokModel
  | GeminiModel
  | GroqModel
  | OpenAIModel
  | AnthropicModel;

// Test-only notice
// This file is part of the test suite; do not import in production paths.
