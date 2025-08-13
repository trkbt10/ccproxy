import { ProviderFactory } from "./types";
import { factory as openai } from "./openai";
import { factory as claude } from "./claude";
import { factory as gemini } from "./gemini";

export const registry: ProviderFactory[] = [openai, claude, gemini];

