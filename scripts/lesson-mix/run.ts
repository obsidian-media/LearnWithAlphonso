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
 *   bun scripts/lesson-mix/run.ts apply                      # checked judge patches into the drafts, gates re-run (every key change is HELD)
 *   bun scripts/lesson-mix/run.ts blind [--go]               # the 300-item blind sample: Opus, no earlier verdicts shown
 *   bun scripts/lesson-mix/run.ts export [--bulk]            # pilot JSON + page; --bulk: the live src/data/lesson-extras, held file, summary page
 *   bun scripts/lesson-mix/run.ts status                     # the ledger and open jobs
 *
 * Money: `--go` is the only thing that spends, and only with LESSON_MIX_APPROVED=yes (the owner's
 * "content run approved, $60 cap", 2026-11-21). Every submission's WORST case is reserved in the
 * US$60 ledger (src/lib/lesson-mix/ledger.ts) before it is sent and refused when it would pass the cap.
 *
 * Keys: ANTHROPIC_API_KEY / MISTRAL_API_KEY, or ANTHROPIC_API_KEY_FILE / MISTRAL_API_KEY_FILE (a path).
 * Second opinion via OpenRouter (BYOK): LESSON_MIX_SECOND_ROUTE=openrouter + OPENROUTER_API_KEY_FILE.
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
import { resolveSecondRoute } from "./second-route";
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
import {
  blindSample,
  secondOpinionSet,
  stratifiedDraw,
  wilson,
} from "../../src/lib/content-review/sampling";
import {
  altsSystem,
  altsUser,
  dedupeWordings,
  explainSystem,
  explainUser,
  parseExplanations,
  mergeAlternatives,
  parseAlts,
} from "../../src/lib/lesson-mix/alternatives";
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
  NO_EXTRAS_LESSONS,
  courseNeeds,
  stripLessonExtras,
  type ExtraType,
  type LessonExtra,
} from "../../src/lib/lesson-mix/extras";
import {
  existingKeys,
  MAX_WORDINGS,
  britishProblems,
  dedupKey,
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
import {
  checkedApply,
  extraItemId,
  parseItemId,
  toReviewItem,
} from "../../src/lib/lesson-mix/panel";
import { strictExplanationProblems } from "../../src/lib/lesson-mix/meta-gate";
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
const SECOND = resolveSecondRoute(process.env, MODEL.mistral);
const MISTRAL_MODEL = SECOND.model;
const COURSES: Course[] = ["en", "fr", "es"];
/** The curriculum without the lesson-mix extras: the tooling always works from the lessons as they were. */
const baseCurriculum = (c: Course) => stripLessonExtras(getCourse(c).curriculum);

const readJson = <T>(file: string, fallback: T): T =>
  fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback;
const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
};
const openLedger = () => openLessonMixLedger(STATE);
/** ONE lock for every phase and provider; the ledger is (re)opened INSIDE it, never before. */
const LOCK = path.join(STATE, "run.lock");
let refCounter = 0;
/** A batch ref that cannot collide in the same millisecond. */
const newRef = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(refCounter++).toString(36)}`;

// ---- Keys ---------------------------------------------------------------------------------------------

function loadKey(provider: "anthropic" | "mistral"): string {
  const env = provider === "anthropic" ? "ANTHROPIC_API_KEY" : SECOND.keyEnv;
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
  phase: "draft" | "review" | "judge" | "blind" | "blind2" | "blind3" | "blind4" | "alts" | "expl";
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
const blindPath = path.join(STATE, "rulings", "blind.json");
const loadBlind = () => readJson<Record<string, Ruling>>(blindPath, {});
const blind2Path = path.join(STATE, "rulings", "blind2.json");
const loadBlind2 = () => readJson<Record<string, Ruling>>(blind2Path, {});
const blind3Path = path.join(STATE, "rulings", "blind3.json");
const loadBlind3 = () => readJson<Record<string, Ruling>>(blind3Path, {});
const blind4Path = path.join(STATE, "rulings", "blind4.json");
const loadBlind4 = () => readJson<Record<string, Ruling>>(blind4Path, {});
const blindFiles = (round: number) =>
  round === 1
    ? { sample: "blind-sample.json", store: blindPath, load: loadBlind, phase: "blind" as const }
    : round === 2
      ? {
          sample: "blind-sample-2.json",
          store: blind2Path,
          load: loadBlind2,
          phase: "blind2" as const,
        }
      : round === 3
        ? {
            sample: "blind-sample-3.json",
            store: blind3Path,
            load: loadBlind3,
            phase: "blind3" as const,
          }
        : {
            sample: "blind-sample-4.json",
            store: blind4Path,
            load: loadBlind4,
            phase: "blind4" as const,
          };

/** Items whose draft was edited, regenerated or extended since they were last reviewed: they are re-verified, nothing else is. */
const changedPath = path.join(STATE, "changed.json");
const loadChanged = () => new Set(readJson<string[]>(changedPath, []));
/** Items a judge or a blind ruling found wrong and that must be redrafted: id -> the reasons. */
const regenPath = path.join(STATE, "regen.json");
const loadRegen = () => readJson<Record<string, string[]>>(regenPath, {});
const altsPath = path.join(STATE, "alts.json");
/** What the second-answer pass actually added (and what the gates refused), per item. */
const mergedAltsPath = path.join(STATE, "alts-merged.json");

/** Forgets every earlier verdict and ruling on these items (the text they judged is gone) and marks them changed. */
function invalidate(ids: string[], opts: { keepAlts?: boolean } = {}) {
  if (!ids.length) return;
  const gone = new Set(ids);
  if (!opts.keepAlts)
    for (const f of [altsPath, mergedAltsPath]) {
      const a = readJson<Record<string, unknown>>(f, {});
      let n = 0;
      for (const id of gone)
        if (a[id]) {
          delete a[id];
          n++;
        }
      if (n) writeJson(f, a);
    }
  for (const phase of ["review", "second"]) {
    const v = loadVerdicts(phase);
    let n = 0;
    for (const id of gone)
      if (v[id]) {
        delete v[id];
        n++;
      }
    if (n) writeJson(verdictPath(phase), v);
  }
  const r = loadRulings();
  const old = readJson<Record<string, Ruling>>(path.join(STATE, "rulings", "superseded.json"), {});
  for (const id of gone)
    if (r[id]) {
      old[id] = r[id]!;
      delete r[id];
    }
  writeJson(rulingPath, r);
  writeJson(path.join(STATE, "rulings", "superseded.json"), old);
  const ch = loadChanged();
  for (const id of gone) ch.add(id);
  writeJson(changedPath, [...ch].sort());
}

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
  for (const u of baseCurriculum(course))
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
  return existingKeys(baseCurriculum(course));
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
        keys[d.course].all?.add(dedupKey(t === "translate" ? d.extra.translate!.prompt : k));
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
    out.push(...selectPilot(baseCurriculum(c), c, per, (id) => hash(`${SEED}:${id}`) >>> 0));
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
    for (const need of courseNeeds(baseCurriculum(c)).values()) {
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
  const targets: {
    course: Course;
    lessonId: string;
    need: ExtraType[];
    feedback?: string[];
    previous?: unknown;
  }[] = [];
  const lessons = flag("all")
    ? COURSES.flatMap((c) =>
        [...courseNeeds(baseCurriculum(c))]
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
    const regen = loadRegen();
    // The draft's own types count too: a lesson's speak slot can move when the curriculum changes.
    const want = [...new Set([...t.need, ...d.need])];
    const bad = want.filter((x) => !passing(d, x) || regen[extraItemId(t.course, t.lessonId, x)]);
    if (!bad.length) continue;
    targets.push({
      ...t,
      need: bad,
      previous: Object.fromEntries(bad.filter((x) => d.extra[x]).map((x) => [x, d.extra[x]])),
      feedback: bad.flatMap((x) =>
        (d.problems[x] ?? [])
          .map((p) => `${x}: ${p}`)
          .concat(d.missing.includes(x) ? [`${x}: it was missing from your reply`] : [])
          .concat((regen[extraItemId(t.course, t.lessonId, x)] ?? []).map((p) => `${x}: ${p}`)),
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
        previous: t.previous,
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
  await withLock(LOCK, async () => {
    const ledger = openLedger(); // re-opened inside the lock: the one above was only for the dry-run check
    const state = loadState();
    for (const group of splitBatches(reqs)) {
      const ref = newRef(phase);
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
    await withLock(LOCK, async () => {
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
            // A type that came back is a new text: its old verdicts and any repair request are void.
            const back = meta.need.filter((t) => parsed.extra[t]);
            if (back.length) {
              const regen = loadRegen();
              const ids = back.map((t) => extraItemId(meta.course, meta.lessonId, t));
              for (const id of ids) delete regen[id];
              writeJson(regenPath, regen);
              invalidate(ids);
            }
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
        } else if (job.phase === "expl") {
          const store = readJson<Record<string, string>>(explPath, {});
          for (const c of job.chunks ?? []) {
            const t = texts.get(c.customId);
            if (!t) {
              missing += c.items.length;
              continue;
            }
            const p = parseExplanations(c, t);
            Object.assign(store, p.byId);
            got += Object.keys(p.byId).length;
            missing += p.missing.length;
          }
          writeJson(explPath, store);
        } else if (job.phase === "alts") {
          const store = readJson<Record<string, string[]>>(altsPath, {});
          for (const c of job.chunks ?? []) {
            const t = texts.get(c.customId);
            if (!t) {
              missing += c.items.length;
              continue;
            }
            const p = parseAlts(c, t);
            Object.assign(store, p.adds);
            got += Object.keys(p.adds).length;
            missing += p.missing.length;
          }
          writeJson(altsPath, store);
        } else {
          const blind = job.phase === "blind";
          const blind2 = job.phase === "blind2";
          const blind3 = job.phase === "blind3";
          const blind4 = job.phase === "blind4";
          const store = blind4
            ? loadBlind4()
            : blind
              ? loadBlind()
              : blind2
                ? loadBlind2()
                : blind3
                  ? loadBlind3()
                  : loadRulings();
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
          writeJson(
            blind
              ? blindPath
              : blind2
                ? blind2Path
                : blind3
                  ? blind3Path
                  : blind4
                    ? blind4Path
                    : rulingPath,
            store,
          );
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
  await withLock(LOCK, async () => {
    const ledger = openLedger(); // re-opened inside the lock
    const store = loadVerdicts("second");
    for (const c of chunks) {
      const req = mreq(c);
      const w = worstCaseUsd(MISTRAL_MODEL, shapeOf(req.body as never), false);
      const ref = newRef(`sec-${c.customId}`);
      reserveWithinCap(ledger, ref, w, {
        phase: "second",
        provider: "mistral",
        model: MISTRAL_MODEL,
      });
      let res: Awaited<ReturnType<typeof sendMistralChat>>;
      for (let attempt = 1; ; attempt++) {
        try {
          res = await sendMistralChat(
            fetch,
            key,
            MISTRAL_MODEL,
            SECOND.shapeBody(req.body),
            SECOND.url,
          );
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

const FOCUS_ANSWERS = [
  "",
  "",
  "FOCUS OF THIS PASS (overrides the general review): look ONLY for a correct learner answer that the app would mark wrong. Ignore style, explanation wording and everything else; return keep for those.",
  'For a TRANSLATE item: find natural, fully correct wordings of the English prompt that are not in acceptableAnswers (the literal rendering, a synonym, subject dropped or stated, another word order, the usual regional-standard word, a gender form the prompt leaves open). If any is missing, decision "fix" with patch {"acceptableAnswers": [...]} holding the WHOLE list: every existing wording unchanged and in order, then the new ones, at most 12 in all. Only wordings that mean exactly what the prompt asks.',
  'For a LISTENING item: find a wrong choice that a listener could ALSO have heard (it sounds the same, or is an equally valid reading of the audio). If found, decision "fix" with patch {"choices": [...], "answer": "..."}: the whole list with that choice replaced by a clearly different, natural, grammatical sentence, the answer at the same position.',
  'If the KEY itself (first accepted answer, or the listening answer) is wrong for this NEW item, fix it and set "keyChange": true.',
].join("\n");

async function judge() {
  const drafts = loadDrafts();
  const items = reviewItems(drafts);
  const claude = new Map(Object.entries(loadVerdicts("review")));
  const mistral = new Map(Object.entries(loadVerdicts("second")));
  const rulings = loadRulings();
  const ids = new Set<string>();
  // --changed: only what was edited, regenerated or extended since its last review.
  const changed = loadChanged();
  const universe = new Set(
    items.filter((it) => !flag("changed") || changed.has(it.id)).map((it) => it.id),
  );
  for (const m of [claude, mistral])
    for (const v of m.values()) if (v.verdict === "defect" && universe.has(v.id)) ids.add(v.id);
  // --all-types translate,listening: Opus reads EVERY item of those types it has not ruled on yet.
  const allTypes = arg("all-types", "").split(",").filter(Boolean);
  if (allTypes.length)
    for (const it of items)
      if (
        allTypes.includes(it.subtype) &&
        (flag("redo") || !rulings[it.id]) &&
        (!arg("course", "") || it.course === arg("course", ""))
      )
        ids.add(it.id);
  // --sample N: Opus also reads N of the items the second-answer pass extended (a quality check on the additions).
  const sampleN = Number(arg("sample", "0"));
  if (sampleN) {
    const merged = readJson<Record<string, { added: string[] }>>(mergedAltsPath, {});
    const pool = items.filter((it) => universe.has(it.id) && merged[it.id]?.added.length);
    for (const it of stratifiedDraw(pool, sampleN, `${SEED}:alts`, (x) => x.course)) ids.add(it.id);
  }
  // Fallback when the Mistral second opinion is unavailable: the judge also sees the control sample
  // (Sonnet-passed items), so the panel still measures what Sonnet misses.
  if (process.env.LESSON_MIX_JUDGE_CONTROL === "yes") {
    const s = secondOpinionSet(
      items.filter((it) => universe.has(it.id)),
      claude,
      ASSUME.controlRate,
      SEED,
    );
    for (const it of s.control) ids.add(it.id);
  }
  // --cats regional,naturalness,spelling: re-judge the items a reviewer put in those categories.
  const cats = arg("cats", "").split(",").filter(Boolean);
  if (cats.length)
    for (const v of claude.values())
      if (v.verdict === "defect" && cats.includes(v.category ?? "") && universe.has(v.id))
        ids.add(v.id);
  // --redo: read them again even if an earlier ruling exists (the new ruling replaces it).
  const todo = items.filter((it) => ids.has(it.id) && (flag("redo") || !rulings[it.id]));
  const chunks = chunk(todo, "jdg");
  // --focus answers: this pass looks ONLY for valid learner answers the grader would reject.
  const focus = flag("focus") ? FOCUS_ANSWERS : "";
  const reqs = chunks.map((c) =>
    buildRequest(c, {
      model: MODEL.judge,
      effort: "medium",
      system: judgeSystem(c.course) + focus,
      user: userMessage(c, (it) => judgeContext(it, claude, mistral)),
      maxTokens: maxTokensFor(c, ASSUME.maxOut.judge),
    }),
  );
  if (!reqs.length) return console.log("judge: nothing flagged (or already judged).");
  await submitAnthropic("judge", MODEL.judge, reqs, (_ref, group) => ({
    chunks: chunks.filter((c) => group.some((r) => r.custom_id === c.customId)),
  }));
}

/** Redrafts a repair may use before an item is given up on and held (the first draft is round 1). */
const MAX_ROUNDS = 5;

/**
 * Applies the judge's rulings. EVERY item here is a NEW draft no learner has seen (ids lx1/sx1/tx1 on a
 * lesson that lacked the type), so the earlier "hold every answer-key change" rule, which protects the
 * answers of EXISTING questions, does not apply: a patch may change the key, then the gates re-run.
 * An item whose id already exists in the curriculum is never touched and stays held.
 * --blind: the blind-sample rulings (round 1) are applied the same way, once.
 * A ruling that cannot be applied (owner call, low confidence, no patch, refused) puts the item into
 * regen.json, so the next `draft --retry-failed` repairs it with the reason in front of the model.
 */
function applyCommand() {
  const drafts = loadDrafts();
  const items = new Map(reviewItems(drafts).map((it) => [it.id, it]));
  const mistral = loadVerdicts("second");
  const doneBlind = new Set(readJson<string[]>(path.join(STATE, "applied-blind.json"), []));
  const blindFile = arg("blind-file", "");
  const rulings: Ruling[] = flag("blind")
    ? Object.values(
        blindFile ? readJson<Record<string, Ruling>>(blindFile, {}) : loadBlind(),
      ).filter((r) => r.decision !== "keep" && !doneBlind.has(r.id))
    : [...Object.values(loadRulings())];
  const regen = loadRegen();
  const applied: string[] = [];
  const refused: { id: string; why: string[] }[] = [];
  const kept: string[] = [];
  const owner: Ruling[] = [];
  const existingQ = (course: Course, lessonId: string, qid: string) =>
    !!lessonIndex(course)
      .get(lessonId)
      ?.lesson.questions.some((q) => q.id === qid);
  for (const r of rulings) {
    if (r.decision === "keep") {
      kept.push(r.id);
      continue;
    }
    const parsed = parseItemId(r.id);
    if (!parsed) continue;
    const d = drafts[dkey(parsed.course, parsed.lessonId)];
    const qid = r.id.split("/")[1]!;
    if (!d || existingQ(parsed.course, parsed.lessonId, qid)) {
      owner.push({ ...r, reason: `targets an existing item, HELD: ${r.reason}` });
      continue;
    }
    const giveUp = (why: string) => {
      if (d.rounds >= MAX_ROUNDS) owner.push({ ...r, reason: `${why}: ${r.reason}` });
      else regen[r.id] = [...(regen[r.id] ?? []), `${why}: ${r.reason}`];
    };
    const item = items.get(r.id);
    if (r.decision !== "fix" || !r.patch || r.confidence < 0.5 || !item) {
      giveUp(
        r.decision === "owner" ? "a judgment call, pick the plainer option" : "needs a redraft",
      );
      continue;
    }
    const out = checkedApply(item, parsed.type, d.extra, {
      id: r.id,
      patch: r.patch,
      reason: r.reason,
      keyChange: true,
    });
    if (out.refused.length) {
      refused.push({ id: r.id, why: out.refused });
      giveUp(`the judge's patch was refused (${out.refused.join("; ")})`);
      continue;
    }
    // A patch that would break a gate is refused: the item keeps the draft it has.
    const broke = gateExtra(
      parsed.type,
      out.extra,
      gateContext(d.course, d.level as GateContext["level"], baseKeys(d.course)),
    ).problems.filter((p) => !/^duplicate:/.test(p));
    const had = new Set(d.problems[parsed.type] ?? []);
    if (broke.some((p) => !had.has(p))) {
      refused.push({ id: r.id, why: ["the patch breaks a gate: " + broke[0]] });
      continue;
    }
    d.extra = out.extra;
    d.fixed = [...new Set([...d.fixed, parsed.type])];
    applied.push(r.id);
    if (mistral[r.id]?.verdict === "ok") kept.push(r.id);
  }
  // A patch may add wordings past the cap; the first nine (canonical first) stay.
  for (const d of Object.values(drafts))
    if (d.extra.translate && d.extra.translate.acceptableAnswers.length > MAX_WORDINGS)
      d.extra.translate.acceptableAnswers = d.extra.translate.acceptableAnswers.slice(
        0,
        MAX_WORDINGS,
      );
  if (flag("blind"))
    writeJson(path.join(STATE, "applied-blind.json"), [...doneBlind, ...rulings.map((r) => r.id)]);
  runGates(drafts);
  saveDrafts(drafts);
  writeJson(regenPath, regen);
  invalidate(applied);
  const prev = readJson<{ owner?: Ruling[] }>(path.join(STATE, "apply.json"), {});
  const ownerAll = new Map((prev.owner ?? []).map((r) => [r.id, r]));
  for (const r of owner) ownerAll.set(r.id, r);
  // A held item that was patched or queued for a redraft is no longer held for the reason it had.
  for (const id of [...ownerAll.keys()]) if (applied.includes(id) || regen[id]) ownerAll.delete(id);
  writeJson(path.join(STATE, "apply.json"), {
    applied,
    refused,
    kept,
    owner: [...ownerAll.values()],
    regen: Object.keys(regen),
  });
  console.log(
    `apply${flag("blind") ? " --blind" : ""}: ${applied.length} fixes applied (answer keys included: these are new drafts), ${refused.length} refused by the checker, ${kept.length} kept, ${Object.keys(regen).length} queued for redraft, ${ownerAll.size} held.`,
  );
}

