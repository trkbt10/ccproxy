/**
 * Harmony Tokenizer Utility
 *
 * Provides tokenization support for Harmony format messages using tiktoken
 * with the o200k_harmony encoding. This is used to convert text content
 * into token IDs that can be directly processed by gpt-oss models.
 */

import { Tiktoken } from "tiktoken";
import o200k_base from "tiktoken/encoders/o200k_base";

// Harmony-specific special tokens to add to the base encoder
const HARMONY_ADDITIONAL_TOKENS = {
  "<|start|>": 200006,
  "<|end|>": 200007,
  "<|message|>": 200008,
  "<|channel|>": 200005,
  "<|constrain|>": 200003,
  "<|return|>": 200002,
  "<|call|>": 200012,
} as const;

// Merge base special tokens with Harmony-specific tokens
// This creates the complete set of special tokens for o200k_harmony encoding
export const HARMONY_SPECIAL_TOKENS = {
  ...o200k_base.special_tokens,
  ...HARMONY_ADDITIONAL_TOKENS,
} as const;

// Inverse mapping for decoding
export const TOKEN_TO_STRING = Object.entries(HARMONY_SPECIAL_TOKENS).reduce(
  (acc, [str, token]) => ({ ...acc, [token]: str }),
  {} as Record<number, string>
);

let encoder: Tiktoken | null = null;

/**
 * Get or initialize the o200k_harmony encoder
 */
function getEncoder(): Tiktoken {
  if (!encoder) {
    // Create encoder with the merged special tokens for o200k_harmony
    encoder = new Tiktoken(o200k_base.bpe_ranks, HARMONY_SPECIAL_TOKENS, o200k_base.pat_str);
  }
  return encoder;
}

/**
 * Tokenize a string using o200k_harmony encoding
 * @param text - The text to tokenize
 * @param allowedSpecial - Set of special tokens to allow (default: all)
 * @param disallowedSpecial - Set of special tokens to disallow (default: none)
 * @returns Array of token IDs
 */
export function tokenizeHarmony(text: string): Uint32Array {
  const enc = getEncoder();
  return enc.encode(text);
}

/**
 * Decode token IDs back to string
 * @param tokens - Array of token IDs
 * @returns Decoded string
 */
export function decodeHarmony(tokens: Uint32Array): Uint8Array {
  const enc = getEncoder();
  return enc.decode(tokens);
}

/**
 * Tokenize a ChatCompletion message content field
 * The encoder now handles Harmony special tokens directly
 * @param content - The message content string
 * @returns Array of token IDs
 */
export function tokenizeMessageContent(content: string): number[] {
  // With the merged special tokens in the encoder,
  // tiktoken should handle Harmony tokens correctly
  const tokens = tokenizeHarmony(content);
  return Array.from(tokens);
}

/**
 * Process ChatCompletion messages to optionally tokenize content
 * @param messages - Array of ChatCompletion messages
 * @param tokenize - Whether to tokenize the content
 * @returns Processed messages with tokenized content if requested
 */
export function processMessagesWithTokens(
  messages: Array<{ role: string; content: string | number[] }>,
  tokenize: boolean = false
): Array<{ role: string; content: string | number[] }> {
  if (!tokenize) {
    return messages;
  }

  return messages.map((message) => ({
    ...message,
    content: typeof message.content === "string" ? tokenizeMessageContent(message.content) : message.content,
  }));
}

/**
 * Clean up the encoder to free memory
 */
export function cleanupEncoder(): void {
  if (encoder) {
    encoder.free();
    encoder = null;
  }
}
