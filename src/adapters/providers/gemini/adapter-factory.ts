import type { Provider } from "../../../config/types";
import type { ProviderAdapter } from "../adapter";
import { selectApiKey } from "../shared/select-api-key";
import {
  GeminiFetchClient,
  type GenerateContentRequest,
  type GenerateContentResponse,
} from "./fetch-client";

// API key selection centralized in shared/select-api-key

export function buildGeminiAdapter(
  provider: Provider,
  modelHint?: string
): ProviderAdapter<GenerateContentRequest, GenerateContentResponse> {
  const apiKey = selectApiKey(provider, modelHint);
  if (!apiKey) throw new Error("Missing Gemini API key");
  const resolvedKey: string = apiKey;
  const client = new GeminiFetchClient({
    apiKey: resolvedKey,
    baseURL: provider.baseURL,
  });
  const adapter: ProviderAdapter<GenerateContentRequest, GenerateContentResponse> = {
    name: "gemini",
    async generate(params) {
      return client.generateContent(
        params.model,
        params.input,
        params.signal
      );
    },
    async *stream(params) {
      let seenFunctionCall = false;
      for await (const ev of client.streamGenerateContent(
        params.model,
        params.input,
        params.signal
      )) {
        try {
          const parts = (ev.candidates?.[0]?.content?.parts || []) as Array<
            { functionCall?: { name?: string } } & Record<string, unknown>
          >;
          if (
            parts.some(
              (p) =>
                p &&
                p.functionCall &&
                typeof p.functionCall.name === "string"
            )
          ) {
            seenFunctionCall = true;
          }
        } catch {
          // ignore shape issues
        }
        yield ev;
      }
      // Synthesize a functionCall at the end when tools are forced but Gemini didn't stream any
      try {
        const { allowedFunctionName: fnName, mode } = extractFunctionCallingSpec(params.input);
        if (!seenFunctionCall && fnName && (mode === "ANY" || mode === "AUTO")) {
          const synthetic: GenerateContentResponse = {
            candidates: [
              {
                content: {
                  parts: [{ functionCall: { name: fnName, args: {} } }],
                },
              },
            ],
          };
          yield synthetic;
        }
      } catch {
        // ignore
      }
    },
    async countTokens(params) {
      if (!isGenerateContentRequest(params.input)) {
        throw new TypeError("Invalid Gemini countTokens input shape");
      }
      return client.countTokens(params.model, params.input, params.signal);
    },
    async listModels() {
      const res = await client.listModels();
      const data = (res.models || [])
        .map((m) => {
          const id = m.name?.startsWith("models/")
            ? m.name.slice("models/".length)
            : m.name;
          return { id: id || "", object: "model" as const };
        })
        .filter((m) => m.id);
      return { object: "list" as const, data };
    },
  };
  return adapter;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isGenerateContentRequest(v: unknown): v is GenerateContentRequest {
  if (!isObject(v)) return false;
  const contents = (v as Record<string, unknown>)["contents"];
  return Array.isArray(contents);
}

function extractFunctionCallingSpec(input: GenerateContentRequest): {
  allowedFunctionName?: string;
  mode?: string;
} {
  const tc = input.toolConfig;
  if (!isObject(tc)) return {};
  const fcc = (tc as Record<string, unknown>)["functionCallingConfig"];
  if (!isObject(fcc)) return {};
  const allowed = (fcc as Record<string, unknown>)[
    "allowedFunctionNames"
  ];
  const mode = (fcc as Record<string, unknown>)["mode"];
  const first = Array.isArray(allowed) && allowed.length > 0 ? allowed[0] : undefined;
  const name = typeof first === "string" ? first : undefined;
  return {
    allowedFunctionName: name,
    mode: typeof mode === "string" ? mode : undefined,
  };
}
