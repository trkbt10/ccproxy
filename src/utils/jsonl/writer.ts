import { createWriteStream } from "fs";
import type { Writable } from "stream";

/**
 * Creates a JSONL writer that appends JSON objects as lines to a file
 * @param filePath Path to the output JSONL file
 * @returns Object with write and close methods
 */
export function createJsonlWriter(filePath: string) {
  const stream = createWriteStream(filePath, { flags: "a" }); // Append mode
  
  return {
    /**
     * Writes a single object as a JSON line
     * @param obj Object to write
     */
    async write(obj: unknown): Promise<void> {
      return new Promise((resolve, reject) => {
        const line = JSON.stringify(obj) + "\n";
        stream.write(line, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
    
    /**
     * Closes the write stream
     */
    async close(): Promise<void> {
      return new Promise((resolve, reject) => {
        stream.end((error: Error | null | undefined) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  };
}

/**
 * Writes an array of objects to a JSONL file
 * @param filePath Path to the output JSONL file
 * @param items Array of objects to write
 */
export async function writeJsonlFromArray(filePath: string, items: unknown[]): Promise<void> {
  const writer = createJsonlWriter(filePath);
  
  try {
    for (const item of items) {
      await writer.write(item);
    }
  } finally {
    await writer.close();
  }
}

/**
 * Creates a JSONL writer for a writable stream
 * @param stream Writable stream
 * @returns Object with write method
 */
export function createJsonlStreamWriter(stream: Writable) {
  return {
    /**
     * Writes a single object as a JSON line
     * @param obj Object to write
     */
    async write(obj: unknown): Promise<void> {
      return new Promise((resolve, reject) => {
        const line = JSON.stringify(obj) + "\n";
        stream.write(line, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  };
}