import type { Pack } from "../data/bank-engine";
import { packQuestions } from "../data/bank-engine";
import type { Level } from "../data/levels";

/**
 * Content-authoring tooling (V4 #5): validation, preview, and file-splicing
 * helpers for the `scripts/pack-tool.ts` CLI. Kept here (not in scripts/,
 * which isn't part of `tsconfig.json`'s `include` and so isn't typechecked
 * or covered by Vitest) so the actual logic gets the same strict-TS +
 * Vitest coverage as everything else -- the CLI script itself stays a thin
 * argv/fs wrapper around these pure functions, same split as
 * `scripts/seed-curriculum-db.ts` importing from `src/lib/curriculum-seed.ts`.
 */

export type PackIssueLevel = "error" | "warning";
export type PackIssue = { level: PackIssueLevel; message: string };

const ID_PATTERN = /^[a-z][a-z0-9]*$/;
const QUESTIONS_PER_LESSON = 5;

/**
 * Validates a draft pack against the actual shape `packQuestions()` /
 * `buildLevel()` expect (`src/data/bank-engine.ts`), so a pack that
 * wouldn't parse -- or would silently drop content -- fails loudly here
 * instead of shipping a broken/short lesson into a real lesson-bank-*.ts
 * file. `error` issues mean the pack is unsafe to apply; `warning` issues
 * are quality/pedagogy footguns worth a human look but not blocking.
 */
export function validatePack(pack: Pack): PackIssue[] {
  const issues: PackIssue[] = [];

  if (!pack.id?.trim()) {
    issues.push({ level: "error", message: "id is empty." });
  } else if (!ID_PATTERN.test(pack.id)) {
    issues.push({
      level: "error",
      message: `id "${pack.id}" must be lowercase letters/digits only, matching existing pack ids (e.g. "esa1p6", "a1p1").`,
    });
  }

  if (!pack.title?.trim()) issues.push({ level: "error", message: "title is empty." });
  if (!pack.subtitle?.trim()) issues.push({ level: "error", message: "subtitle is empty." });
  if (!pack.note?.trim()) issues.push({ level: "error", message: "note is empty." });

  if (pack.kind !== "pair" && pack.kind !== "cloze") {
    issues.push({
      level: "error",
      message: `kind must be "pair" or "cloze", got "${String(pack.kind)}".`,
    });
  }
  if (pack.kind === "pair" && !pack.prompt?.includes("%s")) {
    issues.push({
      level: "error",
      message:
        'pair packs need a `prompt` string containing "%s" -- the left side of each data line ' +
        "gets substituted in (e.g. 'How do you say \"%s\" in Spanish?').",
    });
  }
  if (pack.kind === "cloze" && pack.prompt) {
    issues.push({
      level: "warning",
      message:
        "cloze packs don't use `prompt` (packQuestions() ignores it for cloze) -- did you mean this to be a pair pack?",
    });
  }

  const rawLines = (pack.data ?? "").split("\n").map((l) => l.trim());
  const lines = rawLines.filter(Boolean);
  if (lines.length === 0) {
    issues.push({ level: "error", message: "data has no content lines." });
    return issues;
  }

  const seenAnswers = new Set<string>();
  const seenLefts = new Set<string>();
  lines.forEach((line, i) => {
    const parts = line.split("|");
    if (parts.length !== 2) {
      issues.push({
        level: "error",
        message: `line ${i + 1}: expected exactly one "|" separating left and right sides, found ${parts.length - 1} -- "${line}"`,
      });
      return;
    }
    const [left, right] = parts.map((p) => p.trim());
    if (!left) issues.push({ level: "error", message: `line ${i + 1}: left side is empty.` });
    if (!right) issues.push({ level: "error", message: `line ${i + 1}: right side is empty.` });
    if (pack.kind === "cloze" && left && !left.includes("___")) {
      issues.push({
        level: "warning",
        message: `line ${i + 1}: cloze line has no "___" blank marker -- "${left}"`,
      });
    }
    if (left) {
      const key = left.toLowerCase();
      if (seenLefts.has(key)) {
        issues.push({ level: "warning", message: `line ${i + 1}: duplicate left side "${left}".` });
      }
      seenLefts.add(key);
    }
    if (right) seenAnswers.add(right.toLowerCase());
  });

  if (lines.length % QUESTIONS_PER_LESSON !== 0) {
    const full = Math.floor(lines.length / QUESTIONS_PER_LESSON);
    const leftover = lines.length % QUESTIONS_PER_LESSON;
    const tail =
      leftover >= 3
        ? `+ 1 short lesson (${leftover} questions)`
        : `and silently drop the trailing ${leftover} line(s) entirely (buildLevel() requires at least 3 questions to keep a partial lesson)`;
    issues.push({
      level: "warning",
      message:
        `${lines.length} data line(s) isn't a multiple of ${QUESTIONS_PER_LESSON} -- buildLevel() ` +
        `groups every ${QUESTIONS_PER_LESSON} lines into one lesson. This pack will yield ${full} full lesson(s) ${tail}.`,
    });
  }

  if (lines.length >= 4 && seenAnswers.size < 4) {
    issues.push({
      level: "warning",
      message:
        `only ${seenAnswers.size} distinct right-side answer(s) across ${lines.length} lines -- ` +
        `multiple-choice distractors are drawn from the pack's own answer pool, so questions may ` +
        `end up repeating the same wrong choices.`,
    });
  }

  try {
    const qs = packQuestions(pack);
    if (qs.length !== lines.length) {
      issues.push({
        level: "error",
        message: `packQuestions() produced ${qs.length} question(s) from ${lines.length} data line(s) -- unexpected mismatch, don't apply until this is understood.`,
      });
    }
  } catch (e) {
    issues.push({
      level: "error",
      message: `packQuestions() threw: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  return issues;
}

export function hasErrors(issues: PackIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}

/** Flags a pack id that collides with one already present in the target course's bank. */
export function checkIdCollision(
  packId: string,
  existingIds: ReadonlySet<string>,
): PackIssue | null {
  return existingIds.has(packId)
    ? {
        level: "error",
        message: `pack id "${packId}" already exists in this course's bank -- ids must be unique (lesson/question ids are derived from it).`,
      }
    : null;
}

/** Renders the lessons/questions a pack would actually generate, for human review before merging. */
export function previewPack(pack: Pack): string {
  const dataLineCount = (pack.data ?? "").split("\n").filter((l) => l.trim()).length;
  const out: string[] = [
    `Pack "${pack.id}" -- ${pack.title}`,
    `  ${pack.subtitle} (${pack.kind}, ${dataLineCount} data lines)`,
  ];
  let qs: ReturnType<typeof packQuestions>;
  try {
    qs = packQuestions(pack);
  } catch (e) {
    out.push(`  [could not generate preview: ${e instanceof Error ? e.message : String(e)}]`);
    return out.join("\n");
  }
  qs.forEach((q, i) => {
    out.push("", `  Q${i + 1} [${q.type}] ${q.prompt}`);
    if (q.type === "mc") {
      q.choices.forEach((c, ci) => out.push(`      ${ci === q.answer ? "*" : " "} ${c}`));
    } else if (q.type === "fill") {
      out.push(`      bank: ${q.bank.join(", ")}`);
      out.push(`      answer: ${q.answer}`);
    } else {
      out.push(`      answer: ${q.answer}`);
    }
    out.push(`      explanation: ${q.explanation}`);
  });
  return out.join("\n");
}

/** Extracts every `id: "..."` pack id from a lesson-bank-*.ts file's source text. */
export function extractPackIds(fileSource: string): Set<string> {
  const ids = new Set<string>();
  const re = /^\s*id:\s*"([^"]+)",?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fileSource))) ids.add(m[1]!);
  return ids;
}

