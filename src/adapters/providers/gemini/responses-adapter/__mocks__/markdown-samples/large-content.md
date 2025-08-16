# Large Content Test

This file tests handling of large content with many paragraphs and code blocks.

## Section 1

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

```python
# Large code block with many lines
def process_large_dataset(data):
    """
    This function processes a large dataset.
    It includes multiple operations and comments.
    """
    result = []
    
    for item in data:
        # Process each item
        if item > 0:
            result.append(item * 2)
        else:
            result.append(0)
    
    # Add some complex logic
    for i in range(len(result)):
        if i % 2 == 0:
            result[i] = result[i] ** 2
        else:
            result[i] = result[i] // 2
    
    # More processing
    final_result = []
    for r in result:
        if r > 100:
            final_result.append(r)
    
    return final_result

# Test the function
test_data = list(range(-50, 50))
output = process_large_dataset(test_data)
print(f"Processed {len(test_data)} items, got {len(output)} results")
```

## Section 2

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

```javascript
// Another large code block
class DataProcessor {
    constructor(options = {}) {
        this.options = {
            batchSize: 100,
            timeout: 5000,
            retries: 3,
            ...options
        };
        this.processed = 0;
        this.errors = [];
    }
    
    async processBatch(items) {
        const results = [];
        
        for (const item of items) {
            try {
                const result = await this.processItem(item);
                results.push(result);
                this.processed++;
            } catch (error) {
                this.errors.push({ item, error });
            }
        }
        
        return results;
    }
    
    async processItem(item) {
        // Simulate async processing
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        
        if (Math.random() < 0.1) {
            throw new Error('Random processing error');
        }
        
        return {
            id: item.id,
            processed: true,
            timestamp: Date.now(),
            value: item.value * 2
        };
    }
    
    getStats() {
        return {
            processed: this.processed,
            errors: this.errors.length,
            errorRate: this.errors.length / (this.processed + this.errors.length)
        };
    }
}

// Usage example
const processor = new DataProcessor({ batchSize: 50 });
const data = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random() * 100 }));

(async () => {
    for (let i = 0; i < data.length; i += processor.options.batchSize) {
        const batch = data.slice(i, i + processor.options.batchSize);
        await processor.processBatch(batch);
        console.log(`Processed batch ${i / processor.options.batchSize + 1}`);
    }
    
    console.log('Final stats:', processor.getStats());
})();
```

## Section 3 - Many small paragraphs

Paragraph 1 with some text.

Paragraph 2 with more content.

Paragraph 3 continues the story.

Paragraph 4 adds additional details.

Paragraph 5 provides context.

Paragraph 6 elaborates further.

Paragraph 7 introduces new concepts.

Paragraph 8 summarizes key points.

Paragraph 9 offers conclusions.

Paragraph 10 ends this section.

## Section 4 - Mixed content

Here's a list:
- Item 1
- Item 2
  - Subitem 2.1
  - Subitem 2.2
- Item 3

A table:
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |

Math: $E = mc^2$

Inline code mixed with text: The `process()` function takes a `data` parameter and returns a `result` object.

## Final section

This demonstrates handling of large files with diverse content types.