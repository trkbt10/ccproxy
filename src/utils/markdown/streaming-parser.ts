/**
 * Generic streaming markdown parser that can be used across different providers
 */

import type {
  MarkdownElementType,
  MarkdownParseEvent,
  ParsingState,
  ProcessedRange,
  UnprocessedSegment,
  MarkdownParserConfig,
  MarkdownElementMatcher,
  MarkdownParserPlugin,
  BeginEvent,
  DeltaEvent,
  EndEvent,
  AnnotationEvent,
  MarkdownElementMetadata,
} from "./types";

export class StreamingMarkdownParser {
  *complete(): Generator<MarkdownParseEvent, never, unknown> | AsyncGenerator<MarkdownParseEvent, never, unknown> {
    throw new Error("Method not implemented.");
  }
  protected buffer = "";
  protected activeStates: Map<string, ParsingState> = new Map();
  protected idCounter = 0;
  protected processedRanges: ProcessedRange[] = [];
  protected config: MarkdownParserConfig;
  protected plugins: MarkdownParserPlugin[] = [];

  private readonly defaultMatchers: MarkdownElementMatcher[] = [
    // Code blocks have highest priority to avoid conflicts
    {
      type: "code",
      regex: /```(\w+)?\n?([\s\S]*?)```/g,
      priority: 100,
      extractMetadata: (match) => ({ language: match[1] || "text" }),
      extractContent: (match) => match[2].trim(),
    },
    // Headers
    {
      type: "header",
      regex: /^(#{1,6})\s+(.+)$/gm,
      priority: 90,
      extractMetadata: (match) => ({ level: match[1].length }),
      extractContent: (match) => match[2].trim(),
    },
    // Quotes
    {
      type: "quote",
      regex: /^>\s+(.+)$/gm,
      priority: 80,
      extractContent: (match) => match[1].trim(),
    },
    // Math expressions
    {
      type: "math",
      regex: /\$\$([\s\S]*?)\$\$/g,
      priority: 85,
      extractContent: (match) => match[1].trim(),
    },
    // Lists
    {
      type: "list",
      regex: /^(\s*)([*+-]|\d+\.)\s+(.+)$/gm,
      priority: 70,
      extractMetadata: (match) => ({
        level: Math.floor(match[1].length / 2),
        ordered: /\d+\./.test(match[2]),
      }),
      extractContent: (match) => match[3].trim(),
    },
    // Links
    {
      type: "link",
      regex: /\[([^\]]+)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g,
      priority: 60,
      extractMetadata: (match) => ({
        url: match[2],
        title: match[3] || match[1],
      }),
      extractContent: (match) => match[1],
    },
  ];

  constructor(config: MarkdownParserConfig = {}) {
    this.config = {
      preserveWhitespace: false,
      splitParagraphs: true,
      maxBufferSize: 1024 * 1024, // 1MB default
      ...config,
    };
  }

  /**
   * Add a plugin to the parser
   */
  addPlugin(plugin: MarkdownParserPlugin): void {
    this.plugins.push(plugin);
  }

  /**
   * Process new text chunk and yield parse events
   */
  async *processChunk(text: string): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    // Apply pre-processing plugins
    let processedText = text;
    for (const plugin of this.plugins) {
      if (plugin.preProcess) {
        processedText = plugin.preProcess(processedText);
      }
    }

    this.buffer += processedText;

    // Check buffer size limit
    if (this.config.maxBufferSize && this.buffer.length > this.config.maxBufferSize) {
      throw new Error(`Buffer size exceeded maximum of ${this.config.maxBufferSize} bytes`);
    }

    // Get all matchers sorted by priority
    const matchers = this.getAllMatchers();
    const events: MarkdownParseEvent[] = [];

    // Process each matcher
    for (const matcher of matchers) {
      if (this.config.enabledElements && !this.config.enabledElements.has(matcher.type as MarkdownElementType)) {
        continue;
      }

      for await (const event of this.processWithMatcher(matcher)) {
        events.push(event);
      }
    }

    // Apply custom element detection from plugins
    for (const plugin of this.plugins) {
      if (plugin.detectElements) {
        const detectedElements = plugin.detectElements(this.buffer);
        for (const element of detectedElements) {
          if (!this.isRangeProcessed(element.start, element.end)) {
            const elementId = this.generateId(element.type);
            this.processedRanges.push({ start: element.start, end: element.end, elementId });

            events.push({
              type: "begin",
              elementType: element.type as MarkdownElementType,
              elementId,
              metadata: element.metadata,
            });

            if (element.content) {
              events.push({
                type: "delta",
                elementId,
                content: element.content,
              });
            }

            events.push({
              type: "end",
              elementId,
              finalContent: element.content,
            });
          }
        }
      }
    }

    // Apply post-processing plugins
    let finalEvents = events;
    for (const plugin of this.plugins) {
      if (plugin.postProcess) {
        finalEvents = plugin.postProcess(finalEvents);
      }
    }

    // Yield events
    for (const event of finalEvents) {
      yield event;
    }

    // Process tables separately (special handling)
    yield* this.processTables();

    // Handle incomplete elements
    yield* this.processIncompleteElements();
  }

