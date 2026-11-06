/**
 * The French and Spanish review panel runner (backlog 0.0-ay; logic in src/lib/content-panel/panel.ts).
 *
 *   bun scripts/content-panel/run.ts                 # dry run: builds the sample, prints the estimate, no network
 *   bun scripts/content-panel/run.ts --check-models  # reads OpenRouter's public model list: ids and prices, no key, no cost
 *   OPENROUTER_API_KEY=... bun scripts/content-panel/run.ts --run [--max-usd 5]
 *
 * Options: --seed (default 20261106), --claude <id|auto>, --mistral <id|auto>, --out <dir>
 * (default .content-panel/, git-ignored: raw replies stay out of git), --max-usd (default 5).
 *
 * The key is read from OPENROUTER_API_KEY only. It is never printed, logged or written: requests
 * carry it in a header, and errors print the status and the body, which does not echo it.
 * Calls are not pinned to a provider, so the owner's own Anthropic and Mistral keys in OpenRouter
 * (BYOK) are used when they are set, and OpenRouter's capacity otherwise. Each reply's serving
 * provider is recorded and reported.
 *
 * Cost control: the run is refused when its estimate (at the models' listed prices, a margin on top)
 * is above --max-usd, and it stops early if the cost OpenRouter reports passes --max-usd.
 */
import fs from "node:fs";
import path from "node:path";
import {
  BATCH_SIZE,
  MODEL_FAMILY,
  batchMessage,
  callCost,
  batches,
  clearCut,
  combine,
  estimateCost,
  parseVerdicts,
  samplePanelItems,
  summaryMarkdown,
  systemPrompt,
  type PanelItem,
  type PanelLang,
  type Pricing,
  type Verdict,
} from "../../src/lib/content-panel/panel";

const API = "https://openrouter.ai/api/v1";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const seed = arg("seed", "20261106");
const maxUsd = Number(arg("max-usd", "5"));
// A cap that is not a positive number ("--max-usd 5$" reads as NaN) makes every comparison with it
// false: the run would be neither refused nor stopped.
if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
  console.error("--max-usd must be a positive number of US dollars.");
  process.exit(1);
}
const outDir = path.resolve(arg("out", ".content-panel"));
/** Assumed prices for the dry run, before the live list is read: above today's list prices on purpose. */
const ASSUMED: Record<"claude" | "mistral", Pricing> = {
  claude: { prompt: 3, completion: 15 },
  mistral: { prompt: 2, completion: 6 },
};
/** The estimate is multiplied by this before it is compared with --max-usd (retries, longer replies). */
const MARGIN = 1.5;

type Model = { id: string; created?: number; pricing?: { prompt?: string; completion?: string } };

const FAMILY = MODEL_FAMILY;
/** Models that cannot turn reasoning off, so they need a large budget (see review()). */
const REASONING_MODEL = /^mistralai\/mistral-large-4/;

async function listModels(): Promise<Model[]> {
  const res = await fetch(`${API}/models`);
  if (!res.ok) throw new Error(`models list: HTTP ${res.status}`);
  return ((await res.json()) as { data: Model[] }).data;
}

