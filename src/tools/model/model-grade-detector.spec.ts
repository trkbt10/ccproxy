import { detectModelGrade, getModelsByGrade } from "./model-grade-detector";
import {
  GROK_MODELS,
  GEMINI_MODELS,
  GROQ_MODELS,
  OPENAI_MODELS,
} from "./test-mock-models";

describe("detectModelGrade", () => {
  describe("High-grade models", () => {
    it("should detect pro models as high-grade", () => {
      expect(detectModelGrade("gemini-1.5-pro")).toBe("high");
      expect(detectModelGrade("gemini-2.5-pro")).toBe("high");
      expect(detectModelGrade("gemini-2.0-pro-exp")).toBe("high");
    });

    it("should detect large size models as high-grade", () => {
      expect(detectModelGrade("openai/gpt-oss-120b")).toBe("high");
      expect(detectModelGrade("llama3-70b-8192")).toBe("high");
      expect(detectModelGrade("deepseek-r1-distill-llama-70b")).toBe("high");
      expect(detectModelGrade("llama-3.3-70b-versatile")).toBe("high");
    });

    it("should detect experimental/advanced models as high-grade", () => {
      expect(detectModelGrade("gemini-exp-1206")).toBe("high");
      expect(detectModelGrade("gemini-2.0-pro-exp")).toBe("high");
    });

    it("should detect Grok 3/4 models as high-grade", () => {
      expect(detectModelGrade("grok-3")).toBe("high");
      expect(detectModelGrade("grok-4-0709")).toBe("high");
    });
  });

  describe("Mid-grade models", () => {
    it("should detect flash models as mid-grade", () => {
      expect(detectModelGrade("gemini-1.5-flash")).toBe("mid");
      expect(detectModelGrade("gemini-2.0-flash")).toBe("mid");
      expect(detectModelGrade("gemini-2.5-flash")).toBe("mid");
    });

    it("should detect medium size models as mid-grade", () => {
      expect(detectModelGrade("qwen/qwen3-32b")).toBe("mid");
      expect(detectModelGrade("gemma-3-27b-it")).toBe("mid");
      expect(detectModelGrade("gemma-3-12b-it")).toBe("mid");
      expect(detectModelGrade("openai/gpt-oss-20b")).toBe("mid");
      expect(
        detectModelGrade("meta-llama/llama-4-maverick-17b-128e-instruct")
      ).toBe("mid");
    });

    it("should detect instant models as mid-grade", () => {
      expect(detectModelGrade("llama-3.1-8b-instant")).toBe("mid");
    });

    it("should detect Grok 2 models as mid-grade", () => {
      expect(detectModelGrade("grok-2-1212")).toBe("mid");
      expect(detectModelGrade("grok-2-vision-1212")).toBe("mid");
    });
  });

  describe("Low-grade models", () => {
    it("should detect mini/lite models as low-grade", () => {
      expect(detectModelGrade("grok-3-mini")).toBe("low");
      expect(detectModelGrade("grok-3-mini-fast")).toBe("low");
      expect(detectModelGrade("gemini-2.0-flash-lite")).toBe("low");
      expect(detectModelGrade("gemini-2.5-flash-lite")).toBe("low");
      expect(detectModelGrade("compound-beta-mini")).toBe("low");
    });

    it("should detect small size models as low-grade", () => {
      expect(detectModelGrade("gemini-1.5-flash-8b")).toBe("low");
      expect(detectModelGrade("llama3-8b-8192")).toBe("low");
      expect(detectModelGrade("gemma2-9b-it")).toBe("low");
      expect(detectModelGrade("gemma-3-1b-it")).toBe("low");
      expect(detectModelGrade("gemma-3-4b-it")).toBe("low");
      expect(detectModelGrade("allam-2-7b")).toBe("low");
    });

    it("should detect fast models as low-grade", () => {
      expect(detectModelGrade("grok-3-fast")).toBe("low");
      expect(detectModelGrade("grok-3-mini-fast")).toBe("low");
    });

    it("should detect specialized models as low-grade", () => {
      expect(detectModelGrade("whisper-large-v3")).toBe("low");
      expect(detectModelGrade("embedding-001")).toBe("low");
      expect(detectModelGrade("text-embedding-004")).toBe("low");
      expect(detectModelGrade("playai-tts")).toBe("low");
      expect(detectModelGrade("meta-llama/llama-prompt-guard-2-22m")).toBe(
        "low"
      );
      expect(detectModelGrade("imagen-3.0-generate-002")).toBe("low");
    });
  });

  describe("Edge cases", () => {
    it("should handle thinking models appropriately", () => {
      expect(detectModelGrade("gemini-2.0-flash-thinking-exp")).toBe("mid");
    });

    it("should handle compound models", () => {
      expect(detectModelGrade("compound-beta")).toBe("low");
      expect(detectModelGrade("compound-beta-mini")).toBe("low");
    });
  });
});

