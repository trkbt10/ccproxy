import type { Context } from "hono";
import type { RoutingConfig } from "../../../../../config/types";
import { createGenerateContentHandler } from "./generate-content";
import { createStreamGenerateContentHandler } from "./stream-generate-content";

export const createModelActionHandler = (routingConfig: RoutingConfig) => {
  const generateContentHandler = createGenerateContentHandler(routingConfig);
  const streamGenerateContentHandler = createStreamGenerateContentHandler(routingConfig);

  return async (c: Context) => {
    const path = c.req.path;
    const match = path.match(/\/v1(?:beta)?\/models\/(.+):(\w+)$/);
    
    if (!match) {
      return c.text("Not found", 404);
    }
    
    const [, model, action] = match;
    
    // Set the model in a way that handlers can access it
    c.set("geminiModel", model);
    
    // Route to appropriate handler based on action
    switch (action) {
      case "generateContent":
        return generateContentHandler(c);
      case "streamGenerateContent":
        return streamGenerateContentHandler(c);
      default:
        return c.text(`Unknown action: ${action}`, 404);
    }
  };
};