// Minimal OpenAI Responses compatibility types used by adapters
export type OpenAICompatMessageOutput = {
  type: "message";
  role: string;
  content: Array<{ type: "output_text"; text: string }>;
};

export type OpenAICompatFunctionCallOutput = {
  type: "function_call";
  id?: string;
  call_id?: string;
  name: string;
  arguments?: string;
};

export type OpenAICompatOutputItem =
  | OpenAICompatMessageOutput
  | OpenAICompatFunctionCallOutput;

export type OpenAICompatResponse = {
  id: string;
  object: "response";
  created_at: number;
  model: string;
  status: "in_progress" | "completed" | string;
  output: OpenAICompatOutputItem[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type OpenAICompatStreamEvent =
  | { type: "response.created"; response: { id: string; status: string } }
  | { type: "response.output_text.delta"; delta: string }
  | { type: "response.output_text.done" }
  | { type: "response.output_item.added"; item: OpenAICompatFunctionCallOutput }
  | { type: "response.function_call_arguments.delta"; item_id?: string; delta: string }
  | { type: "response.output_item.done"; item: OpenAICompatFunctionCallOutput }
  | { type: "response.completed"; response: { id: string; status: string } };

