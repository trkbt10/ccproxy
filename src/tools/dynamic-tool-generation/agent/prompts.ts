// System and user prompts for dynamic tool generation

import type { GenerationRequest } from "../types";

const SYSTEM_RULES = `
You generate production-quality, safe JavaScript (ESM) for a dynamic tool system.

System knowledge:
- The runtime loads your files from storage and executes them inside a Node VM via vm.SourceTextModule.
- Only relative ESM imports are allowed, and only .js files (no bare specifiers, no require, no dynamic import).
- No external dependencies; keep tools self-contained and deterministic. Avoid network, filesystem, or process interaction.
- The entry file must export a named const runtime object with shape: { name: string; description?: string; execute(input, context): any }.
- The loader expects an entry of handler.js and a named export (usually dynamicTool).
- Tests are optional; include lightweight examples only if requested.

Quality and safety rules:
- Use plain JavaScript .js ESM modules (package.json is type: module). No TypeScript syntax; JSDoc is allowed.
- Enforce minimal runtime validation derived from the provided JSON Schemas. On invalid input, throw Error with a concise message (fail fast; do not swallow errors).
- Keep code modular and small: split core logic and validation into separate files and import them in handler.js.
- No wildcard or re-exports; use explicit named exports only.
- Deterministic, side-effect-free logic. No global state. No eval.
- Prefer clear, simple algorithms over cleverness.

File structure guidance (recommended):
- handler.js: exports the runtime object and wires validation + logic.
- core/validate.js: minimal schema-based guards; return parsed values or throw Error.
- core/logic.js: pure functions for the transformation.
`;

export function buildUserPrompt(req: GenerationRequest): string {
  const parts: string[] = [];
  parts.push("Task: Generate a JavaScript dynamic tool for this system.");
  parts.push(`Instruction: ${req.instruction}`);
  if (req.suggestedName) parts.push(`Suggested Name: ${req.suggestedName}`);
  if (req.inputSchema) {
    parts.push(`Input JSON Schema: ${JSON.stringify(req.inputSchema)}`);
  }
  if (req.outputSchema) {
    parts.push(`Output JSON Schema: ${JSON.stringify(req.outputSchema)}`);
  }
  parts.push(
    `Respond with strict JSON only (no markdown) matching: ` +
      `{ "tool": {"name":"","description":"","entry":"handler.js","exportName":"dynamicTool"}, ` +
      `"files": [{"path":"handler.js","content":"..."}, {"path":"core/validate.js","content":"..."}, {"path":"core/logic.js","content":"..."}], ` +
      `"testFiles": [{"path":"handler.spec.js","content":"..."}] }.`
  );
  parts.push("Constraints: only relative .js ESM imports, no external deps, no require/dynamic import, no network/fs/process usage.");
  parts.push("Validation: implement minimal guards based on the input schema; throw Error on invalid input; return data matching the output schema.");
  parts.push("Style: small, modular, deterministic; explicit named exports; clear variable names; add short JSDoc where helpful.");
  return parts.join("\n");
}

export const SYSTEM_PROMPT = SYSTEM_RULES.trim();
