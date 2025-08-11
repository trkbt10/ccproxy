/**
 * Mock Models Generator
 *
 * Purpose: Fetch model lists from all configured providers via the
 * abstraction layer (src/adapters/providers/registry.ts) and write
 * them to JSON files for testing/mocking.
 *
 * This script does not run in production paths. It helps tests validate
 * that the provider registry and adapters expose a uniform listModels API.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Provider, RoutingConfig } from "../../../config/types";
import { getAdapterFor } from "../../../adapters/providers/registry";

type ModelsList = {
  object: "list";
  data: Array<{ id: string; object: "model" }>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function fetchModelsForProvider(providerId: string, provider: Provider) {
  const adapter = getAdapterFor(provider);
  const list: ModelsList = await adapter.listModels();
  const ids = (list.data || [])
    .map((m) => m.id)
    .filter(Boolean)
    .sort();
  return {
    providerId,
    providerType: provider.type,
    count: ids.length,
    models: ids,
  };
}

async function main() {
  const outDir = path.join(__dirname, "snapshots");
  await ensureDir(outDir);

  // Prefer providers synthesized from environment variables.
  // Fallback: if none defined, try minimal synthesis from OPENAI only.
  const providers: NonNullable<RoutingConfig["providers"]> = {};

  if (process.env.OPENAI_API_KEY) {
    providers["openai"] = {
      type: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      defaultHeaders: { "OpenAI-Beta": "responses-2025-06-21" },
    };
  }
  if (process.env.GOOGLE_AI_STUDIO_API_KEY) {
    providers["gemini"] = {
      type: "gemini",
      apiKey: process.env.GOOGLE_AI_STUDIO_API_KEY,
    };
  }
  if (process.env.GROK_API_KEY) {
    providers["grok"] = {
      type: "grok",
      apiKey: process.env.GROK_API_KEY,
    };
  }
  if (process.env.GROQ_API_KEY) {
    providers["groq"] = {
      type: "groq",
      apiKey: process.env.GROQ_API_KEY,
      baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    providers["claude"] = {
      type: "claude",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  const entries = Object.entries(providers);

  if (entries.length === 0) {
    console.warn("No providers set via .env. Nothing to generate.");
    return;
  }

  console.log(`Generating model lists for ${entries.length} provider(s)...`);

  const results = await Promise.allSettled(
    entries.map(async ([providerId, provider]) => {
      try {
        console.log(`- Listing models for: ${providerId} (${provider.type})`);
        const data = await fetchModelsForProvider(providerId, provider);
        const perFile = path.join(outDir, `${providerId}.models.json`);
        await writeFile(
          perFile,
          JSON.stringify(
            {
              providerId: data.providerId,
              providerType: data.providerType,
              count: data.count,
              models: data.models,
              generatedAt: new Date().toISOString(),
            },
            null,
            2
          ),
          "utf8"
        );
        return { ok: true as const, value: data };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`! Failed listing for ${providerId}: ${message}`);
        const perFile = path.join(outDir, `${providerId}.models.error.json`);
        await writeFile(
          perFile,
          JSON.stringify(
            {
              providerId,
              providerType: provider.type,
              error: message,
              generatedAt: new Date().toISOString(),
            },
            null,
            2
          ),
          "utf8"
        );
        return {
          ok: false as const,
          error: message,
          providerId,
          providerType: provider.type,
        };
      }
    })
  );

  const summary = results.map((r) => {
    if (r.status === "fulfilled") {
      const v = r.value;
      return v.ok
        ? {
            providerId: v.value.providerId,
            providerType: v.value.providerType,
            count: v.value.count,
          }
        : {
            providerId: v.providerId,
            providerType: v.providerType,
            error: v.error,
          };
    }
    return {
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    } as const;
  });

  const snapshotPath = path.join(outDir, "models-snapshot.json");
  await writeFile(
    snapshotPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      summary,
    }),
    "utf8"
  );

  console.log(`\nModel list generation complete. Files written to: ${outDir}`);
}

// Execute when run directly (bun/tsx/node)
main().catch((err) => {
  console.error("Fatal error generating mock model lists:", err);
  process.exitCode = 1;
});