function resolveModel(which: "claude" | "mistral", wanted: string, list: Model[]): Model {
  if (wanted !== "auto") {
    const m = list.find((x) => x.id === wanted);
    if (!m) throw new Error(`${which}: ${wanted} is not in OpenRouter's model list`);
    return m;
  }
  const candidates = list
    .filter((m) => FAMILY[which].test(m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  if (!candidates[0]) throw new Error(`${which}: no model matches ${FAMILY[which]}`);
  return candidates[0];
}

const perMillion = (m: Model, fallback: Pricing): Pricing => ({
  prompt: Number(m.pricing?.prompt ?? NaN) * 1e6 || fallback.prompt,
  completion: Number(m.pricing?.completion ?? NaN) * 1e6 || fallback.completion,
});

type Call = {
  text: string;
  provider: string;
  cost: number;
};

async function review(
  key: string,
  model: string,
  price: Pricing,
  lang: PanelLang,
  batch: PanelItem[],
): Promise<Call> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "LearnWithAlphonso content panel",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        // Mistral Large 4 always reasons ("none" is refused) and at "low" still spends about 1,500
        // tokens an item before it answers; with a small budget it returned no answer at all.
        ...(REASONING_MODEL.test(model)
          ? { max_tokens: 40_000, reasoning: { effort: "low", exclude: true } }
          : { max_tokens: Math.max(1500, batch.length * 220) }),
        usage: { include: true },
        provider: { data_collection: "deny" },
        messages: [
          { role: "system", content: systemPrompt(lang) },
          { role: "user", content: batchMessage(batch) },
        ],
      }),
    });
    // A free-tier Mistral account rate-limits back-to-back requests; wait longer each time.
    if (res.status === 429 && attempt < 7) {
      await new Promise((r) => setTimeout(r, 3000 * attempt));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as {
      provider?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string; metadata?: { raw?: string } };
    };
    if (!res.ok)
      throw new Error(
        `${model}: HTTP ${res.status} ${body.error?.message ?? ""} ${body.error?.metadata?.raw ?? ""}`,
      );
    return {
      text: body.choices?.[0]?.message?.content ?? "",
      provider: body.provider ?? "unknown",
      cost: callCost(body.usage, price),
    };
  }
}

