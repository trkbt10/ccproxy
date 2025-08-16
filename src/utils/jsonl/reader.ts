import { createReadStream } from "fs";
import { createInterface } from "readline";
import type { Readable } from "stream";

/**
 * Reads a JSONL file line by line and yields parsed JSON objects
 * @param filePath Path to the JSONL file
 * @yields Parsed JSON objects from each line
 */
export async function* readJsonl<T = unknown>(filePath: string): AsyncGenerator<T> {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity, // Handle Windows line endings
  });

  for await (const line of rl) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      try {
        yield JSON.parse(trimmedLine) as T;
      } catch (error) {
        console.error(`Failed to parse JSONL line: ${trimmedLine}`, error);
        throw new Error(`Invalid JSON in JSONL file at line: ${trimmedLine}`);
      }
    }
  }
}

/**
 * Reads JSONL from a readable stream
 * @param stream Readable stream containing JSONL data
 * @yields Parsed JSON objects from each line
 */
export async function* readJsonlFromStream<T = unknown>(
  stream: Readable
): AsyncGenerator<T> {
  const rl = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      try {
        yield JSON.parse(trimmedLine) as T;
      } catch (error) {
        console.error(`Failed to parse JSONL line: ${trimmedLine}`, error);
        throw new Error(`Invalid JSON in JSONL stream at line: ${trimmedLine}`);
      }
    }
  }
}

/**
 * Collects all items from a JSONL file into an array
 * @param filePath Path to the JSONL file
 * @returns Array of parsed JSON objects
 */
export async function readJsonlToArray<T = unknown>(filePath: string): Promise<T[]> {
  const items: T[] = [];
  
  for await (const item of readJsonl<T>(filePath)) {
    items.push(item);
  }
  
  return items;
}