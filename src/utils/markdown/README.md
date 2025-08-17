# Markdown Streaming Utilities

This module provides a generic streaming markdown parser that can be used across different AI providers to parse markdown content incrementally as it arrives in a stream.

## Usage

### Basic Usage

```typescript
import { StreamingMarkdownParser } from './src/utils/markdown';

const parser = new StreamingMarkdownParser();

// Process text chunks as they arrive
for await (const event of parser.processChunk("# Hello\n```js\nconsole.log('test');\n```")) {
  console.log(event);
}
```

### Provider-Specific Implementation

```typescript
import { StreamingMarkdownParser } from './src/utils/markdown';
import type { MarkdownParseEvent } from './src/utils/markdown';

// Create a provider-specific parser
export class ClaudeMarkdownParser extends StreamingMarkdownParser {
  constructor() {
    super({
      idPrefix: 'claude',
      preserveWhitespace: true,
      // Enable only specific elements
      enabledElements: new Set(['code', 'header', 'list'])
    });
  }

  // Override to add custom behavior
  async *processChunk(text: string): AsyncGenerator<MarkdownParseEvent> {
    // Pre-process Claude-specific formatting
    const processedText = text.replace(/\[CLAUDE\]/g, '');
    
    // Use parent implementation
    yield* super.processChunk(processedText);
  }
}
```

### Custom Element Matchers

```typescript
const parser = new StreamingMarkdownParser({
  customMatchers: [
    {
      type: 'custom_tag',
      regex: /<custom>(.*?)<\/custom>/g,
      priority: 100,
      extractContent: (match) => match[1],
      extractMetadata: (match) => ({ tag: 'custom' })
    }
  ]
});
```

### Using Plugins

```typescript
import { StreamingMarkdownParser, MarkdownParserPlugin } from './src/utils/markdown';

const citationPlugin: MarkdownParserPlugin = {
  name: 'citation-enhancer',
  postProcess: (events) => {
    // Add citation numbers to links
    let citationCount = 0;
    return events.map(event => {
      if (event.type === 'annotation' && event.annotation.type === 'url_citation') {
        citationCount++;
        return {
          ...event,
          annotation: {
            ...event.annotation,
            citationNumber: citationCount
          }
        };
      }
      return event;
    });
  }
};

const parser = new StreamingMarkdownParser();
parser.addPlugin(citationPlugin);
```

### Testing

```typescript
import { createTestParser } from './src/utils/markdown';

const { parser, helper } = createTestParser();

// Test parsing
const events = await helper.collectEvents('# Test\n```js\ncode\n```');

// Assert event sequence
const codeEvents = helper.filterEventsByType(events, 'begin');
console.log(codeEvents);

// Get final contents
const contents = helper.getFinalContents(events);
console.log(contents);
```

## Event Types

The parser emits four types of events:

1. **begin** - When a markdown element starts
   - Contains element type, ID, and optional metadata

2. **delta** - Incremental content updates
   - Contains element ID and content chunk

3. **end** - When an element is complete
   - Contains element ID and final content

4. **annotation** - Special metadata events (e.g., for links)
   - Contains element ID and annotation details

## Supported Elements

- **code** - Code blocks with language detection
- **header** - Headers (H1-H6) with level metadata
- **quote** - Block quotes
- **math** - Math expressions ($$...$$)
- **list** - Lists with level and ordering metadata
- **table** - Markdown tables
- **link** - Links with URL and title metadata

## Configuration Options

- `enabledElements` - Set of element types to parse
- `customMatchers` - Array of custom element matchers
- `preserveWhitespace` - Whether to preserve whitespace
- `splitParagraphs` - Whether to split on paragraph breaks
- `maxBufferSize` - Maximum buffer size in bytes
- `idPrefix` - Prefix for generated element IDs
- `idGenerator` - Custom ID generation function