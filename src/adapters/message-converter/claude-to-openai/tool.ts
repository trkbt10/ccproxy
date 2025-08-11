import type {
  ToolResultBlockParam as ClaudeContentBlockToolResult,
  Tool as ClaudeTool,
  ToolUnion as ClaudeToolUnion,
  WebSearchTool20250305,
  ToolBash20250124,
  ToolTextEditor20250124,
  ToolTextEditor20250429,
  ToolTextEditor20250728,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ResponseFunctionToolCallOutputItem as OpenAIResponseFunctionToolCallOutputItem,
  Tool as OpenAITool,
} from "openai/resources/responses/responses";
import {
  createBashDefinition,
  createWebSearchDefinition,
  createTextEditorDefinition,
} from "./tool-definitions";
import { normalizeJSONSchemaForOpenAI } from "./schema-helpers";
import { UnifiedIdManager as CallIdManager, IdFormat } from "../../../utils/id-management/unified-id-manager";

/**
 * Convert tool result from Claude format to OpenAI format
 */
export function convertToolResult(
  block: ClaudeContentBlockToolResult,
  callIdManager: CallIdManager
): OpenAIResponseFunctionToolCallOutputItem {
  console.log(
    `[DEBUG] Converting tool_result: tool_use_id="${
      block.tool_use_id
    }", content=${JSON.stringify(block.content)}`
  );

  // Log the current mapping state
  const stats = callIdManager.getStats();
  console.log(`[DEBUG] Current call_id mappings stats:`, stats);

  // Find the call_id for this tool_use_id
  let call_id = callIdManager.getOpenAICallId(block.tool_use_id);

  if (!call_id) {
    console.error(
      `[ERROR] No call_id mapping found for tool_use_id: ${block.tool_use_id}`
    );
    // Don't throw error, just use the tool_use_id as fallback
    // This might happen in the first request when mapping isn't established yet
    console.warn(
      `[WARN] Using tool_use_id as fallback call_id: ${block.tool_use_id}`
    );
    call_id = IdFormat.fixOpenAIPrefix(block.tool_use_id, "tool_result_fallback");
  } else {
    console.log(
      `[DEBUG] Found call_id ${call_id} for tool_use_id ${block.tool_use_id}`
    );
  }

  // Don't fix the call_id if it already has a valid prefix
  const finalCallId = IdFormat.isValidOpenAIPrefix(call_id) 
    ? call_id 
    : IdFormat.fixOpenAIPrefix(call_id, "tool_result_call_id");

  // Generate a unique ID for this tool result (OpenAI format)
  const resultId = `fc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  // Return with id, type, call_id and output as per OpenAI ResponseFunctionToolCallOutputItem type
  return {
    id: resultId, // Use a new unique ID for the result
    type: "function_call_output",
    call_id: finalCallId, // Use the call_id that maps to the original tool call
    output:
      typeof block.content === "string"
        ? block.content
        : JSON.stringify(block.content),
  };
}

/**
 * Check if tool is a client tool
 */
function isClientTool(t: ClaudeToolUnion): t is ClaudeTool {
  return "input_schema" in t;
}

/**
 * Check if tool is WebSearchTool20250305
 */
function isWebSearchTool(t: ClaudeToolUnion): t is WebSearchTool20250305 {
  return t.type === "web_search_20250305";
}

/**
 * Check if tool is ToolBash20250124
 */
function isBashTool(t: ClaudeToolUnion): t is ToolBash20250124 {
  return t.type === "bash_20250124";
}

/**
 * Check if tool is ToolTextEditor20250124
 */
function isTextEditorTool(t: ClaudeToolUnion): t is ToolTextEditor20250124 {
  return t.type === "text_editor_20250124";
}

/**
 * Check if tool is TextEditor20250429
 */
function isTextEditor20250429(t: ClaudeToolUnion): t is ToolTextEditor20250429 {
  return 'type' in t && t.type === "text_editor_20250429";
}

/**
 * Check if tool is TextEditor20250728
 */
function isTextEditor20250728(t: ClaudeToolUnion): t is ToolTextEditor20250728 {
  return 'type' in t && t.type === "text_editor_20250728";
}

/**
 * Convert Claude tool to OpenAI tool format
 * Preserves Claude-specific information where applicable
 */
export function convertClaudeToolToOpenAI(
  t: ClaudeToolUnion
): OpenAITool | OpenAITool[] {
  if (isClientTool(t)) {
    const schema = normalizeJSONSchemaForOpenAI(t.input_schema);

    console.debug(
      `[DEBUG] tool ${t.name} → cleaned parameters=`,
      JSON.stringify(schema, null, 2)
    );

    return {
      type: "function",
      name: t.name,
      description: t.description ?? "",
      parameters: schema,
      strict: true,
    };
  } 
  
  // Handle server-side tools with type guards to preserve specific information
  if (isWebSearchTool(t)) {
    // Do NOT expose a function tool named "web_search".
    // The runtime doesn't implement executing it client-side, and offering it
    // leads the model to call a non-existent tool and causes loops.
    // Instead, rely on the built-in web_search_preview tool injected elsewhere
    // (handled by the backend) or skip entirely.
    console.warn("[WARN] Suppressing function tool definition for web_search");
    return [];
  }
  
  if (isBashTool(t)) {
    // ToolBash20250124 - create definition with Claude tool
    return createBashDefinition(t);
  }
  
  if (isTextEditorTool(t)) {
    // ToolTextEditor20250124 - create definition with Claude tool
    return createTextEditorDefinition(t);
  }
  
  if (isTextEditor20250429(t)) {
    // ToolTextEditor20250429 - create definition with Claude tool
    return createTextEditorDefinition(t);
  }
  
  if (isTextEditor20250728(t)) {
    // ToolTextEditor20250728 - create definition with Claude tool (includes max_characters)
    return createTextEditorDefinition(t);
  }
  
  // Fallback for unknown tools
  console.warn(`[WARN] Unknown tool type:`, t);
  return [];
}
