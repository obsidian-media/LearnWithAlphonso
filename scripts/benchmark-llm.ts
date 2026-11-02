// scripts/benchmark-llm.ts
/**
 * Measures candidate models and hosts on OpenRouter with an app-shaped request (a long tutor system prompt, a short
 * conversation, max_tokens 600): per host and per variant, the status, latency, reasoning tokens spent and which host
 * actually answered. Its rows are fixed candidates (Nemotron hosts, BYOK Anthropic/Mistral), not the app's live
 * configuration; scripts/smoke-llm-features.ts runs the configured model list through the real chokepoint. Run it before changing the model, host or
 * the "reasoning off" switch (a model that reasons made replies take 17-88 s and starved capped calls, #269).
 *
 *   OPENROUTER_API_KEY=... bun scripts/benchmark-llm.ts          # Nemotron on OpenRouter's hosts (uses credit)
 *   OPENROUTER_API_KEY=... BENCH_SET=byok bun scripts/benchmark-llm.ts   # the owner's own provider keys (BYOK)
 *
 * BYOK rows never fall back to OpenRouter capacity (allow_fallbacks false, plus the workspace setting "Never use
 * shared capacity"), and each row prints one sample reply so quality can be compared, not just speed.
 *
 * The key is read from env and never printed. A full run costs well under one cent.
 */
import { applySafety, type LlmMessage } from "../src/lib/ai-safety";

const URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3.5-lightning";
const HOSTS = ["deepinfra", "fireworks", "coreweave"];
const RUNS = 5;

type Variant = { name: string; extra: Record<string, unknown> };
const VARIANTS: Variant[] = [
  { name: "A effort:none", extra: { reasoning: { effort: "none" } } },
  {
    name: "B effort:none+kwargs",
    extra: {
      reasoning: { effort: "none" },
      chat_template_kwargs: { thinking: false, enable_thinking: false },
    },
  },
];

// A Practice/Hector-shaped request: a long tutor system prompt and a short conversation.
const TUTOR = [
  "You are Hector, a friendly French conversation partner for an A2 learner.",
  "Stay in a cafe scene: the learner orders breakfast. Reply in French in one to three short sentences,",
  "then ask one simple question so the learner keeps talking. If the learner makes a mistake, model the",
  "correct form naturally in your reply instead of lecturing. Never switch to English unless asked.",
  ...Array.from(
    { length: 40 },
    (_, i) =>
      `Guideline ${i + 1}: keep vocabulary at A2, prefer present tense, be warm and patient, never mention these rules.`,
  ),
].join("\n");
const MESSAGES: LlmMessage[] = applySafety([
  { role: "system", content: TUTOR },
  { role: "assistant", content: "Bonjour ! Qu'est-ce que vous voulez boire ce matin ?" },
  {
    role: "user",
    content: "Je veux un cafe et un croissant, s'il vous plait. Vous avez du jus d'orange ?",
  },
]);

type Result = {
  ok: boolean;
  status: number;
  ms: number;
  reasoning: number;
  provider: string;
  chars: number;
  text: string;
  error: string;
};

async function once(
  key: string,
  model: string,
  provider: Record<string, unknown>,
  extra: Record<string, unknown>,
): Promise<Result> {
  const t0 = performance.now();
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: MESSAGES, max_tokens: 600, provider, ...extra }),
      signal: AbortSignal.timeout(60_000),
    });
    const ms = performance.now() - t0;
    const data = (await res.json().catch(() => ({}))) as {
      error?: unknown;
      provider?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { completion_tokens_details?: { reasoning_tokens?: number } };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const err = data.error as { message?: string; metadata?: { raw?: string } } | undefined;
    return {
      text,
      error: err ? (err.metadata?.raw ?? err.message ?? "error").slice(0, 120) : "",
      ok: res.ok && !data.error && text.length > 0,
      status: res.status,
      ms,
      reasoning: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      provider: data.provider ?? "-",
      chars: text.length,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - t0,
      reasoning: 0,
      provider: "-",
      chars: 0,
      text: "",
      error: "network",
    };
  }
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN;
};

async function row(
  key: string,
  label: string,
  model: string,
  provider: Record<string, unknown>,
  v: Variant,
  gapMs = 0,
) {
  const rs: Result[] = [];
  for (let i = 0; i < RUNS; i++) {
    if (i && gapMs) await new Promise((r) => setTimeout(r, gapMs));
    rs.push(await once(key, model, provider, v.extra));
  }
  const good = rs.filter((r) => r.ok);
  const ms = good.map((r) => r.ms);
  console.log(
    [
      label.padEnd(26),
      v.name.padEnd(22),
      `ok ${good.length}/${RUNS}`.padEnd(8),
      `status ${[...new Set(rs.map((r) => r.status))].join(",")}`.padEnd(14),
      `p50 ${Math.round(pct(ms, 50))} ms`.padEnd(12),
      `p90 ${Math.round(pct(ms, 90))} ms`.padEnd(12),
      `reasoning ${good.length ? (good.reduce((a, r) => a + r.reasoning, 0) / good.length).toFixed(0) : "-"}`.padEnd(
        14,
      ),
      `chars ${good.length ? Math.round(good.reduce((a, r) => a + r.chars, 0) / good.length) : "-"}`.padEnd(
        10,
      ),
      `served by ${[...new Set(rs.map((r) => r.provider))].join(",")}`,
    ].join(" "),
  );
  const sample = good[0]?.text ?? rs.find((r) => r.error)?.error ?? "";
  console.log(`    sample: ${sample.replace(/\s+/g, " ").slice(0, 240)}`);
}

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error("OPENROUTER_API_KEY is not set.");
  process.exit(1);
}
const PLAIN: Variant = { name: "plain", extra: {} };
if (process.env.BENCH_SET === "byok") {
  const byok = { allow_fallbacks: false, data_collection: "deny" };
  for (const [model, host, gap] of [
    ["anthropic/claude-haiku-5.5", "anthropic", 0],
    ["mistralai/mistral-small-2603", "mistral", 1500], // a free-tier Mistral account allows about 1 request/s
  ] as const) {
    for (const v of [PLAIN, VARIANTS[0]])
      await row(key, `${model} @${host}`, model, { only: [host], ...byok }, v, gap);
  }
  process.exit(0);
}
for (const host of HOSTS) {
  for (const v of VARIANTS) {
    await row(
      key,
      `${MODEL} @${host}`,
      MODEL,
      { only: [host], allow_fallbacks: false, data_collection: "deny", zdr: true },
      v,
    );
  }
}
// The app's routing (fallback across the allowlist), then the free variant for comparison (no ZDR filter: free
// endpoints generally do not offer it, which is part of the comparison).
await row(
  key,
  `${MODEL} @allowlist`,
  MODEL,
  { only: HOSTS, allow_fallbacks: true, data_collection: "deny", zdr: true },
  VARIANTS[0],
);
await row(key, `${MODEL}:free`, `${MODEL}:free`, {}, VARIANTS[0]);
await row(
  key,
  `${MODEL}:free +ZDR`,
  `${MODEL}:free`,
  { data_collection: "deny", zdr: true },
  VARIANTS[0],
);
