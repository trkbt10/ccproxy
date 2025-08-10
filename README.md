# ccproxy

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge)](https://opensource.org/licenses/ISC)
[![OpenAI](https://img.shields.io/badge/OpenAI-74aa9c?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com)
[![Anthropic](https://img.shields.io/badge/Anthropic-191919?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)

A proxy server that converts Claude API to OpenAI-compatible format. Transforms Claude streaming responses to OpenAI Responses API format, allowing Claude to be used with OpenAI-compatible applications.

## Quick Start

```bash
$ bun run --env-file=.env ./src/server.ts
$ ANTHROPIC_BASE_URL="http://localhost:8082" ANTHROPIC_AUTH_TOKEN="some-api-key" claude
```

Zero-config usage: you can run without `config/routing.json`.
If no providers are defined, a `default` OpenAI provider is synthesized from `OPENAI_API_KEY` and optional `OPENAI_BASE_URL`.

## Environment Variables

All environment variables are optional. Use them when you are not providing equivalent values in `config/routing.json`.

### Optional

| Variable         | Description                                                                 | Default     |
| ---------------- | --------------------------------------------------------------------------- | ----------- |
| `OPENAI_API_KEY` | Fallback API key if not specified via provider config                        | None        |
| `OPENAI_MODEL`   | Default model if not provided via request header or tool routing             | `gpt-4.1`   |
| `PORT`           | Server listen port                                                           | `8082`      |

### External CLI Variables

| Variable               | Description                                     | Default |
| ---------------------- | ----------------------------------------------- | ------- |
| `ANTHROPIC_BASE_URL`   | Endpoint to redirect Anthropic CLI/SDK to proxy | None    |
| `ANTHROPIC_AUTH_TOKEN` | Token for Anthropic CLI (any value)             | None    |

### Test Variables

None.

## Sample .env

Example .env (when not using providers in routing.json):

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx   # Optional if providers[*].apiKey is set
OPENAI_MODEL=gpt-4.1-mini            # Optional; defaults to sensible model
PORT=8082                            # Optional
# Logging is configured in config/routing.json (see below)
```

Example: Redirecting Anthropic CLI to this proxy:

```bash
export ANTHROPIC_BASE_URL="http://localhost:8082"
export ANTHROPIC_AUTH_TOKEN="dummy-token"
claude messages create ...
```

## Installation & Running

```bash
bun install
bun run --env-file=.env ./src/server.ts
# or use CLI
bun run src/cli.ts serve --port 8082
```

If `config/routing.json` is absent, the server still works using the synthesized `default` provider from environment variables.

## Routing Configuration

This proxy supports dynamic provider and model routing through a JSON configuration file. The configuration allows you to:

- Configure multiple AI providers (OpenAI, Claude, Gemini)
- Set different providers and models for specific Claude tools
- Route requests to different API keys based on model prefixes or custom headers
- Configure custom base URLs for providers
- Apply custom processing steps for tool calls
- Use environment variable expansion in configuration values

### Configuration File

The routing configuration is loaded from `config/routing.json` by default. You can override this location with the `ROUTING_CONFIG_PATH` environment variable.

### Configuration Structure

```json
{
  "overrideHeader": "x-openai-model",
  "logging": {
    "enabled": true,
    "eventsEnabled": false,
    "dir": "./logs"
  },
  "providers": {
    "openai-gpt4": {
      "type": "openai",
      "apiKey": "${OPENAI_API_KEY_GPT4:-${OPENAI_API_KEY}}",
      "defaultHeaders": {
        "OpenAI-Beta": "responses-2025-06-21"
      }
    },
    "openai-custom": {
      "type": "openai",
      "baseURL": "https://api.openai.com/v1",
      "api": {
        "keyHeader": "x-openai-key-id",
        "keys": {
          "key1": "${OPENAI_API_KEY_1}",
          "key2": "${OPENAI_API_KEY_2}"
        },
        "keyByModelPrefix": {
          "gpt-4": "${OPENAI_API_KEY_GPT4}",
          "gpt-3.5": "${OPENAI_API_KEY_GPT35}"
        }
      },
      "defaultHeaders": {
        "OpenAI-Beta": "responses-2025-06-21"
      }
    }
  },
  "tools": [
    {
      "name": "text_editor",
      "steps": [
        {
          "kind": "internal",
          "handler": "text_editor",
          "when": { "actionIn": ["preview", "plan"] }
        },
        { "kind": "responses_model", "providerId": "openai-gpt4", "model": "gpt-4.1" }
      ]
    }
  ]
}
```

### Configuration Options

- `overrideHeader`: HTTP header name to override the model selection (default: `x-openai-model`)
- `logging`: Logging configuration
  - `enabled`: Enable file logging (default: true)
  - `eventsEnabled`: Enable verbose streaming event logs (default: false)
  - `dir`: Base directory for logs (default: `./logs`)
- `providers`: Map of provider configurations (optional)
  - Provider ID as key (use "default" for fallback to environment variables)
  - Provider configuration:
    - `type`: Provider type (`openai`, `claude`, `gemini`)
    - `apiKey`: API key (supports environment variable expansion)
    - `baseURL`: Custom API base URL (optional, supports environment variable expansion)
    - `defaultHeaders`: Headers to add to all requests for this provider
    - `api`: API key configuration
      - `keyHeader`: Header name for API key selection
      - `keys`: Map from header value to API key (supports environment variable expansion)
      - `keyByModelPrefix`: Map from model prefix to API key (supports environment variable expansion)
- `tools`: Array of tool-specific routing rules
  - `name`: Claude tool name to match
  - `steps`: Processing steps for the tool
    - `kind`: Either `internal` (custom handler) or `responses_model` (API call)
    - `providerId`: Provider ID to use for this step (defaults to "default")
    - `model`: Model to use for this step (optional)
    - `when`: Conditional execution based on tool input

### Environment Variable Expansion

The configuration supports environment variable expansion using the following syntax:

- `${ENV_VAR}` - Simple environment variable expansion
- `${ENV_VAR:-default}` - With default value if not set
- `${ENV_VAR:?error message}` - Throws error if not set

Example:
```json
{
  "apiKey": "${OPENAI_API_KEY:?OPENAI_API_KEY must be set}"
}
```

### API Key Selection

API keys are selected in the following priority order:

1. Provider's `apiKey` configuration
2. Key ID from custom header mapped through provider's `api.keys` (using `api.keyHeader`)
3. Model prefix matching through provider's `api.keyByModelPrefix`
4. Default `OPENAI_API_KEY` environment variable (when using "default" provider or as fallback)

### Default Provider

The `"default"` provider ID is a special identifier:
- When used in tools, it references the provider defined as `"default"` in the providers configuration
- If the `"default"` provider is not configured, the proxy synthesizes it from environment variables
  so you can still route using `providerId: "default"`:
  - API Key: `OPENAI_API_KEY`
  - Model: `OPENAI_MODEL` or specified in tool configuration
  - Base URL: Use provider `baseURL` in config when needed (no env fallback)

## Deprecations

- `x-openai-api-key` header: Removed. API keys are resolved only from configuration and environment variables as described above. Use `providers[*].apiKey`, `providers[*].api.keys` with `keyHeader`, or `OPENAI_API_KEY`.
- `LOG_EVENTS` and `LOG_DIR` environment variables: Removed. Configure logging in `config/routing.json` under the `logging` section.
- `OPENAI_BASE_URL` environment variable: Removed. Set `providers[*].baseURL` in `config/routing.json` when overriding the API base URL.
## CLI

The project provides a simple CLI for starting the server and managing routing configuration.

Usage:

```bash
bun run src/cli.ts serve [--port 8082] [--config ./config/routing.json]
bun run src/cli.ts config show [--config ./config/routing.json] [--expanded]
bun run src/cli.ts config list [--config ./config/routing.json]
bun run src/cli.ts config get <path> [--config ./config/routing.json]
bun run src/cli.ts config set <path> <value> [--config ./config/routing.json]
```

Examples:

```bash
# Start server on port 8082
bun run src/cli.ts serve --port 8082

# Show current config (raw)
bun run src/cli.ts config show

# Show expanded config (with env var expansion)
bun run src/cli.ts config show --expanded

# List summary (providers and tools)
bun run src/cli.ts config list

# Get a specific value
bun run src/cli.ts config get providers.default.apiKey

# Set a specific value (value can be JSON literals: true, false, 123, {"a":1}, "text")
bun run src/cli.ts config set logging.enabled true
```
