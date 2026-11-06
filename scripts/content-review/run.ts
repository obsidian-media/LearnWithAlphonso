/**
 * The full content review runner (docs/CONTENT-PLAYBOOK.md, "The full review"; logic in
 * src/lib/content-review/). Every command is a dry run unless it says otherwise.
 *
 *   bun scripts/content-review/run.ts inventory          # counts per kind and course, writes .content-review/inventory.json
 *   bun scripts/content-review/run.ts plan               # the cost plan, built from the real prompts
 *   bun scripts/content-review/run.ts status             # the spend ledger and open jobs
 *   bun scripts/content-review/run.ts submit <phase> [--limit N] [--sample N] [--go]
 *                                                        # --limit: first N requests; --sample (review only): a seeded N-item pilot
 *   bun scripts/content-review/run.ts collect [--go]     # polls open jobs, reads results, settles the ledger
 *   bun scripts/content-review/run.ts route              # judge rulings -> checked fixes, owner list, refusals
 *   bun scripts/content-review/run.ts report             # summary, blind-sample error rate with its 95% interval
 *   bun scripts/content-review/run.ts snapshot           # BEFORE editing content: saves every item's hash
 *   bun scripts/content-review/run.ts check [--go] [--max-usd 2] [--name <branch>]
 *                                                        # AFTER editing: Claude + Mistral read only the changed items
 *
 * Phases: review | second | judge | rewrite-explanation | rewrite-cloze | verify | blind-sonnet |
 * blind-mistral | blind-judge (see the playbook for what each reads and writes).
 *
 * Money: `submit --go` is the only command that can spend. It needs CONTENT_REVIEW_APPROVED=yes
 * (set by the owner's "content run approved"), reserves the submission's WORST case in the ledger
 * (src/lib/content-review/ledger.ts: US$99 hard cap, persisted, mirrored outside the checkout)
 * BEFORE sending, and is refused when that would pass the cap. Phases before verification also
 * leave KEEP_BACK_USD untouched so the measurement can always be paid for.
 *
 * Keys: ANTHROPIC_API_KEY / MISTRAL_API_KEY, or ANTHROPIC_API_KEY_FILE / MISTRAL_API_KEY_FILE (a
 * path), or .content-review/config.json {"anthropicKeyFile": "...", "mistralKeyFile": "..."}
 * (git-ignored). Read into memory at the point of use; never printed, logged or written.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  fullInventory,
  inventoryCounts,
  type ReviewItem,
} from "../../src/lib/content-review/inventory";
import { FLAG, flagCounts, withGateFlags } from "../../src/lib/content-review/gates";
import {
  HARD_CAP_USD,
  Ledger,
  withLock,
  type CappedProvider,
  type LedgerPaths,
} from "../../src/lib/content-review/ledger";
import {
  anthropicUsageUsd,
  mistralUsageUsd,
  priceOf,
  worstCaseUsd,
  type RequestShape,
} from "../../src/lib/content-review/pricing";
import {
  RejectedError,
  buildRequest,
  sendMessage,
  createBatch,
  getBatch,
  getResults,
  resultText,
  splitBatches,
  type BatchRequest,
} from "../../src/lib/content-review/anthropic-batch";
import {
  MISTRAL_DONE,
  buildMistralRequest,
  createMistralJob,
  downloadMistralFile,
  getMistralJob,
  parseMistralOutput,
  MISTRAL_OUTPUT_TOKENS_PER_ITEM,
  MAX_INLINE_REQUESTS,
  sendMistralChat,
} from "../../src/lib/content-review/mistral-batch";
import {
  chunk,
  maxTokensFor,
  parseChunkReply,
  systemFor,
  userMessage,
  type Chunk,
  type Verdict,
} from "../../src/lib/content-review/review";
import {
  judgeContext,
  judgeSystem,
  parseRulings,
  rewriteSystem,
  route,
  type Ruling,
} from "../../src/lib/content-review/judge";
import { answerText, checkFixes, overlayJson } from "../../src/lib/content-review/fixes";
import {
  blindSample,
  missEstimate,
  secondOpinionSet,
  stratifiedDraw,
  wilson,
} from "../../src/lib/content-review/sampling";
import { ASSUME, MODEL, costPlan, planMarkdown } from "../../src/lib/content-review/plan";

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "plan";
const arg = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const flag = (name: string) => argv.includes(`--${name}`);

const STATE = path.resolve(arg("state", ".content-review"));
const SEED = arg("seed", "20261106");
/** Left untouched by every phase before verification: the measured error rate must stay affordable. */
const KEEP_BACK_USD = 12;
const VERIFY_PHASES = new Set(["verify", "blind-sonnet", "blind-mistral", "blind-judge"]);

/** One ledger per provider (Anthropic US$99, Mistral US$10; neither borrows from the other). */
const ledgerPaths = (p: CappedProvider): LedgerPaths => ({
  primary: path.join(STATE, `ledger-${p}.json`),
  mirror: path.join(
    process.env.CONTENT_REVIEW_LEDGER_MIRROR_DIR ?? path.join(os.homedir(), ".lwa-content-review"),
    `ledger-${p}.json`,
  ),
  stateDir: STATE,
  marker: path.join(STATE, `started-${p}`),
});
const openLedger = (p: CappedProvider) => Ledger.open(ledgerPaths(p), { provider: p });
const PROVIDERS: CappedProvider[] = ["anthropic", "mistral"];
const ledgerLine = (p: CappedProvider) => {
  const st = openLedger(p).status();
  return `${p}: settled ${st.settledUsd.toFixed(2)}, open ${st.openUsd.toFixed(2)}, remaining ${st.remainingUsd.toFixed(2)} of ${st.capUsd}`;
};

