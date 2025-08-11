export type GenerateParams<TInput = unknown> = {
  model: string;
  input: TInput;
  signal?: AbortSignal;
};

export type StreamParams<TInput = unknown> = GenerateParams<TInput>;

export interface ProviderAdapter<TInput = unknown, TOutput = unknown> {
  readonly name: string;

  generate(params: GenerateParams<TInput>): Promise<TOutput>;

  stream(params: StreamParams<TInput>): AsyncGenerator<TOutput, void, unknown>;

  countTokens?(params: { model: string; input: unknown; signal?: AbortSignal }): Promise<unknown>;

  embed?(params: { model: string; input: unknown; signal?: AbortSignal }): Promise<unknown>;

  // OpenAI-compatible models endpoint (required)
  listModels(): Promise<{ object: "list"; data: Array<{ id: string; object: "model" }> }>;
}