/** The second-answer pass: Sonnet proposes extra accepted wordings for every translate item. */
async function altsCommand() {
  const drafts = loadDrafts();
  runGates(drafts);
  // --again: a second pass over every translate item, whatever the first pass said.
  const have = flag("again")
    ? {}
    : {
        ...readJson<Record<string, unknown>>(mergedAltsPath, {}),
        ...readJson<Record<string, unknown>>(altsPath, {}),
      };
  const items = reviewItems(drafts).filter((it) => it.subtype === "translate" && !have[it.id]);
  const chunks = chunk(items, "alt");
  const reqs = chunks.map((c) =>
    buildRequest(c, {
      model: MODEL.review,
      effort: "low",
      system: altsSystem(c.course, flag("again")),
      user: altsUser(c),
      maxTokens: Math.max(1024, c.items.length * 260),
    }),
  );
  if (!reqs.length) return console.log("alts: nothing left.");
  await submitAnthropic("alts", MODEL.review, reqs, (_ref, group) => ({
    chunks: chunks.filter((c) => group.some((r) => r.custom_id === c.customId)),
  }));
}

/** Merges the proposals into acceptableAnswers, one wording at a time, each through the translate gate. */
function mergeAltsCommand() {
  const drafts = loadDrafts();
  runGates(drafts);
  const adds = readJson<Record<string, string[]>>(altsPath, {});
  const merged = readJson<Record<string, { added: string[]; rejected: string[] }>>(
    mergedAltsPath,
    {},
  );
  const changed: string[] = [];
  let added = 0;
  let rejected = 0;
  for (const [id, proposed] of Object.entries(adds)) {
    const parsed = parseItemId(id);
    const d = parsed && drafts[dkey(parsed.course, parsed.lessonId)];
    if (!parsed || !d?.extra.translate || !passing(d, "translate")) continue;
    const ctx = gateContext(d.course, d.level as GateContext["level"], baseKeys(d.course));
    const base = d.extra.translate;
    const r = mergeAlternatives(
      base,
      proposed,
      (answers) =>
        gateExtra("translate", { translate: { ...base, acceptableAnswers: answers } }, ctx)
          .problems,
    );
    merged[id] = { added: r.added, rejected: r.rejected };
    added += r.added.length;
    rejected += r.rejected.length;
    if (r.added.length) {
      d.extra.translate = r.translate;
      changed.push(id);
    }
  }
  writeJson(mergedAltsPath, merged);
  writeJson(altsPath, {});
  runGates(drafts);
  saveDrafts(drafts);
  invalidate(changed, { keepAlts: true });
  console.log(
    `merge-alts: ${changed.length} translate items extended, ${added} wordings added, ${rejected} refused by the gates (or already accepted).`,
  );
}

