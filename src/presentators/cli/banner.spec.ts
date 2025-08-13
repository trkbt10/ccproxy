import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { printBanner, printProviderInfoLine } from "./banner";
import { detectModelGrade } from "../../config/model/model-grade-detector";
import type { RoutingConfig } from "../../config/types";

// Only mock the external dependency (loadRoutingConfigOnce) and console.log
import * as routingConfig from "../../execution/routing-config";

describe("banner", () => {
  let consoleLogSpy: any;
  let loadRoutingConfigOnceSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    loadRoutingConfigOnceSpy = spyOn(routingConfig, "loadRoutingConfigOnce");
    // Clear all mocks before each test
    consoleLogSpy.mockClear();
    loadRoutingConfigOnceSpy.mockClear();
  });

  describe("printBanner", () => {
    it("should print banner with default text and color", () => {
      printBanner();
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain("█"); // Banner should contain ASCII art
    });

    it("should print banner with custom text", () => {
      printBanner("OPENAI", "green");
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain("█"); // Banner should contain ASCII art
    });
  });

  describe("printProviderInfoLine", () => {
    it("should print provider info with high-grade model", async () => {
      const mockConfig: RoutingConfig = {
        providers: {
          default: {
            type: "openai",
            model: "gpt-4-turbo"
          }
        },
        defaults: {
          providerId: "default"
        },
        tools: []
      };
      
      loadRoutingConfigOnceSpy.mockResolvedValue(mockConfig);
      
      await printProviderInfoLine();
      
      // Should be called 3 times: 2 for Braille lines + 1 for info line + 1 for spacing
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
      
      // Find the info line (contains "+")
      const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]).filter(Boolean);
      const output = outputs.find((o: string) => o.includes("+ OPENAI")) || "";
      
      // Check color codes
      expect(output).toContain("\x1b[32m"); // Green for OpenAI
      expect(output).toContain("\x1b[0m"); // Reset color
      
      // Check content
      expect(output).toContain("+ OPENAI");
      expect(output).toContain("[DEFAULT]");
      
      // Should contain one of the high-grade messages
      const highGradeMessages = [
        "Maximum capability mode engaged",
        "Ultra-performance neural engine active",
        "Running at peak computational capacity",
        "Advanced reasoning circuits online",
        "Hyperdimensional processing enabled",
        "Quantum-enhanced cognition active",
        "Premium neural pathways initialized",
        "Operating at maximum intelligence"
      ];
      
      const hasHighGradeMessage = highGradeMessages.some(msg => output.includes(msg));
      expect(hasHighGradeMessage).toBe(true);
      
      // Verify actual grade detection
      const grade = detectModelGrade("gpt-4-turbo");
      expect(grade).toBe("high");
    });

    it("should print provider info with mid-grade model", async () => {
      const mockConfig: RoutingConfig = {
        providers: {
          claude: {
            type: "claude",
            model: "claude-3-sonnet-20240229"
          }
        },
        defaults: {
          providerId: "claude"
        },
        tools: []
      };
      
      loadRoutingConfigOnceSpy.mockResolvedValue(mockConfig);
      
      await printProviderInfoLine();
      
      // Should be called 3 times: 2 for Braille lines + 1 for info line + 1 for spacing
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
      
      // Find the info line (contains "+")
      const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]).filter(Boolean);
      const output = outputs.find((o: string) => o.includes("+ CLAUDE")) || "";
      
      // Check color codes
      expect(output).toContain("\x1b[36m"); // Cyan for Claude
      
      // Check content
      expect(output).toContain("+ CLAUDE (claude):");
      expect(output).toContain("[DEFAULT]");
      
      // Should contain one of the mid-grade messages
      const midGradeMessages = [
        "Balanced performance mode active",
        "Standard processing engaged",
        "Efficient reasoning systems online",
        "Optimal resource allocation active",
        "Core intelligence modules ready",
        "Stable cognitive systems initialized",
        "Production-ready neural state",
        "Reliable processing pathways online"
      ];
      
      const hasMidGradeMessage = midGradeMessages.some(msg => output.includes(msg));
      expect(hasMidGradeMessage).toBe(true);
      
      // Verify actual grade detection
      const grade = detectModelGrade("claude-3-sonnet-20240229");
      expect(grade).toBe("mid");
    });

    it("should print provider info with low-grade model", async () => {
      const mockConfig: RoutingConfig = {
        providers: {
          mini: {
            type: "openai",
            model: "gpt-3.5-turbo"
          }
        },
        defaults: {
          providerId: "mini"
        },
        tools: []
      };
      
      loadRoutingConfigOnceSpy.mockResolvedValue(mockConfig);
      
      await printProviderInfoLine();
      
      // Should be called 3 times: 2 for Braille lines + 1 for info line + 1 for spacing
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
      
      // Find the info line (contains "+")
      const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]).filter(Boolean);
      const output = outputs.find((o: string) => o.includes("+ OPENAI")) || "";
      
      // Should contain one of the low-grade messages
      const lowGradeMessages = [
        "Efficient lightweight mode active",
        "Quick response systems engaged",
        "Streamlined processing online",
        "Resource-optimized state ready",
        "Fast neural pathways initialized",
        "Compact intelligence core active",
        "Speed-optimized circuits engaged",
        "Rapid inference mode online"
      ];
      
      const hasLowGradeMessage = lowGradeMessages.some(msg => output.includes(msg));
      expect(hasLowGradeMessage).toBe(true);
      
      // Verify actual grade detection
      const grade = detectModelGrade("gpt-3.5-turbo");
      expect(grade).toBe("low");
    });

    it("should handle multiple providers with correct colors", async () => {
      const mockConfig: RoutingConfig = {
        providers: {
          openai: {
            type: "openai",
            model: "gpt-4"
          },
          claude: {
            type: "claude", 
            model: "claude-3-opus-20240229"
          },
          gemini: {
            type: "gemini",
            model: "gemini-1.5-pro"
          }
        },
        defaults: {
          providerId: "claude"
        },
        tools: []
      };
      
      loadRoutingConfigOnceSpy.mockResolvedValue(mockConfig);
      
      await printProviderInfoLine();
      
      // Each provider gets multiple lines (Braille + info + spacing)
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThanOrEqual(9); // 3 providers × 3+ lines each
      
      const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]).filter(Boolean);
      
      // Check each provider has correct color
      const openaiOutput = outputs.find((o: string) => o.includes("OPENAI"));
      expect(openaiOutput).toContain("\x1b[32m"); // Green
      
      const claudeOutput = outputs.find((o: string) => o.includes("CLAUDE"));
      expect(claudeOutput).toContain("\x1b[36m"); // Cyan
      expect(claudeOutput).toContain("[DEFAULT]");
      
      const geminiOutput = outputs.find((o: string) => o.includes("GEMINI"));
      expect(geminiOutput).toContain("\x1b[34m"); // Blue
    });

    it("should skip providers without type", async () => {
      const mockConfig: RoutingConfig = {
        providers: {
          invalid: {} as any, // Provider without type
          valid: {
            type: "openai",
            model: "gpt-4"
          }
        },
        tools: []
      };
      
      loadRoutingConfigOnceSpy.mockResolvedValue(mockConfig);
      
      await printProviderInfoLine();
      
      // Should only log the valid provider (multiple lines)
      const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]).filter(Boolean);
      const output = outputs.find((o: string) => o.includes("+ OPENAI")) || "";
      expect(output).toContain("OPENAI");
    });

    it("should skip providers without model when no default model", async () => {
      const mockConfig: RoutingConfig = {
        providers: {
          nomodel: {
            type: "openai"
            // No model specified
          },
          withmodel: {
            type: "claude",
            model: "claude-3-sonnet-20240229"
          }
        },
        tools: []
      };
      
      loadRoutingConfigOnceSpy.mockResolvedValue(mockConfig);
      
      await printProviderInfoLine();
      
      // Should only log the provider with model (multiple lines)
      const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]).filter(Boolean);
      const output = outputs.find((o: string) => o.includes("+ CLAUDE")) || "";
      expect(output).toContain("CLAUDE");
    });

    it("should use default model when provider has no model", async () => {
      const mockConfig: RoutingConfig = {
        providers: {
          default: {
            type: "openai"
            // No model specified in provider
          }
        },
        defaults: {
          model: "gpt-4o-mini" // Default model specified
        },
        tools: []
      };
      
      loadRoutingConfigOnceSpy.mockResolvedValue(mockConfig);
      
      await printProviderInfoLine();
      
      // Should be called 3 times: 2 for Braille lines + 1 for info line + 1 for spacing
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
      
      // Find the info line (contains "+")
      const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]).filter(Boolean);
      const output = outputs.find((o: string) => o.includes("+ OPENAI")) || "";
      expect(output).toContain("OPENAI");
      
      // Should use low-grade messages for gpt-4o-mini
      const lowGradeMessages = [
        "Efficient lightweight mode active",
        "Quick response systems engaged",
        "Streamlined processing online",
        "Resource-optimized state ready",
        "Fast neural pathways initialized",
        "Compact intelligence core active",
        "Speed-optimized circuits engaged",
        "Rapid inference mode online"
      ];
      
      const hasLowGradeMessage = lowGradeMessages.some(msg => output.includes(msg));
      expect(hasLowGradeMessage).toBe(true);
    });

    it("should show provider ID for non-default providers", async () => {
      const mockConfig: RoutingConfig = {
        providers: {
          primary: {
            type: "openai",
            model: "gpt-4"
          },
          secondary: {
            type: "openai",
            model: "gpt-3.5-turbo"
          }
        },
        defaults: {
          providerId: "primary"
        },
        tools: []
      };
      
      loadRoutingConfigOnceSpy.mockResolvedValue(mockConfig);
      
      await printProviderInfoLine();
      
      // Two providers, each with multiple lines
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThanOrEqual(6);
      const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]).filter(Boolean);
      
      // Primary should show "OPENAI (primary)" because providerId is not "default"
      const primaryOutput = outputs.find((o: string) => o.includes("[DEFAULT]"));
      expect(primaryOutput).toContain("+ OPENAI (primary):");
      
      // Secondary should show "OPENAI (secondary)"
      const secondaryOutput = outputs.find((o: string) => o.includes("+ OPENAI (secondary)"));
      expect(secondaryOutput).toContain("+ OPENAI (secondary):");
    });

    it("should use correct color for unknown provider types", async () => {
      const mockConfig: RoutingConfig = {
        providers: {
          custom: {
            type: "custom-llm",
            model: "custom-model-v1"
          }
        },
        tools: []
      };
      
      loadRoutingConfigOnceSpy.mockResolvedValue(mockConfig);
      
      await printProviderInfoLine();
      
      // Should log multiple lines for the provider
      const outputs = consoleLogSpy.mock.calls.map((call: any) => call[0]).filter(Boolean);
      const output = outputs.find((o: string) => o.includes("+ CUSTOM-LLM")) || "";
      
      // Should use white color for unknown provider types
      expect(output).toContain("\x1b[37m"); // White
      expect(output).toContain("+ CUSTOM-LLM (custom):");
    });
  });
});