const items: Record<PanelLang, PanelItem[]> = {
  fr: samplePanelItems("fr", seed),
  es: samplePanelItems("es", seed),
};
const work = (["fr", "es"] as const).flatMap((lang) =>
  batches(items[lang], BATCH_SIZE).map((batch) => ({ lang, batch })),
);
const all = [...items.fr, ...items.es];
const bySource = (lang: PanelLang) =>
  Object.entries(
    items[lang].reduce<Record<string, number>>((acc, it) => {
      acc[it.source] = (acc[it.source] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
console.log(
  `Items: FR ${items.fr.length} (${bySource("fr")}); ES ${items.es.length} (${bySource("es")})`,
);
console.log(`Batches: ${work.length} per reviewer, ${work.length * 2} calls in all`);

let pricing = ASSUMED;
let models = { claude: "auto", mistral: "auto" };
if (flag("check-models") || flag("run")) {
  const list = await listModels();
  const c = resolveModel("claude", arg("claude", "auto"), list);
  const m = resolveModel("mistral", arg("mistral", "auto"), list);
  models = { claude: c.id, mistral: m.id };
  pricing = { claude: perMillion(c, ASSUMED.claude), mistral: perMillion(m, ASSUMED.mistral) };
  console.log(
    `Claude reviewer: ${c.id} ($${pricing.claude.prompt}/$${pricing.claude.completion} per M tokens)`,
  );
  console.log(
    `Mistral reviewer: ${m.id} ($${pricing.mistral.prompt}/$${pricing.mistral.completion} per M tokens)`,
  );
}
const estClaude = estimateCost(work, pricing.claude);
const estMistral = estimateCost(work, pricing.mistral);
const estimate = (estClaude.usd + estMistral.usd) * MARGIN;
console.log(
  `Estimate: ${estClaude.promptTokens} prompt + ${estClaude.completionTokens} completion tokens per reviewer; ` +
    `Claude $${estClaude.usd.toFixed(2)}, Mistral $${estMistral.usd.toFixed(2)}; with x${MARGIN} margin $${estimate.toFixed(2)} (cap $${maxUsd}).`,
);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `items-${seed}.json`), JSON.stringify(all, null, 1));

if (!flag("run")) {
  console.log(
    `Dry run: no review calls made. Sample written to ${path.join(outDir, `items-${seed}.json`)}.`,
  );
  process.exit(0);
}
if (estimate > maxUsd) {
  console.error(`Refused: the estimate $${estimate.toFixed(2)} is above the cap $${maxUsd}.`);
  process.exit(1);
}
const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error("OPENROUTER_API_KEY is not set.");
  process.exit(1);
}

type Who = "claude" | "mistral";
type LogEntry = {
  batch: number;
  who: Who;
  model: string;
  provider?: string;
  cost?: number;
  errors?: string[];
  text?: string;
  error?: string;
};
const verdicts: Record<Who, Verdict[]> = { claude: [], mistral: [] };
const providers: Record<Who, Set<string>> = { claude: new Set(), mistral: new Set() };
const spentBy: Record<Who, number> = { claude: 0, mistral: 0 };
let log: LogEntry[] = [];
// --only <claude|mistral> reruns one reviewer and keeps the other's replies from the last run of
// this seed (its raw log), so a reviewer that failed does not cost the other one a second pass.
const only = arg("only", "") as Who | "";
const reviewers: Who[] = only ? [only] : ["claude", "mistral"];
const rawPath = path.join(outDir, `raw-${seed}.json`);
if (only && fs.existsSync(rawPath)) {
  const keep = (JSON.parse(fs.readFileSync(rawPath, "utf8")) as LogEntry[]).filter(
    (e) => e.who !== only,
  );
  for (const e of keep) {
    if (e.text === undefined) continue;
    const parsed = parseVerdicts(
      e.text,
      work[e.batch]!.batch.map((it) => it.key),
    );
    verdicts[e.who].push(...parsed.verdicts);
    if (e.provider) providers[e.who].add(e.provider);
    // A reply from before BYOK costs were counted reports $0: count its estimated tokens at list price.
    spentBy[e.who] +=
      e.cost ||
      estimateCost([{ lang: work[e.batch]!.lang, batch: work[e.batch]!.batch }], pricing[e.who])
        .usd;
    models[e.who] = e.model;
  }
  log = keep;
  console.log(`Kept ${keep.length} earlier replies from the other reviewer.`);
}
let spent = 0;
let stopped = false;
for (const [i, w] of work.entries()) {
  for (const who of reviewers) {
    if (spentBy.claude + spentBy.mistral >= maxUsd) {
      stopped = true;
      break;
    }
    const keys = w.batch.map((it) => it.key);
    try {
      const call = await review(key, models[who], pricing[who], w.lang, w.batch);
      spent += call.cost;
      spentBy[who] += call.cost;
      providers[who].add(call.provider);
      const parsed = parseVerdicts(call.text, keys);
      verdicts[who].push(...parsed.verdicts);
      log.push({
        batch: i,
        who,
        model: models[who],
        provider: call.provider,
        cost: call.cost,
        errors: parsed.errors,
        text: call.text,
      });
      console.log(
        `batch ${i + 1}/${work.length} ${who}: ${parsed.verdicts.length}/${keys.length} verdicts, served by ${call.provider}, $${call.cost.toFixed(4)} (total $${spent.toFixed(2)})`,
      );
    } catch (e) {
      log.push({ batch: i, who, model: models[who], error: (e as Error).message });
      console.error(`batch ${i + 1} ${who}: ${(e as Error).message}`);
    }
    // A free-tier Mistral account allows about one request a second (scripts/benchmark-llm.ts).
    if (who === "mistral") await new Promise((r) => setTimeout(r, 2500));
  }
  if (stopped) {
    console.error(`Stopped: cost $${spent.toFixed(2)} reached the cap.`);
    break;
  }
}

const stamp = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(outDir, `raw-${seed}.json`), JSON.stringify(log, null, 1));
fs.writeFileSync(path.join(outDir, `verdicts-${seed}.json`), JSON.stringify(verdicts, null, 1));
const combined = combine(
  all.map((it) => it.key),
  verdicts.claude,
  verdicts.mistral,
);
const textOf = new Map(all.map((it) => [it.key, it.text]));
const md = summaryMarkdown({
  date: stamp,
  seed,
  reviewers: [
    { label: "Claude", model: models.claude, providers: [...providers.claude] },
    { label: "Mistral", model: models.mistral, providers: [...providers.mistral] },
  ],
  itemsByLang: { fr: items.fr.length, es: items.es.length },
  combined,
  costUsd: spentBy.claude + spentBy.mistral,
  textOf: (k) => textOf.get(k) ?? "",
});
fs.writeFileSync(path.join(outDir, `summary-${seed}.md`), md);
console.log(
  `Both defect ${combined.bothDefect.length} (clear-cut ${clearCut(combined).length}), disagree ${combined.disagree.length}, both ok ${combined.bothOk.length}, missing ${combined.missing.length}. Spent $${spent.toFixed(2)} this run; Claude $${spentBy.claude.toFixed(2)} + Mistral $${spentBy.mistral.toFixed(2)} in all.`,
);