// ---- Files ----------------------------------------------------------------------------------------

const readJson = <T>(file: string, fallback: T): T =>
  fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback;
const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
};

type Job = {
  ref: string;
  phase: string;
  provider: "anthropic" | "mistral";
  model: string;
  reservedUsd: number;
  status: "reserved" | "submitted" | "unknown" | "collected" | "released";
  remoteId?: string;
  chunks: Chunk[];
  createdAt: string;
};
type State = { baselineSavedAt?: string; jobs: Job[] };
const statePath = path.join(STATE, "state.json");
const loadState = () => readJson<State>(statePath, { jobs: [] });
const saveState = (s: State) => writeJson(statePath, s);

const verdictStore = (phase: string) => path.join(STATE, "verdicts", `${phase}.json`);
const loadVerdicts = (phase: string) =>
  new Map(Object.entries(readJson<Record<string, Verdict>>(verdictStore(phase), {})));
const rulingStore = (phase: string) => path.join(STATE, "rulings", `${phase}.json`);
const loadRulings = (phase: string) =>
  new Map(Object.entries(readJson<Record<string, Ruling>>(rulingStore(phase), {})));
const RULING_PHASES = new Set([
  "judge",
  "judge-retry",
  "rewrite-explanation",
  "rewrite-cloze",
  "rewrite-card-meaning",
  "rewrite-drill",
  "judge2",
  "blind-judge",
]);
/** Rulings in the order route applies them; a later phase's ruling on the same item wins. */
const ROUTE_PHASES = [
  "judge",
  "judge-retry",
  "rewrite-card-meaning",
  "rewrite-explanation",
  "rewrite-cloze",
  "rewrite-drill",
  "judge2",
];
/** French and Spanish word cards have no authored meaning at all: a rewrite task, not a judgement. */
const needsMeaning = (it: ReviewItem) =>
  it.kind === "card" && it.course !== "en" && !String(it.data.meaning ?? "").trim();
/**
 * Kinds that get no Mistral second opinion (cost plan trim 3, applied 2026-11-06 because the
 * measured Claude flag rate, 46%, would put the second opinion above Mistral's US$10 cap). Their
 * Claude flags still go to the Opus judge, and every resulting change is re-read in phase 7.
 */
const SECOND_OPINION_SKIP = new Set(["card", "lesson-meta", "unit-meta"]);
const verifyHashesPath = () => path.join(STATE, "verify-hashes.json");

function inventory(): ReviewItem[] {
  return withGateFlags(fullInventory());
}

// ---- Keys -------------------------------------------------------------------------------------------

function loadKey(provider: "anthropic" | "mistral"): string {
  const env = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "MISTRAL_API_KEY";
  const direct = process.env[env]?.trim();
  if (direct) return direct;
  const config = readJson<Record<string, string>>(path.join(STATE, "config.json"), {});
  const file =
    process.env[`${env}_FILE`] ??
    config[provider === "anthropic" ? "anthropicKeyFile" : "mistralKeyFile"];
  if (!file)
    throw new Error(
      `${env} is not set, and no key file is configured (${env}_FILE or .content-review/config.json).`,
    );
  const key = fs.readFileSync(file, "utf8").trim();
  if (!key) throw new Error(`The ${provider} key file is empty.`);
  return key;
}

// ---- Phases -------------------------------------------------------------------------------------------

type PhaseWork = {
  provider: "anthropic" | "mistral";
  model: string;
  chunks: Chunk[];
  /** Request bodies, one per chunk, same order. */
  build: (c: Chunk) => BatchRequest;
};

function defectIds(m: Map<string, Verdict>) {
  return new Set([...m.values()].filter((v) => v.verdict === "defect").map((v) => v.id));
}