/** Deterministic tidy: wordings the grader treats as one are collapsed (the consistency test needs 3 DISTINCT). */
function tidyCommand() {
  const drafts = loadDrafts();
  const changed: string[] = [];
  for (const d of Object.values(drafts)) {
    // Spanish Minimal Pairs lessons are a dedicated pack: no appended question of any type.
    if (NO_EXTRAS_LESSONS.has(d.lessonId)) {
      d.extra = {};
      d.need = [];
      d.problems = {};
      continue;
    }
    if (!d.extra.translate) continue;
    // A British-only accepted wording (not the first) is dropped; the first is a redraft's business.
    if (d.course === "en") {
      const [first, ...rest] = d.extra.translate.acceptableAnswers;
      const kept = rest.filter((a) => !britishProblems("en", [a]).length);
      if (kept.length !== rest.length) {
        d.extra.translate = { ...d.extra.translate, acceptableAnswers: [first!, ...kept] };
        changed.push(extraItemId(d.course, d.lessonId, "translate"));
      }
    }
    const next = dedupeWordings(d.extra.translate);
    if (next !== d.extra.translate) {
      d.extra.translate = next;
      changed.push(extraItemId(d.course, d.lessonId, "translate"));
    }
  }
  saveDrafts(drafts);
  invalidate(changed, { keepAlts: true });
  runGates(drafts);
  saveDrafts(drafts);
  console.log(
    `tidy: ${changed.length} translate items had wordings the grader counts as one; collapsed.`,
  );
}

