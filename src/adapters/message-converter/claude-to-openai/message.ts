import type {
  TextBlock as ClaudeTextBlock,
  MessageParam as ClaudeMessageParam,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ResponseFunctionToolCall as OpenAIResponseFunctionToolCall,
  ResponseInputText as OpenAIResponseInputText,
  ResponseInputMessageContentList as OpenAIResponseInputMessageContentList,
  ResponseInputItem as OpenAIResponseInputItem,
  EasyInputMessage as OpenAIResponseEasyInputMessage,
} from "openai/resources/responses/responses";
import { convertClaudeImageToOpenAI } from "./image";
import { convertToolResult } from "./tool";
// Tool chain validator removed: mapping-only behavior
import { logDebug } from "../../../utils/logging/migrate-logger";
import { UnifiedIdManager as CallIdManager } from "../../../utils/id-management/unified-id-manager";
import { planToolExecution } from "../../../execution/tool-model-planner";
import type { RoutingConfig } from "../../../config/types";
import { findHandler } from "../../../tools/internal/registry";
import type { ToolResultBlockParam as ClaudeContentBlockToolResult } from "@anthropic-ai/sdk/resources/messages";

/**
 * Convert Claude message to OpenAI input items
 */
export function convertClaudeMessage(
  message: ClaudeMessageParam,
  callIdManager: CallIdManager,
  routingConfig?: RoutingConfig
): OpenAIResponseInputItem[] {
  console.log(
    `[DEBUG] Converting Claude message: role=${
      message.role
    }, content type=${typeof message.content}`
  );

  // Log the entire message for debugging
  console.log(
    `[DEBUG] Full message content:`,
    JSON.stringify(message.content, null, 2)
  );

  if (typeof message.content === "string") {
    const inputMessage: OpenAIResponseEasyInputMessage = {
      role: message.role,
      content: message.content,
    };
    return [inputMessage];
  }

  const result: OpenAIResponseInputItem[] = [];
  let buffer: ClaudeTextBlock[] = [];

  for (const block of message.content) {
    switch (block.type) {
      case "text":
        const text: ClaudeTextBlock = {
          type: "text",
          text: block.text,
          citations: [],
        };
        buffer.push(text);
        break;

      case "tool_use":
        console.log(
          `[DEBUG] Converting tool_use: id="${block.id}", name="${
            block.name
          }", input=${JSON.stringify(block.input)}`
        );
        flushBuffer();

        // Log the current mapping state
        const stats = callIdManager.getStats();
        console.log(
          `[DEBUG] Current call_id mappings stats:`,
          stats
        );

        const steps = routingConfig ? planToolExecution(routingConfig, block.name, block.input) : [];
        let handled = false;
        for (const step of steps) {
          if (step.kind === "internal") {
            const callId = callIdManager.getOrCreateOpenAICallIdForToolUse(
              block.id,
              block.name,
              { source: "message-conversion-internal" }
            );
            const handler = findHandler(step.handler);
            if (!handler) continue;
            try {
              const content = handler.execute(step.handler, block.input, {});
              const contentValue = typeof content === "string" ? content : JSON.stringify(content);
              const tr: ClaudeContentBlockToolResult = {
                type: "tool_result",
                tool_use_id: block.id,
                content: contentValue,
              };
              const toolResult = convertToolResult(tr, callIdManager);
              result.push(toolResult);
              console.log(`[DEBUG] Handled tool_use internally via ${step.handler}`);
              handled = true;
              break;
            } catch (e) {
              console.warn(`[WARN] Internal handler failed: ${(e as Error).message}`);
            }
          } else if (step.kind === "responses_model") {
            const callId = callIdManager.getOrCreateOpenAICallIdForToolUse(
              block.id,
              block.name,
              { source: "message-conversion-new" }
            );
            const toolCall: OpenAIResponseFunctionToolCall = {
              type: "function_call",
              call_id: callId,
              name: block.name,
              arguments: JSON.stringify(block.input),
            };
            result.push(toolCall);
            console.log(`[DEBUG] Emitted function_call for tool: ${block.name}`);
            handled = true;
            break;
          }
        }
        if (!handled) {
          const callId = callIdManager.getOrCreateOpenAICallIdForToolUse(
            block.id,
            block.name,
            { source: "message-conversion-new" }
          );
          const toolCall: OpenAIResponseFunctionToolCall = {
            type: "function_call",
            call_id: callId,
            name: block.name,
            arguments: JSON.stringify(block.input),
          };
        
          result.push(toolCall);
          console.log(`[DEBUG] Fallback: Emitted function_call for tool: ${block.name}`);
        }
        break;

      case "tool_result":
        flushBuffer();
        const toolResult = convertToolResult(block, callIdManager);
        result.push(toolResult);

        // Validation removed
        break;

      case "image": {
        // Handle image blocks
        flushBuffer();
        const imageContent = convertClaudeImageToOpenAI(block);
        const inputMessage: OpenAIResponseEasyInputMessage = {
          role: message.role,
          content: [imageContent],
        };
        result.push(inputMessage);
        break;
      }
    }
  }
  flushBuffer();
  return result;

  function flushBuffer() {
    if (buffer.length === 0) {
      // If there's no text content but we're flushing (e.g., before a tool call),
      // we should NOT add an empty message
      return;
    }
    if (buffer.length === 1 && "text" in buffer[0]) {
      const inputMessage: OpenAIResponseEasyInputMessage = {
        role: message.role,
        content: buffer[0].text,
      };
      result.push(inputMessage);
    } else {
      // For assistant messages, we just push them as simple text
      if (message.role === "assistant") {
        const textContent = buffer.map((b) => b.text).join("");
        const inputMessage: OpenAIResponseEasyInputMessage = {
          role: message.role,
          content: textContent,
        };
        result.push(inputMessage);
      } else {
        // For user messages, we use the content array format
        const content: OpenAIResponseInputMessageContentList = buffer.map(
          (b) => {
            switch (b.type) {
              case "text":
                const inputTextItem: OpenAIResponseInputText = {
                  type: "input_text",
                  text: b.text,
                };
                return inputTextItem;
            }
          }
        );

        const inputMessage: OpenAIResponseEasyInputMessage = {
          role: message.role,
          content,
        };
        result.push(inputMessage);
      }
    }
    buffer = [];
  }
}
