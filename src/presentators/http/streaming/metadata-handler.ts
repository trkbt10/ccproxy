type MetadataResult = {
  isMetadata: boolean;
  metadata?: Record<string, unknown>;
};

export function getMetadataHandler(requestId: string) {
  return {
    isMetadata(text: string): boolean {
      return text.startsWith("{") && text.includes("\"_meta\"");
    },
    processMetadata(text: string, itemId?: string): MetadataResult {
      try {
        const obj = JSON.parse(text) as Record<string, unknown>;
        return { isMetadata: true, metadata: obj };
      } catch {
        console.warn(`[${requestId}] Failed to parse metadata JSON for item ${itemId}`);
        return { isMetadata: false };
      }
    },
  };
}

