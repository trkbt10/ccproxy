import type {
  ToolBash20250124,
  ToolTextEditor20250124,
  ToolTextEditor20250429,
  ToolTextEditor20250728,
  WebSearchTool20250305,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  Tool as OpenAITool,
  WebSearchTool as OpenAIWebSearchTool,
} from "openai/resources/responses/responses";

/**
 * Create web search preview tool definition
 */
export function createWebSearchPreviewDefinition(): OpenAIWebSearchTool {
  return {
    type: "web_search_preview",
  };
}

/**
 * Create bash tool definition from Claude tool
 */
export function createBashDefinition(t: ToolBash20250124): OpenAITool {
  // Base definition for bash tool
  const baseDefinition: OpenAITool = {
    name: "bash",
    description: "Executes shell commands on the server and returns the output.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "array",
          items: { type: "string" },
          description: 'List of the command and its arguments (e.g., ["ls", "-la"])',
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
    strict: true,
  };

  // Currently ToolBash20250124 only has cache_control, no other special properties
  return baseDefinition;
}

/**
 * Create web search tool definition from Claude tool
 */
export function createWebSearchDefinition(t: WebSearchTool20250305): OpenAITool {
  const baseDefinition: OpenAITool = {
    name: "web_search",
    description: "Performs a web search for the given query and returns the results.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        ...(t.allowed_domains && {
          allowed_domains: {
            type: "array",
            items: { type: "string" },
            description: "List of domains to include in search",
            default: t.allowed_domains,
          },
        }),
        ...(t.blocked_domains && {
          blocked_domains: {
            type: "array",
            items: { type: "string" },
            description: "List of domains to exclude from search",
            default: t.blocked_domains,
          },
        }),
        ...(t.max_uses && {
          max_uses: {
            type: "integer",
            description: "Maximum number of times the tool can be invoked",
            default: t.max_uses,
          },
        }),
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  };

  console.debug(
    `[DEBUG] WebSearchTool with Claude params:`,
    {
      allowed_domains: t.allowed_domains,
      blocked_domains: t.blocked_domains,
      max_uses: t.max_uses,
      user_location: t.user_location,
    }
  );

  return baseDefinition;
}

/**
 * Create text editor tool definition from Claude tool
 */
export function createTextEditorDefinition(
  t: ToolTextEditor20250124 | ToolTextEditor20250429 | ToolTextEditor20250728
): OpenAITool {
  const baseDefinition: OpenAITool = {
    name: "text_editor",
    description: "Performs find-and-replace operations within the given text.",
    type: "function",
    parameters: {
      type: "object",
      properties: {
        original: { type: "string", description: "Original text" },
        search: { type: "string", description: "Search string or regular expression" },
        replace: { type: "string", description: "Replacement string" },
        flags: {
          type: "string",
          description: 'Regular expression flags (e.g., "g", "i")',
        },
      },
      required: ["original", "search", "replace"],
      additionalProperties: false,
    },
    strict: true,
  };

  // Add max_characters if it's ToolTextEditor20250728
  if ('max_characters' in t && t.max_characters && baseDefinition.parameters) {
    baseDefinition.parameters.properties = {
      ...(baseDefinition.parameters.properties || {}),
      max_characters: {
        type: "integer",
        description: "Maximum number of characters to display when viewing a file",
        default: t.max_characters,
      },
    };
    
    console.debug(
      `[DEBUG] ToolTextEditor20250728 with max_characters:`,
      t.max_characters
    );
  }

  return baseDefinition;
}
