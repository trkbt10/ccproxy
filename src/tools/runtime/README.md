# Tool Execution Architecture

## Overview

The tool execution system has been redesigned to support non-intrusive interception and asynchronous execution, allowing tools to be executed during streaming without modifying the original data flow.

## Key Components

### 1. Tool Interceptor (`tool-interceptor.ts`)

The core abstraction that enables tool interception without modifying data:

- **Non-blocking execution**: Tools execute asynchronously
- **Event-driven**: Uses listeners to notify when tools complete
- **Stateful tracking**: Prevents duplicate execution
- **Request-scoped**: Each request has its own interceptor instance

### 2. Tool Processor (`tool-processor.ts`)

The synchronous tool processor for batch processing:

- **Type-safe**: Uses type guards for proper type checking
- **Generic**: Works with any message format
- **Immediate execution**: Executes tools and modifies data inline

### 3. Enhanced Response Processor

Shows how to integrate tool interception:

```typescript
// Analyze request for tool calls
const toolCalls = extractToolCalls(request);

// Start intercepting (non-blocking)
for (const toolCall of toolCalls) {
  if (shouldIntercept(toolCall)) {
    toolInterceptor.interceptToolCall(toolCall);
  }
}

// Process request normally (streaming or non-streaming)
const response = await processRequest();
```

## Usage Patterns

### Pattern 1: Streaming with Tool Injection

For streaming responses where tool results need to be injected:

```typescript
class StreamHandler implements ToolExecutionListener {
  async onToolExecuted(result: ToolExecutionResult) {
    // Inject tool result into stream
    await this.injectToolResult(result);
  }
}
```

### Pattern 2: Batch Processing

For non-streaming where all tools execute before response:

```typescript
const processedItems = await toolProcessor.processItems(items);
// Items now include tool results
```

### Pattern 3: Fire-and-Forget

For cases where tool execution is logged but not injected:

```typescript
toolInterceptor.interceptToolCall(event);
// Continue without waiting
```

## Benefits

1. **No Data Mutation**: Original request/response flow unchanged
2. **Streaming Compatible**: Tools execute during streaming
3. **Flexible Integration**: Multiple integration patterns
4. **Performance**: Non-blocking execution
5. **Debugging**: Clear execution tracking

## Migration Guide

### From Old Tool Processor

Before:
```typescript
const processedInput = await toolProcessor.processInputItems(input);
// Input is modified
```

After:
```typescript
// Option 1: Use interceptor (non-blocking)
toolInterceptor.interceptToolCall(event);

// Option 2: Use processor (blocking)
const processed = await toolProcessor.processItems(items);
```

### Integration Points

1. **Response Processor**: Use enhanced processor for automatic interception
2. **Streaming SSE**: Extend with tool support for injection
3. **OpenAI Handler**: Similar pattern for chat completions

## Future Enhancements

1. **Tool Result Caching**: Cache results for repeated calls
2. **Parallel Execution Limits**: Control concurrent executions
3. **Timeout Handling**: Add execution timeouts
4. **Result Streaming**: Stream partial results for long-running tools