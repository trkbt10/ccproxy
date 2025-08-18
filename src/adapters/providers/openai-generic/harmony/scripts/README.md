# Harmony Mock Response Generator

This script generates mock JSONL responses for testing the harmony decoder by sending real requests to Groq through the OpenAI client.

## Usage

```bash
# Set your Groq API key
export GROQ_API_KEY=your-groq-api-key

# Run the script
bun run generate-mock-responses.ts
```

## Output

The script generates individual JSON files in `../__mocks__/scenarios/` directory. Each scenario is saved as a separate file named `{scenario-name}.json` with the following structure:

```json
{
  "name": "test-scenario-name",
  "description": "Description of what this test covers",
  "request": {
    "original": { /* Original ResponseCreateParamsBase */ },
    "harmonized": [ /* Array of harmonized ChatCompletionMessageParam */ ],
    "chatParams": { /* Final ChatCompletionCreateParams sent to Groq */ }
  },
  "response": { /* ChatCompletion response from Groq */ },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

Example output files:
- `basic-conversation.json`
- `reasoning-high.json`
- `developer-instructions.json`
- etc.

## Adding Test Scenarios

To add new test scenarios, modify the `requests` array in the main function. Each request should test specific harmony features like:

- Basic text completions
- Tool/function calling
- Different message roles (system, developer, user, assistant)
- Response formats
- Tool choice configurations
- Multi-turn conversations

The script automatically converts harmony's ResponseCreateParamsBase to OpenAI's ChatCompletionCreateParams format.