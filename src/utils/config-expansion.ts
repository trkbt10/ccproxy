/**
 * Expands environment variables in configuration values
 * Supports:
 * - ${ENV_VAR} - Simple environment variable expansion
 * - ${ENV_VAR:-default} - With default value if not set
 * - ${ENV_VAR:?error message} - Throws error if not set
 */
export function expandValue(value: string): string {
  // Pattern to match ${VAR}, ${VAR:-default}, ${VAR:?error}
  const pattern = /\$\{([^}]+)\}/g;
  
  return value.replace(pattern, (match, expr) => {
    // Check for :- (default value) syntax
    const defaultMatch = expr.match(/^([^:]+):-(.*)$/);
    if (defaultMatch) {
      const [, varName, defaultValue] = defaultMatch;
      return process.env[varName.trim()] || defaultValue;
    }
    
    // Check for :? (error if not set) syntax
    const errorMatch = expr.match(/^([^:]+):\?(.*)$/);
    if (errorMatch) {
      const [, varName, errorMessage] = errorMatch;
      const value = process.env[varName.trim()];
      if (!value) {
        throw new Error(errorMessage || `Environment variable ${varName} is not set`);
      }
      return value;
    }
    
    // Simple variable expansion
    return process.env[expr.trim()] || match;
  });
}

/**
 * Recursively expands all string values in an object
 */
export function expandConfig<T>(config: T): T {
  if (typeof config === 'string') {
    return expandValue(config) as T;
  }
  
  if (Array.isArray(config)) {
    return config.map(item => expandConfig(item)) as T;
  }
  
  if (config && typeof config === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = expandConfig(value);
    }
    return result as T;
  }
  
  return config;
}