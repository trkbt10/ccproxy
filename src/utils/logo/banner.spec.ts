import { describe, it, expect, beforeEach } from "bun:test";
import { getBanner } from "./banner";

describe("getBanner", () => {
  beforeEach(() => {
    // Force a wide terminal to avoid width fallback
    Object.defineProperty(process.stdout, 'columns', {
      value: 200,
      writable: true,
      configurable: true
    });
  });

  it("should render ASCII art for uppercase letters", () => {
    const result = getBanner("ABC");
    console.log("ABC banner:\n", result);
    
    // Should contain ASCII art characters (█)
    expect(result).toContain("█");
    // Should have 3 lines
    expect(result.split("\n").length).toBe(3);
  });

  it("should render ASCII art for 'CCPROXY'", () => {
    const result = getBanner("CCPROXY");
    console.log("CCPROXY banner:\n", result);
    
    // Should contain ASCII art characters (█)
    expect(result).toContain("█");
    // Should have 3 lines
    expect(result.split("\n").length).toBe(3);
  });

  it("should apply color when specified", () => {
    const result = getBanner("TEST", { color: "cyan" });
    console.log("Colored TEST banner:\n", result);
    
    // Should contain ANSI color codes
    expect(result).toContain("\x1b[36m"); // cyan color code
    expect(result).toContain("\x1b[0m");  // reset code
  });

  it("should handle unsupported characters by using spaces", () => {
    const result = getBanner("A+B");
    console.log("A+B banner (with unsupported '+'):\n", result);
    
    // Should still render A and B, with space for unsupported '+'
    expect(result).toContain("█");
    // Should have 3 lines
    expect(result.split("\n").length).toBe(3);
  });

  it("should handle lowercase letters", () => {
    const result = getBanner("hello");
    console.log("hello banner:\n", result);
    
    // Should contain ASCII art characters (█)
    expect(result).toContain("█");
    // Should have 3 lines
    expect(result.split("\n").length).toBe(3);
  });

  it("should handle mixed case", () => {
    const result = getBanner("HeLLo");
    console.log("HeLLo banner:\n", result);
    
    // Should contain ASCII art characters (█)
    expect(result).toContain("█");
    // Should have 3 lines
    expect(result.split("\n").length).toBe(3);
  });

  it("should handle narrow terminals by falling back to plain text", () => {
    // Set a very narrow terminal
    Object.defineProperty(process.stdout, 'columns', {
      value: 10,
      writable: true,
      configurable: true
    });

    const result = getBanner("VERYLONGTEXT");
    console.log("Narrow terminal fallback:\n", result);
    
    // Should fall back to plain text
    expect(result).not.toContain("█");
    expect(result).toContain("VERYLONGTEXT");
  });

  it("should handle spacing option", () => {
    const result = getBanner("AB", { spacing: 3 });
    console.log("AB with spacing=3:\n", result);
    
    // Should contain ASCII art characters (█)
    expect(result).toContain("█");
    // Should have extra spaces between characters
    const lines = result.split("\n");
    expect(lines[0]).toContain("   "); // 3 spaces between chars
  });
});