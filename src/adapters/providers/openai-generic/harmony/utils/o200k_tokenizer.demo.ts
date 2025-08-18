/**
 * Demo script for o200k_harmony tokenizer
 *
 * Run with: npx tsx src/adapters/providers/openai-generic/harmony/utils/o200k_tokenizer.demo.ts
 */

import {
  tokenizeHarmony,
  decodeHarmony,
  tokenizeMessageContent,
  processMessagesWithTokens,
  HARMONY_SPECIAL_TOKENS,
  cleanupEncoder,
} from "./o200k_tokenizer";

// ANSI color codes for pretty output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function printSection(title: string) {
  console.log(`\n${colors.bright}${colors.blue}=== ${title} ===${colors.reset}\n`);
}

function printTokens(label: string, tokens: number[] | Uint32Array) {
  const tokenArray = Array.from(tokens);
  console.log(`${colors.yellow}${label}:${colors.reset}`);
  console.log(`  Count: ${tokenArray.length}`);
  console.log(`  Tokens: [${tokenArray.join(", ")}]`);
}

function printMessage(message: any) {
  console.log(`${colors.cyan}Role:${colors.reset} ${message.role}`);
  if (typeof message.content === "string") {
    console.log(`${colors.cyan}Content:${colors.reset} "${message.content.replace(/\n/g, "\\n")}"`);
  } else {
    console.log(
      `${colors.cyan}Content (tokenized):${colors.reset} [${message.content.slice(0, 10).join(", ")}${
        message.content.length > 10 ? ", ..." : ""
      }] (${message.content.length} tokens)`
    );
  }
}

async function main() {
  console.log(`${colors.bright}${colors.green}O200K Harmony Tokenizer Demo${colors.reset}`);

  // 1. Basic tokenization
  printSection("Basic Tokenization");

  const simpleText = "Hello, world! This is a test.";
  const simpleTokens = tokenizeHarmony(simpleText);
  console.log(`Text: "${simpleText}"`);
  printTokens("Simple text", simpleTokens);

  // 2. Special tokens
  printSection("Special Tokens");

  console.log("Available special tokens:");
  for (const [token, id] of Object.entries(HARMONY_SPECIAL_TOKENS)) {
    console.log(`  ${colors.magenta}${token}${colors.reset} � ${id}`);
  }

  // 3. Harmony message tokenization
  printSection("Harmony Message Tokenization");

  const harmonyMessage = "<|start|>user<|message|>What is the weather like today?<|end|>";
  const harmonyTokens = tokenizeMessageContent(harmonyMessage);
  console.log(`Message: "${harmonyMessage}"`);
  printTokens("Harmony message", harmonyTokens);

  // 4. Complex developer message
  printSection("Developer Message Example");

  const developerMessage = `<|start|>developer<|message|># Instructions

Always respond in riddles and be mysterious

# Tools

## functions

namespace functions {

// Gets the current weather
type get_weather = (_: {
  location: string
}) => any;

}<|end|>`;

  const devTokens = tokenizeMessageContent(developerMessage);
  console.log(`${colors.dim}Developer message (truncated):${colors.reset}`);
  console.log(developerMessage.split("\n").slice(0, 5).join("\n") + "\n...");
  printTokens("Developer message", devTokens);

  // 5. Process multiple messages
  printSection("Process Multiple Messages");

  const messages = [
    {
      role: "system",
      content:
        "<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.\nKnowledge cutoff: 2024-06\nCurrent date: 2025-08-18<|end|>",
    },
    {
      role: "developer",
      content: "<|start|>developer<|message|># Instructions\n\nAlways respond in riddles<|end|>",
    },
    {
      role: "user",
      content: "<|start|>user<|message|>What is 2+2?<|end|>",
    },
    {
      role: "assistant",
      content: "<|start|>assistant",
    },
  ];

  console.log(`${colors.bright}Original messages:${colors.reset}`);
  messages.forEach((msg, i) => {
    console.log(`\n${colors.dim}Message ${i + 1}:${colors.reset}`);
    printMessage(msg);
  });

  const tokenizedMessages = processMessagesWithTokens(messages, true);

  console.log(`\n${colors.bright}Tokenized messages:${colors.reset}`);
  tokenizedMessages.forEach((msg, i) => {
    console.log(`\n${colors.dim}Message ${i + 1}:${colors.reset}`);
    printMessage(msg);
  });

  // 6. Decode demonstration (if we had proper decode support)
  printSection("Decoding Notes");

  console.log(`${colors.yellow}Note:${colors.reset} The decode function returns Uint8Array (raw bytes).`);
  console.log("To properly decode, you would need to convert the bytes to a string.");
  console.log("Special tokens would need to be handled separately during decoding.");

  // Clean up
  cleanupEncoder();
  console.log(`\n${colors.green} Demo completed. Encoder cleaned up.${colors.reset}`);
}

// Run the demo
main().catch(console.error);
