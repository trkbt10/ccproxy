#!/usr/bin/env bun
/**
 * Script to generate mock JSONL responses for harmony decoder tests
 * Uses OpenAI client with Groq provider to generate real responses
 */

import { OpenAI } from "openai";
import type { ChatCompletionCreateParams, ChatCompletion } from "openai/resources/chat/completions";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { ResponseCreateParamsBase } from "../types";
import { harmonizeResponseParams } from "../harmonizer";
import { extractChatCompletionParams } from "../utils/extract-chat-params";

// Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_BASE_URL = process.env.GROQ_BASE_URL;
const GROQ_TEST_MODEL = process.env.GROQ_TEST_MODEL;
const OUTPUT_DIR = join(__dirname, "../__mocks__/scenarios");

// Validate required environment variables
const missingEnvVars: string[] = [];
if (!GROQ_API_KEY) missingEnvVars.push("GROQ_API_KEY");
if (!GROQ_BASE_URL) missingEnvVars.push("GROQ_BASE_URL");
if (!GROQ_TEST_MODEL) missingEnvVars.push("GROQ_TEST_MODEL");

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}\n` +
      "Please set all required environment variables:\n" +
      "  export GROQ_API_KEY=your-api-key\n" +
      "  export GROQ_BASE_URL=https://api.groq.com/openai/v1\n" +
      "  export GROQ_TEST_MODEL=llama3-8b-8192"
  );
}

// Initialize OpenAI client with Groq configuration
const client = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: GROQ_BASE_URL,
});

interface MockRequest {
  name: string;
  description: string;
  params: ResponseCreateParamsBase;
}

interface MockEntry {
  name: string;
  description: string;
  request: {
    original: ResponseCreateParamsBase;
    harmonized: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    chatParams: ChatCompletionCreateParams;
  };
  response: ChatCompletion;
  timestamp: string;
}

/**
 * Send request to Groq and capture response
 * Always uses the harmonizer to convert ResponseCreateParamsBase to harmony format
 */
async function sendRequest(request: MockRequest): Promise<MockEntry> {
  console.log(`\n📤 Sending request: ${request.name}`);
  console.log(`   ${request.description}`);

  // Use harmonizer to convert params to Harmony format messages
  const harmonyMessages = harmonizeResponseParams(request.params, {});

  // Extract chat completion params from the request
  const extractedParams = extractChatCompletionParams(request.params);
  if (!request.params.model) {
    throw new Error(`Model is required in request params for ${request.name}`);
  }
  // Build chat completion params with harmonized messages
  const chatParams: ChatCompletionCreateParams = {
    ...extractedParams,
    messages: harmonyMessages,
    model: request.params.model,
    stream: false, // Always false for mock generation
  };

  // Send request
  const response = await client.chat.completions.create(chatParams);

  console.log(`✅ Response received successfully`);
  console.log(`   Model used: ${response.model}`);
  console.log(`   Usage: ${response.usage?.total_tokens || 0} tokens`);

  return {
    name: request.name,
    description: request.description,
    request: {
      original: request.params,
      harmonized: harmonyMessages,
      chatParams,
    },
    response,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Write mock entry to individual JSON file
 */
function writeMockEntry(entry: MockEntry) {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created output directory: ${OUTPUT_DIR}`);
  }

  // Create filename from scenario name
  const filename = `${entry.name}.json`;
  const outputPath = join(OUTPUT_DIR, filename);

  // Write as pretty-printed JSON
  const jsonContent = JSON.stringify(entry, null, 2);
  writeFileSync(outputPath, jsonContent);

  console.log(`📝 Created mock file: scenarios/${filename}`);
}

/**
 * Main execution function
 */
