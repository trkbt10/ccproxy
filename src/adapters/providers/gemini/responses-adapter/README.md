# Gemini Responses Adapter

This adapter converts Gemini streaming responses to the OpenAI Responses API format.

## Architecture

The adapter consists of three main components:

### 1. StreamingMarkdownParser (`markdown-parser.ts`)
- Parses Markdown elements incrementally as text chunks arrive
- Detects code blocks, headers, quotes, lists, tables, and links
- Emits begin/delta/end events for each element
- Does NOT handle paragraph breaks (\n\n) - that's the stream handler's job

### 2. GeminiStreamHandler (`stream-handler.ts`)
- Converts Gemini's streaming format to OpenAI Responses API events
- Uses a reducer pattern for state management
- Handles text splitting on paragraph breaks (\n\n)
- Preserves code block integrity (no splitting inside code blocks)
- Manages proper event sequencing (added → deltas → done)

### 3. Integration Layer
- Coordinates between the parser and handler
- Ensures consistent behavior across different streaming scenarios

## Key Behaviors

### Text Splitting
- Text is split into separate deltas at each `\n\n` (paragraph break)
- Multiple consecutive `\n\n` are treated as individual deltas
- Code blocks (between ``` markers) are NEVER split, even if they contain `\n\n`
- Splitting happens during streaming, not just at completion

### Event Sequencing
1. `response.created` - Always first
2. `response.output_item.added` - When starting a new output item
3. `response.output_text.delta` - For each text chunk
4. `response.output_text.done` - When text is complete
5. `response.output_item.done` - After text done
6. `response.completed` - Always last

### Code Block Handling
```typescript
// Input with code block
const text = "Para1\n\n```python\ndef foo():\n\n    pass\n```\n\nPara2";

// Produces 3 deltas:
// 1. "Para1\n\n"
// 2. "```python\ndef foo():\n\n    pass\n```\n\n"  // Preserved with \n\n inside
// 3. "Para2"
```

### Edge Cases Handled

#### Empty/Whitespace
- Empty input → Only created/completed events
- Only whitespace → Preserved as-is
- Empty code blocks → Handled correctly

#### Streaming Boundaries
- `\n\n` split across chunks → Detected and handled
- ``` split across chunks → State tracked correctly
- Single character chunks → Processed efficiently

#### Special Characters
- Unicode (emojis, RTL text, etc.) → Preserved correctly
- Mixed line endings (\r\n, \n) → Handled appropriately
- Zero-width characters → Passed through

#### Error Recovery
- null/undefined text → Ignored gracefully
- Malformed function calls → Use defaults
- Incomplete streams → Flush buffer on completion

## Performance Characteristics

- **Memory**: O(buffer_size) - Only buffers unprocessed text
- **Time**: O(n) where n is input length
- **Streaming**: Immediate emission when paragraph breaks detected

## Testing

The implementation includes:

### Unit Tests
- `stream-handler.spec.ts` - Basic functionality
- `markdown-parser.spec.ts` - Markdown element detection

### Integration Tests
- `stream-handler-markdown.spec.ts` - File-based testing with real markdown
- `integration.spec.ts` - Parser/handler coordination

### Edge Case Tests
- `stream-handler-edge-cases.spec.ts` - Original edge cases
- `stream-handler-edge-cases-advanced.spec.ts` - Comprehensive edge cases

### Test Data
- `__mocks__/markdown-samples/` - Various markdown patterns:
  - `simple-text.md` - Basic paragraphs
  - `code-blocks.md` - Code with \n\n inside
  - `mixed-content.md` - Headers, lists, quotes, etc.
  - `extreme-edge-cases.md` - Nested backticks, empty blocks
  - `unicode-special-chars.md` - Unicode, RTL, special chars
  - `large-content.md` - Performance testing
  - `cross-validation-example.md` - Real-world example

## Usage

```typescript
import { GeminiStreamHandler } from './stream-handler';

const handler = new GeminiStreamHandler('gemini-pro');

// Process a stream
for await (const event of handler.handleStream(geminiStream)) {
  // event is an OpenAI Responses API event
  console.log(event.type);
}

// Reset for reuse
handler.reset();
```

## Limitations

1. **Markdown Parser**:
   - Doesn't handle all markdown elements (e.g., footnotes)
   - No support for custom markdown extensions
   - Incomplete elements at stream end may not be detected

2. **Stream Handler**:
   - Code block detection is simple (just ``` tracking)
   - No support for nested code blocks with same delimiter
   - Function calls interrupt text accumulation

3. **Integration**:
   - Parser and handler run independently (no feedback loop)
   - Some edge cases in markdown might not be perfectly preserved

## Future Improvements

1. **Enhanced Markdown Support**:
   - Add support for more markdown elements
   - Better handling of nested structures
   - Markdown extensions (e.g., mermaid diagrams)

2. **Performance Optimizations**:
   - Streaming parser with less regex
   - Lazy evaluation of large texts
   - Better buffer management

3. **Error Handling**:
   - More robust recovery mechanisms
   - Better error messages
   - Validation of output format

## Contributing

When adding new features or fixing bugs:

1. Add test cases to `__mocks__/markdown-samples/`
2. Update relevant test files
3. Ensure all tests pass
4. Document new behaviors in this README

The test suite is comprehensive - use it to ensure your changes don't break existing functionality.