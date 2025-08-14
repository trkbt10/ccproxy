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

## Use with Claude Code
$ ./ccproxy serve claude --port 8082
$ ANTHROPIC_BASE_URL="http://localhost:8082" ANTHROPIC_AUTH_TOKEN="any-value" claude

## Use with codex
$ ./ccproxy serve openai --config ./config/claude.config.json --port 11434
$ codex --oss --model claude-sonnet-4-20250514

```

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
      "model": "gpt-5"
    }
  },
  "logging": {
    "enabled": true,
    "dir": "./logs"
  }
}
```

### Provider Options

- `type`: Provider type (`openai`, `claude`, `gemini`, `grok`, `groq`)
- `apiKey`: API key with environment variable expansion
- `baseURL`: Custom API endpoint
- `model`: Default model
- `defaultHeaders`: Headers added to all requests

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
