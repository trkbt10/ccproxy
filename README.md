# ccproxy

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge)](https://opensource.org/licenses/ISC)
[![OpenAI](https://img.shields.io/badge/OpenAI-74aa9c?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com)
[![Anthropic](https://img.shields.io/badge/Anthropic-191919?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)

A proxy server that enables Claude API access through OpenAI-compatible endpoints. Supports streaming responses, tool routing, and multiple provider configurations.

## Quick Start

```bash
# Install and build
bun install
bun run build:cli
chmod +x ./ccproxy

# Start server
./ccproxy serve

# Use with Claude CLI
ANTHROPIC_BASE_URL="http://localhost:8082" ANTHROPIC_AUTH_TOKEN="any-value" claude
```

## Operating Modes

### Claude API Mode (Default)
Accepts Claude API requests and routes them to configured providers.

```bash
./ccproxy serve --port 8082
```

### OpenAI API Mode  
Provides OpenAI-compatible endpoints (`/v1/chat/completions`).

```bash
./ccproxy serve --api openai --port 8085
```

## Configuration

### Configuration File

The proxy uses a JSON configuration file for routing and provider settings.

**File discovery order:**
1. `ROUTING_CONFIG_PATH` environment variable
2. `./ccproxy.config.json`
3. `./config/ccproxy.config.json`
4. `./config/routing.json`

**Initialize default configuration:**
```bash
./ccproxy config init
./ccproxy config init --force  # Overwrite existing
```

### Configuration Structure

```json
{
  "providers": {
    "default": {
      "type": "openai",
      "apiKey": "${OPENAI_API_KEY}",
      "model": "gpt-4",
      "tools": {
        "defaultStrategy": "passthrough",
        "routing": {
          "specific_tool": "builtin-first"
        }
      }
    }
  },
  "tools": [
    {
      "name": "tool_name",
      "steps": [
        {
          "kind": "responses_model",
          "providerId": "default",
          "model": "gpt-4"
        }
      ]
    }
  ],
  "logging": {
    "enabled": true,
    "dir": "./logs"
  },
  "dynamicTools": {
    "storage": "filesystem",
    "storageRoot": "./generated-tools",
    "provider": "default"
  }
}
```

### Provider Configuration

Each provider supports:
- `type`: Provider type (`openai`, `claude`, `gemini`, `grok`, `groq`)
- `apiKey`: API key with environment variable expansion
- `baseURL`: Custom API endpoint
- `model`: Default model
- `defaultHeaders`: Headers added to all requests
- `tools`: Tool routing configuration
  - `defaultStrategy`: Default routing strategy
  - `routing`: Tool-specific strategy overrides

### Tool Routing Strategies

- `builtin-only`: Use only provider-specific builtin tools
- `dynamic-only`: Use only dynamically generated tools
- `builtin-first`: Try builtin, fallback to dynamic
- `dynamic-first`: Try dynamic, fallback to builtin
- `passthrough`: Let LLM handle directly

### Environment Variable Expansion

Configuration values support:
- `${VAR}`: Simple expansion
- `${VAR:-default}`: With default value
- `${VAR:?error message}`: Required variable

## CLI Commands

```bash
# Server
./ccproxy serve [options]
  --port <number>              Server port (default: 8082/8085)
  --api <claude|openai>        API mode (default: claude)
  --config <path>              Config file path
  -c <key=value>               Override config values

# Configuration
./ccproxy config init [--force]
./ccproxy config show [--expanded]
./ccproxy config list
./ccproxy config get <path>
./ccproxy config set <path> <value>
```

## Integration Examples

### Codex CLI

Add to `~/.codex/config.toml`:
```toml
[model_providers.ccproxy]
name = "CCProxy"
base_url = "http://localhost:8082/v1"
env_key = "DUMMY_KEY"

model = "claude-3-5-sonnet-20241022"
model_provider = "ccproxy"
```

### Environment Variables

When not using configuration file:
- `OPENAI_API_KEY`: Default provider API key
- `OPENAI_MODEL`: Default model
- `PORT`: Server port
- `ANTHROPIC_BASE_URL`: For Claude CLI redirection
- `ANTHROPIC_AUTH_TOKEN`: Any value for Claude CLI

## Error Handling

- HTTP errors from upstream providers are preserved
- Error format matches the API mode (Claude or OpenAI format)
- Streaming errors emit SSE `error` event before termination

## Routing Configuration

This proxy supports dynamic provider and model routing through a JSON configuration file. The configuration allows you to:

- Configure multiple AI providers (OpenAI, Claude, Gemini)
- Prepare conversion paths for additional providers (Gemini via fetch client, Grok chat)
- Set different providers and models for specific Claude tools
- Route requests to different API keys based on model prefixes or custom headers
- Configure custom base URLs for providers
- Apply custom processing steps for tool calls
- Use environment variable expansion in configuration values

### Configuration File

Configuration is unified into `ccproxy.config.json`.

Search order:

- `ROUTING_CONFIG_PATH` (if set)
- `./ccproxy.config.json`
- `./config/ccproxy.config.json`
- `./config/routing.json` (example layout also supported)

Initialize a minimal default config:

```bash
./ccproxy config init
# overwrite if it already exists
./ccproxy config init --force
```

### Configuration Structure

```json
{
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
        {
          "kind": "responses_model",
          "providerId": "openai-gpt4",
          "model": "gpt-4.1"
        }
      ]
    }
  ]
}
```

### Configuration Options

- `logging`: Logging configuration
  - `enabled`: Enable file logging (default: true)
  - `eventsEnabled`: Enable verbose streaming event logs (default: false)
  - `dir`: Base directory for logs (default: `./logs`)
- `providers`: Map of provider configurations (optional)
  - Provider ID as key (use "default" for fallback to environment variables)
  - Provider configuration:
    - `type`: Provider type (`openai`, `claude`, `gemini`, `grok`)
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
./ccproxy serve [--port 8082|8085] [--api claude|openai] [--config ./ccproxy.config.json]
./ccproxy config init [--config ./ccproxy.config.json] [--force]
./ccproxy config show [--config ./ccproxy.config.json] [--expanded]
./ccproxy config list [--config ./ccproxy.config.json]
./ccproxy config get <path> [--config ./ccproxy.config.json]
./ccproxy config set <path> <value> [--config ./ccproxy.config.json]
```

### Command Options

#### `serve` command
- `--port <number>`: Server port (default: 8082 for claude, 8085 for openai, or from PORT env var)
- `--api <mode>`: API mode: "claude" (default) or "openai"
- `--openai`: Shorthand for "--api openai"
- `--config <path>`: Configuration file path (default: auto-discovery)
- `-c, --config-override <key=value>`: Override config values at runtime
  - Supports dot notation: `--config-override providers.default.model=gpt-4`
  - Multiple overrides: `-c key1=val1 -c key2=val2`
  - Similar to Codex CLI's `--config` flag

#### Configuration with Codex CLI

When using ccproxy with Codex CLI, you can configure the proxy endpoint in your `~/.codex/config.toml`:

```toml
[model_providers.ccproxy]
name = "CCProxy (Claude via OpenAI)"
base_url = "http://localhost:8082/v1"
env_key = "ANTHROPIC_AUTH_TOKEN"  # Any value will work

# Then use it with:
model = "claude-3-5-sonnet-20241022"
model_provider = "ccproxy"
```

This allows you to use Claude models through the OpenAI-compatible ccproxy with Codex.

Options:

```text
--port <number>     Port to listen on (default: 8082 for claude, 8085 for openai)
--api <mode>        API mode: "claude" (default) or "openai"
--openai            Shorthand for "--api openai"
--config <path>     Path to ccproxy config JSON (auto-detected if omitted)
--expanded          Expand env vars in config output (for "config show")
--force             Overwrite existing config (for "config init")
```

Examples:

```bash
# Start server for Claude API (default port 8082)
./ccproxy serve

# Start server for OpenAI API (default port 8085)
./ccproxy serve --api openai

# Start with custom port and config file
./ccproxy serve --port 9000 --config ./config/ccproxy.openai.config.json

# Start with runtime config overrides
./ccproxy serve -c logging.enabled=false -c providers.default.model=gpt-4

# Show current config (raw)
./ccproxy config show

# Show expanded config (with env var expansion)
./ccproxy config show --expanded

# List summary (providers and tools)
./ccproxy config list

# Get a specific value
./ccproxy config get providers.default.apiKey

# Set a specific value (value can be JSON literals: true, false, 123, {"a":1}, "text")
./ccproxy config set logging.enabled true
```

### Test Endpoints (optional)

For client integration testing, you can expose OpenAI-compatible endpoints:

- `POST /v1/chat/completions` (stream and non-stream)
- `POST /v1/responses` (stream and non-stream)

Enable them explicitly:

```bash
EXPOSE_OPENAI_COMPAT_TEST_ROUTES=true ./ccproxy serve
```

Notes:

- These are test-only echo handlers for validating client behavior.
- Not part of the product API; disabled by default and in production.