function phaseWork(phase: string, items: ReviewItem[]): PhaseWork {
  const done = RULING_PHASES.has(phase)
    ? new Set(loadRulings(phase).keys())
    : new Set(loadVerdicts(phase).keys());
  const todo = (list: ReviewItem[]) => list.filter((it) => !done.has(it.id));
  const claude = loadVerdicts("review");
  const mistral = loadVerdicts("second");
  const sonnet = (list: ReviewItem[], role: "review" | "verify") => ({
    provider: "anthropic" as const,
    model: MODEL.review,
    chunks: chunk(todo(list), phase),
    build: (c: Chunk) => buildRequest(c, { model: MODEL.review, role, effort: "low" }),
  });
  const opus = (
    list: ReviewItem[],
    system: (c: Chunk) => string,
    contextOf?: (it: ReviewItem) => string,
  ) => ({
    provider: "anthropic" as const,
    model: MODEL.judge,
    chunks: chunk(todo(list), phase),
    build: (c: Chunk) =>
      buildRequest(c, {
        model: MODEL.judge,
        effort: "medium",
        system: system(c),
        user: userMessage(c, contextOf),
        maxTokens: maxTokensFor(c, ASSUME.maxOut.judge),
      }),
  });
  const mistralWork = (list: ReviewItem[]) => ({
    provider: "mistral" as const,
    model: MODEL.mistral,
    chunks: chunk(todo(list), phase),
    build: (c: Chunk) => {
      const r = buildMistralRequest(c);
      return { custom_id: r.custom_id, params: r.body };
    },
  });
  const ctx = (it: ReviewItem) => judgeContext(it, claude, mistral);

  switch (phase) {
    case "review": {
      // --sample N: a seeded draw across course and kind, for the pilot that calibrates the plan.
      const n = Number(arg("sample", "0"));
      return sonnet(
        n > 0
          ? stratifiedDraw(items, n, `${SEED}:pilot`, (it) => `${it.course}|${it.kind}`)
          : items,
        "review",
      );
    }
    case "second": {
      // An item with no Claude verdict goes to Mistral as "flagged": on a half-done review that would
      // send thousands of unreviewed items. Re-submit the review phase until it is (nearly) complete.
      // --pilot: only the items the (pilot) review has read, to measure Mistral's cost per item.
      const pilot = flag("pilot");
      if (!pilot && claude.size < items.length * 0.99)
        throw new Error(
          `The review phase has verdicts for ${claude.size} of ${items.length} items: finish it (re-submit review) first.`,
        );
      const pool = (pilot ? items.filter((it) => claude.has(it.id)) : items).filter(
        (it) => !SECOND_OPINION_SKIP.has(it.kind),
      );
      const s = secondOpinionSet(pool, claude, ASSUME.controlRate, SEED);
      return mistralWork([...s.flagged, ...s.control]);
    }
    case "judge": {
      const ids = new Set([...defectIds(claude), ...defectIds(mistral)]);
      for (const it of items) if (it.flags?.includes(FLAG.knownSecondAnswer)) ids.add(it.id);
      return opus(
        items.filter(
          (it) =>
            ids.has(it.id) &&
            !needsMeaning(it) &&
            // --ready: only items whose second opinion is in (or that get none), so the judge can
            // run in waves while the slow synchronous Mistral pass is still going.
            (!flag("ready") || SECOND_OPINION_SKIP.has(it.kind) || mistral.has(it.id)),
        ),
        (c) => judgeSystem(c.course),
        ctx,
      );
    }
    case "judge-retry": {
      // Fixes the checks refused: the judge tries again, told exactly why.
      const refused = readJson<{ fix: { id: string }; why: string[] }[]>(
        path.join(STATE, "refused.json"),
        [],
      );
      const why = new Map(refused.map((r) => [r.fix.id, r.why.join("; ")]));
      return opus(
        items.filter((it) => why.has(it.id)),
        (c) => judgeSystem(c.course),
        (it) => `${ctx(it)}
YOUR PREVIOUS PATCH WAS REFUSED: ${why.get(it.id)}. Write a patch that keeps every rule, or decide "keep" or "owner".`,
      );
    }
    case "judge2": {
      // Phase 7 round 2: a changed item the fresh re-read flagged again.
      const verify = loadVerdicts("verify");
      const hashes = readJson<Record<string, string>>(verifyHashesPath(), {});
      const again = items.filter(
        (it) => verify.get(it.id)?.verdict === "defect" && hashes[it.id] === it.hash,
      );
      return opus(
        again,
        (c) => judgeSystem(c.course),
        (it) => `${judgeContext(it, verify, new Map())}
This item was already fixed once by the review; the fresh re-read above flagged the CURRENT text.`,
      );
    }
    case "rewrite-card-meaning": {
      const list = items.filter(needsMeaning);
      return {
        provider: "anthropic",
        model: MODEL.review,
        chunks: chunk(todo(list), phase),
        build: (c) =>
          buildRequest(c, {
            model: MODEL.review,
            effort: "low",
            system: rewriteSystem(c.course, "card-meaning"),
            user: userMessage(c, ctx),
            maxTokens: maxTokensFor(c, ASSUME.maxOut.explanation),
          }),
      };
    }
    case "rewrite-explanation": {
      const fixed = loadRulings("judge");
      const list = items.filter(
        (it) =>
          it.flags?.includes(FLAG.genericExplanation) && !fixed.get(it.id)?.patch?.explanation,
      );
      return {
        provider: "anthropic",
        model: MODEL.review,
        chunks: chunk(todo(list), phase),
        build: (c) =>
          buildRequest(c, {
            model: MODEL.review,
            effort: "low",
            system: rewriteSystem(c.course, "explanation"),
            user: userMessage(c, ctx),
            maxTokens: maxTokensFor(c, ASSUME.maxOut.explanation),
          }),
      };
    }
    case "rewrite-drill":
      // Not the conjugation engine (cost plan): the B1-C1 packs need tenses and moods it does not
      // have, and several contrast two verbs or tenses on purpose. fixes.ts holds each patch to the
      // gate's own "is a form of the bracketed verb" check.
      return opus(
        items.filter((it) => it.flags?.includes(FLAG.drillNonForm)),
        (c) => rewriteSystem(c.course, "drill-options"),
        ctx,
      );
    case "rewrite-cloze":
      return opus(
        items.filter((it) => it.flags?.includes(FLAG.clozeFromPool)),
        (c) => rewriteSystem(c.course, "cloze-options"),
        ctx,
      );
    case "verify": {
      const baseline = readJson<Record<string, string>>(path.join(STATE, "baseline.json"), {});
      if (!Object.keys(baseline).length)
        throw new Error("No baseline: the review phase saves it on its first submit.");
      // Re-read every item whose text differs from the baseline and has no verdict for its CURRENT
      // text (a later fix makes it due again).
      const hashes = readJson<Record<string, string>>(verifyHashesPath(), {});
      const due = items.filter((it) => baseline[it.id] !== it.hash && hashes[it.id] !== it.hash);
      const verifyWork = sonnet(due, "verify");
      verifyWork.chunks = chunk(due, phase);
      return verifyWork;
    }
    case "blind-sonnet":
      return sonnet(blindSample(items, ASSUME.blindPerCourse, `${SEED}:blind`), "verify");
    case "blind-mistral":
      return mistralWork(blindSample(items, ASSUME.blindPerCourse, `${SEED}:blind`));
    case "blind-judge": {
      const bs = loadVerdicts("blind-sonnet");
      const bm = loadVerdicts("blind-mistral");
      return opus(
        blindSample(items, ASSUME.blindPerCourse, `${SEED}:blind`),
        (c) => judgeSystem(c.course),
        (it) => judgeContext(it, bs, bm),
      );
    }
    default:
      throw new Error(`Unknown phase ${phase}`);
  }
}

