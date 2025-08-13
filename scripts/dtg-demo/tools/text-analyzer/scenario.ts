import type { ToolScenario, ToolKey } from "../../../../src/tools/dynamic-tool-generation/types";
import crypto from "node:crypto";

function hash(obj: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

export function buildTextAnalyzerScenario(): ToolScenario<{ text: string; topN?: number; stopwords?: string[] }, { totalWords: number; top: Array<{ word: string; count: number }> }> {
  const inputSchema = {
    type: "object",
    properties: {
      text: { type: "string" },
      topN: { type: "integer", minimum: 1, default: 10 },
      stopwords: { type: "array", items: { type: "string" } },
    },
    required: ["text"],
    additionalProperties: false,
  } as const;
  const outputSchema = {
    type: "object",
    properties: {
      totalWords: { type: "integer" },
      top: {
        type: "array",
        items: {
          type: "object",
          properties: { word: { type: "string" }, count: { type: "integer" } },
          required: ["word", "count"],
          additionalProperties: false,
        },
      },
    },
    required: ["totalWords", "top"],
    additionalProperties: false,
  } as const;

  const instruction = [
    "Implement a text analyzer tool.",
    "Tokenize input text into words (letters, digits, underscore).",
    "Normalize to lowercase. Remove stopwords if provided.",
    "Return totalWords and top most frequent words up to topN (default 10).",
  ].join(" ");

  const request = {
    instruction,
    inputSchema: inputSchema as unknown as Record<string, unknown>,
    outputSchema: outputSchema as unknown as Record<string, unknown>,
    suggestedName: "text_analyzer",
  };

  const key: ToolKey = {
    functionName: "text_analyzer",
    schemaHash: hash({ inputSchema, outputSchema }),
    variant: "v1",
  };

  const sampleInput = {
    text: "This is a test. This test is only a test.",
    topN: 3,
    stopwords: ["is", "a"],
  };

  return { scenarioId: "text-analyzer", namespace: ["text-analyzer"], key, request, sampleInput };
}
