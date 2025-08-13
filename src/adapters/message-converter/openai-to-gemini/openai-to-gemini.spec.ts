import { describe, it, expect } from "vitest";
import { geminiToOpenAI } from "./request-converter";
import { openAIToGemini } from "./response-converter";
import { openAIStreamToGemini } from "./stream-converter";
import type { ChatCompletion, ChatCompletionChunk } from "openai/resources/chat/completions";
import type { GeminiGenerateContentRequest } from "./types";

describe("OpenAI to Gemini Converters", () => {
  describe("geminiToOpenAI", () => {
    it("should convert simple text message", () => {
      const geminiReq: GeminiGenerateContentRequest = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello, how are you?" }]
          }
        ]
      };

      const result = geminiToOpenAI(geminiReq, "gpt-4");

      expect(result).toEqual({
        model: "gpt-4",
        messages: [
          {
            role: "user",
            content: "Hello, how are you?"
          }
        ]
      });
    });

    it("should convert system instruction", () => {
      const geminiReq: GeminiGenerateContentRequest = {
        systemInstruction: {
          parts: [{ text: "You are a helpful assistant." }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: "What's the weather?" }]
          }
        ]
      };

      const result = geminiToOpenAI(geminiReq, "gpt-4");

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({
        role: "system",
        content: "You are a helpful assistant."
      });
      expect(result.messages[1]).toEqual({
        role: "user",
        content: "What's the weather?"
      });
    });

    it("should convert multi-turn conversation", () => {
      const geminiReq: GeminiGenerateContentRequest = {
        contents: [
          {
            role: "user",
            parts: [{ text: "What is 2+2?" }]
          },
          {
            role: "model",
            parts: [{ text: "2+2 equals 4." }]
          },
          {
            role: "user",
            parts: [{ text: "What about 3+3?" }]
          }
        ]
      };

      const result = geminiToOpenAI(geminiReq, "gpt-4");

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[1].role).toBe("assistant");
      expect(result.messages[2].role).toBe("user");
    });

    it("should convert generation config", () => {
      const geminiReq: GeminiGenerateContentRequest = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello" }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 1024,
          stopSequences: ["END", "STOP"]
        }
      };

      const result = geminiToOpenAI(geminiReq, "gpt-4");

      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBe(0.9);
      expect(result.max_tokens).toBe(1024);
      expect(result.stop).toEqual(["END", "STOP"]);
    });

    it("should convert function declarations to tools", () => {
      const geminiReq: GeminiGenerateContentRequest = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Get the weather" }]
          }
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "get_weather",
                description: "Get weather information",
                parameters: {
                  type: "object",
                  properties: {
                    location: { type: "string" }
                  },
                  required: ["location"]
                }
              }
            ]
          }
        ]
      };

      const result = geminiToOpenAI(geminiReq, "gpt-4");

      expect(result.tools).toHaveLength(1);
      expect(result.tools?.[0]).toEqual({
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather information",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" }
            },
            required: ["location"]
          }
        }
      });
    });
  });

  describe("openAIToGemini", () => {
    it("should convert simple completion response", () => {
      const openAIResponse: ChatCompletion = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Hello! I'm doing well, thank you.",
              refusal: null
            },
            finish_reason: "stop",
            logprobs: null
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      };

      const result = openAIToGemini(openAIResponse, "gemini-pro");

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates?.[0].content.parts).toHaveLength(1);
      expect(result.candidates?.[0].content.parts[0].text).toBe("Hello! I'm doing well, thank you.");
      expect(result.candidates?.[0].finishReason).toBe("STOP");
      expect(result.usageMetadata).toEqual({
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30
      });
    });

    it("should convert tool calls", () => {
      const openAIResponse: ChatCompletion = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              refusal: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: JSON.stringify({ location: "Tokyo" })
                  }
                }
              ]
            },
            finish_reason: "tool_calls",
            logprobs: null
          }
        ]
      };

      const result = openAIToGemini(openAIResponse, "gemini-pro");

      expect(result.candidates?.[0].content.parts).toHaveLength(1);
      expect(result.candidates?.[0].content.parts[0].function_call).toEqual({
        name: "get_weather",
        args: { location: "Tokyo" }
      });
    });
  });

  describe("openAIStreamToGemini", () => {
    it("should convert streaming text response", async () => {
      // Create a mock stream
      async function* mockStream(): AsyncIterable<ChatCompletionChunk> {
        yield {
          id: "chatcmpl-123",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "gpt-4",
          choices: [
            {
              index: 0,
              delta: { content: "Hello" },
              finish_reason: null
            }
          ]
        };
        yield {
          id: "chatcmpl-123",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "gpt-4",
          choices: [
            {
              index: 0,
              delta: { content: " world!" },
              finish_reason: null
            }
          ]
        };
        yield {
          id: "chatcmpl-123",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "gpt-4",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 2,
            total_tokens: 7
          }
        };
      }

      const chunks: string[] = [];
      const stream = openAIStreamToGemini(mockStream(), "gemini-pro", false);
      
      for await (const chunk of stream) {
        chunks.push(new TextDecoder().decode(chunk));
      }

      expect(chunks).toHaveLength(3);
      
      // First chunk
      const firstResponse = JSON.parse(chunks[0]);
      expect(firstResponse.candidates[0].content.parts[0].text).toBe("Hello");
      
      // Second chunk
      const secondResponse = JSON.parse(chunks[1]);
      expect(secondResponse.candidates[0].content.parts[0].text).toBe(" world!");
      
      // Final chunk with usage
      const finalResponse = JSON.parse(chunks[2]);
      expect(finalResponse.candidates[0].finishReason).toBe("STOP");
      expect(finalResponse.usageMetadata).toEqual({
        promptTokenCount: 5,
        candidatesTokenCount: 2,
        totalTokenCount: 7
      });
    });

    it("should handle SSE format", async () => {
      async function* mockStream(): AsyncIterable<ChatCompletionChunk> {
        yield {
          id: "chatcmpl-123",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "gpt-4",
          choices: [
            {
              index: 0,
              delta: { content: "Test" },
              finish_reason: null
            }
          ]
        };
      }

      const chunks: string[] = [];
      const stream = openAIStreamToGemini(mockStream(), "gemini-pro", true);
      
      for await (const chunk of stream) {
        chunks.push(new TextDecoder().decode(chunk));
      }

      expect(chunks[0]).toMatch(/^data: /);
      expect(chunks[0]).toMatch(/\n\n$/);
      expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
    });
  });
});