import { encoding_for_model, get_encoding } from "tiktoken";
// Lightweight tokenizer selection without hardcoding a specific model.
// Falls back to cl100k_base if the model is unknown.
export function getTokenizerForModel(model?: string) {
  try {
    return encoding_for_model("gpt-5");
  } catch {
    // Fallback to a generic encoding similar to GPT-4/4o
    return get_encoding("cl100k_base");
  }
}
