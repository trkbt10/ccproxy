# Unicode and Special Characters Test

Text with emojis 🎉 and special chars ™®©.

## Code with Unicode

```python
print("Hello, 世界! 🌍")
print("Special chars: \n\r\t")
print("Unicode: café, naïve, résumé")
```

## Line endings test

Unix line ending (LF): Line 1
Line 2

Windows line ending (CRLF): Line 1
Line 2

Mixed line endings in code:
```javascript
// This has mixed line endings
const unix = "line1\nline2";
const windows = "line1\r\nline2";
const mixed = "line1\nline2\r\nline3";
```

## Zero-width characters

Here's text with​zero-width​spaces.

## RTL text

Hebrew: שלום עולם
Arabic: مرحبا بالعالم

## Special markdown chars

\*Not italic\*
\**Not bold\**
\`Not code\`

## Nested quotes

> Level 1
>> Level 2
>>> Level 3
>>>> Level 4

## Complex nesting

> Quote with code:
> ```python
> def quoted_code():
>     print("I'm in a quote!")
> ```
> End quote.