/**
 * Test helper utilities for markdown parser testing
 */

import type { MarkdownParseEvent } from './types';
import { StreamingMarkdownParser } from './streaming-parser';

export interface TestHelperOptions {
  chunkSize?: number;
  delayMs?: number;
}

/**
 * Create a test helper for markdown parser testing
 */
export function createTestHelper(parser: StreamingMarkdownParser) {
  return {
    /**
     * Collect all events from parsing a string
     */
    async collectEvents(
      input: string | string[],
      options?: TestHelperOptions
    ): Promise<MarkdownParseEvent[]> {
      const events: MarkdownParseEvent[] = [];
      const chunks = Array.isArray(input) ? input : [input];
      
      for (const chunk of chunks) {
        if (options?.delayMs) {
          await new Promise(resolve => setTimeout(resolve, options.delayMs));
        }
        
        for await (const event of parser.processChunk(chunk)) {
          events.push(event);
        }
      }
      
      return events;
    },

    /**
     * Create a mock stream that yields chunks
     */
    async *createMockStream(
      content: string,
      chunkSize: number = 10
    ): AsyncIterable<string> {
      for (let i = 0; i < content.length; i += chunkSize) {
        yield content.slice(i, i + chunkSize);
      }
    },

    /**
     * Parse content in chunks and collect events
     */
    async parseInChunks(
      content: string,
      chunkSize: number = 10
    ): Promise<MarkdownParseEvent[]> {
      const events: MarkdownParseEvent[] = [];
      
      for await (const chunk of this.createMockStream(content, chunkSize)) {
        for await (const event of parser.processChunk(chunk)) {
          events.push(event);
        }
      }
      
      return events;
    },

    /**
     * Filter events by type
     */
    filterEventsByType<T extends MarkdownParseEvent['type']>(
      events: MarkdownParseEvent[],
      type: T
    ): Extract<MarkdownParseEvent, { type: T }>[] {
      return events.filter(e => e.type === type) as Extract<MarkdownParseEvent, { type: T }>[];
    },

    /**
     * Get events for a specific element ID
     */
    getEventsForElement(
      events: MarkdownParseEvent[],
      elementId: string
    ): MarkdownParseEvent[] {
      return events.filter(e => {
        if ('elementId' in e) {
          return e.elementId === elementId;
        }
        return false;
      });
    },

    /**
     * Assert event sequence for an element
     */
    assertElementSequence(
      events: MarkdownParseEvent[],
      elementId: string,
      expectedTypes: MarkdownParseEvent['type'][]
    ): boolean {
      const elementEvents = this.getEventsForElement(events, elementId);
      const actualTypes = elementEvents.map(e => e.type);
      
      if (actualTypes.length !== expectedTypes.length) {
        return false;
      }
      
      return actualTypes.every((type, index) => type === expectedTypes[index]);
    },

    /**
     * Get final content for all elements
     */
    getFinalContents(events: MarkdownParseEvent[]): Map<string, string> {
      const contents = new Map<string, string>();
      
      for (const event of events) {
        if (event.type === 'end') {
          contents.set(event.elementId, event.finalContent);
        }
      }
      
      return contents;
    },

    /**
     * Debug helper - print events in readable format
     */
    printEvents(events: MarkdownParseEvent[]): void {
      for (const event of events) {
        switch (event.type) {
          case 'begin':
            console.log(`[BEGIN] ${event.elementType} (${event.elementId})`);
            if (event.metadata) {
              console.log(`  Metadata:`, event.metadata);
            }
            break;
          case 'delta':
            console.log(`[DELTA] ${event.elementId}: "${event.content}"`);
            break;
          case 'end':
            console.log(`[END] ${event.elementId}: "${event.finalContent}"`);
            break;
          case 'annotation':
            console.log(`[ANNOTATION] ${event.elementId}:`, event.annotation);
            break;
        }
      }
    }
  };
}

/**
 * Create a simple test parser instance
 */
export function createTestParser(config?: ConstructorParameters<typeof StreamingMarkdownParser>[0]): {
  parser: StreamingMarkdownParser;
  helper: ReturnType<typeof createTestHelper>;
} {
  const parser = new StreamingMarkdownParser(config);
  const helper = createTestHelper(parser);
  
  return { parser, helper };
}