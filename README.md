# ccproxy

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=for-the-badge)](https://opensource.org/licenses/ISC)
[![OpenAI](https://img.shields.io/badge/OpenAI-74aa9c?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com)
[![Anthropic](https://img.shields.io/badge/Anthropic-191919?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)

A multi-provider AI proxy that routes requests between Claude, OpenAI, and Gemini APIs with configurable tool routing and provider selection.

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

- **Claude API Mode** (default, port 8082): Accepts Claude API requests
- **OpenAI API Mode** (port 8085): Provides OpenAI-compatible endpoints
- **Gemini API Mode** (port 8086): Provides Gemini-compatible endpoints

## Configuration

### File Locations
- `ROUTING_CONFIG_PATH` environment variable
- `./ccproxy.config.json`
- `./config/ccproxy.config.json`
- `./config/routing.json`

### Structure

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

### Provider Options
- `type`: Provider type (`openai`, `claude`, `gemini`, `grok`, `groq`)
- `apiKey`: API key with environment variable expansion
- `baseURL`: Custom API endpoint
- `model`: Default model
- `defaultHeaders`: Headers added to all requests
- `tools`: Tool routing configuration

### Tool Routing Strategies
- `builtin-only`: Use only provider-specific builtin tools
- `dynamic-only`: Use only dynamically generated tools
- `builtin-first`: Try builtin, fallback to dynamic
- `dynamic-first`: Try dynamic, fallback to builtin
- `passthrough`: Let LLM handle directly

### Environment Variable Expansion
- `${VAR}`: Simple expansion
- `${VAR:-default}`: With default value
- `${VAR:?error message}`: Required variable

### Examples
See `/config/examples/` for complete configuration examples.

## CLI Reference

### Server Commands

```bash
./ccproxy serve [claude|openai|gemini] [options]
  --port <number>                      Server port (default: 8082/8085/8086)
  --config <path>                      Config file path
  -c, --config-override <key=value>    Override config values at runtime

# Examples
./ccproxy serve                       # Claude API on port 8082
./ccproxy serve openai --port 9000    # OpenAI API on port 9000
./ccproxy serve gemini                # Gemini API on port 8086
```

### Configuration Commands

```bash
./ccproxy config init [--config <path>] [--force]
./ccproxy config show [--config <path>] [--expanded]
./ccproxy config list [--config <path>]
./ccproxy config get <path> [--config <path>]
./ccproxy config set <path> <value> [--config <path>]
```

## Environment Variables

- `OPENAI_API_KEY`: Default provider API key (when no config file exists)
- `OPENAI_MODEL`: Default model
- `PORT`: Server port
- `ANTHROPIC_BASE_URL`: Redirect Claude CLI to proxy
- `ANTHROPIC_AUTH_TOKEN`: Any value for Claude CLI authentication

## Integration Examples

### Codex CLI
Add to `~/.codex/config.toml`:
```toml
[model_providers.ccproxy]
name = "CCProxy"
base_url = "http://localhost:8082/v1"
env_key = "DUMMY_KEY"
```

## Notes

- Zero-config mode: Runs without configuration file using environment variables
- Default provider synthesized from `OPENAI_API_KEY` when no config exists
- HTTP errors from upstream providers are preserved with matching format
- Streaming errors emit SSE `error` event before termination
