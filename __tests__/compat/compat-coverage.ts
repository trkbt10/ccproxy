/**
 * COMPATIBILITY COVERAGE (TEST-ONLY)
 * Tracks which OpenAI-compatible features are exercised by tests.
 */

export type Feature =
  | "chat.non_stream.basic"
  | "chat.non_stream.function_call"
  | "chat.stream.chunk"
  | "chat.stream.done"
  | "chat.stream.tool_call.delta"
  | "responses.non_stream.basic"
  | "responses.stream.created"
  | "responses.stream.delta"
  | "responses.stream.done"
  | "responses.stream.completed"
  | "responses.non_stream.function_call"
  | "responses.stream.function_call.added"
  | "responses.stream.function_call.args.delta"
  | "responses.stream.function_call.done"
  | "models.list.basic";

export class CompatCoverage {
  private seenByProvider = new Map<string, Set<Feature>>();
  private errorsByProvider = new Map<string, { feature: Feature; reason: string }[]>();

  providers(): string[] {
    return Array.from(this.seenByProvider.keys());
  }

  mark(provider: string, f: Feature): void {
    if (!this.seenByProvider.has(provider))
      this.seenByProvider.set(provider, new Set());
    this.seenByProvider.get(provider)!.add(f);
  }

  error(provider: string, feature: Feature, reason: string): void {
    if (!this.errorsByProvider.has(provider)) this.errorsByProvider.set(provider, []);
    this.errorsByProvider.get(provider)!.push({ feature, reason });
  }

  has(provider: string, f: Feature): boolean {
    return this.seenByProvider.get(provider)?.has(f) ?? false;
  }

  report(provider: string): {
    total: number;
    covered: number;
    percent: number;
    missing: Feature[];
    errors: { feature: Feature; reason: string }[];
  } {
    const all: Feature[] = [
      "chat.non_stream.basic",
      "chat.non_stream.function_call",
      "chat.stream.chunk",
      "chat.stream.done",
      "chat.stream.tool_call.delta",
      "responses.non_stream.basic",
      "responses.stream.created",
      "responses.stream.delta",
      "responses.stream.done",
      "responses.stream.completed",
      "responses.non_stream.function_call",
      "responses.stream.function_call.added",
      "responses.stream.function_call.args.delta",
      "responses.stream.function_call.done",
      "models.list.basic",
    ];
    const seen = this.seenByProvider.get(provider) ?? new Set<Feature>();
    const covered = all.filter((f) => seen.has(f));
    const missing = all.filter((f) => !seen.has(f));
    const total = all.length;
    const percent = Math.round((covered.length / total) * 1000) / 10;
    const errors = this.errorsByProvider.get(provider) ?? [];
    return { total, covered: covered.length, percent, missing, errors };
  }
}

export const compatCoverage = new CompatCoverage();

// ---------- Markdown report helpers (TEST-ONLY) ----------
export type CompatReport = ReturnType<CompatCoverage["report"]> & {
  generatedAt: string;
  provider: string;
};

export function toMarkdown(report: CompatReport): string {
  const lines: string[] = [];
  lines.push(`# OpenAI API Compatibility Coverage — ${report.provider}`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push(`- Total features: ${report.total}`);
  lines.push(`- Covered: ${report.covered}`);
  lines.push(`- Coverage: ${report.percent}%`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  const coveredCount = report.covered;
  const missingCount = report.missing.length;
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Total | ${report.total} |`);
  lines.push(`| Covered | ${coveredCount} |`);
  lines.push(`| Missing | ${missingCount} |`);
  lines.push(`| Coverage | ${report.percent}% |`);
  lines.push("");
  lines.push(`## Missing Features`);
  lines.push("");
  if (report.missing.length === 0) {
    lines.push(`- (none)`);
  } else {
    for (const f of report.missing) lines.push(`- ${f}`);
  }
  lines.push("");
  if (report.errors.length > 0) {
    lines.push(`## Errors / Reasons`);
    lines.push("");
    for (const e of report.errors) {
      lines.push(`- ${e.feature}: ${e.reason}`);
    }
    lines.push("");
  }
  lines.push(
    `> Note: This measures compatibility coverage against the OpenAI API (feature-level), not code coverage.`
  );
  return lines.join("\n");
}

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeMarkdownReport(
  report: CompatReport,
  baseDir = "reports/openai-compat"
): Promise<void> {
  const filePath = `${baseDir}/${report.provider}.md`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, toMarkdown(report), "utf8");
}

export async function writeCombinedMarkdownReport(
  reports: CompatReport[],
  baseDir = "reports/openai-compat"
): Promise<void> {
  const filePath = `${baseDir}/summary.md`;
  await mkdir(dirname(filePath), { recursive: true });
  const lines: string[] = [];
  lines.push(`# OpenAI API Compatibility Coverage — Summary`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  for (const r of reports) {
    lines.push(`## ${r.provider}`);
    lines.push("");
    lines.push(`- Total: ${r.total}`);
    lines.push(`- Covered: ${r.covered}`);
    lines.push(`- Coverage: ${r.percent}%`);
    if (r.missing.length > 0) {
      lines.push(`- Missing: ${r.missing.join(", ")}`);
    } else {
      lines.push(`- Missing: (none)`);
    }
    lines.push("");
  }
  await writeFile(filePath, lines.join("\n"), "utf8");
}
