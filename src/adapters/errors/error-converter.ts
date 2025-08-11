export type ErrorEnvelope = "claude" | "openai";

export type ClaudeErrorBody = {
  type: "error";
  error: { type: string; message: string };
};

export type OpenAIErrorBody = {
  error: { type: string; message: string };
};

export function toErrorBody(envelope: ErrorEnvelope, message: string): ClaudeErrorBody | OpenAIErrorBody {
  if (envelope === "openai") {
    return { error: { type: "api_error", message } };
  }
  return { type: "error", error: { type: "api_error", message } };
}

