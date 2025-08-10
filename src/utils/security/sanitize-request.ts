import { maskApiKey } from "./mask-sensitive";

const SENSITIVE_KEYS = [
  "apiKey",
  "api_key",
  "apikey",
  "API_KEY",
  "authorization",
  "Authorization",
  "x-api-key",
  "X-API-KEY",
  "secret",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "bearer",
  "Bearer"
];

export function sanitizeObject(obj: any, depth = 0, maxDepth = 10): any {
  if (depth > maxDepth) return "[Max depth reached]";
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj !== "object") return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1, maxDepth));
  }
  
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive.toLowerCase()))) {
      if (typeof value === "string") {
        sanitized[key] = maskApiKey(value);
      } else {
        sanitized[key] = "[REDACTED]";
      }
    } else if (key === "headers" || key === "Headers") {
      sanitized[key] = sanitizeHeaders(value);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value, depth + 1, maxDepth);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

function sanitizeHeaders(headers: any): any {
  if (!headers) return headers;
  
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    
    if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive.toLowerCase()))) {
      sanitized[key] = typeof value === "string" ? maskApiKey(value) : "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export function sanitizeRequestForLogging(request: any): any {
  return sanitizeObject(request);
}