  /**
   * Process content with a specific matcher
   */
  private async *processWithMatcher(
    matcher: MarkdownElementMatcher
  ): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    const events: MarkdownParseEvent[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    matcher.regex.lastIndex = 0;

    while ((match = matcher.regex.exec(this.buffer)) !== null) {
      const startIndex = match.index;
      const endIndex = startIndex + match[0].length;

      if (this.isRangeProcessed(startIndex, endIndex)) {
        continue;
      }

      const elementId = this.generateId(matcher.type);
      this.processedRanges.push({ start: startIndex, end: endIndex, elementId });

      const metadata = matcher.extractMetadata ? matcher.extractMetadata(match) : undefined;
      const content = matcher.extractContent ? matcher.extractContent(match) : match[0];

      events.push({
        type: "begin",
        elementType: matcher.type as MarkdownElementType,
        elementId,
        metadata,
      });

      if (content) {
        events.push({
          type: "delta",
          elementId,
          content,
        });
      }

      events.push({
        type: "end",
        elementId,
        finalContent: content,
      });

      // Special handling for links - emit annotation
      if (matcher.type === "link" && metadata?.url) {
        events.push({
          type: "annotation",
          elementId,
          annotation: {
            type: "url_citation",
            url: metadata.url,
            title: metadata.title || content,
            start_index: startIndex,
            end_index: endIndex,
          },
        });
      }
    }

    for (const event of events) {
      yield event;
    }
  }

  /**
   * Process tables (special handling for multi-line elements)
   */
  private async *processTables(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    const tableRowRegex = /^\|.*\|$/gm;
    const matches = Array.from(this.buffer.matchAll(tableRowRegex));

    if (matches.length === 0) return;

    // Group consecutive table rows
    let currentTable: { start: number; end: number; content: string } | null = null;
    const processedTables: Array<{ start: number; end: number; content: string }> = [];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const currentIndex = match.index!;

      if (!currentTable) {
        currentTable = {
          start: currentIndex,
          end: currentIndex + match[0].length,
          content: match[0],
        };
      } else {
        const prevEnd = currentTable.end;
        const linesBetween = this.buffer.slice(prevEnd, currentIndex).trim();

        if (linesBetween === "" || linesBetween === "\n") {
          currentTable.end = currentIndex + match[0].length;
          currentTable.content += "\n" + match[0];
        } else {
          processedTables.push(currentTable);
          currentTable = {
            start: currentIndex,
            end: currentIndex + match[0].length,
            content: match[0],
          };
        }
      }
    }

    if (currentTable) {
      processedTables.push(currentTable);
    }

