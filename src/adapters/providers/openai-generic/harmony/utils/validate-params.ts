/**
 * Validate Response API parameters
 */

import type { ResponseCreateParamsBase } from '../types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function validateParams(params: ResponseCreateParamsBase): void {
  if (!params) {
    throw new ValidationError('Response parameters are required');
  }

  // Validate model if provided
  if (params.model && typeof params.model !== 'string') {
    throw new ValidationError('Model must be a string');
  }

  // Validate input
  if (params.input !== undefined) {
    if (typeof params.input !== 'string' && !Array.isArray(params.input)) {
      throw new ValidationError('Input must be a string or array');
    }
  }

  // Validate instructions
  if (params.instructions !== undefined && params.instructions !== null) {
    if (typeof params.instructions !== 'string') {
      throw new ValidationError('Instructions must be a string');
    }
  }

  // Validate tools
  if (params.tools !== undefined) {
    if (!Array.isArray(params.tools)) {
      throw new ValidationError('Tools must be an array');
    }
    
    // Basic validation of tool structure
    for (const tool of params.tools) {
      if (!tool || typeof tool !== 'object') {
        throw new ValidationError('Each tool must be an object');
      }
      
      // Check for function tools
      if ('function' in tool && tool.function) {
        if (!isObject(tool.function)) {
          throw new ValidationError('Function tool must have a valid function object');
        }
        if (!('name' in tool.function) || typeof tool.function.name !== 'string') {
          throw new ValidationError('Function tool must have a name');
        }
      }
    }
  }

  // Validate temperature
  if (params.temperature !== undefined && params.temperature !== null) {
    if (typeof params.temperature !== 'number' || params.temperature < 0 || params.temperature > 2) {
      throw new ValidationError('Temperature must be a number between 0 and 2');
    }
  }

  // Validate top_p
  if (params.top_p !== undefined && params.top_p !== null) {
    if (typeof params.top_p !== 'number' || params.top_p < 0 || params.top_p > 1) {
      throw new ValidationError('top_p must be a number between 0 and 1');
    }
  }

  // Validate max_output_tokens
  if (params.max_output_tokens !== undefined && params.max_output_tokens !== null) {
    if (typeof params.max_output_tokens !== 'number' || params.max_output_tokens <= 0) {
      throw new ValidationError('max_output_tokens must be a positive number');
    }
  }

  // Validate reasoning
  if (params.reasoning !== undefined && params.reasoning !== null) {
    if (typeof params.reasoning !== 'object') {
      throw new ValidationError('Reasoning must be an object');
    }
  }
}