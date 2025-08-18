/**
 * Additional test scenarios for harmony mock generation
 * These scenarios cover missing test cases identified in the analysis
 */

import type { MockRequest } from './generate-mock-responses';

export const additionalScenarios: MockRequest[] = [
  // 1. Tool choice "none" - explicitly disable tools
  {
    name: "tool-choice-none",
    description: "Explicitly disable tool usage",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: "What's the weather like in Paris?",
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get weather info',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            },
            required: ['location']
          },
          strict: false
        }
      ],
      tool_choice: 'none'
    }
  },

  // 2. Empty tools array
  {
    name: "empty-tools-array",
    description: "Empty tools array handling",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: "Tell me a joke",
      tools: [],
      instructions: "Be funny and creative"
    }
  },

  // 3. Null instructions
  {
    name: "null-instructions",
    description: "Null instructions handling",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: "What is machine learning?",
      instructions: null
    }
  },

  // 4. Complex multi-message conversation with tool results
  {
    name: "conversation-with-tool-results",
    description: "Conversation including tool call results",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: [
        { type: 'message', role: 'user', content: 'What is the weather in Tokyo?' },
        { 
          type: 'message', 
          role: 'assistant', 
          content: 'I\'ll check the weather in Tokyo for you.'
        },
        {
          type: 'function_call',
          call_id: 'call_123',
          name: 'get_weather',
          arguments: '{"city":"Tokyo"}'
        },
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: '{"temperature": 22, "condition": "sunny", "humidity": 65}'
        },
        { type: 'message', role: 'assistant', content: 'The weather in Tokyo is currently 22°C and sunny with 65% humidity.' },
        { type: 'message', role: 'user', content: 'Is that good weather for sightseeing?' }
      ]
    }
  },

  // 5. Reasoning with no input (edge case)
  {
    name: "reasoning-no-input",
    description: "High reasoning with empty input",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: "",
      reasoning: { effort: "high" },
      instructions: "If no input is provided, explain what you can help with"
    }
  },

  // 6. Multiple instructions sources
  {
    name: "combined-instructions",
    description: "Instructions from both parameters and tool choice",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: "Calculate 15% tip on $85",
      instructions: "Always show your calculations step by step",
      tools: [
        {
          type: 'function',
          name: 'calculate',
          description: 'Perform calculations',
          parameters: {
            type: 'object',
            properties: {
              expression: { type: 'string' }
            },
            required: ['expression']
          },
          strict: false
        }
      ],
      tool_choice: 'auto'
    }
  },

  // 7. Very long input to test truncation
  {
    name: "long-input",
    description: "Very long input text",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: "Please summarize this text: " + "Lorem ipsum dolor sit amet. ".repeat(100),
      max_output_tokens: 150
    }
  },

  // 8. Special characters in input
  {
    name: "special-characters",
    description: "Input with special harmony tokens",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: "What does <|start|> mean? And what about <|end|>?",
      instructions: "Explain these as literal text, not as special tokens"
    }
  },

  // 9. Nested tool parameters
  {
    name: "complex-tool-schema",
    description: "Tool with nested parameter schema",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: "Book a flight from Tokyo to London for 2 adults",
      tools: [
        {
          type: 'function',
          name: 'book_flight',
          description: 'Book a flight',
          parameters: {
            type: 'object',
            properties: {
              origin: { type: 'string' },
              destination: { type: 'string' },
              passengers: {
                type: 'object',
                properties: {
                  adults: { type: 'number' },
                  children: { type: 'number' },
                  infants: { type: 'number' }
                },
                required: ['adults']
              },
              class: { 
                type: 'string', 
                enum: ['economy', 'premium', 'business', 'first']
              }
            },
            required: ['origin', 'destination', 'passengers']
          },
          strict: false
        }
      ]
    }
  },

  // 10. Array input with mixed message types
  {
    name: "mixed-message-types",
    description: "Array input with various message types",
    params: {
      model: process.env.GROQ_TEST_MODEL!,
      input: [
        { type: 'message', role: 'system', content: 'You are a helpful assistant' },
        { type: 'message', role: 'user', content: 'Hi there!' },
        { type: 'message', role: 'assistant', content: 'Hello! How can I help you today?' },
        { type: 'message', role: 'user', content: 'What is 2+2?' }
      ]
    }
  }
];