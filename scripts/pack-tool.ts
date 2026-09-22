/**
 * Content-authoring CLI for the bank-engine Pack format (V4 #5, "content
 * authoring tooling") -- wraps the exact format `src/data/bank-engine.ts`
 * already defines (`Pack` -> `packQuestions()` -> `buildLevel()`) rather
 * than inventing a new one, so a new lesson pack -- or checking a
 * hand-written one -- doesn't require directly hand-editing a 3000+ line
 * lesson-bank-*.ts array and hoping it parses.
 *
 * All the actual logic (validation, preview rendering, TS file-splicing,
 * AI-draft prompt/parse) lives in src/lib/pack-authoring.ts and
 * src/lib/pack-draft-generation.server.ts -- typechecked (tsconfig.json's
 * `include`) and covered by Vitest, unlike this file, which is a thin
 * argv/fs wrapper (scripts/ isn't part of the app bundle or the typecheck
 * include, same as every other script in this directory).
 *
 * Usage (run with bun, which executes TS directly -- no build step):
 *   bun run scripts/pack-tool.ts new     --course es --level A1 --id esa1p9 [--kind pair|cloze] [--out drafts/esa1p9.json]
 *   bun run scripts/pack-tool.ts draft   --course es --level A1 --id esa1p9 --topic "Weather vocabulary" [--kind pair|cloze] [--lines 20] [--out drafts/esa1p9.json]
 *   bun run scripts/pack-tool.ts validate <file.json> [--course es]
 *   bun run scripts/pack-tool.ts preview  <file.json>
 *   bun run scripts/pack-tool.ts apply    <file.json> --course es --level A1 [--confirm]
 *
 * Every command that can touch a real lesson-bank-*.ts file (`apply`) is
 * part of a human-gated pipeline: `new` (hand-write) or `draft` (AI first
 * draft, NVIDIA_API_KEY required) -> `validate`/`preview` -> `apply
 * --confirm`. `apply` without `--confirm` is a dry run. Nothing in this
 * tool ever writes to a lesson-bank-*.ts file without that explicit flag.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Pack } from "../src/data/bank-engine";
import type { Level } from "../src/data/levels";
import { resolveNvidiaChatModel } from "../src/lib/nvidia-chat-model.server";
import {
  checkIdCollision,
  extractPackIds,
  hasErrors,
  insertPackIntoBank,
  previewPack,
  validatePack,
  type PackIssue,
} from "../src/lib/pack-authoring";
import { draftPack } from "../src/lib/pack-draft-generation.server";
import { GENERATIVE_VOCAB } from "../src/data/generative/vocab";
import { TEMPLATES } from "../src/data/generative/templates";
import { expandTemplate } from "../src/data/generative/expand";
import { proposeVocabForTopic } from "../src/lib/generative-vocab.server";
import { replaceVocabArrayInSource } from "../src/lib/generative-vocab-authoring";

type Course = "en" | "fr" | "es";
const COURSES: Course[] = ["en", "fr", "es"];
const LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1"];
const TARGET_LANGUAGE: Record<Course, string> = { en: "English", fr: "French", es: "Spanish" };
const BANK_FILE: Record<Course, string> = {
  en: "src/data/lesson-bank.ts",
  fr: "src/data/lesson-bank-fr.ts",
  es: "src/data/lesson-bank-es.ts",
};

function isCourse(v: unknown): v is Course {
  return typeof v === "string" && (COURSES as string[]).includes(v);
}
function isLevel(v: unknown): v is Level {
  return typeof v === "string" && (LEVELS as string[]).includes(v);
}

type Flags = Record<string, string | boolean>;

/** Tiny argv parser: `<command> <positional...> [--flag [value]]...` -- no dependency needed for a 5-command CLI. */
function parseArgs(argv: string[]): { command?: string; positional: string[]; flags: Flags } {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}

function printIssues(issues: PackIssue[]) {
  if (issues.length === 0) {
    console.log("  no issues.");
    return;
  }
  for (const issue of issues) console.log(`  [${issue.level.toUpperCase()}] ${issue.message}`);
}