const explPath = path.join(STATE, "expl.json");

/** Sonnet rewrites every explanation that fails the stricter rubric (one batch). */
async function explainCommand() {
  const drafts = loadDrafts();
  runGates(drafts);
  const done = readJson<Record<string, string>>(explPath, {});
  const items = reviewItems(drafts).filter(
    (it) => !done[it.id] && strictExplanationProblems(String(it.data.explanation ?? "")).length,
  );
  const chunks = chunk(items, "exp");
  const reqs = chunks.map((c) =>
    buildRequest(c, {
      model: MODEL.review,
      effort: "low",
      system: explainSystem(c.course),
      user: explainUser(c),
      maxTokens: Math.max(1024, c.items.length * 200),
    }),
  );
  if (!reqs.length) return console.log("explain: nothing fails the stricter rubric.");
  console.log(`explain: ${items.length} explanations fail the stricter rubric.`);
  await submitAnthropic("expl", MODEL.review, reqs, (_ref, group) => ({
    chunks: chunks.filter((c) => group.some((r) => r.custom_id === c.customId)),
  }));
}

/** Puts the rewrites in the drafts when they pass every gate and the stricter rubric; changed items are re-verified. */
function explainApplyCommand() {
  const drafts = loadDrafts();
  runGates(drafts);
  const store = readJson<Record<string, string>>(explPath, {});
  const changed: string[] = [];
  let refused = 0;
  for (const [id, text] of Object.entries(store)) {
    const parsed = parseItemId(id);
    const d = parsed && drafts[dkey(parsed.course, parsed.lessonId)];
    if (!parsed || !d?.extra[parsed.type]) continue;
    const before = d.extra[parsed.type] as { explanation: string };
    if (before.explanation === text) continue;
    const trial: LessonExtra = {
      ...d.extra,
      [parsed.type]: { ...before, explanation: text },
    };
    const gate = gateExtra(
      parsed.type,
      trial,
      gateContext(d.course, d.level as GateContext["level"], baseKeys(d.course)),
    ).problems.filter((p) => !/^duplicate:/.test(p));
    const had = new Set(d.problems[parsed.type] ?? []);
    if (gate.some((p) => !had.has(p)) || strictExplanationProblems(text).length) {
      refused++;
      continue;
    }
    d.extra = trial;
    changed.push(id);
  }
  runGates(drafts);
  saveDrafts(drafts);
  invalidate(changed, { keepAlts: true });
  console.log(
    `explain-apply: ${changed.length} explanations rewritten, ${refused} refused by the gates.`,
  );
}

