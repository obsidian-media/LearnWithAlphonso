/**
 * The lesson-mix content runner (docs/CONTENT-PLAYBOOK.md, "The lesson mix"; logic in
 * src/lib/lesson-mix/, the panel is the closure run's, src/lib/content-review/). Every command is a
 * dry run unless it says --go.
 *
 *   bun scripts/lesson-mix/run.ts select [--per-level 3]     # the pilot lessons (15 per course), .lesson-mix/pilot.json
 *   bun scripts/lesson-mix/run.ts plan                       # lessons and items per course, projected bulk cost vs the cap
 *   bun scripts/lesson-mix/run.ts draft [--round N] [--retry-failed] [--all] [--go]
 *                                                            # Sonnet 5.5 batch, one request per lesson
 *   bun scripts/lesson-mix/run.ts collect [--go] [--wait]    # polls open batches, reads results, settles the ledger
 *   bun scripts/lesson-mix/run.ts gates                      # the deterministic gates over every draft
 *   bun scripts/lesson-mix/run.ts review [--go]              # Sonnet batch over every item that passed the gates
 *   bun scripts/lesson-mix/run.ts second [--go]              # Mistral (synchronous) over every flag plus 10% of the rest
 *   bun scripts/lesson-mix/run.ts judge [--go]               # Opus batch over every flagged item
 *   bun scripts/lesson-mix/run.ts apply                      # checked judge patches into the drafts, gates re-run
 *   bun scripts/lesson-mix/run.ts export                     # pilot JSON, the panel report and the owner's review page
 *   bun scripts/lesson-mix/run.ts status                     # the ledger and open jobs
 *
 * Money: `--go` is the only thing that spends, and only with LESSON_MIX_APPROVED=yes (the owner's
 * "content run approved, $60 cap", 2026-11-21). Every submission's WORST case is reserved in the
 * US$60 ledger (src/lib/lesson-mix/ledger.ts) before it is sent and refused when it would pass the cap.
 *
 * Keys: ANTHROPIC_API_KEY / MISTRAL_API_KEY, or ANTHROPIC_API_KEY_FILE / MISTRAL_API_KEY_FILE (a path).
 * Read into memory at the point of use; never printed, logged or written.
 */
import fs from "node:fs";
import path from "node:path";
import { getCourse } from "../../src/data/courses";
import type { Course } from "../../src/data/course-meta";
import { hash } from "../../src/data/bank-engine";
import {
  RejectedError,
  buildRequest,
  createBatch,
  getBatch,
  getResults,
  resultText,
  splitBatches,
  type BatchRequest,
} from "../../src/lib/content-review/anthropic-batch";
import { sendMistralChat, buildMistralRequest } from "../../src/lib/content-review/mistral-batch";
import {
  judgeContext,
  judgeSystem,
  parseRulings,
  route,
  type Ruling,
} from "../../src/lib/content-review/judge";
import {
  chunk,
  maxTokensFor,
  parseChunkReply,
  userMessage,
  type Chunk,
  type Verdict,
} from "../../src/lib/content-review/review";
import { withLock } from "../../src/lib/content-review/ledger";
import { secondOpinionSet } from "../../src/lib/content-review/sampling";
import { ASSUME, MODEL } from "../../src/lib/content-review/plan";
import type { ReviewItem } from "../../src/lib/content-review/inventory";
import {
  anthropicUsageUsd,
  mistralUsageUsd,
  worstCaseUsd,
  type RequestShape,
} from "../../src/lib/content-review/pricing";
import {
  buildDraftRequest,
  draftCustomId,
  parseDraft,
  parseDraftCustomId,
  selectPilot,
  type PilotLesson,
} from "../../src/lib/lesson-mix/draft";
import {
  EXTRA_TYPES,
  courseNeeds,
  type ExtraType,
  type LessonExtra,
} from "../../src/lib/lesson-mix/extras";
import {
  existingKeys,
  gateExtra,
  normKey,
  type GateContext,
  type GateResult,
} from "../../src/lib/lesson-mix/gates";
import {
  LESSON_MIX_CAP_USD,
  openLessonMixLedger,
  refuseIfOver,
  remainingUnderCap,
  reserveWithinCap,
} from "../../src/lib/lesson-mix/ledger";
import { checkedApply, parseItemId, toReviewItem } from "../../src/lib/lesson-mix/panel";
import { renderPage, type PageLesson } from "../../src/lib/lesson-mix/page";

const argv = process.argv.slice(2);
const cmd = argv[0] ?? "status";
const arg = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const flag = (name: string) => argv.includes(`--${name}`);
const STATE = path.resolve(arg("state", ".lesson-mix"));
const SEED = "20261121";
/** Mistral Large 4 is 403 on the owner's account (2026-11-21); override with LESSON_MIX_MISTRAL_MODEL. */
const MISTRAL_MODEL = process.env.LESSON_MIX_MISTRAL_MODEL ?? MODEL.mistral;
const COURSES: Course[] = ["en", "fr", "es"];

