import type { ToolScenario, ToolKey } from "../../../../src/tools/dynamic-tool-generation/types";
import crypto from "node:crypto";

function hash(obj: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

export function buildSumScenario(): ToolScenario<{ values: number[] }, { sum: number; count: number }> {
  const inputSchema = {
    type: "object",
    properties: {
      values: { type: "array", items: { type: "number" } },
    },
    required: ["values"],
    additionalProperties: false,
  } as const;
  const outputSchema = {
    type: "object",
    properties: {
      sum: { type: "number" },
      count: { type: "number" },
    },
    required: ["sum", "count"],
    additionalProperties: false,
  } as const;

  const request = {
    instruction: "Implement a tool that sums an array of numbers and returns { sum, count }.",
    inputSchema: inputSchema as unknown as Record<string, unknown>,
    outputSchema: outputSchema as unknown as Record<string, unknown>,
    suggestedName: "sum_numbers",
  };

  const key: ToolKey = {
    functionName: "sum_numbers",
    schemaHash: hash({ inputSchema, outputSchema }),
    variant: "v1",
  };

  const sampleInput = { values: [1, 2, 3, 4, 5] };

  return { scenarioId: "sum", namespace: ["sum"], key, request, sampleInput };
}