function tsString(s: string): string {
  if (s.includes('"') && !s.includes("'")) return `'${s}'`;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tsTemplate(s: string): string {
  return `\`${s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
}

/** Formats a Pack as the TS object-literal source used in lesson-bank-*.ts (2-space indent, trailing comma). */
export function formatPackAsTs(pack: Pack): string {
  const lines = ["  {", `    id: ${tsString(pack.id)},`, `    title: ${tsString(pack.title)},`];
  lines.push(`    subtitle: ${tsString(pack.subtitle)},`);
  lines.push(`    kind: ${tsString(pack.kind)},`);
  if (pack.prompt) lines.push(`    prompt: ${tsString(pack.prompt)},`);
  lines.push(`    note: ${tsString(pack.note)},`);
  lines.push(`    data: ${tsTemplate(pack.data)},`);
  lines.push("  },");
  return lines.join("\n");
}

export type InsertResult = { updated: string } | { error: string };

/**
 * Splices a pack's formatted TS source into a lesson-bank-*.ts file, right
 * before the target level's closing `];`. Relies on the file's established,
 * consistent formatting (`const <LEVEL>: Pack[] = [` ... a line that is
 * exactly `];`) rather than a full TS parser -- every existing lesson-bank
 * file follows this shape (verified against lesson-bank.ts/-fr.ts/-es.ts).
 */
export function insertPackIntoBank(fileSource: string, level: Level, pack: Pack): InsertResult {
  const startMarker = `const ${level}: Pack[] = [`;
  const start = fileSource.indexOf(startMarker);
  if (start === -1) {
    return { error: `could not find "${startMarker}" in the target file.` };
  }
  const closeMarker = "\n];";
  const closeIdx = fileSource.indexOf(closeMarker, start);
  if (closeIdx === -1) {
    return { error: `found "${startMarker}" but no closing "];" after it.` };
  }
  const insertAt = closeIdx + 1; // right after the newline preceding "];"
  const updated =
    fileSource.slice(0, insertAt) + formatPackAsTs(pack) + "\n" + fileSource.slice(insertAt);
  return { updated };
}