const readJson = <T>(file: string, fallback: T): T =>
  fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback;
const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
};
const openLedger = () => openLessonMixLedger(STATE);

// ---- Keys ---------------------------------------------------------------------------------------------

function loadKey(provider: "anthropic" | "mistral"): string {
  const env = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "MISTRAL_API_KEY";
  const direct = process.env[env]?.trim();
  if (direct) return direct;
  const file = process.env[`${env}_FILE`];
  if (!file) throw new Error(`${env} is not set, and ${env}_FILE is not set.`);
  const key = fs.readFileSync(file, "utf8").trim();
  if (!key) throw new Error(`The ${provider} key file is empty.`);
  return key;
}

function approved() {
  if (process.env.LESSON_MIX_APPROVED !== "yes")
    throw new Error(
      'Refused: LESSON_MIX_APPROVED=yes is not set (the owner\'s "content run approved").',
    );
}

// ---- State ---------------------------------------------------------------------------------------------

type Job = {
  ref: string;
  phase: "draft" | "review" | "judge";
  model: string;
  reservedUsd: number;
  status: "reserved" | "submitted" | "unknown" | "collected" | "released";
  remoteId?: string;
  createdAt: string;
  /** draft: custom_id -> {course, lessonId, need}; review/judge: the chunks. */
  drafts?: Record<string, { course: Course; lessonId: string; need: ExtraType[] }>;
  chunks?: Chunk[];
};
type State = { jobs: Job[] };
const statePath = path.join(STATE, "state.json");
const loadState = () => readJson<State>(statePath, { jobs: [] });
const saveState = (s: State) => writeJson(statePath, s);

/** One drafted lesson: the latest record per type and what the gates said about it. */
type Draft = {
  course: Course;
  lessonId: string;
  level: string;
  need: ExtraType[];
  extra: LessonExtra;
  rounds: number;
  /** Hard failures the first draft had (for the first-pass rate). */
  firstProblems: Partial<Record<ExtraType, string[]>>;
  problems: Partial<Record<ExtraType, string[]>>;
  warnings: Partial<Record<ExtraType, string[]>>;
  /** A type the lesson needed but the model did not return. */
  missing: ExtraType[];
  fixed: ExtraType[];
};
const draftsPath = path.join(STATE, "drafts.json");
const loadDrafts = () => readJson<Record<string, Draft>>(draftsPath, {});
const saveDrafts = (d: Record<string, Draft>) => writeJson(draftsPath, d);
const dkey = (course: string, lessonId: string) => `${course}/${lessonId}`;

const verdictPath = (phase: string) => path.join(STATE, "verdicts", `${phase}.json`);
const loadVerdicts = (phase: string) => readJson<Record<string, Verdict>>(verdictPath(phase), {});
const rulingPath = path.join(STATE, "rulings", "judge.json");
const loadRulings = () => readJson<Record<string, Ruling>>(rulingPath, {});

// ---- Content ---------------------------------------------------------------------------------------------

const lessonIndex = (course: Course) => {
  const m = new Map<
    string,
    {
      unitTitle: string;
      level: GateContext["level"];
      unitId: string;
      index: number;
      lesson: ReturnType<typeof getCourse>["curriculum"][number]["lessons"][number];
    }
  >();
  for (const u of getCourse(course).curriculum)
    u.lessons.forEach((lesson, index) =>
      m.set(lesson.id, { unitTitle: u.title, level: u.level, unitId: u.id, index, lesson }),
    );
  return m;
};

function gateContext(
  course: Course,
  level: GateContext["level"],
  taken: GateContext["existing"],
): GateContext {
  return { course, level, existing: taken };
}

/** Existing keys per course, plus whatever accepted drafts already claim (two lessons never share a phrase). */
function baseKeys(course: Course) {
  return existingKeys(getCourse(course).curriculum);
}

function runGates(drafts: Record<string, Draft>) {
  const keys = Object.fromEntries(COURSES.map((c) => [c, baseKeys(c)])) as Record<
    Course,
    GateContext["existing"]
  >;
  for (const d of Object.values(drafts).sort((a, b) => (a.lessonId < b.lessonId ? -1 : 1))) {
    const level = d.level as GateContext["level"];
    d.problems = {};
    d.warnings = {};
    for (const t of EXTRA_TYPES) {
      if (!d.extra[t]) continue;
      const r: GateResult = gateExtra(t, d.extra, gateContext(d.course, level, keys[d.course]));
      d.problems[t] = r.problems;
      d.warnings[t] = r.warnings;
      if (!r.problems.length) {
        const k =
          t === "listening"
            ? d.extra.listening!.audioText
            : t === "speak"
              ? d.extra.speak!.answer
              : d.extra.translate!.acceptableAnswers[0]!;
        keys[d.course][t].add(normKey(k));
        if (t === "translate")
          for (const a of d.extra.translate!.acceptableAnswers)
            keys[d.course].translate.add(normKey(a));
      }
    }
  }
}