/** Items that still need a redraft and what is wrong (no spend). */
function regenReport() {
  const drafts = loadDrafts();
  runGates(drafts);
  const regen = loadRegen();
  let failing = 0;
  const byType: Record<string, number> = {};
  for (const d of Object.values(drafts))
    for (const t of d.need) {
      const id = extraItemId(d.course, d.lessonId, t);
      if (!passing(d, t) || regen[id]) {
        failing++;
        byType[t] = (byType[t] ?? 0) + 1;
      }
    }
  console.log(
    `regen set: ${failing} items (${JSON.stringify(byType)}); ${Object.keys(regen).length} queued by rulings.`,
  );
}

/** The published error rate: 300 items (100 per course) from the content as it will ship, judged blind. */
async function blindCommand() {
  const drafts = loadDrafts();
  runGates(drafts);
  const apply = readJson<{ owner: Ruling[] }>(path.join(STATE, "apply.json"), { owner: [] });
  const held = new Set(apply.owner.map((r) => r.id));
  const round = Number(arg("round", "1"));
  // A later round is a FRESH sample of the post-fix content: every earlier sample's ids are excluded.
  const earlier = new Set<string>();
  for (let r = 1; r < round; r++)
    for (const id of readJson<string[]>(path.join(STATE, blindFiles(r).sample), []))
      earlier.add(id);
  const items = reviewItems(drafts).filter((it) => !held.has(it.id) && !earlier.has(it.id));
  const sample = blindSample(items, 100, round === 1 ? SEED : `${SEED}:round${round}`);
  writeJson(
    path.join(STATE, blindFiles(round).sample),
    sample.map((it) => it.id),
  );
  const done = blindFiles(round).load();
  const todo = sample.filter((it) => !done[it.id]);
  const none = new Map<string, Verdict>();
  const chunks = chunk(todo, "bld");
  const reqs = chunks.map((c) =>
    buildRequest(c, {
      model: MODEL.judge,
      effort: "medium",
      system: judgeSystem(c.course),
      user: userMessage(c, (it) => judgeContext(it, none, none)),
      maxTokens: maxTokensFor(c, ASSUME.maxOut.judge),
    }),
  );
  if (!reqs.length) return console.log("blind: the sample is already judged.");
  console.log(`blind round ${round}: ${sample.length} items sampled, ${todo.length} to judge.`);
  await submitAnthropic(blindFiles(round).phase, MODEL.judge, reqs, (_ref, group) => ({
    chunks: chunks.filter((c) => group.some((r) => r.custom_id === c.customId)),
  }));
}

