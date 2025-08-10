import type {
  TextBlock,
  ToolUseBlock,
  WebSearchToolResultBlock,
  ContentBlock,
} from "@anthropic-ai/sdk/resources/messages";

// Metadata for tracking streaming state
type StreamingMetadata = {
  id: string;
  index: number;
  started: boolean;
  completed: boolean;
  argsBuffer?: string;
  call_id?: string;
};

export class ContentBlockManager {
  private blocks: ContentBlock[] = [];
  private metadata: Map<string, StreamingMetadata> = new Map();

  /**
   * Add a new text block
   */
  addTextBlock(): { block: TextBlock; metadata: StreamingMetadata } {
    const index = this.blocks.length;
    const id = `text_${index}`;

    const block: TextBlock = {
      type: "text",
      text: "",
      citations: null,
    };

    const metadata: StreamingMetadata = {
      id,
      index,
      started: false,
      completed: false,
    };

    this.blocks.push(block);
    this.metadata.set(id, metadata);

    return { block, metadata };
  }

  /**
   * Add a new tool use block
   */
  addToolBlock(
    toolId: string,
    name: string,
    call_id?: string
  ): { block: ToolUseBlock; metadata: StreamingMetadata } {
    const existingMeta = this.metadata.get(toolId);
    if (existingMeta) {
      const block = this.blocks[existingMeta.index] as ToolUseBlock;
      return { block, metadata: existingMeta };
    }

    const index = this.blocks.length;

    const block: ToolUseBlock = {
      id: toolId,
      type: "tool_use",
      name,
      input: {},
    };

    const metadata: StreamingMetadata = {
      id: toolId,
      index,
      started: false,
      completed: false,
      argsBuffer: "",
      call_id,
    };

    this.blocks.push(block);
    this.metadata.set(toolId, metadata);

    return { block, metadata };
  }

  /**
   * Add a new web search tool result block
   */
  addWebSearchToolResultBlock(
    id: string,
    toolUseId: string
  ): { block: WebSearchToolResultBlock; metadata: StreamingMetadata } {
    const existingMeta = this.metadata.get(id);
    if (existingMeta) {
      const block = this.blocks[existingMeta.index] as WebSearchToolResultBlock;
      return { block, metadata: existingMeta };
    }

    const index = this.blocks.length;

    const block: WebSearchToolResultBlock = {
      type: "web_search_tool_result",
      tool_use_id: toolUseId,
      content: [],
    };

    const metadata: StreamingMetadata = {
      id,
      index,
      started: false,
      completed: false,
    };

    this.blocks.push(block);
    this.metadata.set(id, metadata);

    return { block, metadata };
  }

  /**
   * Get block and metadata by ID
   */
  getBlock(
    id: string
  ): { block: ContentBlock; metadata: StreamingMetadata } | undefined {
    const metadata = this.metadata.get(id);
    if (!metadata) {
      return undefined;
    }

    const block = this.blocks[metadata.index];
    return { block, metadata };
  }

  /**
   * Get tool block by ID
   */
  getToolBlock(
    id: string
  ): { block: ToolUseBlock; metadata: StreamingMetadata } | undefined {
    const result = this.getBlock(id);
    if (!result || result.block.type !== "tool_use") {
      return undefined;
    }

    return { block: result.block as ToolUseBlock, metadata: result.metadata };
  }

  /**
   * Get web search tool result block by ID
   */
  getWebSearchToolResultBlock(
    id: string
  ):
    | { block: WebSearchToolResultBlock; metadata: StreamingMetadata }
    | undefined {
    const result = this.getBlock(id);
    if (!result || result.block.type !== "web_search_tool_result") {
      return undefined;
    }

    return {
      block: result.block as WebSearchToolResultBlock,
      metadata: result.metadata,
    };
  }

  /**
   * Get current text block (last added text block that's not completed)
   */
  getCurrentTextBlock():
    | { block: TextBlock; metadata: StreamingMetadata }
    | undefined {
    for (const [id, metadata] of Array.from(
      this.metadata.entries()
    ).reverse()) {
      if (!metadata.completed) {
        const block = this.blocks[metadata.index];
        if (block.type === "text") {
          return { block: block as TextBlock, metadata };
        }
      }
    }
    return undefined;
  }

  /**
   * Mark block as started
   */
  markStarted(id: string): void {
    const metadata = this.metadata.get(id);
    if (metadata) {
      metadata.started = true;
    }
  }

  /**
   * Mark block as completed
   */
  markCompleted(id: string): void {
    const metadata = this.metadata.get(id);
    if (metadata) {
      metadata.completed = true;
    }
  }

  /**
   * Get all blocks
   */
  getAllBlocks(): ContentBlock[] {
    return [...this.blocks];
  }

  /**
   * Check if there are any active tool blocks
   */
  hasActiveTools(): boolean {
    for (const [id, metadata] of this.metadata) {
      if (!metadata.completed) {
        const block = this.blocks[metadata.index];
        if (block.type === "tool_use") {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get all uncompleted blocks with metadata
   */
  getUncompletedBlocks(): Array<{
    block: ContentBlock;
    metadata: StreamingMetadata;
  }> {
    const uncompleted: Array<{
      block: ContentBlock;
      metadata: StreamingMetadata;
    }> = [];

    for (const [id, metadata] of this.metadata) {
      if (!metadata.completed) {
        const block = this.blocks[metadata.index];
        uncompleted.push({ block, metadata });
      }
    }

    return uncompleted;
  }

  /**
   * Update text content
   */
  updateTextContent(id: string, text: string): void {
    const metadata = this.metadata.get(id);
    if (!metadata) {
      return;
    }

    const block = this.blocks[metadata.index];
    if (block.type === "text") {
      block.text = (block.text || "") + text;
    }
  }

  /**
   * Get metadata by ID
   */
  getMetadata(id: string): StreamingMetadata | undefined {
    return this.metadata.get(id);
  }
}
