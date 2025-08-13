export type Mode = "sync" | "stream";
export type Context = "basic" | "tool_call";

export type Line = {
  ts: string;
  provider: string;
  api: "chat" | "responses";
  mode: Mode;
  context: Context;
  request: unknown;
  response?: unknown;
  events?: unknown[];
  error?: { message: string };
};

export type ProviderInstance = {
  name: string;
  defaultModel: string;
  nativeCases: (model: string) => Promise<NativeCase[]>;
};

export type ProviderFactory = {
  name: string;
  defaultModel: string;
  buildFromEnv: () => ProviderInstance | undefined;
};

export type NativeCase = {
  api: "chat" | "responses";
  mode: Mode;
  context: Context;
  buildRequest: () => unknown; // builds provider-native request object (captures model)
  run: () => Promise<Line>; // executes with the above request and returns a Line without rewriting
};
