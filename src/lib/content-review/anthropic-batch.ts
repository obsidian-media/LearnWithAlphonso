// Anthropic Message Batches API client for the full content review (50% off, results within 24h).
// Checked against platform.claude.com/docs/en/build-with-claude/batch-processing on 2026-11-06:
//   POST /v1/messages/batches {requests:[{custom_id, params}]}  -> {id, processing_status, ...}
//   GET  /v1/messages/batches/{id}                              -> processing_status "in_progress" | "canceling" | "ended", results_url
//   GET  results_url                                            -> JSONL {custom_id, result:{type, message?|error?}}
//   result.type: succeeded | errored | canceled | expired (only "succeeded" is billed)
//   Limits: 100,000 requests or 256 MB per batch; custom_id ^[a-zA-Z0-9_-]{1,64}$; results kept 29 days.
// The rubric goes in `system` with a 1-hour cache breakpoint (batches can outlast the 5-minute TTL).
// The key is passed in a header only, never logged; errors report the status and the API's message.

import type { Chunk } from "./review";
import { maxTokensFor, systemFor, userMessage } from "./review";
import type { AnthropicUsage } from "./pricing";
import type { RubricRole } from "./rubric";

export const ANTHROPIC_API = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2026-10-21";
export const MAX_REQUESTS_PER_BATCH = 100_000;
export const MAX_BATCH_BYTES = 256 * 1024 * 1024;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Thinking settings per model, from the thinking docs (2026-11-06): Sonnet 5.5 rejects "disabled";
 * "between_tools" turns up-front thinking off (and with no tools, thinking off). Opus 5.5 cannot turn
 * thinking off; effort bounds it, and max_tokens bounds it hard.
 */
export function thinkingParams(
  model: string,
  effort: "low" | "medium" | "high",
): Record<string, unknown> {
  if (model.startsWith("claude-sonnet-5-5"))
    return { thinking: { type: "between_tools" }, output_config: { effort } };
  if (model.startsWith("claude-opus-5-5")) return { output_config: { effort } };
  return {};
}

export type BatchRequest = { custom_id: string; params: Record<string, unknown> };

export function buildRequest(
  c: Chunk,
  opts: {
    model: string;
    role?: RubricRole;
    effort?: "low" | "medium" | "high";
    maxTokens?: number;
    system?: string;
    user?: string;
  },
): BatchRequest {
  return {
    custom_id: c.customId,
    params: {
      model: opts.model,
      max_tokens: opts.maxTokens ?? maxTokensFor(c),
      system: [
        {
          type: "text",
          text: opts.system ?? systemFor(c, opts.role),
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [{ role: "user", content: opts.user ?? userMessage(c) }],
      ...thinkingParams(opts.model, opts.effort ?? "low"),
    },
  };
}

/** Splits requests into batches under both API limits (a 5% margin on the byte limit). */
export function splitBatches(reqs: BatchRequest[]): BatchRequest[][] {
  const out: BatchRequest[][] = [];
  let cur: BatchRequest[] = [];
  let bytes = 0;
  for (const r of reqs) {
    const b = new TextEncoder().encode(JSON.stringify(r)).length + 1;
    if (
      cur.length &&
      (cur.length >= MAX_REQUESTS_PER_BATCH || bytes + b > MAX_BATCH_BYTES * 0.95)
    ) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(r);
    bytes += b;
  }
  if (cur.length) out.push(cur);
  return out;
}

const headers = (key: string) => ({
  "x-api-key": key,
  "anthropic-version": ANTHROPIC_VERSION,
  "content-type": "application/json",
});

/** Thrown when the API refused the request: nothing was accepted, so a reservation may be released. */
export class RejectedError extends Error {}

async function readError(res: Response) {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return `HTTP ${res.status} ${body.error?.message ?? ""}`.trim();
}

export type BatchInfo = {
  id: string;
  processing_status: "in_progress" | "canceling" | "ended";
  request_counts?: Record<string, number>;
  results_url?: string | null;
};

export async function createBatch(
  f: FetchLike,
  key: string,
  requests: BatchRequest[],
): Promise<BatchInfo> {
  const res = await f(`${ANTHROPIC_API}/messages/batches`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ requests }),
  });
  // 4xx: the batch was refused as a whole. 5xx or a network error: unknown, the caller keeps the reservation.
  if (res.status >= 400 && res.status < 500) throw new RejectedError(await readError(res));
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as BatchInfo;
}

export async function getBatch(f: FetchLike, key: string, id: string): Promise<BatchInfo> {
  const res = await f(`${ANTHROPIC_API}/messages/batches/${encodeURIComponent(id)}`, {
    headers: headers(key),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as BatchInfo;
}

export type BatchResultLine = {
  custom_id: string;
  result: {
    type: "succeeded" | "errored" | "canceled" | "expired";
    message?: {
      content?: { type: string; text?: string }[];
      usage?: AnthropicUsage;
      stop_reason?: string;
    };
    error?: unknown;
  };
};

export async function getResults(
  f: FetchLike,
  key: string,
  info: BatchInfo,
): Promise<BatchResultLine[]> {
  if (info.processing_status !== "ended" || !info.results_url)
    throw new Error(`batch ${info.id} has not ended`);
  const res = await f(info.results_url, { headers: headers(key) });
  if (!res.ok) throw new Error(await readError(res));
  return parseResultsJsonl(await res.text());
}

export function parseResultsJsonl(text: string): BatchResultLine[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BatchResultLine);
}

/** The text of a succeeded result (thinking blocks are skipped). */
export function resultText(r: BatchResultLine): string {
  return (r.result.message?.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

/**
 * One synchronous Messages call (full price, no batch discount), for the small per-PR check
 * (`run.ts check`), where waiting for a batch is not worth half the price of a few cents.
 */
export async function sendMessage(
  f: FetchLike,
  key: string,
  params: Record<string, unknown>,
): Promise<{ text: string; usage: AnthropicUsage }> {
  const res = await f(`${ANTHROPIC_API}/messages`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(params),
  });
  if (res.status >= 400 && res.status < 500) throw new RejectedError(await readError(res));
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: AnthropicUsage;
  };
  return {
    text: (body.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join(""),
    usage: body.usage ?? {},
  };
}
