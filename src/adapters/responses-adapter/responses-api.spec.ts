import OpenAI from "openai";
import { ResponsesAPI } from "../providers/openai-generic/responses-adapter/responses-api";
import type {
  Response as OpenAIResponse,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_DEFAULT_MODEL || "gpt-4o-mini";

describe("ResponsesAPI emulator (OpenAI-backed)", () => {
  const maybe = API_KEY ? it : it.skip;

  maybe("non-stream returns response with output", async () => {
    const api = new ResponsesAPI(new OpenAI({ apiKey: API_KEY! }));
    const params: ResponseCreateParamsNonStreaming = {
      model: MODEL,
      input: "Hello",
    };
    const res = (await api.create(params)) as OpenAIResponse;
    expect(res.object).toBe("response");
    expect(Array.isArray(res.output)).toBe(true);
  });

  maybe("stream yields responses SSE events", async () => {
    const api = new ResponsesAPI(new OpenAI({ apiKey: API_KEY! }));
    const params: ResponseCreateParamsStreaming = {
      model: MODEL,
      input: "streaming",
      stream: true,
    };
    const stream = await api.create(params);

    let created = false,
      delta = false,
      done = false,
      completed = false;
    for await (const ev of stream) {
      const e = ev as ResponseStreamEvent;
      if (e.type === "response.created") created = true;
      if (e.type === "response.output_text.delta") delta = true;
      if (e.type === "response.output_text.done") done = true;
      if (e.type === "response.completed") completed = true;
    }
    expect(created).toBe(true);
    expect(delta).toBe(true);
    expect(done).toBe(true);
    expect(completed).toBe(true);
  });
});