/** A request's text, split the way pricing.ts bounds it. */
function shapeOf(params: Record<string, unknown>): RequestShape {
  const p = params as {
    system?: { text: string }[];
    messages: { content: string }[];
    max_tokens: number;
  };
  // Anthropic: the system prompt is the cached prefix. Mistral: no cache, and its system prompt is one
  // of the messages, so everything is uncached input.
  const sys = Array.isArray(p.system) ? p.system.map((x) => x.text).join("") : "";
  return {
    cached: sys,
    uncached: p.messages.map((m) => m.content).join(""),
    messages: p.messages.length + 1,
    maxTokens: p.max_tokens,
  };
}

function worstOf(model: string, reqs: BatchRequest[], batch = true): number {
  return reqs.reduce((sum, r) => sum + worstCaseUsd(model, shapeOf(r.params), batch), 0);
}

// ---- Commands -------------------------------------------------------------------------------------------

/**
 * The second opinion without Mistral's batch API (the owner's account refuses batch jobs with
 * HTTP 402 until billing is enabled): one synchronous call per request, each reserved at its
 * FULL-price worst case on the Mistral ledger before it is sent and settled from its usage at the
 * full listed price. Results go to the same verdict store, so a later batch run skips them.
 */
// Its own lock: it only touches the Mistral ledger and its verdict file, and it runs for hours.
async function submitMistralSync(phase: string, work: PhaseWork, chunks: Chunk[], key: string) {
  await withLock(path.join(STATE, "run-mistral.lock"), async () => {
    const ledger = openLedger("mistral");
    const store = Object.fromEntries(loadVerdicts(phase));
    const raw = readJson<unknown[]>(path.join(STATE, "raw", `${phase}-sync.json`), []);
    let spent = 0;
    // --concurrency N: N requests in flight (one process, so reservations stay serialised).
    const concurrency = Math.max(1, Math.min(8, Number(arg("concurrency", "1")) || 1));
    let next = 0;
    let failed: unknown = null;
    const one = async (c: Chunk) => {
      const req = buildMistralRequest(c);
      const worst = worstCaseUsd(work.model, shapeOf(req.body), false);
      const ref = `${phase}-sync-${c.customId}-${Date.now().toString(36)}`;
      ledger.reserve(ref, worst, { phase, provider: "mistral", model: work.model });
      let res: Awaited<ReturnType<typeof sendMistralChat>>;
      for (let attempt = 1; ; attempt++) {
        try {
          res = await sendMistralChat(fetch, key, work.model, req.body);
          break;
        } catch (e) {
          const msg = (e as Error).message;
          // 429: rate limit (nothing billed); wait longer each time. Anything else stops the run.
          if (e instanceof RejectedError && /HTTP 429/.test(msg) && attempt < 8) {
            await new Promise((r) => setTimeout(r, 4000 * attempt));
            continue;
          }
          if (e instanceof RejectedError) ledger.release(ref, `rejected: ${msg}`);
          else console.error(`${ref}: outcome unknown, reservation KEPT: ${msg}`);
          writeJson(verdictStore(phase), store);
          throw e;
        }
      }
      const cost = res.usage ? mistralUsageUsd(work.model, res.usage, false) : worst;
      spent += cost;
      ledger.settle(ref, cost);
      const parsed = parseChunkReply(c, res.text);
      for (const v of parsed.verdicts) store[v.id] = v;
      raw.push({
        customId: c.customId,
        items: c.items.length,
        usage: res.usage,
        missing: parsed.missing.length,
        text: res.text,
      });
      writeJson(verdictStore(phase), store);
      writeJson(path.join(STATE, "raw", `${phase}-sync.json`), raw);
      console.log(
        `${c.customId}: ${parsed.verdicts.length}/${c.items.length}, ${cost.toFixed(4)} (${JSON.stringify(res.usage)}); this run ${spent.toFixed(2)}; mistral remaining ${ledger.status().remainingUsd.toFixed(2)}`,
      );
      await new Promise((r) => setTimeout(r, 1500));
    };
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (!failed && next < chunks.length) {
          const c = chunks[next++]!;
          try {
            await one(c);
          } catch (e) {
            failed = e;
          }
        }
      }),
    );
    if (failed) throw failed;
  });
}

