import {
  toOpenAICallIdFromClaude,
  toClaudeToolUseIdFromOpenAI,
  isSameIgnoringPrefix,
  ensureOpenAICallId,
  generateOpenAICallId,
} from "./id-conversion";

describe("ID Conversion", () => {
  describe("toOpenAICallIdFromClaude", () => {
    it("should convert Claude tool_use_id to OpenAI call_id format", () => {
      expect(toOpenAICallIdFromClaude("toolu_01ABC123")).toBe("call_01ABC123");
      expect(toOpenAICallIdFromClaude("toolu_xyz789")).toBe("call_xyz789");
    });

    it("should handle IDs without underscore", () => {
      expect(toOpenAICallIdFromClaude("abc123")).toBe("call_abc123");
      expect(toOpenAICallIdFromClaude("simple")).toBe("call_simple");
    });

    it("should handle empty string", () => {
      expect(toOpenAICallIdFromClaude("")).toBe("call_");
    });

    it("should handle IDs with multiple underscores", () => {
      expect(toOpenAICallIdFromClaude("toolu_01_ABC_123")).toBe("call_01_ABC_123");
      expect(toOpenAICallIdFromClaude("prefix_middle_suffix")).toBe("call_middle_suffix");
    });
  });

  describe("toClaudeToolUseIdFromOpenAI", () => {
    it("should convert OpenAI call_id to Claude tool_use_id format", () => {
      expect(toClaudeToolUseIdFromOpenAI("call_01ABC123")).toBe("toolu_01ABC123");
      expect(toClaudeToolUseIdFromOpenAI("call_xyz789")).toBe("toolu_xyz789");
    });

    it("should handle IDs without underscore", () => {
      expect(toClaudeToolUseIdFromOpenAI("abc123")).toBe("toolu_abc123");
      expect(toClaudeToolUseIdFromOpenAI("simple")).toBe("toolu_simple");
    });

    it("should handle empty string", () => {
      expect(toClaudeToolUseIdFromOpenAI("")).toBe("toolu_");
    });

    it("should handle IDs with multiple underscores", () => {
      expect(toClaudeToolUseIdFromOpenAI("call_01_ABC_123")).toBe("toolu_01_ABC_123");
      expect(toClaudeToolUseIdFromOpenAI("prefix_middle_suffix")).toBe("toolu_middle_suffix");
    });
  });

  describe("isSameIgnoringPrefix", () => {
    it("should return true for IDs with same suffix but different prefixes", () => {
      expect(isSameIgnoringPrefix("call_01ABC123", "toolu_01ABC123")).toBe(true);
      expect(isSameIgnoringPrefix("toolu_xyz789", "call_xyz789")).toBe(true);
      expect(isSameIgnoringPrefix("fc_123", "ws_123")).toBe(true);
    });

    it("should return true for identical IDs", () => {
      expect(isSameIgnoringPrefix("call_01ABC123", "call_01ABC123")).toBe(true);
      expect(isSameIgnoringPrefix("toolu_xyz789", "toolu_xyz789")).toBe(true);
    });

    it("should return false for different suffixes", () => {
      expect(isSameIgnoringPrefix("call_01ABC123", "call_01ABC124")).toBe(false);
      expect(isSameIgnoringPrefix("toolu_xyz789", "toolu_xyz788")).toBe(false);
    });

    it("should handle IDs without underscore", () => {
      expect(isSameIgnoringPrefix("abc123", "abc123")).toBe(true);
      expect(isSameIgnoringPrefix("abc123", "abc124")).toBe(false);
    });

    it("should handle empty strings", () => {
      expect(isSameIgnoringPrefix("", "")).toBe(true);
      expect(isSameIgnoringPrefix("call_", "toolu_")).toBe(true);
    });
  });

  describe("ensureOpenAICallId", () => {
    it("should keep existing call_ prefix", () => {
      expect(ensureOpenAICallId("call_01ABC123")).toBe("call_01ABC123");
      expect(ensureOpenAICallId("call_xyz789")).toBe("call_xyz789");
    });

    it("should convert non-call_ prefixed IDs", () => {
      expect(ensureOpenAICallId("toolu_01ABC123")).toBe("call_01ABC123");
      expect(ensureOpenAICallId("fc_xyz789")).toBe("call_xyz789");
      expect(ensureOpenAICallId("ws_123")).toBe("call_123");
    });

    it("should handle IDs without prefix", () => {
      expect(ensureOpenAICallId("abc123")).toBe("call_abc123");
      expect(ensureOpenAICallId("simple")).toBe("call_simple");
    });

    it("should handle empty string", () => {
      expect(ensureOpenAICallId("")).toBe("call_");
    });
  });

  describe("generateOpenAICallId", () => {
    it("should generate ID with call_ prefix", () => {
      const id = generateOpenAICallId();
      expect(id).toMatch(/^call_/);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateOpenAICallId());
      }
      expect(ids.size).toBe(100);
    });

    it("should include timestamp and random component", () => {
      const id = generateOpenAICallId();
      const parts = id.split("_");
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe("call");
      expect(parseInt(parts[1])).toBeGreaterThan(0); // timestamp
      expect(parts[2]).toMatch(/^[a-z0-9]{9}$/); // random string
    });
  });

  describe("Round-trip conversions", () => {
    it("should preserve ID suffix through round-trip conversion", () => {
      const originalOpenAI = "call_01ABC123";
      const toClaude = toClaudeToolUseIdFromOpenAI(originalOpenAI);
      const backToOpenAI = toOpenAICallIdFromClaude(toClaude);
      expect(isSameIgnoringPrefix(originalOpenAI, backToOpenAI)).toBe(true);
      expect(backToOpenAI).toBe(originalOpenAI);
    });

    it("should preserve ID suffix from Claude through round-trip", () => {
      const originalClaude = "toolu_xyz789";
      const toOpenAI = toOpenAICallIdFromClaude(originalClaude);
      const backToClaude = toClaudeToolUseIdFromOpenAI(toOpenAI);
      expect(isSameIgnoringPrefix(originalClaude, backToClaude)).toBe(true);
      expect(backToClaude).toBe(originalClaude);
    });
  });

  describe("Edge cases", () => {
    it("should handle special characters in IDs", () => {
      expect(toOpenAICallIdFromClaude("toolu_01-ABC.123")).toBe("call_01-ABC.123");
      expect(toClaudeToolUseIdFromOpenAI("call_xyz@789#")).toBe("toolu_xyz@789#");
    });

    it("should handle very long IDs", () => {
      const longSuffix = "a".repeat(1000);
      expect(toOpenAICallIdFromClaude(`toolu_${longSuffix}`)).toBe(`call_${longSuffix}`);
      expect(toClaudeToolUseIdFromOpenAI(`call_${longSuffix}`)).toBe(`toolu_${longSuffix}`);
    });

    it("should handle Unicode characters", () => {
      expect(toOpenAICallIdFromClaude("toolu_🔧123")).toBe("call_🔧123");
      expect(toClaudeToolUseIdFromOpenAI("call_测试789")).toBe("toolu_测试789");
    });
  });

  describe("Common ID patterns", () => {
    it("should handle common Claude ID patterns", () => {
      const claudePatterns = [
        "toolu_01HX5SSXW9E8J4C8YPWPTFXW9V",
        "toolu_bdrk_01HsFH5fhkKzPa2tG5TmFgHh",
        "toolu_01234567890abcdefghijklmnop",
      ];

      claudePatterns.forEach((claudeId) => {
        const openaiId = toOpenAICallIdFromClaude(claudeId);
        expect(openaiId).toMatch(/^call_/);
        expect(toClaudeToolUseIdFromOpenAI(openaiId)).toBe(claudeId);
      });
    });

    it("should handle common OpenAI ID patterns", () => {
      const openaiPatterns = ["call_abc123", "call_1234567890", "call_a1b2c3d4e5f6"];

      openaiPatterns.forEach((openaiId) => {
        const claudeId = toClaudeToolUseIdFromOpenAI(openaiId);
        expect(claudeId).toMatch(/^toolu_/);
        expect(toOpenAICallIdFromClaude(claudeId)).toBe(openaiId);
      });
    });
  });
});
