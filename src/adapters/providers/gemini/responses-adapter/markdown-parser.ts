/**
 * Streaming Markdown Parser for Gemini responses
 * Parses Markdown elements incrementally as text chunks arrive
 * Yields begin/delta/end events for streaming processing
 */

export type MarkdownElementType = 'text' | 'code' | 'header' | 'list' | 'quote' | 'table' | 'math' | 'link';

export type MarkdownParseEvent = 
  | {
      type: 'begin';
      elementType: MarkdownElementType;
      elementId: string;
      metadata?: {
        language?: string; // for code blocks
        level?: number; // for headers
        url?: string; // for links
        title?: string; // for links
      };
    }
  | {
      type: 'delta';
      elementId: string;
      content: string;
    }
  | {
      type: 'end';
      elementId: string;
      finalContent: string;
    }
  | {
      type: 'annotation';
      elementId: string;
      annotation: {
        type: 'url_citation';
        url: string;
        title: string;
        start_index: number;
        end_index: number;
      };
    };

type ParsingState = {
  elementType: MarkdownElementType;
  elementId: string;
  startMarker: string;
  endMarker: string;
  buffer: string;
  metadata?: {
    language?: string;
    level?: number;
  };
  processed: boolean;
};

export class StreamingMarkdownParser {
  private buffer = '';
  private activeStates: Map<string, ParsingState> = new Map();
  private idCounter = 0;
  private processedRanges: Array<{ start: number; end: number; elementId: string }> = [];

  /**
   * Process new text chunk and yield parse events
   */
  async *processChunk(text: string): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    this.buffer += text;
    
