# Comprehensive Example

This markdown file contains various elements.

## Headers

Headers should be treated as regular text.

### Code Examples

```python
import numpy as np
from sklearn.model_selection import KFold

# Cross-validation implementation
def cross_validate(X, y):
    kf = KFold(n_splits=5)
    scores = []
    
    for train_idx, val_idx in kf.split(X):
        # Training code here
        pass
    
    return scores
```

## Lists and Quotes

- First item
- Second item
  - Nested item
  
> This is a blockquote
> It can span multiple lines

## Links and Formatting

Check out [OpenAI](https://openai.com) for more information.
You can also use **bold** and *italic* text.

## Multiple Consecutive Newlines



Like this section with extra spacing.




And even more spacing here.

## Inline Code

Use `print()` function in Python or `console.log()` in JavaScript.

## Complex Nested Structure

```markdown
# This is a markdown code block
It can contain other code blocks:
```python
print("Nested!")
```
```

Final paragraph.