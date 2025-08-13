import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import type { GenerationPlan, GenerationRequest, OpenAIResponseCandidate } from "../types";
import { isOpenAIResponseCandidate } from "../types";
import type { OpenAICompatibleClient } from "../../../adapters/providers/openai-client-types";

function extractFirstText(resp: OpenAIResponseCandidate): string | undefined {
  if (Array.isArray(resp.output_text) && resp.output_text.length > 0) {
    return resp.output_text[0];
  }
  if (Array.isArray(resp.output)) {
    for (const item of resp.output) {
      if (item && typeof item === "object" && "type" in item) {
        const rec = item as Record<string, unknown>;
        if (rec.type === "message") {
          const content = rec.content as Array<{ type: string; text?: string }> | undefined;
          const firstText = content?.find((c) => c.type === "output_text" || c.type === "text");
          if (firstText?.text) return firstText.text;
        }
        if (rec.type === "output_text" && typeof rec.content === "string") {
          return rec.content as string;
        }
      }
    }
  }
  return undefined;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

type ArtifactRec = { path: string; content: string };
function isArtifact(v: unknown): v is ArtifactRec {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return isNonEmptyString(o.path) && typeof o.content === "string";
}

function assertPlanShape(obj: unknown): asserts obj is {
  tool: { name: string; description?: string; entry: string; exportName: string };
  files: ArtifactRec[];
  testFiles?: ArtifactRec[];
} {
  if (!obj || typeof obj !== "object") throw new Error("plan_not_object");
  const o = obj as Record<string, unknown>;
  const t = o.tool as Record<string, unknown> | undefined;
  if (!t) throw new Error("plan_missing_tool");
  if (!isNonEmptyString(t.name)) throw new Error("plan_tool_name_invalid");
  if (!isNonEmptyString(t.entry)) throw new Error("plan_tool_entry_invalid");
  if (!isNonEmptyString(t.exportName)) throw new Error("plan_tool_export_invalid");
  const files = o.files as unknown;
  if (!Array.isArray(files) || files.length === 0) throw new Error("plan_files_invalid");
  for (const f of files) if (!isArtifact(f)) throw new Error("plan_file_item_invalid");
  const testFiles = o.testFiles as unknown;
  if (testFiles !== undefined) {
    if (!Array.isArray(testFiles)) throw new Error("plan_test_files_invalid");
    for (const f of testFiles) if (!isArtifact(f)) throw new Error("plan_test_file_item_invalid");
  }
}

export async function generateToolPlan(
  client: OpenAICompatibleClient,
  model: string,
  req: GenerationRequest,
  options?: { signal?: AbortSignal }
): Promise<GenerationPlan> {
  const user = buildUserPrompt(req);
  const raw = await client.responses.create(
    {
      model,
      tool_choice: "none",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    },
    options
  );

  if (!raw || typeof raw !== "object") throw new Error("invalid_llm_response_object");
  if (!isOpenAIResponseCandidate(raw)) throw new Error("invalid_llm_response_shape");
  const candidate = raw as OpenAIResponseCandidate;
  const text = extractFirstText(candidate);
  if (!text || typeof text !== "string") throw new Error("llm_response_no_text");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("llm_response_not_json");
  }

  // Narrow the structure without using any
  assertPlanShape(parsed);

  const tool = (parsed as { tool: { name: string; description?: string; entry: string; exportName: string } }).tool;
  const files = (parsed as { files: ArtifactRec[] }).files;
  const testFiles = (parsed as { testFiles?: ArtifactRec[] }).testFiles;

  // Enforce .js entry fallback if absent
  const entry = tool.entry || "handler.js";
  const exportName = tool.exportName || "dynamicTool";
  const name = tool.name || req.suggestedName || "dynamic_tool";
  const description = tool.description;

  const out: GenerationPlan = {
    tool: { name, description, entry, exportName },
    files,
    testFiles,
  };
  return out;
}