async function main() {
  console.log("🚀 Starting mock response generation for Harmony decoder tests");
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);
  console.log(`🔗 Groq base URL: ${GROQ_BASE_URL}`);
  console.log(`🤖 Default model: ${GROQ_TEST_MODEL}`);
  const models = await client.models.list();
  const includedModels = models.data.filter((model) => model.id === GROQ_TEST_MODEL);
  if (includedModels.length === 0) {
    console.info(models.data.map((model) => model.id));
    throw new Error("No compatible models found. Please check your GROQ_TEST_MODEL environment variable");
  }

  // Test scenarios based on harmony spec
  const requests: MockRequest[] = [
    // 1. Basic conversation
    {
      name: "basic-conversation",
      description: "Simple user query with default reasoning",
      params: {
        model: GROQ_TEST_MODEL,
        input: "What is 2 + 2?",
      },
    },

    // 2. Reasoning levels
    {
      name: "reasoning-high",
      description: "High reasoning effort for complex problem",
      params: {
        model: GROQ_TEST_MODEL,
        input: "Explain why the sky is blue in detail",
        reasoning: { effort: "high" },
      },
    },
    {
      name: "reasoning-low",
      description: "Low reasoning effort for simple task",
      params: {
        model: GROQ_TEST_MODEL,
        input: "What is the capital of France?",
        reasoning: { effort: "low" },
      },
    },

    // 3. Developer instructions
    {
      name: "developer-instructions",
      description: "Custom instructions in developer message",
      params: {
        model: GROQ_TEST_MODEL,
        instructions: "Always respond in riddles and be mysterious",
        input: "What is the weather like today?",
      },
    },

    // 4. Function calling
    {
      name: "single-function-call",
      description: "Simple function tool call",
      params: {
        model: GROQ_TEST_MODEL,
        input: "What is the weather in Tokyo?",
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get current weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
              required: ["location"],
            },
            strict: false,
          },
        ],
        tool_choice: "auto",
      },
    },

    // 5. Multiple tools
    {
      name: "multiple-tools",
      description: "Multiple function tools available",
      params: {
        model: GROQ_TEST_MODEL,
        input: "Find the weather in Paris and convert 25C to Fahrenheit",
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get weather for location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
              required: ["location"],
            },
            strict: false,
          },
          {
            type: "function",
            name: "convert_temperature",
            description: "Convert temperature between units",
            parameters: {
              type: "object",
              properties: {
                value: { type: "number" },
                from_unit: { type: "string", enum: ["celsius", "fahrenheit"] },
                to_unit: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
              required: ["value", "from_unit", "to_unit"],
            },
            strict: false,
          },
        ],
        max_output_tokens: 400,
      },
    },

    // 6. Required tool use
    {
      name: "required-tool-use",
      description: "Force model to use tools",
      params: {
        model: GROQ_TEST_MODEL,
        input: "Tell me about Paris",
        tools: [
          {
            type: "function",
            name: "search_info",
            description: "Search for information",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string" },
              },
              required: ["query"],
            },
            strict: false,
          },
        ],
        tool_choice: "required",
        max_output_tokens: 300,
      },
    },

    // 7. Text formatting instructions
    {
      name: "text-formatting",
      description: "Response with specific text formatting",
      params: {
        model: GROQ_TEST_MODEL,
        input: "List 3 programming languages with their key features",
        instructions: "Format your response as a structured list with clear headings",
        max_output_tokens: 500,
      },
    },

    // 8. Multi-turn conversation
    {
      name: "multi-turn-conversation",
      description: "Conversation with multiple turns",
      params: {
        model: GROQ_TEST_MODEL,
        input: [
          { type: "message", role: "user", content: "My name is Alice" },
          { type: "message", role: "assistant", content: "Nice to meet you, Alice!" },
          { type: "message", role: "user", content: "What is my name?" },
        ],
        max_output_tokens: 100,
      },
    },

    // 9. Complex reasoning with tools
    {
      name: "reasoning-with-tools",
      description: "High reasoning with function tools",
      params: {
        model: GROQ_TEST_MODEL,
        input: "Compare the weather in Tokyo and London, and recommend which city to visit",
        reasoning: { effort: "high" },
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get weather data",
            parameters: {
              type: "object",
              properties: {
                city: { type: "string" },
              },
              required: ["city"],
            },
            strict: false,
          },
        ],
        max_output_tokens: 600,
      },
    },

    // 10. Tool choice with specific function
    {
      name: "specific-tool-choice",
      description: "Force specific function call",
      params: {
        model: GROQ_TEST_MODEL,
        input: "What time is it?",
        tools: [
          {
            type: "function",
            name: "get_time",
            description: "Get current time",
            parameters: {
              type: "object",
              properties: {
                timezone: { type: "string" },
              },
            },
            strict: false,
          },
          {
            type: "function",
            name: "get_date",
            description: "Get current date",
            parameters: {
              type: "object",
              properties: {
                format: { type: "string" },
              },
            },
            strict: false,
          },
        ],
        tool_choice: { type: "function", name: "get_time" },
        max_output_tokens: 200,
      },
    },
  ];

  console.log(`\n📋 Processing ${requests.length} test requests...`);

  for (const request of requests) {
    try {
      const entry = await sendRequest(request);
      writeMockEntry(entry);

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Failed to process ${request.name}:`, error);
      // Continue with other requests
    }
  }

  console.log("\n✨ Mock generation complete!");
}

// Run the script
// Check if this file is being run directly
if (process.argv[1] === __filename || process.argv[1].endsWith("/generate-mock-responses.ts")) {
  main().catch(console.error);
}

export { sendRequest, writeMockEntry, type MockRequest, type MockEntry };