async function submit(phase: string) {
  const items = inventory();
  const work = phaseWork(phase, items);
  const limit = Number(arg("limit", "0"));
  if (!Number.isInteger(limit) || limit < 0)
    throw new Error("--limit must be a whole number of requests");
  const chunks = limit ? work.chunks.slice(0, limit) : work.chunks;
  if (!chunks.length) {
    console.log(`${phase}: nothing left to submit.`);
    return;
  }
  const reqs = chunks.map(work.build);
  const worst = worstOf(work.model, reqs);
  const nItems = chunks.reduce((a, c) => a + c.items.length, 0);
  console.log(
    `${phase}: ${nItems} items in ${reqs.length} requests to ${work.model}; worst case $${worst.toFixed(2)}.`,
  );
  if (!flag("go")) {
    console.log("Dry run: nothing sent. Add --go (with CONTENT_REVIEW_APPROVED=yes) to submit.");
    return;
  }
  if (process.env.CONTENT_REVIEW_APPROVED !== "yes")
    throw new Error(
      "Refused: CONTENT_REVIEW_APPROVED=yes is not set (the owner approves the run).",
    );
  const key = loadKey(work.provider);
  if (work.provider === "mistral" && flag("sync"))
    return submitMistralSync(phase, work, chunks, key);
  await withLock(path.join(STATE, "run.lock"), async () => {
    const ledger = openLedger(work.provider);
    const state = loadState();
    if (phase === "review" && !fs.existsSync(path.join(STATE, "baseline.json"))) {
      writeJson(
        path.join(STATE, "baseline.json"),
        Object.fromEntries(items.map((it) => [it.id, it.hash])),
      );
      state.baselineSavedAt = new Date().toISOString();
    }
    const groups =
      work.provider === "anthropic"
        ? splitBatches(reqs).map((g) =>
            chunks.filter((c) => g.some((r) => r.custom_id === c.customId)),
          )
        : Array.from({ length: Math.ceil(chunks.length / MAX_INLINE_REQUESTS) }, (_, i) =>
            chunks.slice(i * MAX_INLINE_REQUESTS, (i + 1) * MAX_INLINE_REQUESTS),
          );
    for (const group of groups) {
      const groupReqs = group.map(work.build);
      const ref = `${phase}-${Date.now().toString(36)}`;
      const usd = worstOf(work.model, groupReqs);
      ledger.reserve(ref, usd, {
        phase,
        provider: work.provider,
        model: work.model,
        // The reserve for the final sample lives inside the Anthropic cap only.
        keepBackUsd: work.provider === "anthropic" && !VERIFY_PHASES.has(phase) ? KEEP_BACK_USD : 0,
      });
      const job: Job = {
        ref,
        phase,
        provider: work.provider,
        model: work.model,
        reservedUsd: usd,
        status: "reserved",
        chunks: group,
        createdAt: new Date().toISOString(),
      };
      state.jobs.push(job);
      saveState(state);
      try {
        if (work.provider === "anthropic")
          job.remoteId = (await createBatch(fetch, key, groupReqs)).id;
        else
          job.remoteId = (
            await createMistralJob(fetch, key, work.model, group.map(buildMistralRequest), {
              phase,
              ref,
            })
          ).id;
        job.status = "submitted";
        if (phase === "verify") {
          // The text each verdict will be about: a later change to the item makes it due again.
          const hashes = readJson<Record<string, string>>(verifyHashesPath(), {});
          for (const c of group) for (const it of c.items) hashes[it.id] = it.hash;
          writeJson(verifyHashesPath(), hashes);
        }
        console.log(
          `Submitted ${ref} (${job.remoteId}); reserved $${usd.toFixed(2)}, remaining $${ledger.status().remainingUsd.toFixed(2)}.`,
        );
      } catch (e) {
        if (e instanceof RejectedError) {
          ledger.release(ref, `rejected: ${e.message}`);
          job.status = "released";
          console.error(`${ref} rejected, reservation released: ${e.message}`);
        } else {
          job.status = "unknown";
          console.error(
            `${ref}: outcome unknown, reservation KEPT (check the provider console): ${(e as Error).message}`,
          );
        }
      }
      saveState(state);
    }
  });
}

