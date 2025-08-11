import type {
  ImageBlockParam as ClaudeContentBlockImage,
  Base64ImageSource,
  URLImageSource,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ResponseInputImage,
} from "openai/resources/responses/responses";

function isBase64ImageSource(
  source: Base64ImageSource | URLImageSource
): source is Base64ImageSource {
  return source.type === "base64";
}

function isURLImageSource(
  source: Base64ImageSource | URLImageSource
): source is URLImageSource {
  return source.type === "url";
}

export function convertClaudeImageToOpenAI(
  block: ClaudeContentBlockImage
): ResponseInputImage {
  const src = block.source;

  if (isBase64ImageSource(src)) {
    return {
      type: "input_image" as const,
      image_url: `data:${src.media_type};base64,${src.data}`,
      detail: "auto",
    };
  }

  if (isURLImageSource(src)) {
    return {
      type: "input_image" as const,
      image_url: src.url,
      detail: "auto",
    };
  }

  throw new Error("Unsupported image source");
}