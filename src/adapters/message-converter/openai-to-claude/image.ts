import type {
  ImageBlockParam as ClaudeImageBlock,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  ResponseInputImage as OpenAIResponseInputImage,
} from "openai/resources/responses/responses";

/**
 * Convert OpenAI image format to Claude image format
 */
export function convertOpenAIImageToClaude(
  image: OpenAIResponseInputImage
): ClaudeImageBlock | null {
  if (!image.image_url) {
    console.warn("[WARN] OpenAI image block has no image_url");
    return null;
  }

  // Handle base64 image
  if (typeof image.image_url === "string") {
    // Check if it's a base64 string
    if (image.image_url.startsWith("data:image/")) {
      const matches = image.image_url.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const mediaType = `image/${matches[1]}`;
        const data = matches[2];
        
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: data,
          },
        };
      }
    }
    
    // Assume it's a URL
    return {
      type: "image",
      source: {
        type: "url",
        url: image.image_url,
      },
    };
  }

  console.warn("[WARN] Unknown OpenAI image format:", image);
  return null;
}