function blindStats(round = 1) {
  const ids = readJson<string[]>(path.join(STATE, blindFiles(round).sample), []);
  const b = blindFiles(round).load();
  const judged = ids.filter((id) => b[id]);
  const bad = judged.filter((id) => b[id]!.decision !== "keep");
  const wrongSide = bad.filter((id) =>
    ["second-answer", "wrong-key"].includes(b[id]!.category ?? ""),
  );
  const byCategory: Record<string, number> = {};
  for (const id of bad)
    byCategory[b[id]!.category ?? "other"] = (byCategory[b[id]!.category ?? "other"] ?? 0) + 1;
  return {
    n: judged.length,
    defects: bad.length,
    markedWrong: wrongSide.length,
    markedWrongStats: wilson(wrongSide.length, judged.length),
    byCategory,
    ...wilson(bad.length, judged.length),
  };
}

/** A held item's reason in plain English (the raw gate text stays in held-for-owner.json). */
const plainWhy = (why: string) => {
  const n = /after (\d+) drafts/.exec(why)?.[1];
  const tries = n ? ` after ${n} tries` : "";
  if (/meta text/.test(why))
    return `The explanation keeps reading like an instruction to us instead of a note to the learner${tries}, so this question is left out until a person rewrites it.`;
  if (/words|close variant|audio is/.test(why))
    return `The wrong choices keep being too far from (or a different length than) the sentence that is played${tries}, so this listening question is left out.`;
  if (/never returned/.test(why))
    return `The model never produced this question${tries}, so it is left out.`;
  return why.replace(/\s+/g, " ").slice(0, 200);
};