    // Process in order of priority - code blocks first to avoid conflicts
    yield* this.processCodeBlocks();
    yield* this.processHeaders();
    yield* this.processQuotes();
    yield* this.processMath();
    yield* this.processLists();
    yield* this.processTables();
    yield* this.processLinks();
  }

  /**
   * Process code blocks (```...```)
   */
  private async *processCodeBlocks(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockRegex.exec(this.buffer)) !== null) {
      const [fullMatch, language, content] = match;
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      
      // Check if this range was already processed
      if (this.isRangeProcessed(startIndex, endIndex)) {
        continue;
      }
      
      const elementId = this.generateId('code');
      
      // Mark range as processed
      this.processedRanges.push({ start: startIndex, end: endIndex, elementId });
      
      yield {
        type: 'begin',
        elementType: 'code',
        elementId,
        metadata: { language: language || 'text' }
      };
      
      if (content.trim()) {
        yield {
          type: 'delta',
          elementId,
          content: content.trim()
        };
      }
      
      yield {
        type: 'end',
        elementId,
        finalContent: content.trim()
      };
    }

    // Handle incomplete code blocks
    const incompleteCodeRegex = /```(\w+)?\n?([\s\S]*?)$/g;
    let incompleteMatch;
    
    while ((incompleteMatch = incompleteCodeRegex.exec(this.buffer)) !== null) {
      const [fullMatch, language, content] = incompleteMatch;
      const startIndex = incompleteMatch.index;
      
      // Check if this is truly incomplete (no closing ```)
      const hasClosing = this.buffer.slice(startIndex).includes('```\n') || 
                        this.buffer.slice(startIndex).endsWith('```');
      
      if (hasClosing || this.isRangeProcessed(startIndex, startIndex + fullMatch.length)) {
        continue;
      }
      
      // Find or create state for this incomplete code block
      let state = Array.from(this.activeStates.values())
        .find(s => s.elementType === 'code' && !s.processed);
      
      if (!state) {
        const elementId = this.generateId('code');
        state = {
          elementType: 'code',
          elementId,
          startMarker: `\`\`\`${language || ''}`,
          endMarker: '```',
          buffer: '',
          metadata: { language: language || 'text' },
          processed: false
        };
        
        this.activeStates.set(elementId, state);
        
        yield {
          type: 'begin',
          elementType: 'code',
          elementId,
          metadata: { language: language || 'text' }
        };
      }
      
      // Emit delta for new content
      if (content !== state.buffer) {
        const newContent = content.slice(state.buffer.length);
        if (newContent) {
          yield {
            type: 'delta',
            elementId: state.elementId,
            content: newContent
          };
          state.buffer = content;
        }
      }
    }
  }

  /**
   * Process headers (# ## ###)
   */
  private async *processHeaders(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    const headerRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;

    while ((match = headerRegex.exec(this.buffer)) !== null) {
      const [fullMatch, hashes, content] = match;
      const level = hashes.length;
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      
      if (this.isRangeProcessed(startIndex, endIndex)) {
        continue;
      }
      
      const elementId = this.generateId('header');
      this.processedRanges.push({ start: startIndex, end: endIndex, elementId });
      
      yield {
        type: 'begin',
        elementType: 'header',
        elementId,
        metadata: { level }
      };
      
      yield {
        type: 'delta',
        elementId,
        content: content.trim()
      };
      
      yield {
        type: 'end',
        elementId,
        finalContent: content.trim()
      };
    }
  }

  /**
   * Process quotes (> text)
   */
  private async *processQuotes(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    const quoteRegex = /^>\s+(.+)$/gm;
    let match;

    while ((match = quoteRegex.exec(this.buffer)) !== null) {
      const [fullMatch, content] = match;
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      
      if (this.isRangeProcessed(startIndex, endIndex)) {
        continue;
      }
      
      const elementId = this.generateId('quote');
      this.processedRanges.push({ start: startIndex, end: endIndex, elementId });
      
      yield {
        type: 'begin',
        elementType: 'quote',
        elementId
      };
      
      yield {
        type: 'delta',
        elementId,
        content: content.trim()
      };
      
      yield {
        type: 'end',
        elementId,
        finalContent: content.trim()
      };
    }
  }

  /**
   * Process math expressions ($$ ... $$)
   */
  private async *processMath(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    const mathRegex = /\$\$([\s\S]*?)\$\$/g;
    let match;

    while ((match = mathRegex.exec(this.buffer)) !== null) {
      const [fullMatch, content] = match;
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      
      if (this.isRangeProcessed(startIndex, endIndex)) {
        continue;
      }
      
      const elementId = this.generateId('math');
      this.processedRanges.push({ start: startIndex, end: endIndex, elementId });
      
      yield {
        type: 'begin',
        elementType: 'math',
        elementId
      };
      
      yield {
        type: 'delta',
        elementId,
        content: content.trim()
      };
      
      yield {
        type: 'end',
        elementId,
        finalContent: content.trim()
      };
    }
  }

  /**
   * Process lists (* item)
   */
  private async *processLists(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    const listRegex = /^(\s*)[*+-]\s+(.+)$/gm;
    let match;

    while ((match = listRegex.exec(this.buffer)) !== null) {
      const [fullMatch, indent, content] = match;
      const level = Math.floor(indent.length / 2);
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      
      if (this.isRangeProcessed(startIndex, endIndex)) {
        continue;
      }
      
      const elementId = this.generateId('list');
      this.processedRanges.push({ start: startIndex, end: endIndex, elementId });
      
      yield {
        type: 'begin',
        elementType: 'list',
        elementId,
        metadata: { level }
      };
      
      yield {
        type: 'delta',
        elementId,
        content: content.trim()
      };
      
      yield {
        type: 'end',
        elementId,
        finalContent: content.trim()
      };
    }
  }

  /**
   * Process tables (| col1 | col2 |)
   */
  private async *processTables(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    // Find table rows (lines that start and end with |)
    const tableRowRegex = /^\|.*\|$/gm;
    const matches = Array.from(this.buffer.matchAll(tableRowRegex));
    
    if (matches.length === 0) return;
    
    // Group consecutive table rows
    let currentTable: { start: number; end: number; content: string } | null = null;
    let processedTables: Array<{ start: number; end: number; content: string }> = [];
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const currentIndex = match.index!;
      
      if (!currentTable) {
        // Start new table
        currentTable = {
          start: currentIndex,
          end: currentIndex + match[0].length,
          content: match[0]
        };
      } else {
        // Check if this row is consecutive to the previous one
        const prevEnd = currentTable.end;
        const linesBetween = this.buffer.slice(prevEnd, currentIndex).trim();
        
        if (linesBetween === '' || linesBetween === '\n') {
          // Extend current table
          currentTable.end = currentIndex + match[0].length;
          currentTable.content += '\n' + match[0];
        } else {
          // Finish current table and start new one
          processedTables.push(currentTable);
          currentTable = {
            start: currentIndex,
            end: currentIndex + match[0].length,
            content: match[0]
          };
        }
      }
    }
    
    // Add final table if exists
    if (currentTable) {
      processedTables.push(currentTable);
    }
    
    // Process each table
    for (const table of processedTables) {
      if (this.isRangeProcessed(table.start, table.end)) {
        continue;
      }
      
      const elementId = this.generateId('table');
      this.processedRanges.push({ start: table.start, end: table.end, elementId });
      
      yield {
        type: 'begin',
        elementType: 'table',
        elementId
      };
      
      yield {
        type: 'delta',
        elementId,
        content: table.content
      };
      
      yield {
        type: 'end',
        elementId,
        finalContent: table.content
      };
    }
  }

  /**
   * Check if a range has already been processed
   */
  private isRangeProcessed(start: number, end: number): boolean {
    return this.processedRanges.some(range => 
      (start >= range.start && start < range.end) ||
      (end > range.start && end <= range.end) ||
      (start <= range.start && end >= range.end)
    );
  }

  /**
   * Generate unique element ID
   */
  private generateId(prefix: string): string {
    return `${prefix}_${++this.idCounter}_${Date.now()}`;
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = '';
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
  getProcessedRanges(): Array<{ start: number; end: number; elementId: string }> {
    return [...this.processedRanges];
  }

  /**
   * Get unprocessed text segments
   */
  getUnprocessedSegments(): Array<{ start: number; end: number; text: string }> {
    const segments: Array<{ start: number; end: number; text: string }> = [];
    const sortedRanges = [...this.processedRanges].sort((a, b) => a.start - b.start);
    
    let lastEnd = 0;
    
    for (const range of sortedRanges) {
      if (range.start > lastEnd) {
        segments.push({
          start: lastEnd,
          end: range.start,
          text: this.buffer.substring(lastEnd, range.start)
        });
      }
      lastEnd = Math.max(lastEnd, range.end);
    }
    
    // Add final segment if exists
    if (lastEnd < this.buffer.length) {
      segments.push({
        start: lastEnd,
        end: this.buffer.length,
        text: this.buffer.substring(lastEnd)
      });
    }
    
    return segments;
  }

  /**
   * Process markdown links [text](url "title")
   */
  private async *processLinks(): AsyncGenerator<MarkdownParseEvent, void, unknown> {
    // Match markdown links with optional title
    const linkRegex = /\[([^\]]+)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g;
    let match;
    
    while ((match = linkRegex.exec(this.buffer)) !== null) {
      const [fullMatch, text, url, title] = match;
      const startIndex = match.index;
      const endIndex = startIndex + fullMatch.length;
      
      // Check if this range was already processed
      if (this.isRangeProcessed(startIndex, endIndex)) {
        continue;
      }
      
      const elementId = this.generateId('link');
      
      // Mark range as processed
      this.processedRanges.push({ start: startIndex, end: endIndex, elementId });
      
      // Emit annotation event for the link
      yield {
        type: 'annotation',
        elementId,
        annotation: {
          type: 'url_citation',
          url: url,
          title: title || text,
          start_index: startIndex,
          end_index: endIndex
        }
      };
    }
  }
}