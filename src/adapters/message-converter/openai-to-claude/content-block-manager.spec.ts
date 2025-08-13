import { describe, test, expect, beforeEach } from "bun:test";
import { ContentBlockManager } from "./content-block-manager";
import type {
  TextBlock,
  ToolUseBlock,
  WebSearchToolResultBlock,
} from "@anthropic-ai/sdk/resources/messages";

describe("ContentBlockManager", () => {
  let manager: ContentBlockManager;

  beforeEach(() => {
    manager = new ContentBlockManager();
  });

  describe("addTextBlock", () => {
    test("should add a new text block with default values", () => {
      const { block, metadata } = manager.addTextBlock();

      expect(block.type).toBe("text");
      expect(block.text).toBe("");
      expect(block.citations).toBeNull();
      
      expect(metadata.id).toBe("text_0");
      expect(metadata.index).toBe(0);
      expect(metadata.started).toBe(false);
      expect(metadata.completed).toBe(false);
    });

    test("should add multiple text blocks with correct indices", () => {
      const { metadata: meta1 } = manager.addTextBlock();
      const { metadata: meta2 } = manager.addTextBlock();
      const { metadata: meta3 } = manager.addTextBlock();

      expect(meta1.id).toBe("text_0");
      expect(meta1.index).toBe(0);
      
      expect(meta2.id).toBe("text_1");
      expect(meta2.index).toBe(1);
      
      expect(meta3.id).toBe("text_2");
      expect(meta3.index).toBe(2);
    });
  });

  describe("addToolBlock", () => {
    test("should add a new tool block", () => {
      const toolId = "tool_123";
      const toolName = "calculator";
      const callId = "call_456";
      
      const { block, metadata } = manager.addToolBlock(toolId, toolName, callId);

      expect(block.type).toBe("tool_use");
      expect(block.id).toBe(toolId);
      expect(block.name).toBe(toolName);
      expect(block.input).toEqual({});
      
      expect(metadata.id).toBe(toolId);
      expect(metadata.index).toBe(0);
      expect(metadata.started).toBe(false);
      expect(metadata.completed).toBe(false);
      expect(metadata.argsBuffer).toBe("");
      expect(metadata.call_id).toBe(callId);
    });

    test("should return existing block if ID already exists", () => {
      const toolId = "tool_duplicate";
      const toolName = "first_tool";
      
      const { block: block1, metadata: meta1 } = manager.addToolBlock(toolId, toolName);
      const { block: block2, metadata: meta2 } = manager.addToolBlock(toolId, "different_name");

      // Should return the same block and metadata
      expect(block1).toBe(block2);
      expect(meta1).toBe(meta2);
      expect(block2.name).toBe("first_tool"); // Original name should be preserved
    });

    test("should work without call_id parameter", () => {
      const { metadata } = manager.addToolBlock("tool_no_call", "test_tool");
      
      expect(metadata.call_id).toBeUndefined();
    });
  });

  describe("addWebSearchToolResultBlock", () => {
    test("should add a new web search tool result block", () => {
      const id = "search_123";
      const toolUseId = "tool_456";
      
      const { block, metadata } = manager.addWebSearchToolResultBlock(id, toolUseId);

      expect(block.type).toBe("web_search_tool_result");
      expect(block.tool_use_id).toBe(toolUseId);
      expect(block.content).toEqual([]);
      
      expect(metadata.id).toBe(id);
      expect(metadata.index).toBe(0);
      expect(metadata.started).toBe(false);
      expect(metadata.completed).toBe(false);
    });

    test("should return existing block if ID already exists", () => {
      const id = "search_duplicate";
      const toolUseId = "tool_789";
      
      const { block: block1, metadata: meta1 } = manager.addWebSearchToolResultBlock(id, toolUseId);
      const { block: block2, metadata: meta2 } = manager.addWebSearchToolResultBlock(id, "different_tool");

      // Should return the same block and metadata
      expect(block1).toBe(block2);
      expect(meta1).toBe(meta2);
      expect(block2.tool_use_id).toBe(toolUseId); // Original tool_use_id should be preserved
    });
  });

  describe("getBlock", () => {
    test("should retrieve block by ID", () => {
      const { block: addedBlock, metadata: addedMeta } = manager.addTextBlock();
      
      const result = manager.getBlock(addedMeta.id);
      
      expect(result).toBeDefined();
      expect(result?.block).toBe(addedBlock);
      expect(result?.metadata).toBe(addedMeta);
    });

    test("should return undefined for non-existent ID", () => {
      const result = manager.getBlock("non_existent");
      
      expect(result).toBeUndefined();
    });
  });

  describe("getToolBlock", () => {
    test("should retrieve tool block by ID", () => {
      const toolId = "tool_get";
      const { block: addedBlock, metadata: addedMeta } = manager.addToolBlock(toolId, "test_tool");
      
      const result = manager.getToolBlock(toolId);
      
      expect(result).toBeDefined();
      expect(result?.block).toBe(addedBlock);
      expect(result?.metadata).toBe(addedMeta);
    });

    test("should return undefined for non-tool blocks", () => {
      const { metadata } = manager.addTextBlock();
      
      const result = manager.getToolBlock(metadata.id);
      
      expect(result).toBeUndefined();
    });
  });

  describe("getWebSearchToolResultBlock", () => {
    test("should retrieve web search tool result block by ID", () => {
      const id = "search_get";
      const { block: addedBlock, metadata: addedMeta } = manager.addWebSearchToolResultBlock(id, "tool_123");
      
      const result = manager.getWebSearchToolResultBlock(id);
      
      expect(result).toBeDefined();
      expect(result?.block).toBe(addedBlock);
      expect(result?.metadata).toBe(addedMeta);
    });

    test("should return undefined for non-web-search blocks", () => {
      const { metadata } = manager.addTextBlock();
      
      const result = manager.getWebSearchToolResultBlock(metadata.id);
      
      expect(result).toBeUndefined();
    });
  });

  describe("getCurrentTextBlock", () => {
    test("should return the last uncompleted text block", () => {
      const { metadata: meta1 } = manager.addTextBlock();
      const { block: block2, metadata: meta2 } = manager.addTextBlock();
      
      manager.markCompleted(meta1.id);
      
      const current = manager.getCurrentTextBlock();
      
      expect(current).toBeDefined();
      expect(current?.block).toBe(block2);
      expect(current?.metadata).toBe(meta2);
    });

    test("should return undefined if all text blocks are completed", () => {
      const { metadata: meta1 } = manager.addTextBlock();
      const { metadata: meta2 } = manager.addTextBlock();
      
      manager.markCompleted(meta1.id);
      manager.markCompleted(meta2.id);
      
      const current = manager.getCurrentTextBlock();
      
      expect(current).toBeUndefined();
    });

    test("should skip non-text blocks", () => {
      const { metadata: textMeta } = manager.addTextBlock();
      manager.addToolBlock("tool_between", "test_tool");
      const { block: textBlock2, metadata: textMeta2 } = manager.addTextBlock();
      
      manager.markCompleted(textMeta.id);
      
      const current = manager.getCurrentTextBlock();
      
      expect(current).toBeDefined();
      expect(current?.block).toBe(textBlock2);
      expect(current?.metadata).toBe(textMeta2);
    });
  });

  describe("markStarted and markCompleted", () => {
    test("should mark block as started", () => {
      const { metadata } = manager.addTextBlock();
      
      expect(metadata.started).toBe(false);
      
      manager.markStarted(metadata.id);
      
      expect(metadata.started).toBe(true);
    });

    test("should mark block as completed", () => {
      const { metadata } = manager.addTextBlock();
      
      expect(metadata.completed).toBe(false);
      
      manager.markCompleted(metadata.id);
      
      expect(metadata.completed).toBe(true);
    });

    test("should handle non-existent IDs gracefully", () => {
      // Should not throw
      expect(() => manager.markStarted("non_existent")).not.toThrow();
      expect(() => manager.markCompleted("non_existent")).not.toThrow();
    });
  });

  describe("updateTextContent", () => {
    test("should append text to text block", () => {
      const { block, metadata } = manager.addTextBlock();
      
      manager.updateTextContent(metadata.id, "Hello ");
      manager.updateTextContent(metadata.id, "World!");
      
      expect(block.text).toBe("Hello World!");
    });

    test("should not update non-text blocks", () => {
      const { block, metadata } = manager.addToolBlock("tool_text", "test_tool");
      
      manager.updateTextContent(metadata.id, "Should not be added");
      
      expect(block.input).toEqual({}); // Should remain unchanged
    });

    test("should handle non-existent IDs gracefully", () => {
      expect(() => manager.updateTextContent("non_existent", "text")).not.toThrow();
    });
  });

  describe("getAllBlocks", () => {
    test("should return all blocks in order", () => {
      const { block: text1 } = manager.addTextBlock();
      const { block: tool1 } = manager.addToolBlock("tool_all", "test_tool");
      const { block: search1 } = manager.addWebSearchToolResultBlock("search_all", "tool_123");
      const { block: text2 } = manager.addTextBlock();
      
      const allBlocks = manager.getAllBlocks();
      
      expect(allBlocks).toHaveLength(4);
      expect(allBlocks[0]).toBe(text1);
      expect(allBlocks[1]).toBe(tool1);
      expect(allBlocks[2]).toBe(search1);
      expect(allBlocks[3]).toBe(text2);
    });

    test("should return a copy of the blocks array", () => {
      manager.addTextBlock();
      
      const blocks1 = manager.getAllBlocks();
      const blocks2 = manager.getAllBlocks();
      
      expect(blocks1).not.toBe(blocks2); // Different array instances
      expect(blocks1).toEqual(blocks2); // But same content
    });
  });

  describe("hasActiveTools", () => {
    test("should return true when there are uncompleted tool blocks", () => {
      const { metadata } = manager.addToolBlock("tool_active", "test_tool");
      
      expect(manager.hasActiveTools()).toBe(true);
      
      manager.markCompleted(metadata.id);
      
      expect(manager.hasActiveTools()).toBe(false);
    });

    test("should return false when there are only text blocks", () => {
      manager.addTextBlock();
      manager.addTextBlock();
      
      expect(manager.hasActiveTools()).toBe(false);
    });

    test("should return false when all tool blocks are completed", () => {
      const { metadata: meta1 } = manager.addToolBlock("tool_1", "test_tool_1");
      const { metadata: meta2 } = manager.addToolBlock("tool_2", "test_tool_2");
      
      manager.markCompleted(meta1.id);
      manager.markCompleted(meta2.id);
      
      expect(manager.hasActiveTools()).toBe(false);
    });
  });

  describe("getUncompletedBlocks", () => {
    test("should return all uncompleted blocks", () => {
      const { block: text1, metadata: textMeta1 } = manager.addTextBlock();
      const { block: tool1, metadata: toolMeta1 } = manager.addToolBlock("tool_uncomp", "test_tool");
      const { block: text2, metadata: textMeta2 } = manager.addTextBlock();
      
      manager.markCompleted(textMeta1.id);
      
      const uncompleted = manager.getUncompletedBlocks();
      
      expect(uncompleted).toHaveLength(2);
      expect(uncompleted[0].block).toBe(tool1);
      expect(uncompleted[0].metadata).toBe(toolMeta1);
      expect(uncompleted[1].block).toBe(text2);
      expect(uncompleted[1].metadata).toBe(textMeta2);
    });

    test("should return empty array when all blocks are completed", () => {
      const { metadata: meta1 } = manager.addTextBlock();
      const { metadata: meta2 } = manager.addToolBlock("tool_all_comp", "test_tool");
      
      manager.markCompleted(meta1.id);
      manager.markCompleted(meta2.id);
      
      const uncompleted = manager.getUncompletedBlocks();
      
      expect(uncompleted).toHaveLength(0);
    });
  });

  describe("getMetadata", () => {
    test("should return metadata by ID", () => {
      const { metadata: addedMeta } = manager.addTextBlock();
      
      const retrievedMeta = manager.getMetadata(addedMeta.id);
      
      expect(retrievedMeta).toBe(addedMeta);
    });

    test("should return undefined for non-existent ID", () => {
      const metadata = manager.getMetadata("non_existent");
      
      expect(metadata).toBeUndefined();
    });
  });

  describe("mixed operations", () => {
    test("should handle complex scenario with multiple block types", () => {
      // Add various blocks
      const { block: text1, metadata: textMeta1 } = manager.addTextBlock();
      manager.updateTextContent(textMeta1.id, "Starting text");
      manager.markStarted(textMeta1.id);
      
      const { block: tool1, metadata: toolMeta1 } = manager.addToolBlock("tool_complex", "calculator", "call_complex");
      manager.markStarted(toolMeta1.id);
      
      const { block: text2, metadata: textMeta2 } = manager.addTextBlock();
      manager.updateTextContent(textMeta2.id, "Middle text");
      
      const { block: search1, metadata: searchMeta1 } = manager.addWebSearchToolResultBlock("search_complex", "tool_search");
      
      // Complete some blocks
      manager.markCompleted(textMeta1.id);
      manager.markCompleted(toolMeta1.id);
      
      // Verify state
      expect(manager.getAllBlocks()).toHaveLength(4);
      expect(manager.hasActiveTools()).toBe(false);
      expect(manager.getCurrentTextBlock()?.block).toBe(text2);
      
      const uncompleted = manager.getUncompletedBlocks();
      expect(uncompleted).toHaveLength(2);
      expect(uncompleted[0].block).toBe(text2);
      expect(uncompleted[1].block).toBe(search1);
      
      // Verify block contents
      expect((text1 as TextBlock).text).toBe("Starting text");
      expect((tool1 as ToolUseBlock).name).toBe("calculator");
      expect((search1 as WebSearchToolResultBlock).tool_use_id).toBe("tool_search");
    });

    test("should maintain correct indices across different block types", () => {
      const { metadata: meta1 } = manager.addTextBlock();
      const { metadata: meta2 } = manager.addToolBlock("tool_idx", "test");
      const { metadata: meta3 } = manager.addWebSearchToolResultBlock("search_idx", "tool_123");
      const { metadata: meta4 } = manager.addTextBlock();
      
      expect(meta1.index).toBe(0);
      expect(meta2.index).toBe(1);
      expect(meta3.index).toBe(2);
      expect(meta4.index).toBe(3);
    });
  });
});