// Mistral batch client for the second opinion, called directly (not through OpenRouter).
// Checked against docs.mistral.ai (batch capability page and the batch API reference) on 2026-11-06:
//   POST /v1/batch/jobs {endpoint:"/v1/chat/completions", model, requests:[{custom_id, body}], metadata, timeout_hours}
//     (inline `requests` is supported below 10,000 requests; above that, upload a .jsonl file)
//   GET  /v1/batch/jobs/{id} -> status QUEUED | RUNNING | SUCCESS | FAILED | TIMEOUT_EXCEEDED |
//        CANCELLATION_REQUESTED | CANCELLED; output_file, error_file, total/succeeded/failed_requests
//   Batch is 50% off.
// NOT confirmed from the docs: the output file's line shape and the file download path. This client
// reads both OpenAI-style shapes ({custom_id, response:{body:{choices, usage}}} and
// {custom_id, response:{choices, usage}}) and downloads with GET /v1/files/{id}/content, Mistral's
// files endpoint. A line it cannot read becomes a missing verdict (re-queued), never an ok, and a
// line with no usage is charged at its reservation's worst case.

import type { FetchLike } from "./anthropic-batch";
import { RejectedError } from "./anthropic-batch";
import type { Chunk } from "./review";
import { maxTokensFor, systemFor, userMessage } from "./review";

export const MISTRAL_API = "https://api.mistral.ai/v1";
export const MAX_INLINE_REQUESTS = 9_999;

export type MistralRequest = { custom_id: string; body: Record<string, unknown> };

/** Mistral Large 4 reasons before it answers (first run of #428: about 1,500 tokens an item). */
export const MISTRAL_OUTPUT_TOKENS_PER_ITEM = 2_000;

export function buildMistralRequest(c: Chunk): MistralRequest {
  return {
    custom_id: c.customId,
    body: {
      temperature: 0,
      max_tokens: maxTokensFor(c, MISTRAL_OUTPUT_TOKENS_PER_ITEM),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemFor(c) },
        { role: "user", content: userMessage(c) },
      ],
    },
  };
}

const headers = (key: string) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});

async function readError(res: Response) {
  const body = (await res.json().catch(() => ({}))) as { message?: string; detail?: unknown };
  return `HTTP ${res.status} ${body.message ?? (body.detail ? JSON.stringify(body.detail) : "")}`.trim();
}

export type MistralJob = {
  id: string;
  status: string;
  output_file?: string | null;
  error_file?: string | null;
  total_requests?: number;
  succeeded_requests?: number;
  failed_requests?: number;
};

export const MISTRAL_DONE = new Set(["SUCCESS", "FAILED", "TIMEOUT_EXCEEDED", "CANCELLED"]);

export async function createMistralJob(
  f: FetchLike,
  key: string,
  model: string,
  requests: MistralRequest[],
  metadata: Record<string, string>,
): Promise<MistralJob> {
  if (requests.length > MAX_INLINE_REQUESTS)
    throw new RejectedError(
      `inline batches take at most ${MAX_INLINE_REQUESTS} requests; split it`,
    );
  const res = await f(`${MISTRAL_API}/batch/jobs`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ endpoint: "/v1/chat/completions", model, requests, metadata }),
  });
  if (res.status >= 400 && res.status < 500) throw new RejectedError(await readError(res));
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as MistralJob;
}

export async function getMistralJob(f: FetchLike, key: string, id: string): Promise<MistralJob> {
  const res = await f(`${MISTRAL_API}/batch/jobs/${encodeURIComponent(id)}`, {
    headers: headers(key),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as MistralJob;
}

export async function downloadMistralFile(
  f: FetchLike,
  key: string,
  fileId: string,
): Promise<string> {
  const res = await f(`${MISTRAL_API}/files/${encodeURIComponent(fileId)}/content`, {
    headers: headers(key),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.text();
}

export type MistralLine = {
  customId: string;
  text: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number } | null;
};

type Choice = { message?: { content?: string | { type?: string; text?: string }[] } };

/** One output line, either OpenAI-style shape; reasoning chunks in an array content are skipped. */
export function parseMistralLine(line: string): MistralLine | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  const customId = typeof raw.custom_id === "string" ? raw.custom_id : null;
  if (!customId) return null;
  const response = (raw.response ?? {}) as Record<string, unknown>;
  const body = ((response.body as Record<string, unknown>) ?? response) as {
    choices?: Choice[];
    usage?: MistralLine["usage"];
  };
  const content = body.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((p) => p.type === "text")
            .map((p) => p.text ?? "")
            .join("")
        : null;
  return { customId, text, usage: body.usage ?? null };
}

export function parseMistralOutput(jsonl: string): MistralLine[] {
  return jsonl
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseMistralLine)
    .filter((x): x is MistralLine => x !== null);
}

/** One synchronous chat call (full price), for the small per-PR check. */
export async function sendMistralChat(
  f: FetchLike,
  key: string,
  model: string,
  body: Record<string, unknown>,
): Promise<{ text: string; usage: MistralLine["usage"] }> {
  const res = await f(`${MISTRAL_API}/chat/completions`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ model, ...body }),
  });
  if (res.status >= 400 && res.status < 500) throw new RejectedError(await readError(res));
  if (!res.ok) throw new Error(await readError(res));
  const line = parseMistralLine(JSON.stringify({ custom_id: "sync", response: await res.json() }));
  return { text: line?.text ?? "", usage: line?.usage ?? null };
}
