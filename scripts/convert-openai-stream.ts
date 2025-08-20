#!/usr/bin/env bun
import { readJsonl } from "../src/utils/jsonl/reader";
import { createJsonlWriter } from "../src/utils/jsonl/writer";
import { buildResponseItemsFromStream } from "../src/adapters/providers/openai-generic/responses-adapter/stream-to-response-builder";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import { resolve } from "path";

async function main() {
  const inputFile = resolve(__dirname, "../__mocks__/openai-mixed-blocks-raw.jsonl");
  const outputFile = resolve(__dirname, "../.tmp/openai-mixed-blocks-converted.jsonl");

  console.log(`Reading from: ${inputFile}`);
  console.log(`Writing to: ${outputFile}`);

  const writer = createJsonlWriter(outputFile);

  try {
    // Create an async generator that yields ResponseStreamEvent objects
    async function* createEventStream(): AsyncGenerator<ResponseStreamEvent> {
      for await (const event of readJsonl<ResponseStreamEvent>(inputFile)) {
        yield event;
      }
    }

    // Convert the stream to ResponseItems
    const responseItems = await buildResponseItemsFromStream(createEventStream());

    // Write each ResponseItem to the output file
    for (const item of responseItems) {
      await writer.write(item);
    }

    console.log(`Converted ${responseItems.length} response items`);
  } catch (error) {
    console.error("Error processing JSONL:", error);
    process.exit(1);
  } finally {
    await writer.close();
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