function readPackFile(path: string): Pack {
  if (!existsSync(path)) fail(`file not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as Pack;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function requireCourse(flags: Flags): Course {
  if (!isCourse(flags.course)) fail(`--course must be one of ${COURSES.join(", ")}`);
  return flags.course as Course;
}
function requireLevel(flags: Flags): Level {
  if (!isLevel(flags.level)) fail(`--level must be one of ${LEVELS.join(", ")}`);
  return flags.level as Level;
}
function requireString(flags: Flags, key: string, hint: string): string {
  const v = flags[key];
  if (typeof v !== "string" || !v) fail(`--${key} is required (${hint})`);
  return v as string;
}
function packKind(flags: Flags): "pair" | "cloze" {
  const k = flags.kind ?? "pair";
  if (k !== "pair" && k !== "cloze") fail('--kind must be "pair" or "cloze"');
  return k as "pair" | "cloze";
}

function cmdNew(flags: Flags) {
  const course = requireCourse(flags);
  const level = requireLevel(flags);
  const id = requireString(flags, "id", "e.g. esa1p9");
  const kind = packKind(flags);
  const out = typeof flags.out === "string" ? flags.out : `drafts/${id}.json`;

  const pack: Pack = {
    id,
    title: "TODO title",
    subtitle: "TODO subtitle",
    kind,
    ...(kind === "pair" ? { prompt: 'TODO prompt with "%s" (e.g. How do you say "%s"?)' } : {}),
    note: "TODO note -- shown appended to each question's explanation.",
    data:
      kind === "pair"
        ? [1, 2, 3, 4, 5].map((n) => `TODO left ${n}|TODO right ${n}`).join("\n")
        : [1, 2, 3].map((n) => `TODO sentence ${n} with a ___ blank.|TODO answer ${n}`).join("\n"),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(pack, null, 2) + "\n");
  console.log(
    `Scaffolded a draft pack at ${out}. Fill in the TODOs (aim for a multiple of 5 data lines), then:`,
  );
  console.log(`  bun run scripts/pack-tool.ts validate ${out} --course ${course}`);
  console.log(`  bun run scripts/pack-tool.ts preview ${out}`);
  console.log(`  bun run scripts/pack-tool.ts apply ${out} --course ${course} --level ${level}`);
}

async function cmdDraft(flags: Flags) {
  const course = requireCourse(flags);
  const level = requireLevel(flags);
  const id = requireString(flags, "id", "e.g. esa1p9");
  const topic = requireString(flags, "topic", 'e.g. "Weather vocabulary"');
  const kind = packKind(flags);
  const lineCount = flags.lines ? Number(flags.lines) : 20;
  const out = typeof flags.out === "string" ? flags.out : `drafts/${id}.json`;
  if (!Number.isFinite(lineCount) || lineCount < 3) fail("--lines must be a number >= 3");

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    fail(
      "NVIDIA_API_KEY is not set. AI-assisted drafting needs a NVIDIA NIM key (see .env.example, " +
        'build.nvidia.com) -- without one, hand-write a draft instead with "bun run scripts/pack-tool.ts new".',
    );
  }

  console.log(`Drafting "${topic}" (${course}, ${level}, ${kind}, ${lineCount} lines)...`);
  let result: Awaited<ReturnType<typeof draftPack>>;
  try {
    result = await draftPack({
      topic,
      targetLanguage: TARGET_LANGUAGE[course],
      kind,
      lineCount,
      nvidiaApiKey: apiKey,
      nvidiaModel: resolveNvidiaChatModel(),
    });
  } catch (e) {
    fail(`draft generation failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const pack: Pack = {
    id,
    title: result.title,
    subtitle: result.subtitle,
    kind,
    ...(kind === "pair" ? { prompt: `How do you say "%s" in ${TARGET_LANGUAGE[course]}?` } : {}),
    note: result.note,
    data: result.lines.join("\n"),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(pack, null, 2) + "\n");
  console.log(`\nDraft written to ${out}.`);
  console.log(
    "THIS IS AN AI-GENERATED DRAFT, NOT REVIEWED CONTENT. Read every line for accuracy and",
  );
  console.log(
    "natural phrasing before validating/applying -- edit the file directly if anything is off.\n",
  );
  console.log(previewPack(pack));
  console.log("\nValidation:");
  printIssues(validatePack(pack));
}

const VOCAB_FILE = "src/data/generative/vocab.ts";

async function cmdGenerate(flags: Flags) {
  const course = requireCourse(flags);
  if (course !== "en") {
    fail(
      '--course must be "en" -- this pilot is English-only, see ' +
        "docs/superpowers/specs/2026-09-22-generative-sentence-content-design.md",
    );
  }
  const level = requireLevel(flags);
  const id = requireString(flags, "id", "e.g. a1gen1");
  const templateId = requireString(
    flags,
    "template",
    `one of ${TEMPLATES.map((t) => t.id).join(", ")}`,
  );
  const topic = requireString(flags, "topic", 'e.g. "daily routines"');
  const count = flags.count ? Number(flags.count) : 25;
  const out = typeof flags.out === "string" ? flags.out : `drafts/${id}.json`;
  if (!Number.isFinite(count) || count < 3) fail("--count must be a number >= 3");

  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    fail(`unknown --template "${templateId}" -- must be one of ${TEMPLATES.map((t) => t.id).join(", ")}`);
  }
  if (template!.level !== level) {
    fail(`--level ${level} doesn't match template "${templateId}"'s level (${template!.level})`);
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    fail(
      "NVIDIA_API_KEY is not set. Vocab proposal needs a NVIDIA NIM key (see .env.example, " +
        "build.nvidia.com).",
    );
  }

  const posTypes = [
    ...new Set(template!.slots.filter((s) => s.pos !== "pronoun").map((s) => s.pos)),
  ];

  console.log(`Proposing vocab for "${topic}" (${posTypes.join(", ")})...`);
  const proposal = await proposeVocabForTopic({
    topic,
    posTypes,
    level,
    existingVocab: GENERATIVE_VOCAB,
    nvidiaApiKey: apiKey,
    nvidiaModel: resolveNvidiaChatModel(),
  });

  console.log(`  accepted: ${proposal.accepted.length}, rejected: ${proposal.rejected.length}`);
  if (proposal.rejected.length > 0) {
    console.log("  rejected (needs manual review -- POS mismatch, or excluded like \"be\"):");
    for (const r of proposal.rejected) console.log(`    - ${r.word} (claimed ${r.pos})`);
  }

  if (proposal.accepted.length > 0) {
    if (!existsSync(VOCAB_FILE)) fail(`vocab file not found: ${VOCAB_FILE}`);
    const vocabSource = readFileSync(VOCAB_FILE, "utf-8");
    const updated = replaceVocabArrayInSource(vocabSource, proposal.merged);
    writeFileSync(VOCAB_FILE, updated);
    console.log(`  written ${proposal.accepted.length} new vocab entries to ${VOCAB_FILE}.`);
  }

  const lines = expandTemplate({
    template: template!,
    vocab: proposal.merged,
    packId: id,
    targetCount: count,
  });

  if (lines.length === 0) {
    fail(
      `no sentences could be generated -- not enough vocab at level ${level} for this ` +
        `template's required parts of speech (${posTypes.join(", ")}). Run "generate" again ` +
        "with a broader topic, or add vocab manually.",
    );
  }
  if (lines.length < count) {
    console.log(
      `  warning: only ${lines.length} distinct sentences possible (requested ${count}) -- ` +
        "the vocab pool for this topic/level is small. Not an error, just a shortfall.",
    );
  }

  const pack: Pack = {
    id,
    title: topic.replace(/^\w/, (c) => c.toUpperCase()),
    subtitle: `Generated: ${template!.tense}-tense sentences`,
    kind: "cloze",
    note: `Auto-generated via "${template!.id}" -- verb-conjugation practice.`,
    data: lines.join("\n"),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(pack, null, 2) + "\n");
  console.log(`\nDraft pack written to ${out} (${lines.length} lines).`);
  console.log(
    "THIS IS GENERATED CONTENT -- grammar is compiler-verified, but read every line before",
  );
  console.log("validating/applying, same discipline as a hand-authored or AI-drafted pack.\n");
  console.log(previewPack(pack));
  console.log("\nValidation:");
  printIssues(validatePack(pack));
  console.log(`\nNext:`);
  console.log(`  bun run scripts/pack-tool.ts validate ${out} --course ${course}`);
  console.log(`  bun run scripts/pack-tool.ts apply ${out} --course ${course} --level ${level}`);
}

