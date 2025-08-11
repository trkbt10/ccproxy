export type ErrorEnvelope = "claude" | "openai";

export type ClaudeErrorBody = {
  type: "error";
  error: { type: string; message: string };
};

export type OpenAIErrorBody = {
  error: { type: string; message: string };
};

export function toErrorBody(
  envelope: ErrorEnvelope,
  message: string,
  type?: string
): ClaudeErrorBody | OpenAIErrorBody {
  const t = type || "api_error";
  if (envelope === "openai") {
    return { error: { type: t, message } };
  }
  return { type: "error", error: { type: t, message } };
}