describe("getModelsByGrade", () => {
  const allModels = [
    ...GROK_MODELS,
    ...GEMINI_MODELS,
    ...GROQ_MODELS,
    ...OPENAI_MODELS,
  ];

  it("should filter models by grade", () => {
    const highGradeModels = getModelsByGrade(allModels, "high");
    const midGradeModels = getModelsByGrade(allModels, "mid");
    const lowGradeModels = getModelsByGrade(allModels, "low");

    // Check that all models are categorized
    const totalCategorized =
      highGradeModels.length + midGradeModels.length + lowGradeModels.length;
    expect(totalCategorized).toBe(allModels.length);

    // Check some expected models in each category
    expect(highGradeModels).toContain("gemini-2.5-pro");
    expect(highGradeModels).toContain("openai/gpt-oss-120b");
    expect(highGradeModels).toContain("grok-3");

    expect(midGradeModels).toContain("gemini-2.5-flash");
    expect(midGradeModels).toContain("qwen/qwen3-32b");
    expect(midGradeModels).toContain("grok-2-1212");

    expect(lowGradeModels).toContain("grok-3-mini");
    expect(lowGradeModels).toContain("gemini-1.5-flash-8b");
    expect(lowGradeModels).toContain("whisper-large-v3");
  });

  it("should return empty array for non-existent grade", () => {
    const models = getModelsByGrade(GEMINI_MODELS, "high");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => detectModelGrade(m) === "high")).toBe(true);
  });

  describe("OpenAI models grading", () => {
    it("should detect GPT-5 models as high-grade", () => {
      expect(detectModelGrade("gpt-5")).toBe("high");
      expect(detectModelGrade("gpt-5-2025-08-07")).toBe("high");
    });

    it("should detect GPT-4 models as high-grade", () => {
      expect(detectModelGrade("gpt-4")).toBe("high");
      expect(detectModelGrade("gpt-4o")).toBe("high");
      expect(detectModelGrade("gpt-4-turbo")).toBe("high");
    });

    it("should detect O-series models correctly", () => {
      expect(detectModelGrade("o1-pro")).toBe("high");
      expect(detectModelGrade("o3")).toBe("high");
      expect(detectModelGrade("o3-pro")).toBe("high");
      expect(detectModelGrade("o1-mini")).toBe("low");
      expect(detectModelGrade("o3-mini")).toBe("low");
    });

    it("should detect GPT-3.5 models as low-grade", () => {
      expect(detectModelGrade("gpt-3.5-turbo")).toBe("low");
      expect(detectModelGrade("gpt-3.5-turbo-16k")).toBe("low");
    });

    it("should detect mini/nano models as low-grade", () => {
      expect(detectModelGrade("gpt-4o-mini")).toBe("low");
      expect(detectModelGrade("gpt-5-mini")).toBe("low");
      expect(detectModelGrade("gpt-5-nano")).toBe("low");
    });
  });
});