function cmdValidate(positional: string[], flags: Flags) {
  const file = positional[0];
  if (!file) fail("usage: validate <file.json> [--course en|fr|es]");
  const pack = readPackFile(file);
  const issues = validatePack(pack);

  if (flags.course !== undefined) {
    const course = requireCourse(flags);
    const bankPath = BANK_FILE[course];
    if (existsSync(bankPath)) {
      const collision = checkIdCollision(pack.id, extractPackIds(readFileSync(bankPath, "utf-8")));
      if (collision) issues.push(collision);
    }
  }

  console.log(`Validating "${pack.id}":`);
  printIssues(issues);
  if (hasErrors(issues)) fail("fix the error(s) above before applying.");
  const warnings = issues.length;
  console.log(`\nOK (errors: 0${warnings ? `, warnings: ${warnings}` : ""}).`);
}

function cmdPreview(positional: string[]) {
  const file = positional[0];
  if (!file) fail("usage: preview <file.json>");
  console.log(previewPack(readPackFile(file)));
}

function cmdApply(positional: string[], flags: Flags) {
  const file = positional[0];
  if (!file) fail("usage: apply <file.json> --course en|fr|es --level A1..C1 [--confirm]");
  const course = requireCourse(flags);
  const level = requireLevel(flags);
  const confirm = flags.confirm === true;

  const pack = readPackFile(file);
  const bankPath = BANK_FILE[course];
  if (!existsSync(bankPath)) fail(`bank file not found: ${bankPath}`);
  const fileSource = readFileSync(bankPath, "utf-8");

  const issues = validatePack(pack);
  const collision = checkIdCollision(pack.id, extractPackIds(fileSource));
  if (collision) issues.push(collision);

  console.log(previewPack(pack));
  console.log("\nValidation:");
  printIssues(issues);

  if (hasErrors(issues)) fail(`fix the error(s) above -- nothing written to ${bankPath}.`);

  const result = insertPackIntoBank(fileSource, level, pack);
  if ("error" in result) fail(result.error);

  if (!confirm) {
    console.log(
      `\nDry run only -- would insert "${pack.id}" into ${bankPath}'s ${level} array. Re-run with --confirm to write.`,
    );
    return;
  }

  writeFileSync(bankPath, result.updated);
  console.log(`\nApplied: "${pack.id}" inserted into ${bankPath}'s ${level} array.`);
  console.log(
    'Run "bun run test" and "bunx tsc --noEmit" next to confirm the file still parses and passes.',
  );
}

function printHelp(exitCode: number) {
  console.log(
    [
      "Content-authoring CLI for lesson-bank Pack content (bank-engine format).",
      "",
      "Commands:",
      "  new      --course <en|fr|es> --level <A1..C1> --id <id> [--kind pair|cloze] [--out <path>]",
      "  draft    --course <en|fr|es> --level <A1..C1> --id <id> --topic <topic> [--kind pair|cloze] [--lines N] [--out <path>]",
      "  generate --course en --level <A1..C1> --id <id> --template <svo-present|svo-past> --topic <topic> [--count N] [--out <path>]",
      "  validate <file.json> [--course <en|fr|es>]",
      "  preview  <file.json>",
      "  apply    <file.json> --course <en|fr|es> --level <A1..C1> [--confirm]",
    ].join("\n"),
  );
  process.exit(exitCode);
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "new":
      cmdNew(flags);
      break;
    case "draft":
      await cmdDraft(flags);
      break;
    case "generate":
      await cmdGenerate(flags);
      break;
    case "validate":
      cmdValidate(positional, flags);
      break;
    case "preview":
      cmdPreview(positional);
      break;
    case "apply":
      cmdApply(positional, flags);
      break;
    default:
      printHelp(command ? 1 : 0);
  }
}

main();
