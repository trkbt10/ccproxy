// Deterministic, prefix-based ID conversions between ecosystems

// Extract suffix after the first underscore or return the whole id
function suffix(id: string): string {
  const idx = id.indexOf("_");
  return idx >= 0 ? id.slice(idx + 1) : id;
}

export function toOpenAICallIdFromClaude(claudeToolUseId: string): string {
  return `call_${suffix(claudeToolUseId)}`;
}

export function toClaudeToolUseIdFromOpenAI(openaiCallId: string): string {
  return `toolu_${suffix(openaiCallId)}`;
}

export function isSameIgnoringPrefix(a: string, b: string): boolean {
  return suffix(a) === suffix(b);
}

// Ensure an ID conforms to OpenAI call_id prefix; converts from known variants
export function ensureOpenAICallId(id: string): string {
  if (id.startsWith("call_")) return id;
  return toOpenAICallIdFromClaude(id);
}

export function generateOpenAICallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
