import { describe, it, expect } from "vitest";
import { convertToolsToHarmonyFormat, getBuiltinToolTypes } from "./convert-tools";
import type { Tool, FunctionTool, WebSearchTool } from "../types";

describe("convertToolsToHarmonyFormat", () => {
  it("should return empty string for no tools", () => {
    expect(convertToolsToHarmonyFormat([])).toBe("");
    expect(convertToolsToHarmonyFormat(null as any)).toBe("");
  });

  it("should convert function tool without parameters", () => {
    const tools: Tool[] = [
      {
        type: 'function',
        name: "get_location",
        description: "Gets the location of the user.",
        parameters: null,
        strict: null
      } as FunctionTool,
    ];

    const result = convertToolsToHarmonyFormat(tools);
    expect(result).toContain("namespace functions {");
    expect(result).toContain("// Gets the location of the user.");
    expect(result).toContain("type get_location = () => any;");
    expect(result).toContain("} // namespace functions");
  });

  it("should convert function tool with parameters", () => {
    const tools: Tool[] = [
      {
        type: 'function',
        name: "get_weather",
        description: "Gets the current weather",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state",
            },
            format: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              default: "celsius",
            },
          },
          required: ["location"],
        },
        strict: null
      } as FunctionTool,
    ];

    const result = convertToolsToHarmonyFormat(tools);
    expect(result).toContain("// Gets the current weather");
    expect(result).toContain("type get_weather = (_: {");
    expect(result).toContain("// The city and state");
    expect(result).toContain("location: string,");
    expect(result).toContain('format?: "celsius" | "fahrenheit", // default: celsius');
  });

  it("should handle multiple function tools", () => {
    const tools: Tool[] = [
      {
        type: 'function',
        name: "func1",
        description: "First function",
        parameters: null,
        strict: null
      } as FunctionTool,
      {
        type: 'function',
        name: "func2",
        description: "Second function",
        parameters: { type: "object", properties: { value: { type: "number" } } },
        strict: null
      } as FunctionTool,
    ];

    const result = convertToolsToHarmonyFormat(tools);
    expect(result).toContain("// First function");
    expect(result).toContain("type func1 = () => any;");
    expect(result).toContain("// Second function");
    expect(result).toContain("type func2 = (_: {");
  });

  it("should handle function without description", () => {
    const tools: Tool[] = [
      {
        type: 'function',
        name: "test_func",
        parameters: null,
        strict: null,
        description: null
      } as FunctionTool,
    ];

    const result = convertToolsToHarmonyFormat(tools);
    expect(result).toContain("// No description provided");
  });

  it("should ignore built-in tools in main output", () => {
    const tools: Tool[] = [
      { type: "web_search_preview_2025_03_11" } as WebSearchTool,
      { type: "code_interpreter" } as Tool.CodeInterpreter,
      {
        type: 'function',
        name: "custom_func",
        description: "Custom function",
        parameters: null,
        strict: null
      } as FunctionTool,
    ];

    const result = convertToolsToHarmonyFormat(tools);
    expect(result).not.toContain("web_search");
    expect(result).not.toContain("code_interpreter");
    expect(result).toContain("custom_func");
  });
});

describe("getBuiltinToolTypes", () => {
  it("should return empty array for no builtin tools", () => {
    const tools: Tool[] = [
      {
        type: 'function',
        name: "custom",
        parameters: null,
        strict: null,
        description: null
      } as FunctionTool,
    ];

    expect(getBuiltinToolTypes(tools)).toEqual([]);
  });

  it("should detect browser tool for web_search", () => {
    const tools: Tool[] = [{ type: "web_search_preview_2025_03_11" } as WebSearchTool];

    expect(getBuiltinToolTypes(tools)).toEqual(["browser"]);
  });

  it("should detect python tool for code_interpreter", () => {
    const tools: Tool[] = [{ type: "code_interpreter" } as Tool.CodeInterpreter];

    expect(getBuiltinToolTypes(tools)).toEqual(["python"]);
  });

  it("should detect both browser and python", () => {
    const tools: Tool[] = [
      { type: "web_search_preview_2025_03_11" } as WebSearchTool,
      { type: "code_interpreter" } as Tool.CodeInterpreter,
      {
        type: 'function',
        name: "custom",
        parameters: null,
        strict: null,
        description: null
      } as FunctionTool,
    ];

    expect(getBuiltinToolTypes(tools)).toEqual(["browser", "python"]);
  });
});
