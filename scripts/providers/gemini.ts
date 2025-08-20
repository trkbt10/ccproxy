import { GeminiFetchClient } from "../../src/adapters/providers/gemini/client/fetch-client";
import type { GenerateContentRequest, GenerateContentResponse } from "../../src/adapters/providers/gemini/client/fetch-client";
import { Line, Mode, ProviderFactory, ProviderInstance, NativeCase } from "./types";

function env(key: string, dflt?: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : dflt;
}

type GeminiProvider = { type: "gemini"; client: GeminiFetchClient };

function buildProviderFromEnv(): GeminiProvider | undefined {
  const apiKey =
    env("GEMINI_API_KEY") || env("GOOGLE_API_KEY") || env("GOOGLE_AI_STUDIO_API_KEY") || env("GOOGLE_AI_API_KEY");
  if (!apiKey) return undefined;
  const client = new GeminiFetchClient({ apiKey, baseURL: env("GEMINI_BASE_URL") });
  return { type: "gemini", client };
}

// selectModel is intentionally omitted to avoid indirection; use defaultModel

export const factory: ProviderFactory = {
  name: "gemini",
  defaultModel: "gemini-2.0-flash",
  buildFromEnv(): ProviderInstance | undefined {
    const p = buildProviderFromEnv();
    if (!p) return undefined;
    return {
      name: "gemini",
      defaultModel: "gemini-2.0-flash",
      async nativeCases(model): Promise<NativeCase[]> {
        const ts = () => new Date().toISOString();
        const makeLineBase = (
          api: "chat" | "responses",
          mode: Mode,
          context: "basic" | "tool_call",
          request: unknown
        ) => ({
          ts: ts(),
          provider: p.type,
          api,
          mode,
          context,
          request,
        });
        const baseBody = (text: string) => ({
          contents: [{ role: "user" as const, parts: [{ text }] }],
          generationConfig: { temperature: 0.0 },
        });
        const toolDecl = {
          tools: [
            {
              functionDeclarations: [
                {
                  name: "get_current_time",
                  description: "Get the current time in a location",
                  parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
                },
              ],
            },
          ],
          toolConfig: { functionCallingConfig: { mode: "ANY" as const, allowedFunctionNames: ["get_current_time"] } },
        };
        return [
          {
            api: "chat",
            mode: "sync",
            context: "basic",
            buildRequest: () => ({ model, ...baseBody("Hello from mock generator") }),
            run: async () => {
              const request = { ...baseBody("Hello from mock generator") };
              try {
                const resp = await p.client.generateContent(model, request);
                return { ...makeLineBase("chat", "sync", "basic", { model, ...request }), response: resp } as Line;
              } catch (e) {
                return {
                  ...makeLineBase("chat", "sync", "basic", { model, ...request }),
                  error: { message: e instanceof Error ? e.message : String(e) },
                } as Line;
              }
            },
          },
          {
            api: "chat",
            mode: "stream",
            context: "basic",
            buildRequest: () => ({ model, ...baseBody("Hello from mock generator") }),
            run: async () => {
              const request = { ...baseBody("Hello from mock generator") };
              const events: GenerateContentResponse[] = [];
              try {
                for await (const ev of p.client.streamGenerateContent(model, request)) events.push(ev);
                return { ...makeLineBase("chat", "stream", "basic", { model, ...request }), events } as Line;
              } catch (e) {
                return {
                  ...makeLineBase("chat", "stream", "basic", { model, ...request }),
                  error: { message: e instanceof Error ? e.message : String(e) },
                } as Line;
              }
            },
          },
          {
            api: "chat",
            mode: "sync",
            context: "tool_call",
            buildRequest: () => ({ model, ...baseBody("Call the tool for time in Tokyo"), ...toolDecl }),
            run: async () => {
              const request = { ...baseBody("Call the tool for time in Tokyo"), ...toolDecl };
              try {
                const resp = await p.client.generateContent(model, request);
                return { ...makeLineBase("chat", "sync", "tool_call", { model, ...request }), response: resp } as Line;
              } catch (e) {
                return {
                  ...makeLineBase("chat", "sync", "tool_call", { model, ...request }),
                  error: { message: e instanceof Error ? e.message : String(e) },
                } as Line;
              }
            },
          },
          {
            api: "chat",
            mode: "stream",
            context: "tool_call",
            buildRequest: () => ({ model, ...baseBody("Call the tool for time in Tokyo"), ...toolDecl }),
            run: async () => {
              const request = { ...baseBody("Call the tool for time in Tokyo"), ...toolDecl };
              const events: GenerateContentResponse[] = [];
              try {
                for await (const ev of p.client.streamGenerateContent(model, request)) events.push(ev);
                return { ...makeLineBase("chat", "stream", "tool_call", { model, ...request }), events } as Line;
              } catch (e) {
                return {
                  ...makeLineBase("chat", "stream", "tool_call", { model, ...request }),
                  error: { message: e instanceof Error ? e.message : String(e) },
                } as Line;
              }
            },
          },
        ];
      },
    };
  },
};