    // Process each table
    for (const table of processedTables) {
      if (this.isRangeProcessed(table.start, table.end)) {
        continue;
      }

      const elementId = this.generateId("table");
      this.processedRanges.push({ start: table.start, end: table.end, elementId });

      yield {
        type: "begin",
        elementType: "table",
        elementId,
      };

      yield {
        type: "delta",
        elementId,
        content: table.content,
      };

      yield {
        type: "end",
        elementId,
        finalContent: table.content,
      };
    }
  }

  /**
   * Handle incomplete elements (e.g., unclosed code blocks)
   */
  private async *processIncompleteElements(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    // Handle incomplete code blocks
    const incompleteCodeRegex = /```(\w+)?\n?([\s\S]*?)$/g;
    let match;

    while ((match = incompleteCodeRegex.exec(this.buffer)) !== null) {
      const [fullMatch, language, content] = match;
      const startIndex = match.index;

      // Check if this is truly incomplete
      const hasClosing =
        this.buffer.slice(startIndex).includes("```\n") || this.buffer.slice(startIndex).endsWith("```");

      if (hasClosing || this.isRangeProcessed(startIndex, startIndex + fullMatch.length)) {
        continue;
      }

      // Find or create state for this incomplete code block
      let state = Array.from(this.activeStates.values()).find((s) => s.elementType === "code" && !s.processed);

      if (!state) {
        const elementId = this.generateId("code");
        state = {
          elementType: "code",
          elementId,
          startMarker: `\`\`\`${language || ""}`,
          endMarker: "```",
          buffer: "",
          metadata: { language: language || "text" },
          processed: false,
        };

        this.activeStates.set(elementId, state);

        yield {
          type: "begin",
          elementType: "code",
          elementId,
          metadata: { language: language || "text" },
        };
      }

      // Emit delta for new content
      if (content !== state.buffer) {
        const newContent = content.slice(state.buffer.length);
        if (newContent) {
          yield {
            type: "delta",
            elementId: state.elementId,
            content: newContent,
          };
          state.buffer = content;
        }
      }
    }
  }

  /**
   * Get all matchers sorted by priority
   */
  private getAllMatchers(): MarkdownElementMatcher[] {
    const allMatchers = [...this.defaultMatchers, ...(this.config.customMatchers || [])];

    return allMatchers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Check if a range has already been processed
   */
  protected isRangeProcessed(start: number, end: number): boolean {
    return this.processedRanges.some(
      (range) =>
        (start >= range.start && start < range.end) ||
        (end > range.start && end <= range.end) ||
        (start <= range.start && end >= range.end)
    );
  }

  /**
   * Generate unique element ID
   */
  protected generateId(type: string): string {
    if (this.config.idGenerator) {
      return this.config.idGenerator(type as MarkdownElementType);
    }

    const prefix = this.config.idPrefix || type;
    return `${prefix}_${++this.idCounter}_${Date.now()}`;
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = "";
    this.activeStates.clear();
    this.idCounter = 0;
    this.processedRanges = [];
  }

  /**
   * Get current buffer for debugging
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Get active parsing states for debugging
   */
  getActiveStates(): Map<string, ParsingState> {
    return new Map(this.activeStates);
  }

  /**
   * Get processed ranges
   */
  getProcessedRanges(): ProcessedRange[] {
    return [...this.processedRanges];
  }

  /**
   * Get unprocessed text segments
   */
  getUnprocessedSegments(): UnprocessedSegment[] {
    const segments: UnprocessedSegment[] = [];
    const sortedRanges = [...this.processedRanges].sort((a, b) => a.start - b.start);

    let lastEnd = 0;

    for (const range of sortedRanges) {
      if (range.start > lastEnd) {
        segments.push({
          start: lastEnd,
          end: range.start,
          text: this.buffer.substring(lastEnd, range.start),
        });
      }
      lastEnd = Math.max(lastEnd, range.end);
    }

    // Add final segment if exists
    if (lastEnd < this.buffer.length) {
      segments.push({
        start: lastEnd,
        end: this.buffer.length,
        text: this.buffer.substring(lastEnd),
      });
    }

    return segments;
  }
}