async function collect() {
  const state = loadState();
  const open = state.jobs.filter((j) => j.status === "submitted");
  if (!open.length) return console.log("No open jobs.");
  if (!flag("go")) return console.log(`${open.length} open jobs. Add --go to poll them (no cost).`);
  await withLock(path.join(STATE, "run.lock"), async () => {
    for (const job of open) {
      const ledger = openLedger(job.provider);
      const key = loadKey(job.provider);
      const byCustom = new Map(job.chunks.map((c) => [c.customId, c]));
      const texts: { chunk: Chunk; text: string }[] = [];
      // Raw replies with their usage (git-ignored): the token rates that re-project the plan.
      const raw: {
        customId: string;
        items: number;
        type: string;
        usage?: unknown;
        stop?: string;
        text?: string;
      }[] = [];
      let cost = 0;
      if (job.provider === "anthropic") {
        const info = await getBatch(fetch, key, job.remoteId!);
        if (info.processing_status !== "ended") {
          console.log(
            `${job.ref}: ${info.processing_status} ${JSON.stringify(info.request_counts ?? {})}`,
          );
          continue;
        }
        for (const r of await getResults(fetch, key, info)) {
          const c = byCustom.get(r.custom_id);
          if (!c) continue;
          raw.push({
            customId: r.custom_id,
            items: c.items.length,
            type: r.result.type,
            usage: r.result.message?.usage,
            stop: r.result.message?.stop_reason,
            text:
              r.result.type === "succeeded"
                ? resultText(r)
                : JSON.stringify(r.result.error ?? null),
          });
          if (r.result.type === "succeeded") {
            cost += anthropicUsageUsd(job.model, r.result.message?.usage ?? {});
            texts.push({ chunk: c, text: resultText(r) });
          }
        }
      } else {
        const info = await getMistralJob(fetch, key, job.remoteId!);
        if (!MISTRAL_DONE.has(info.status)) {
          console.log(
            `${job.ref}: ${info.status} ${info.succeeded_requests ?? 0}/${info.total_requests ?? "?"}`,
          );
          continue;
        }
        const lines = info.output_file
          ? parseMistralOutput(await downloadMistralFile(fetch, key, info.output_file))
          : [];
        for (const l of lines) {
          const c = byCustom.get(l.customId);
          if (!c) continue;
          // No usage on a line: charge that request's worst case, never zero.
          cost += l.usage
            ? mistralUsageUsd(job.model, l.usage)
            : worstCaseUsd(job.model, {
                cached: "",
                uncached: systemFor(c) + userMessage(c),
                messages: 2,
                maxTokens: maxTokensFor(c, MISTRAL_OUTPUT_TOKENS_PER_ITEM),
              });
          raw.push({
            customId: l.customId,
            items: c.items.length,
            type: l.text ? "succeeded" : "no-text",
            usage: l.usage ?? undefined,
            text: l.text ?? undefined,
          });
          if (l.text) texts.push({ chunk: c, text: l.text });
        }
      }
      let got = 0;
      let missing = 0;
      if (RULING_PHASES.has(job.phase)) {
        const store = Object.fromEntries(loadRulings(job.phase));
        for (const t of texts) {
          const p = parseRulings(t.chunk, t.text);
          for (const r of p.rulings) store[r.id] = { ...r, at: job.createdAt };
          got += p.rulings.length;
          missing += p.missing.length;
        }
        writeJson(rulingStore(job.phase), store);
      } else {
        const store = Object.fromEntries(loadVerdicts(job.phase));
        for (const t of texts) {
          const p = parseChunkReply(t.chunk, t.text);
          for (const v of p.verdicts) store[v.id] = v;
          got += p.verdicts.length;
          missing += p.missing.length;
        }
        writeJson(verdictStore(job.phase), store);
      }
      writeJson(path.join(STATE, "raw", `${job.ref}.json`), raw);
      ledger.settle(job.ref, cost, `${got} parsed, ${missing} missing`);
      job.status = "collected";
      saveState(state);
      console.log(
        `${job.ref}: ${got} results, ${missing} missing (re-submit the phase to retry them); cost $${cost.toFixed(4)}; remaining $${ledger.status().remainingUsd.toFixed(2)}.`,
      );
    }
  });
}

function routeCommand() {
  const items = new Map(inventory().map((it) => [it.id, it]));
  // In the order they were made (phase order breaks ties and covers rulings from before `at`):
  // a rewrite submitted before a judge wave must not override that wave's later fix.
  const rulings = ROUTE_PHASES.flatMap((p, phaseIndex) =>
    [...loadRulings(p).values()].map((r) => ({ r, phaseIndex })),
  )
    .sort((a, b) => (a.r.at ?? "").localeCompare(b.r.at ?? "") || a.phaseIndex - b.phaseIndex)
    .map((x) => x.r);
  // Rulings on one item from several phases (the judge, then a rewrite) are merged: fix patches
  // combine field by field, the later phase winning a field both set; the lowest confidence and any
  // key change carry over. A later keep or owner never discards an earlier fix.
  const latest = new Map<string, Ruling>();
  for (const r of rulings) {
    const prev = latest.get(r.id);
    if (!prev) latest.set(r.id, r);
    else if (prev.decision === "fix" && r.decision === "fix")
      latest.set(r.id, {
        ...r,
        patch: { ...prev.patch, ...r.patch },
        confidence: Math.min(prev.confidence, r.confidence),
        keyChange: prev.keyChange || r.keyChange,
        category: r.keyChange ? r.category : prev.keyChange ? prev.category : r.category,
        reason: `${prev.reason} / ${r.reason}`,
      });
    else if (r.decision === "fix" || prev.decision !== "fix") latest.set(r.id, r);
  }
  const second = loadVerdicts("second");
  const routed = route([...latest.values()], (id) => second.get(id)?.verdict === "ok");
  const checked = checkFixes(items, routed.fixes);
  // A key change gives the question's word card a new term: a card fix written for the old term
  // would land on the new card with the wrong meaning. Drop it; the new card is re-read in verify.
  const orphaned = new Set<string>();
  for (const f of checked.ok) {
    if (!f.keyChange || !f.id.includes(":question:")) continue;
    const it = items.get(f.id)!;
    const lesson = f.id.slice(f.id.indexOf(":question:") + 10).split("/")[0];
    const old = (answerText(it.data) ?? "").trim().toLowerCase();
    if (old) orphaned.add(`${it.course}:card:${lesson}/${old}`);
  }
  // A fix that passed these checks but failed a CI gate once applied (recorded by hand in
  // .content-review/gate-refused.json, {id: the gate's message}) goes back to judge-retry.
  const gateRefused = readJson<Record<string, string>>(path.join(STATE, "gate-refused.json"), {});
  for (const f of [...checked.ok]) {
    const why = orphaned.has(f.id)
      ? "its card term was changed by a key change in the same lesson"
      : gateRefused[f.id];
    if (!why) continue;
    checked.ok.splice(checked.ok.indexOf(f), 1);
    checked.refused.push({ fix: f, why: [why] });
  }
  for (const course of ["en", "fr", "es"])
    fs.writeFileSync(
      path.join(STATE, `fixes-${course}.json`),
      overlayJson(checked.ok.filter((f) => f.id.startsWith(`${course}:`))),
    );
  writeJson(path.join(STATE, "refused.json"), checked.refused);
  // Kinds the build-time overlay (src/data/review-fixes.ts) applies; the rest (story campaigns,
  // scenarios, podcast quizzes) are applied by hand from manual-fixes.json.
  const OVERLAY_KINDS = /:(question|card|lesson-meta|unit-meta|placement):/;
  const manual = checked.ok.filter((f) => !OVERLAY_KINDS.test(f.id));
  writeJson(path.join(STATE, "manual-fixes.json"), manual);
  // --levels A1,A2 (and "other" for items without a CEFR level) applies only those items' fixes,
  // so the delivery PRs can be split by language and level. --courses fr limits the language.
  const levels = new Set(arg("levels", "A1,A2,B1,B2,C1,other").split(","));
  const courses = new Set(arg("courses", "en,fr,es").split(","));
  const CEFR = new Set(["A1", "A2", "B1", "B2", "C1"]);
  const inLevels = (id: string) => {
    const it = items.get(id);
    if (!it || !courses.has(it.course)) return false;
    return levels.has(CEFR.has(it.level) ? it.level : "other");
  };
  if (flag("apply")) {
    for (const course of ["en", "fr", "es"]) {
      const file = path.resolve("src", "data", "review-fixes", `${course}.json`);
      const current = readJson<
        Record<
          string,
          { patch: Record<string, string | string[]>; reason: string; keyChange?: boolean }
        >
      >(file, {});
      for (const f of checked.ok.filter(
        (x) => x.id.startsWith(`${course}:`) && OVERLAY_KINDS.test(x.id) && inLevels(x.id),
      )) {
        const prev = current[f.id];
        current[f.id] = {
          patch: { ...(prev?.patch ?? {}), ...f.patch },
          // Re-running route is idempotent: a reason already recorded is not appended again.
          reason:
            !prev || prev.reason.includes(f.reason)
              ? (prev?.reason ?? f.reason)
              : `${prev.reason} / ${f.reason}`,
          ...(f.keyChange || prev?.keyChange ? { keyChange: true } : {}),
        };
      }
      const sorted = Object.fromEntries(
        Object.keys(current)
          .sort()
          .map((k) => [k, current[k]]),
      );
      fs.writeFileSync(
        file,
        `${JSON.stringify(sorted, null, 1)}
`,
      );
    }
    console.log(
      "Applied to src/data/review-fixes/*.json; re-export the bundles and run the gates.",
    );
  }
  const owner = [
    ...routed.owner,
    ...checked.refused.map((r) => ({
      id: r.fix.id,
      decision: "owner" as const,
      confidence: 0,
      reason: `fix refused: ${r.why.join("; ")}`,
    })),
  ];
  fs.writeFileSync(
    path.join(STATE, "owner-list.md"),
    [
      "# Owner list",
      "",
      "| Item | Why it needs you |",
      "| --- | --- |",
      ...owner.map((o) => `| \`${o.id}\` | ${o.reason.replace(/\|/g, "\\|")} |`),
      "",
    ].join("\n"),
  );
  console.log(
    `Key changes: ${routed.keyChanges.applied} applied, ${routed.keyChanges.listed} held for the owner. Fixes ${checked.ok.length} (legacy prompt needed: ${checked.ok.filter((f) => f.needsLegacyPrompt).length}), kept ${routed.kept.length}, owner ${owner.length} (${checked.refused.length} of them refused fixes).`,
  );
}