/** The bulk summary page and the held-for-owner file (docs/lesson-mix/held-for-owner.json). */
function exportBulkPage(a: {
  drafts: Record<string, Draft>;
  claude: Record<string, Verdict>;
  mistral: Record<string, Verdict>;
  rulings: Record<string, Ruling>;
  apply: { applied: string[]; refused: { id: string; why: string[] }[]; owner: Ruling[] };
  lessons: PageLesson[];
  out: Record<Course, Record<string, LessonExtra>>;
  dir: string;
}) {
  const { drafts, claude, rulings, apply, lessons, out } = a;
  const shipped = { listening: 0, speak: 0, translate: 0 } as Record<ExtraType, number>;
  for (const c of COURSES)
    for (const r of Object.values(out[c])) for (const t of EXTRA_TYPES) if (r[t]) shipped[t]++;
  const total = shipped.listening + shipped.speak + shipped.translate;
  const all = Object.values(drafts);
  const needed = all.reduce((n, d) => n + d.need.length, 0);
  const dropped = all.reduce((n, d) => n + d.need.filter((t) => !passing(d, t)).length, 0);
  const firstPass = all.reduce(
    (n, d) =>
      n +
      d.need.filter((t) => d.firstProblems[t] !== undefined && !d.firstProblems[t]!.length).length,
    0,
  );
  const cv = Object.values(claude);
  const flagged = cv.filter((v) => v.verdict === "defect").length;
  const rv = Object.values(rulings);
  const n = (x: string) => rv.filter((r) => r.decision === x).length;
  const b1 = blindStats(1);
  const b2 = blindStats(2);
  const b3 = blindStats(3);
  const b4 = blindStats(4);
  const ledger = openLedger().status();
  const pct = (x: number, y: number) => `${((100 * x) / Math.max(1, y)).toFixed(1)}%`;
  const range = (b: ReturnType<typeof blindStats>) =>
    `95% range ${(100 * b.low).toFixed(1)} to ${(100 * b.high).toFixed(1)}%`;
  const cats = (b: ReturnType<typeof blindStats>) =>
    Object.entries(b.byCategory)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
  const blindLine = (b: ReturnType<typeof blindStats>, what: string) =>
    b.n
      ? `${what}. ${b.n} items (100 per course), ${b.defects} defects, error rate ${(100 * b.rate).toFixed(1)}% (${range(b)}). A correct answer that would be marked wrong (a valid alternative or a wrong key): ${b.markedWrong} of ${b.n} (${(100 * b.markedWrongStats.rate).toFixed(1)}%, 95% range ${(100 * b.markedWrongStats.low).toFixed(1)} to ${(100 * b.markedWrongStats.high).toFixed(1)}%). Defects by category: ${cats(b) || "none"}.`
      : `${what}: not run.`;
  // Every wanted item that is not in the data: still held for the owner, or dropped by the gates.
  const heldRows: {
    id: string;
    why: string;
    decision?: string;
    confidence?: number;
    patch?: unknown;
    draft?: unknown;
  }[] = apply.owner.map((r) => {
    const parsed = parseItemId(r.id);
    const d = parsed ? drafts[dkey(parsed.course, parsed.lessonId)] : undefined;
    return {
      id: r.id,
      why: r.reason,
      decision: r.decision,
      confidence: r.confidence,
      patch: r.patch,
      draft: d && parsed ? d.extra[parsed.type] : undefined,
    };
  });
  const have = new Set(heldRows.map((h) => h.id));
  for (const d of all)
    for (const t of d.need) {
      const id = extraItemId(d.course, d.lessonId, t);
      if (passing(d, t) || have.has(id)) continue;
      heldRows.push({
        id,
        why: d.extra[t]
          ? `failed the automatic checks after ${d.rounds} drafts: ${(d.problems[t] ?? [])[0] ?? ""}`
          : `the model never returned it after ${d.rounds} drafts`,
        draft: d.extra[t],
      });
    }
  writeJson(path.resolve("docs/lesson-mix/held-for-owner.json"), heldRows);
  // The owner's spot-check: about 60 items, 20 per course and 4 per level, drawn at random.
  const LEVELS: string[] = ["A1", "A2", "B1", "B2", "C1"];
  const spot: PageLesson[] = [];
  for (const c of COURSES)
    for (const level of LEVELS) {
      const pool = lessons
        .filter((l) => l.course === c && l.level === level)
        .flatMap((l) => l.items.map((it) => ({ l, it })))
        .filter(({ it }) => it.status !== "held" && it.status !== "dropped")
        .sort(
          (x, y) =>
            (hash(`${SEED}:spot:${c}:${x.l.lessonId}:${x.it.type}`) >>> 0) -
            (hash(`${SEED}:spot:${c}:${y.l.lessonId}:${y.it.type}`) >>> 0),
        );
      for (const { l, it } of pool.slice(0, 4)) spot.push({ ...l, items: [it] });
    }
  const html = renderPage(
    "Lesson mix: every lesson",
    {
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
      lines: [
        [
          "Lessons and items",
          `${all.length} lessons drafted; ${total} new questions ship (listening ${shipped.listening}, speak ${shipped.speak}, translate ${shipped.translate}) of ${needed} wanted; ${heldRows.length} are held back.`,
        ],
        [
          "Automatic checks",
          `${pct(needed - dropped, needed)} of items pass the checks (now including a gate that rejects text written for developers instead of learners); ${pct(firstPass, needed)} passed on the very first draft.`,
        ],
        [
          "Panel",
          `Sonnet 5.5 reviewed ${cv.length} items and flagged ${flagged} (${pct(flagged, cv.length)}). Opus judged ${rv.length} (this round, after the redrafts): ${n("fix")} fix, ${n("keep")} keep, ${rv.length - n("fix") - n("keep")} other.`,
        ],
        [
          "Blind sample 1 (before the fixes)",
          blindLine(b1, "The first bulk, before any fix, judged blind by Opus"),
        ],
        [
          "Blind sample 2 (after the first fixes)",
          blindLine(
            b2,
            "After the first fixes, a fresh sample (the first sample's items excluded), judged blind by Opus",
          ),
        ],
        [
          "Blind sample 3 (after the targeted round)",
          blindLine(
            b3,
            "After the targeted round (a second Sonnet pass for extra accepted answers, then Opus read every translate and listening item), a fresh sample of the shipping content (samples 1 and 2 excluded), judged blind by Opus. The target was 6% with no wrong-answer defects: NOT met. The 29 patches Opus proposed for this sample's defects were applied afterwards, which this rate does not reflect",
          ),
        ],
        [
          "Blind sample 4 (after the owner's extra round)",
          blindLine(
            b4,
            "After an Opus pass over every translate and listening item for answers the grader would reject, a stricter explanation rewrite and a re-check of the regional, naturalness and spelling findings, a fresh sample (samples 1 to 3 excluded), judged blind by Opus",
          ),
        ],
        [
          "Second opinion",
          "Mistral stayed off (403 / 429 as in the pilot). Everything is AI-reviewed (Sonnet reads, Opus judges), not native-reviewed.",
        ],
        [
          "Spend",
          `US$${ledger.settledUsd.toFixed(2)} settled of the US$${LESSON_MIX_CAP_USD} cap (all providers, pilot and both bulk rounds included).`,
        ],
        [
          "Not merged",
          "The data is wired into the app on this branch only; the database is not reseeded. Order: cut and distribute the native build, merge, then reseed immediately after the deploy.",
        ],
        ...heldRows.map((h, i): [string, string] => [`Held ${i + 1}: ${h.id}`, plainWhy(h.why)]),
      ],
      note: `Below: a random spot-check of ${spot.length} items (20 per course, 4 per level), none of them held. Green line = the answer.`,
    },
    spot,
  );
  const page = path.resolve(
    arg("page", "D:/AgentDevWork/repos/renders-2026-11-19/lesson-mix-bulk/index.html"),
  );
  fs.mkdirSync(path.dirname(page), { recursive: true });
  fs.writeFileSync(page, html);
  console.log(
    `export --bulk: ${total} items in ${Object.values(out).reduce((x, c) => x + Object.keys(c).length, 0)} lessons written to ${a.dir}; ${heldRows.length} held; page ${page} (${(html.length / 1024).toFixed(0)} KB)`,
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
  const bulk = flag("bulk");
  const pilot: { course: Course; lessonId: string }[] = bulk
    ? Object.values(drafts)
        .map((d) => ({ course: d.course, lessonId: d.lessonId }))
        .sort((a, b) => (dkey(a.course, a.lessonId) < dkey(b.course, b.lessonId) ? -1 : 1))
    : readJson<PilotLesson[]>(path.join(STATE, "pilot.json"), []);
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
      // A held item (a suspected wrong key) never ships: it waits for the owner.
      if (!problems.length && !(bulk && status === "held"))
        (record as Record<string, unknown>)[t] = d.extra[t];
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
  const dir = path.resolve(arg("docs", bulk ? "src/data/lesson-extras" : "docs/lesson-mix/pilot"));
  for (const c of COURSES) writeJson(path.join(dir, `${c}.json`), out[c]);
  writeJson(path.join(STATE, "page-lessons.json"), lessons);
  if (bulk) return exportBulkPage({ drafts, claude, mistral, rulings, apply, lessons, out, dir });
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
          "Panel results",
          (() => {
            const cv = Object.values(claude);
            const rv = Object.values(rulings);
            const d = cv.filter((v) => v.verdict === "defect").length;
            const n = (x: string) => rv.filter((r) => r.decision === x).length;
            return `Sonnet reviewed ${cv.length} items and flagged ${d} (${((100 * d) / Math.max(1, cv.length)).toFixed(1)}%). Opus judged ${rv.length} (the ${d} flagged plus the control sample of Sonnet-passed items): ${n("fix")} fix, ${n("keep")} keep, ${rv.length - n("fix") - n("keep")} other.`;
          })(),
        ],
        [
          "Mistral second opinion",
          "UNAVAILABLE. Mistral Large 4 returned HTTP 403 (account tier), and Medium and Small returned HTTP 429 on every retry, both directly and through OpenRouter (BYOK). The Opus judge ran on every Sonnet-flagged item plus the control sample instead, so this pilot has no independent second model.",
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
  alts: altsCommand,
  explain: explainCommand,
  "explain-apply": explainApplyCommand,
  "merge-alts": mergeAltsCommand,
  regen: regenReport,
  tidy: tidyCommand,
  blind: blindCommand,
  export: exportCommand,
  status,
};
const run = commands[cmd];
if (!run) {
  console.error(`Unknown command ${cmd}. See the header of this file.`);
  process.exit(1);
}
await run();
