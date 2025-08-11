function ensureRequiredRec(schema: any) {
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

function removeUnsupportedFormats(schema: any) {
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

function ensureAdditionalPropertiesFalseRec(schema: any) {
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

export function normalizeJSONSchemaForOpenAI(inputSchema: any): any {
  // Deep clone to avoid mutating the original
  const schema = structuredClone(inputSchema);
  
  // Apply all transformations
  ensureRequiredRec(schema);
  removeUnsupportedFormats(schema);
  ensureAdditionalPropertiesFalseRec(schema);
  
  return schema;
}