function report() {
  const items = inventory();
  const blind = blindSample(items, ASSUME.blindPerCourse, `${SEED}:blind`);
  const bj = loadRulings("blind-judge");
  const judged = blind.filter((it) => bj.has(it.id));
  const defects = judged.filter((it) => bj.get(it.id)!.decision !== "keep").length;
  const w = wilson(defects, judged.length);
  const claude = loadVerdicts("review");
  const s = secondOpinionSet(items, claude, ASSUME.controlRate, SEED);
  const confirmed = new Set(
    [...loadRulings("judge").values()].filter((r) => r.decision !== "keep").map((r) => r.id),
  );
  const passed = items.length - s.flagged.length;
  const miss = missEstimate(
    s.control.map((it) => it.id),
    confirmed,
    passed,
  );

  console.log(
    `Blind sample: ${defects}/${judged.length} defects, ${(w.rate * 100).toFixed(1)}% (95% CI ${(w.low * 100).toFixed(1)}-${(w.high * 100).toFixed(1)}%).`,
  );
  console.log(
    `Claude miss estimate: ${miss.misses}/${miss.sampled} control items, ${(miss.rate * 100).toFixed(1)}% (95% CI ${(miss.low * 100).toFixed(1)}-${(miss.high * 100).toFixed(1)}%), about ${miss.projectedMissed} of ${passed} passed items.`,
  );
  for (const p of PROVIDERS) console.log(ledgerLine(p));
}

// ---- The per-PR check (playbook step "Run the panel on what you changed") --------------------------

const snapshotPath = () => path.resolve(arg("snapshot", path.join(STATE, "snapshot.json")));
/** Above this many changed items, a check is a review round: use the batch phases instead. */
const CHECK_MAX_ITEMS = 300;

function snapshot() {
  const items = inventory();
  writeJson(snapshotPath(), Object.fromEntries(items.map((it) => [it.id, it.hash])));
  console.log(
    `Snapshot of ${items.length} item hashes written to ${snapshotPath()}. Edit content, then run check.`,
  );
}

function changedSince(items: ReviewItem[], base: Record<string, string>): ReviewItem[] {
  return items.filter((it) => base[it.id] !== it.hash);
}