const passing = (d: Draft, t: ExtraType) => !!d.extra[t] && !d.problems[t]?.length;

function reviewItems(drafts: Record<string, Draft>): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const d of Object.values(drafts)) {
    const idx = lessonIndex(d.course).get(d.lessonId)!;
    for (const t of EXTRA_TYPES) {
      if (!passing(d, t)) continue;
      const it = toReviewItem({
        course: d.course,
        level: idx.level,
        lessonId: d.lessonId,
        lessonTitle: idx.lesson.title,
        type: t,
        extra: d.extra,
      });
      if (it) out.push(it);
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ---- Money ---------------------------------------------------------------------------------------------

function shapeOf(params: Record<string, unknown>): RequestShape {
  const p = params as {
    system?: { text: string }[] | string;
    messages: { content: string }[];
    max_tokens: number;
  };
  const sys = Array.isArray(p.system) ? p.system.map((x) => x.text).join("") : "";
  return {
    cached: sys,
    uncached: p.messages.map((m) => m.content).join(""),
    messages: p.messages.length + 1,
    maxTokens: p.max_tokens,
  };
}
const worstOf = (model: string, reqs: BatchRequest[], batch = true) =>
  reqs.reduce((s, r) => s + worstCaseUsd(model, shapeOf(r.params), batch), 0);

// ---- Commands ---------------------------------------------------------------------------------------------

function select() {
  const per = Number(arg("per-level", "3"));
  const out: PilotLesson[] = [];
  for (const c of COURSES)
    out.push(...selectPilot(getCourse(c).curriculum, c, per, (id) => hash(`${SEED}:${id}`) >>> 0));
  writeJson(path.join(STATE, "pilot.json"), out);
  for (const c of COURSES) {
    const mine = out.filter((p) => p.course === c);
    console.log(`${c}: ${mine.length} lessons`);
    for (const p of mine)
      console.log(
        `  ${p.level} ${p.lessonId} (lesson ${p.indexInUnit + 1} of its unit) needs ${p.need.join("+")}`,
      );
  }
}

function countNeeds() {
  const rows: Record<
    string,
    { lessons: number; listening: number; speak: number; translate: number }
  > = {};
  for (const c of COURSES) {
    const r = { lessons: 0, listening: 0, speak: 0, translate: 0 };
    for (const need of courseNeeds(getCourse(c).curriculum).values()) {
      if (!need.length) continue;
      r.lessons++;
      for (const t of need) r[t]++;
    }
    rows[c] = r;
  }
  return rows;
}

function plan() {
  const rows = countNeeds();
  const ledger = openLedger();
  const total = Object.values(rows).reduce(
    (a, r) => ({
      lessons: a.lessons + r.lessons,
      listening: a.listening + r.listening,
      speak: a.speak + r.speak,
      translate: a.translate + r.translate,
    }),
    { lessons: 0, listening: 0, speak: 0, translate: 0 },
  );
  const items = total.listening + total.speak + total.translate;
  console.log("Eligible lessons and new items per course (the bulk run):");
  for (const c of COURSES)
    console.log(
      `  ${c}: ${rows[c]!.lessons} lessons; listening ${rows[c]!.listening}, speak ${rows[c]!.speak}, translate ${rows[c]!.translate}`,
    );
  console.log(`  total: ${total.lessons} lessons, ${items} items.`);
  // Per-item and per-lesson costs measured on the pilot, when it has run.
  const m = measured();
  if (!m) {
    console.log("No pilot spend measured yet: no projection.");
  } else {
    const projDraft = m.draftPerLesson * total.lessons;
    const projReview = m.reviewPerItem * items;
    const projSecond = m.secondPerItem * items;
    const projJudge = m.judgePerFlagged * m.flagRate * items;
    const projBlind = m.blind;
    const proj = projDraft + projReview + projSecond + projJudge + projBlind;
    console.log(
      `Projected bulk (measured on the pilot): draft ${projDraft.toFixed(2)} + review ${projReview.toFixed(2)} + second opinion ${projSecond.toFixed(2)} + judge ${projJudge.toFixed(2)} + blind sample ${projBlind.toFixed(2)} = US$${proj.toFixed(2)}`,
    );
    console.log(
      `  pilot flag rate ${(m.flagRate * 100).toFixed(1)}%; remaining under the cap now US$${remainingUnderCap(ledger).toFixed(2)} of ${LESSON_MIX_CAP_USD}`,
    );
    console.log(
      refuseIfOver(ledger, proj)
        ? "  The ledger WOULD REFUSE this plan today (it is above what is left)."
        : "  Fits in what is left under the cap.",
    );
    writeJson(path.join(STATE, "projection.json"), {
      rows,
      total,
      items,
      ...m,
      projDraft,
      projReview,
      projSecond,
      projJudge,
      projBlind,
      proj,
    });
  }
}

/** Per-unit costs from the ledger's own settled entries (the pilot). */
function measured() {
  const ledger = openLedger();
  const by = new Map<string, number>();
  for (const e of ledger.entries()) {
    if (e.type === "settle") {
      const phase = ledger.entries().find((x) => x.type === "reserve" && x.ref === e.ref);
      const ph = phase && phase.type === "reserve" ? phase.phase : "?";
      by.set(ph, (by.get(ph) ?? 0) + e.usd);
    }
  }
  const drafts = Object.values(loadDrafts());
  const nItems = reviewItems(loadDrafts()).length;
  if (!drafts.length || !by.has("draft") || !nItems) return null;
  const reviewed = Object.keys(loadVerdicts("review"));
  const flagged = Object.values(loadVerdicts("review")).filter(
    (v) => v.verdict === "defect",
  ).length;
  const judged = Object.keys(loadRulings()).length;
  const stats = {
    draftPerLesson: (by.get("draft") ?? 0) / drafts.length,
    reviewPerItem: (by.get("review") ?? 0) / Math.max(1, reviewed.length || nItems),
    secondPerItem: (by.get("second") ?? 0) / Math.max(1, nItems),
    judgePerFlagged: (by.get("judge") ?? 0) / Math.max(1, judged),
    flagRate: reviewed.length ? flagged / reviewed.length : ASSUME.claudeFlagRate,
    // The blind sample of 300 (three judges) is priced from the per-item costs above.
    blind:
      300 *
      ((by.get("review") ?? 0) / Math.max(1, reviewed.length || nItems) +
        (by.get("second") ?? 0) / Math.max(1, nItems) +
        0.01),
  };
  return stats;
}

async function draft() {
  const round = Number(arg("round", "0"));
  const retry = flag("retry-failed");
  const drafts = loadDrafts();
  const pilot = readJson<PilotLesson[]>(path.join(STATE, "pilot.json"), []);
  if (!pilot.length && !flag("all")) throw new Error("No pilot lessons: run `select` first.");
  const targets: { course: Course; lessonId: string; need: ExtraType[]; feedback?: string[] }[] =
    [];
  const lessons = flag("all")
    ? COURSES.flatMap((c) =>
        [...courseNeeds(getCourse(c).curriculum)]
          .map(([lessonId, need]) => ({ course: c, lessonId, need }))
          .filter((x) => x.need.length),
      )
    : pilot.map((p) => ({ course: p.course, lessonId: p.lessonId, need: p.need }));
  for (const t of lessons) {
    const d = drafts[dkey(t.course, t.lessonId)];
    if (!retry) {
      if (!d) targets.push(t);
      continue;
    }
    if (!d) continue;
    const bad = t.need.filter((x) => !passing(d, x));
    if (!bad.length) continue;
    targets.push({
      ...t,
      need: bad,
      feedback: bad.flatMap((x) =>
        (d.problems[x] ?? [])
          .map((p) => `${x}: ${p}`)
          .concat(d.missing.includes(x) ? [`${x}: it was missing from your reply`] : []),
      ),
    });
  }
  if (!targets.length) return console.log("draft: nothing left to draft.");
  const reqs: BatchRequest[] = [];
  const meta: Job["drafts"] = {};
  for (const t of targets) {
    const idx = lessonIndex(t.course).get(t.lessonId)!;
    const id = draftCustomId(t.course, t.lessonId, round);
    reqs.push(
      buildDraftRequest(id, {
        course: t.course,
        unitTitle: idx.unitTitle,
        level: idx.level,
        lesson: idx.lesson,
        need: t.need,
        feedback: t.feedback,
      }),
    );
    meta[id] = { course: t.course, lessonId: t.lessonId, need: t.need };
  }
  await submitAnthropic("draft", MODEL.review, reqs, (ref, group) => ({
    drafts: Object.fromEntries(
      group.map((r) => [r.custom_id, meta[r.custom_id]!]),
    ) as Job["drafts"],
    ref,
  }));
}

async function submitAnthropic(
  phase: Job["phase"],
  model: string,
  reqs: BatchRequest[],
  extra: (ref: string, group: BatchRequest[]) => Partial<Job>,
) {
  const worst = worstOf(model, reqs);
  console.log(`${phase}: ${reqs.length} requests to ${model}; worst case US$${worst.toFixed(2)}.`);
  const ledger = openLedger();
  console.log(
    `  ledger: remaining under the US$${LESSON_MIX_CAP_USD} cap: US$${remainingUnderCap(ledger).toFixed(2)}`,
  );
  if (refuseIfOver(ledger, worst))
    throw new Error(
      `Refused: the worst case ${worst.toFixed(2)} is above what is left under the cap.`,
    );
  if (!flag("go"))
    return console.log("Dry run: nothing sent. Add --go (with LESSON_MIX_APPROVED=yes) to submit.");
  approved();
  const key = loadKey("anthropic");
  await withLock(path.join(STATE, "run.lock"), async () => {
    const state = loadState();
    for (const group of splitBatches(reqs)) {
      const ref = `${phase}-${Date.now().toString(36)}`;
      const usd = worstOf(model, group);
      reserveWithinCap(ledger, ref, usd, { phase, provider: "anthropic", model });
      const job: Job = {
        ref,
        phase,
        model,
        reservedUsd: usd,
        status: "reserved",
        createdAt: new Date().toISOString(),
        ...extra(ref, group),
      };
      state.jobs.push(job);
      saveState(state);
      try {
        job.remoteId = (await createBatch(fetch, key, group)).id;
        job.status = "submitted";
        console.log(
          `Submitted ${ref}; reserved US$${usd.toFixed(2)}; remaining US$${remainingUnderCap(ledger).toFixed(2)}.`,
        );
      } catch (e) {
        if (e instanceof RejectedError) {
          ledger.release(ref, `rejected: ${e.message}`);
          job.status = "released";
          console.error(`${ref} rejected, reservation released: ${e.message}`);
        } else {
          job.status = "unknown";
          console.error(`${ref}: outcome unknown, reservation KEPT: ${(e as Error).message}`);
        }
      }
      saveState(state);
    }
  });
}

async function collect() {
  const wait = flag("wait");
  for (;;) {
    const state = loadState();
    const open = state.jobs.filter((j) => j.status === "submitted");
    if (!open.length) return console.log("No open jobs.");
    if (!flag("go"))
      return console.log(`${open.length} open jobs. Add --go to poll them (no cost).`);
    const key = loadKey("anthropic");
    await withLock(path.join(STATE, "run.lock"), async () => {
      const ledger = openLedger();
      for (const job of open) {
        const info = await getBatch(fetch, key, job.remoteId!);
        if (info.processing_status !== "ended") {
          console.log(
            `${job.ref}: ${info.processing_status} ${JSON.stringify(info.request_counts ?? {})}`,
          );
          continue;
        }
        const results = await getResults(fetch, key, info);
        let cost = 0;
        const raw: unknown[] = [];
        const texts = new Map<string, string>();
        for (const r of results) {
          raw.push({
            id: r.custom_id,
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
            texts.set(r.custom_id, resultText(r));
          }
        }
        let got = 0;
        let missing = 0;
        if (job.phase === "draft") {
          const drafts = loadDrafts();
          for (const [id, meta] of Object.entries(job.drafts ?? {})) {
            const text = texts.get(id);
            const parsed = text ? parseDraft(text, meta.need) : { extra: {}, errors: ["no reply"] };
            const idx = lessonIndex(meta.course).get(meta.lessonId)!;
            const k = dkey(meta.course, meta.lessonId);
            const prev = drafts[k];
            const merged: LessonExtra = { ...(prev?.extra ?? {}), ...parsed.extra };
            const stillMissing = meta.need.filter((t) => !parsed.extra[t]);
            drafts[k] = {
              course: meta.course,
              lessonId: meta.lessonId,
              level: idx.level,
              need: prev?.need ?? meta.need,
              extra: merged,
              rounds: (prev?.rounds ?? 0) + 1,
              firstProblems: prev?.firstProblems ?? {},
              problems: {},
              warnings: {},
              missing: stillMissing,
              fixed: prev?.fixed ?? [],
            };
            if (text && !stillMissing.length) got++;
            else missing++;
          }
          saveDrafts(drafts);
        } else if (job.phase === "review") {
          const store = loadVerdicts("review");
          for (const c of job.chunks ?? []) {
            const t = texts.get(c.customId);
            if (!t) {
              missing += c.items.length;
              continue;
            }
            const p = parseChunkReply(c, t);
            for (const v of p.verdicts) store[v.id] = v;
            got += p.verdicts.length;
            missing += p.missing.length;
          }
          writeJson(verdictPath("review"), store);
        } else {
          const store = loadRulings();
          for (const c of job.chunks ?? []) {
            const t = texts.get(c.customId);
            if (!t) {
              missing += c.items.length;
              continue;
            }
            const p = parseRulings(c, t);
            for (const r of p.rulings) store[r.id] = { ...r, at: job.createdAt };
            got += p.rulings.length;
            missing += p.missing.length;
          }
          writeJson(rulingPath, store);
        }
        writeJson(path.join(STATE, "raw", `${job.ref}.json`), raw);
        ledger.settle(job.ref, cost, `${got} parsed, ${missing} missing`);
        job.status = "collected";
        saveState(state);
        console.log(
          `${job.ref}: ${got} ok, ${missing} missing; cost US$${cost.toFixed(4)}; remaining under the cap US$${remainingUnderCap(ledger).toFixed(2)}.`,
        );
      }
    });
    if (!wait || !loadState().jobs.some((j) => j.status === "submitted")) return;
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

function gatesCommand() {
  const drafts = loadDrafts();
  // First-pass failures are recorded the first time a draft is gated.
  runGates(drafts);
  const stats = { items: 0, pass: 0, firstPass: 0, warn: 0 } as Record<string, number>;
  const byType: Record<string, { n: number; pass: number }> = {};
  const reasons = new Map<string, number>();
  for (const d of Object.values(drafts)) {
    for (const t of EXTRA_TYPES) {
      if (!d.extra[t]) continue;
      if (d.rounds === 1 && d.firstProblems[t] === undefined)
        d.firstProblems[t] = d.problems[t] ?? [];
      stats.items!++;
      byType[t] ??= { n: 0, pass: 0 };
      byType[t]!.n++;
      if (!d.problems[t]?.length) {
        stats.pass!++;
        byType[t]!.pass++;
      }
      if (!d.firstProblems[t]?.length) stats.firstPass!++;
      if (d.warnings[t]?.length) stats.warn!++;
      for (const p of d.problems[t] ?? [])
        reasons.set(
          p.replace(/"[^"]*"/g, '"…"').slice(0, 90),
          (reasons.get(p.replace(/"[^"]*"/g, '"…"').slice(0, 90)) ?? 0) + 1,
        );
    }
    for (const t of d.missing) {
      stats.items!++;
      byType[t] ??= { n: 0, pass: 0 };
      byType[t]!.n++;
    }
  }
  saveDrafts(drafts);
  console.log(
    `gates: ${stats.pass}/${stats.items} items pass (${((100 * stats.pass!) / Math.max(1, stats.items!)).toFixed(1)}%); first-pass ${stats.firstPass}/${stats.items}; ${stats.warn} with warnings`,
  );
  for (const [t, v] of Object.entries(byType)) console.log(`  ${t}: ${v.pass}/${v.n}`);
  for (const [r, n] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 12))
    console.log(`  ${n}x ${r}`);
}

async function review() {
  const drafts = loadDrafts();
  runGates(drafts);
  const done = new Set(Object.keys(loadVerdicts("review")));
  const items = reviewItems(drafts).filter((it) => !done.has(it.id));
  const chunks = chunk(items, "rev");
  const reqs = chunks.map((c) =>
    buildRequest(c, { model: MODEL.review, role: "review", effort: "low" }),
  );
  if (!reqs.length) return console.log("review: nothing left.");
  await submitAnthropic("review", MODEL.review, reqs, (_ref, group) => ({
    chunks: chunks.filter((c) => group.some((r) => r.custom_id === c.customId)),
  }));
}

async function second() {
  const drafts = loadDrafts();
  const items = reviewItems(drafts);
  const claude = new Map(Object.entries(loadVerdicts("review")));
  if (claude.size < items.length)
    throw new Error(`The review has ${claude.size} of ${items.length} verdicts: finish it first.`);
  const have = loadVerdicts("second");
  const s = secondOpinionSet(items, claude, ASSUME.controlRate, SEED);
  const todo = [...s.flagged, ...s.control].filter((it) => !have[it.id]);
  const chunks = chunk(todo, "sec");
  const mreq = (c: Chunk) => {
    const r = buildMistralRequest(c);
    // Only the Large 4 family takes reasoning_effort.
    if (!/large/.test(MISTRAL_MODEL)) delete (r.body as Record<string, unknown>).reasoning_effort;
    return r;
  };
  const reqs = chunks.map(mreq);
  const worst = reqs.reduce(
    (a, r) => a + worstCaseUsd(MISTRAL_MODEL, shapeOf(r.body as never), false),
    0,
  );
  console.log(
    `second: ${todo.length} items (${s.flagged.length} flagged + ${s.control.length} control) in ${chunks.length} requests to ${MISTRAL_MODEL} (synchronous, full price: the account has no Mistral batch); worst case US$${worst.toFixed(2)}.`,
  );
  const ledger = openLedger();
  if (refuseIfOver(ledger, worst)) throw new Error("Refused: above what is left under the cap.");
  if (!flag("go") || !chunks.length)
    return console.log(chunks.length ? "Dry run: nothing sent." : "");
  approved();
  const key = loadKey("mistral");
  await withLock(path.join(STATE, "run-mistral.lock"), async () => {
    const store = loadVerdicts("second");
    for (const c of chunks) {
      const req = mreq(c);
      const w = worstCaseUsd(MISTRAL_MODEL, shapeOf(req.body as never), false);
      const ref = `sec-${c.customId}-${Date.now().toString(36)}`;
      reserveWithinCap(ledger, ref, w, {
        phase: "second",
        provider: "mistral",
        model: MISTRAL_MODEL,
      });
      let res: Awaited<ReturnType<typeof sendMistralChat>>;
      for (let attempt = 1; ; attempt++) {
        try {
          res = await sendMistralChat(fetch, key, MISTRAL_MODEL, req.body);
          break;
        } catch (e) {
          const msg = (e as Error).message;
          if (e instanceof RejectedError && /HTTP 429/.test(msg) && attempt < 20) {
            console.error(`${c.customId}: HTTP 429, waiting (attempt ${attempt}/20)`);
            await new Promise((r) =>
              setTimeout(r, Math.min(60_000, 2000 * 2 ** Math.min(attempt, 5))),
            );
            continue;
          }
          if (e instanceof RejectedError) ledger.release(ref, `rejected: ${msg}`);
          else console.error(`${ref}: outcome unknown, reservation KEPT: ${msg}`);
          writeJson(verdictPath("second"), store);
          throw e;
        }
      }
      const cost = res.usage ? mistralUsageUsd(MISTRAL_MODEL, res.usage, false) : w;
      ledger.settle(ref, cost);
      const parsed = parseChunkReply(c, res.text);
      for (const v of parsed.verdicts) store[v.id] = v;
      writeJson(verdictPath("second"), store);
      console.log(
        `${c.customId}: ${parsed.verdicts.length}/${c.items.length}, US$${cost.toFixed(4)}; remaining US$${remainingUnderCap(ledger).toFixed(2)}`,
      );
    }
  });
}

async function judge() {
  const drafts = loadDrafts();
  const items = reviewItems(drafts);
  const claude = new Map(Object.entries(loadVerdicts("review")));
  const mistral = new Map(Object.entries(loadVerdicts("second")));
  const rulings = loadRulings();
  const ids = new Set<string>();
  for (const m of [claude, mistral])
    for (const v of m.values()) if (v.verdict === "defect") ids.add(v.id);
  const todo = items.filter((it) => ids.has(it.id) && !rulings[it.id]);
  const chunks = chunk(todo, "jdg");
  const reqs = chunks.map((c) =>
    buildRequest(c, {
      model: MODEL.judge,
      effort: "medium",
      system: judgeSystem(c.course),
      user: userMessage(c, (it) => judgeContext(it, claude, mistral)),
      maxTokens: maxTokensFor(c, ASSUME.maxOut.judge),
    }),
  );
  if (!reqs.length) return console.log("judge: nothing flagged (or already judged).");
  await submitAnthropic("judge", MODEL.judge, reqs, (_ref, group) => ({
    chunks: chunks.filter((c) => group.some((r) => r.custom_id === c.customId)),
  }));
}

function applyCommand() {
  const drafts = loadDrafts();
  const items = new Map(reviewItems(drafts).map((it) => [it.id, it]));
  const rulings = [...Object.values(loadRulings())];
  const mistral = loadVerdicts("second");
  const { fixes, kept, owner } = route(rulings, (id) => mistral[id]?.verdict === "ok");
  const applied: string[] = [];
  const refused: { id: string; why: string[] }[] = [];
  for (const f of fixes) {
    const item = items.get(f.id);
    const parsed = parseItemId(f.id);
    if (!item || !parsed) continue;
    const d = drafts[dkey(parsed.course, parsed.lessonId)]!;
    const r = checkedApply(item, parsed.type, d.extra, f);
    if (r.refused.length) {
      refused.push({ id: f.id, why: r.refused });
      continue;
    }
    d.extra = r.extra;
    d.fixed = [...new Set([...d.fixed, parsed.type])];
    applied.push(f.id);
  }
  runGates(drafts);
  // A fix that broke a gate is undone by the next draft round; list it.
  saveDrafts(drafts);
  writeJson(path.join(STATE, "apply.json"), { applied, refused, kept, owner });
  console.log(
    `apply: ${applied.length} fixes applied, ${refused.length} refused by the checker, ${kept.length} kept, ${owner.length} for the owner.`,
  );
}

function exportCommand() {
  const drafts = loadDrafts();
  runGates(drafts);
  const claude = loadVerdicts("review");
  const mistral = loadVerdicts("second");
  const rulings = loadRulings();
  const apply = readJson<{
    applied: string[];
    refused: { id: string; why: string[] }[];
    owner: Ruling[];
  }>(path.join(STATE, "apply.json"), { applied: [], refused: [], owner: [] });
  const ownerIds = new Set(apply.owner.map((r) => r.id));
  const lessons: PageLesson[] = [];
  const out: Record<Course, Record<string, LessonExtra>> = { en: {}, fr: {}, es: {} };
  const pilot = readJson<PilotLesson[]>(path.join(STATE, "pilot.json"), []);
  for (const p of pilot) {
    const d = drafts[dkey(p.course, p.lessonId)];
    if (!d) continue;
    const idx = lessonIndex(p.course).get(p.lessonId)!;
    const items = [] as PageLesson["items"];
    const record: LessonExtra = {};
    for (const t of EXTRA_TYPES) {
      if (!d.extra[t]) continue;
      const it = toReviewItem({
        course: p.course,
        level: idx.level,
        lessonId: p.lessonId,
        lessonTitle: idx.lesson.title,
        type: t,
        extra: d.extra,
      })!;
      const problems = d.problems[t] ?? [];
      const v: { who: string; verdict: string; detail?: string }[] = [];
      const c = claude[it.id];
      if (c)
        v.push({
          who: "Sonnet 5.5",
          verdict: c.verdict,
          detail:
            c.verdict === "defect" ? `${c.category}/${c.severity}: ${c.problem ?? ""}` : undefined,
        });
      const m = mistral[it.id];
      if (m)
        v.push({
          who: "Mistral Large 4",
          verdict: m.verdict,
          detail:
            m.verdict === "defect" ? `${m.category}/${m.severity}: ${m.problem ?? ""}` : undefined,
        });
      const r = rulings[it.id];
      if (r) v.push({ who: "Opus 5.5 judge", verdict: r.decision, detail: r.reason });
      const status = problems.length
        ? "dropped"
        : ownerIds.has(it.id)
          ? "held"
          : d.fixed.includes(t)
            ? "fixed"
            : "clean";
      items.push({
        type: t,
        extra: d.extra,
        warnings: d.warnings[t] ?? [],
        problems,
        verdicts: v,
        status,
        note:
          status === "fixed"
            ? "The judge patched this item; this is the corrected text."
            : status === "dropped"
              ? "Failed the automatic checks after a retry: NOT included in the pilot data."
              : undefined,
      });
      if (!problems.length) (record as Record<string, unknown>)[t] = d.extra[t];
    }
    if (Object.keys(record).length) out[p.course][p.lessonId] = record;
    lessons.push({
      course: p.course,
      level: idx.level,
      lessonId: p.lessonId,
      title: idx.lesson.title,
      unitTitle: idx.unitTitle,
      context: idx.lesson.questions
        .filter((q) => q.type === "mc" || q.type === "fill")
        .slice(0, 4)
        .map((q) => ("prompt" in q ? q.prompt : "")),
      items,
    });
  }
  const dir = path.resolve(arg("docs", "docs/lesson-mix/pilot"));
  for (const c of COURSES) writeJson(path.join(dir, `${c}.json`), out[c]);
  writeJson(path.join(STATE, "page-lessons.json"), lessons);
  const ledger = openLedger().status();
  const html = renderPage(
    "Lesson-mix pilot: 45 lessons",
    {
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
      lines: [
        [
          "Spend (ledger, all providers)",
          `US$${ledger.settledUsd.toFixed(2)} settled of the US$${LESSON_MIX_CAP_USD} cap`,
        ],
        [
          "Not merged",
          "Nothing here is in the live content. The items sit in docs/lesson-mix/pilot/ and are not loaded by the app.",
        ],
      ],
      note: "Each card is one lesson; the green line is the answer. Status: clean = the panel found nothing; fixed = the Opus judge patched it; held = a question for you; dropped = failed the automatic checks twice and left out of the data.",
    },
    lessons,
  );
  const page = path.resolve(
    arg("page", "D:/AgentDevWork/repos/renders-2026-11-19/lesson-mix-pilot/index.html"),
  );
  fs.mkdirSync(path.dirname(page), { recursive: true });
  fs.writeFileSync(page, html);
  console.log(
    `export: ${Object.values(out).reduce((n, c) => n + Object.keys(c).length, 0)} lessons written to ${dir}; page ${page}`,
  );
}

function status() {
  const ledger = openLedger();
  const s = ledger.status();
  console.log(
    `ledger: settled US$${s.settledUsd.toFixed(4)}, open US$${s.openUsd.toFixed(2)}, remaining under the cap US$${remainingUnderCap(ledger).toFixed(2)} of ${LESSON_MIX_CAP_USD}`,
  );
  for (const j of loadState().jobs)
    console.log(
      `  ${j.ref} ${j.phase} ${j.model} ${j.status} reserved US$${j.reservedUsd.toFixed(2)}`,
    );
}

const commands: Record<string, () => unknown> = {
  select,
  plan,
  draft,
  collect,
  gates: gatesCommand,
  review,
  second,
  judge,
  apply: applyCommand,
  export: exportCommand,
  status,
};
const run = commands[cmd];
if (!run) {
  console.error(`Unknown command ${cmd}. See the header of this file.`);
  process.exit(1);
}
await run();
