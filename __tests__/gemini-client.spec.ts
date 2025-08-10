import { describe, it, expect } from "bun:test";
import { GeminiFetchClient } from "../src/providers/gemini/fetch-client";

const API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY;

describe("Gemini Fetch Client (integration, optional)", () => {
  const maybe = API_KEY ? it : it.skip;

  maybe("listModels returns some models", async () => {
    const client = new GeminiFetchClient({ apiKey: API_KEY! });
    const res = await client.listModels();
    expect(Array.isArray(res.models)).toBe(true);
  });

  maybe("generateContent returns a candidate and maps to OpenAI compat", async () => {
    const client = new GeminiFetchClient({ apiKey: API_KEY! });
    const res = await client.listModels();
    const model = res.models?.[0]?.name?.replace(/^models\//, "") || "gemini-1.5-flash";
    const gen = await client.generateContent(model, { contents: [{ parts: [{ text: "Hello from test" }] }] });
    expect(gen.candidates?.length).toBeGreaterThan(0);
  });
});