async function check() {
  const base = readJson<Record<string, string>>(snapshotPath(), {});
  if (!Object.keys(base).length)
    throw new Error(`No snapshot at ${snapshotPath()}: run "snapshot" on the base before editing.`);
  const changed = changedSince(inventory(), base);
  const maxUsd = Number(arg("max-usd", "2"));
  if (!Number.isFinite(maxUsd) || maxUsd <= 0)
    throw new Error("--max-usd must be a positive number of US dollars.");
  console.log(`${changed.length} changed or new items.`);
  if (!changed.length) return;
  if (changed.length > CHECK_MAX_ITEMS)
    throw new Error(
      `${changed.length} items is a review round, not a check: use the batch phases (playbook, "The full review").`,
    );
  const chunks = chunk(changed, "check");
  const claudeReqs = chunks.map((c) =>
    buildRequest(c, { model: MODEL.review, role: "review", effort: "low" }),
  );
  const mistralReqs = chunks.map(buildMistralRequest);
  const worst =
    worstOf(MODEL.review, claudeReqs, false) +
    worstOf(
      MODEL.mistral,
      mistralReqs.map((r) => ({ custom_id: r.custom_id, params: r.body })),
      false,
    );
  console.log(
    `${chunks.length} requests to each reviewer; worst case ${worst.toFixed(2)} at full price (cap ${maxUsd}).`,
  );
  if (!flag("go")) return console.log("Dry run: nothing sent. Add --go to run the check.");
  const ledger = Ledger.open(
    {
      primary: path.join(STATE, "checks", `ledger-${Date.now().toString(36)}.json`),
      mirror: path.join(
        os.homedir(),
        ".lwa-content-review",
        "checks",
        `ledger-${Date.now().toString(36)}.json`,
      ),
      stateDir: path.join(STATE, "checks"),
    },
    { capUsd: maxUsd },
  );
  ledger.reserve("check", worst, {
    phase: "check",
    provider: "both",
    model: `${MODEL.review}+${MODEL.mistral}`,
  });
  const keyA = loadKey("anthropic");
  const keyM = loadKey("mistral");
  const claude: Verdict[] = [];
  const mistral: Verdict[] = [];
  let cost = 0;
  for (const [i, c] of chunks.entries()) {
    const { custom_id: _id, params } = claudeReqs[i]!;
    const a = await sendMessage(fetch, keyA, params);
    cost += anthropicUsageUsd(MODEL.review, a.usage, false);
    claude.push(...parseChunkReply(c, a.text).verdicts);
    const m = await sendMistralChat(fetch, keyM, MODEL.mistral, mistralReqs[i]!.body);
    cost += m.usage ? mistralUsageUsd(MODEL.mistral, m.usage, false) : worst / chunks.length;
    mistral.push(...parseChunkReply(c, m.text).verdicts);
  }
  ledger.settle("check", cost);
  const ca = new Map(claude.map((v) => [v.id, v]));
  const cb = new Map(mistral.map((v) => [v.id, v]));
  const row = (it: ReviewItem) => {
    const a = ca.get(it.id);
    const b = cb.get(it.id);
    const say = (v?: Verdict) =>
      !v
        ? "no verdict"
        : v.verdict === "ok"
          ? "ok"
          : `${v.category}/${v.severity}: ${v.problem ?? ""} Fix: ${v.fix ?? ""}`;
    const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");
    return `| \`${it.id}\` | ${cell(say(a))} | ${cell(say(b))} |`;
  };
  const bad = changed.filter(
    (it) => ca.get(it.id)?.verdict !== "ok" || cb.get(it.id)?.verdict !== "ok",
  );
  const branch = arg("name", new Date().toISOString().slice(0, 10));
  const out = path.resolve("docs", "content-review", "checks", `${branch}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    [
      `# Content check: ${branch}`,
      "",
      `Changed or new items: ${changed.length}. Reviewers: \`${MODEL.review}\`, \`${MODEL.mistral}\`. Cost: US${cost.toFixed(2)}.`,
      `Both ok: ${changed.length - bad.length}. Needs action (a defect or a missing verdict from either): ${bad.length}.`,
      "",
      "| Item | Claude | Mistral |",
      "| --- | --- | --- |",
      ...bad.map(row),
      "",
    ].join("\n"),
  );
  console.log(
    `Report: ${out}. Fix or answer every row before opening the PR, and link the report in the PR body.`,
  );
}

switch (cmd) {
  case "snapshot":
    snapshot();
    break;
  case "check":
    await check();
    break;
  case "inventory": {
    const items = inventory();
    fs.mkdirSync(STATE, { recursive: true });
    writeJson(
      path.join(STATE, "inventory.json"),
      items.map(({ data: _d, ...rest }) => rest),
    );
    console.table(inventoryCounts(items));
    console.table(flagCounts(items));
    console.log(`${items.length} items.`);
    break;
  }
  case "plan":
    console.log(planMarkdown(costPlan(inventory(), SEED), HARD_CAP_USD));
    console.log(
      `\nPrices used: ${JSON.stringify({ review: priceOf(MODEL.review), judge: priceOf(MODEL.judge), mistral: priceOf(MODEL.mistral) })}`,
    );
    break;
  case "status": {
    for (const p of PROVIDERS) console.log(ledgerLine(p));
    for (const j of loadState().jobs)
      console.log(
        `${j.ref} ${j.phase} ${j.provider} ${j.status} reserved $${j.reservedUsd.toFixed(2)}`,
      );
    break;
  }
  case "submit":
    await submit(argv[1] ?? "");
    break;
  case "collect":
    await collect();
    break;
  case "route":
    routeCommand();
    break;
  case "report":
    report();
    break;
  default:
    console.error(`Unknown command ${cmd}. See the header of this file.`);
    process.exit(1);
}
