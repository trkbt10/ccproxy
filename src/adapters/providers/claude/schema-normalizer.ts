/**
 * Schema normalization utilities for OpenAI/Claude tool parameter conversion
 * These functions ensure JSON schemas are compatible with OpenAI's strict requirements
 */

/**
 * Recursively ensures all object properties are listed in the required array
 */
function ensureRequiredRec(schema: any): void {
  if (schema.type === "object" && typeof schema.properties === "object") {
    const props = Object.keys(schema.properties);
    const existing = Array.isArray(schema.required) ? schema.required : [];
    schema.required = Array.from(new Set([...existing, ...props]));
  }

  if (schema.type === "array" && schema.items) {
    ensureRequiredRec(schema.items);
  }

  if (typeof schema.properties === "object") {
    for (const key of Object.keys(schema.properties)) {
      ensureRequiredRec(schema.properties[key]);
    }
  }
}

/**
 * Removes unsupported format specifiers (like "uri") from schemas
 */
function removeUnsupportedFormats(schema: any): void {
  if (schema.format === "uri") {
    delete schema.format;
  }
  if (schema.properties) {
    for (const key of Object.keys(schema.properties)) {
      removeUnsupportedFormats(schema.properties[key]);
    }
  }
  if (schema.items) {
    removeUnsupportedFormats(schema.items);
  }
}

/**
 * Ensures all object schemas have additionalProperties: false
 */
function ensureAdditionalPropertiesFalseRec(schema: any): void {
  if (schema.type === "object") {
    schema.additionalProperties = false;
  }
  if (schema.items) {
    ensureAdditionalPropertiesFalseRec(schema.items);
  }
  if (schema.properties) {
    for (const key of Object.keys(schema.properties)) {
      ensureAdditionalPropertiesFalseRec(schema.properties[key]);
    }
  }
}

/**
 * Normalizes a JSON schema to be compatible with OpenAI's requirements
 * - Ensures all properties are marked as required
 * - Removes unsupported format specifiers
 * - Sets additionalProperties to false for all objects
 */
export function normalizeJSONSchemaForOpenAI(inputSchema: any): any {
  // Deep clone to avoid mutating the original
  const schema = structuredClone(inputSchema);
  
  // Apply all transformations
  ensureRequiredRec(schema);
  removeUnsupportedFormats(schema);
  ensureAdditionalPropertiesFalseRec(schema);
  
  return schema;
}