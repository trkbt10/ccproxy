/**
 * Parse a value literal from string to its appropriate type
 * 
 * @param text - The string value to parse
 * @returns The parsed value in its appropriate type
 * 
 * @example
 * parseValueLiteral("true") // returns boolean true
 * parseValueLiteral("123") // returns number 123
 * parseValueLiteral('{"key": "value"}') // returns object
 * parseValueLiteral("hello") // returns string "hello"
 */
export function parseValueLiteral(text: string): unknown {
  // Try JSON parse first
  try {
    return JSON.parse(text);
  } catch {}
  
  // Fallback to common literals
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  if (!Number.isNaN(Number(text))) {
    return Number(text);
  }
  
  // Keep as string
  return text;
}