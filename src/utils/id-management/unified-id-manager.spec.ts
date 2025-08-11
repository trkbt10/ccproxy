import {
  UnifiedIdManager,
  IdFormat,
  UnifiedIdRegistry,
} from "./unified-id-manager";

describe("UnifiedIdManager - ID lifecycle and mapping", () => {
  test("getOrCreateOpenAICallIdForToolUse creates mapping without marking used", () => {
    const m = new UnifiedIdManager("spec-conv-1");
    const toolUseId = IdFormat.generateClaudeId();

    const callId = m.getOrCreateOpenAICallIdForToolUse(toolUseId, "editor", {
      source: "spec",
    });
    expect(callId.startsWith("call_") || callId.startsWith("fc_")).toBe(true);

    // Should be stored and pending (not used yet)
    const stats1 = m.getStats();
    expect(stats1.totalMappings).toBe(1);
    expect(stats1.pendingMappings).toBe(1);
    expect(stats1.usedMappings).toBe(0);

    // Export map and verify content
    const map = m.getMappingAsMap();
    expect(map.get(callId)).toBe(toolUseId);

    // Lookup from Claude -> OpenAI marks as used
    const resolved = m.getOpenAICallId(toolUseId);
    expect(resolved).toBe(callId);
    const stats2 = m.getStats();
    expect(stats2.usedMappings).toBe(1);

    // Purge used immediately
    const purged = m.purgeUsed(0);
    expect(purged).toBe(1);
    const stats3 = m.getStats();
    expect(stats3.totalMappings).toBe(0);
  });

  test("existing mapping is returned and not marked used by getOrCreate", () => {
    const m = new UnifiedIdManager("spec-conv-2");
    const callId = IdFormat.generateOpenAIId();
    const toolUseId = IdFormat.generateClaudeId();
    m.registerMapping(callId, toolUseId, "calc", { source: "spec" });

    const again = m.getOrCreateOpenAICallIdForToolUse(toolUseId, "calc", {
      source: "spec",
    });
    expect(again).toBe(callId);
    // Should still be pending (not used yet)
    const stats = m.getStats();
    expect(stats.pendingMappings).toBe(1);
    expect(stats.usedMappings).toBe(0);
  });

  test("prefix fixing on register", () => {
    const m = new UnifiedIdManager("spec-conv-3");
    const bad = "ws_abc123";
    const expectedFixed = "call_" + bad.substring("ws_".length);
    const toolUseId = IdFormat.generateClaudeId();
    m.registerMapping(bad, toolUseId, "editor", { source: "spec" });

    // Retrieval by fixed ID works
    const claudeId = m.getClaudeToolUseId(expectedFixed);
    expect(claudeId).toBe(toolUseId);
  });

  test("ignore prefix when resolving mapping", () => {
    const m = new UnifiedIdManager("spec-conv-4");
    const callId = IdFormat.generateOpenAIId();
    // Store mapping with one Claude prefix
    const withoutPrefix = "12345_abc";
    const toolUse = "toolu_" + withoutPrefix;
    m.registerMapping(callId, toolUse, "web_search", { source: "spec" });

    // Try resolving with a different prefix but same suffix
    const altToolUse = "tool_" + withoutPrefix; // invalid/legacy prefix
    const resolved = m.getOpenAICallId(altToolUse);
    expect(resolved).toBe(callId);
  });

  test("import/export roundtrip", () => {
    const m1 = new UnifiedIdManager("spec-conv-5");
    const callId = IdFormat.generateOpenAIId();
    const toolUseId = IdFormat.generateClaudeId();
    m1.registerMapping(callId, toolUseId, "bash", { source: "spec" });

    const map = m1.getMappingAsMap();
    const m2 = new UnifiedIdManager("spec-conv-5b");
    m2.importFromMap(map, { source: "import" });

    expect(m2.getOpenAICallId(toolUseId)).toBe(callId);
  });

  test("validation flags duplicate Claude IDs", () => {
    const m = new UnifiedIdManager("spec-conv-6");
    const toolUse = IdFormat.generateClaudeId();
    m.registerMapping(IdFormat.generateOpenAIId(), toolUse, "t1");
    m.registerMapping(IdFormat.generateOpenAIId(), toolUse, "t2"); // duplicate Claude ID

    const v = m.validateMappings();
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.includes("Duplicate Claude ID"))).toBe(true);
  });

  test("registry caches per conversation and clearManager removes state", () => {
    // Create a local registry instance for this test
    const registry = new UnifiedIdRegistry();

    const a1 = registry.getManager("conv-X");
    const a2 = registry.getManager("conv-X");
    expect(a1).toBe(a2);

    const callId = IdFormat.generateOpenAIId();
    const toolUse = IdFormat.generateClaudeId();
    a1.registerMapping(callId, toolUse);
    expect(a1.getOpenAICallId(toolUse)).toBe(callId);

    registry.clearManager("conv-X");
    const a3 = registry.getManager("conv-X");
    expect(a3).not.toBe(a1);
    // New manager should not have old mapping
    expect(a3.getOpenAICallId(toolUse)).toBeUndefined();
  });
});
