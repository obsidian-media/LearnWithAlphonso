// Writes docs/content-fixes-a1a2-phase1.md: one row per hand-reviewed rewrite in
// src/data/question-fixes-a1a2.ts (id, before, after, why).
// Run: bun scripts/gen-content-fixes-table.ts
import { writeFileSync } from "node:fs";
import { curriculum, rawCurriculum, type Question } from "../src/data/curriculum";
import { QUESTION_FIXES } from "../src/data/question-fixes";

function index(units: typeof curriculum) {
  const map = new Map<string, Question>();
  for (const u of units)
    for (const l of u.lessons) for (const q of l.questions) map.set(`${l.id}/${q.id}`, q);
  return map;
}
const before = index(rawCurriculum);
const after = index(curriculum);
const show = (q: Question) => {
  if (q.type !== "mc" && q.type !== "fill") return "";
  const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
  const wrong = (q.type === "mc" ? q.choices : q.bank).filter((o) => o !== answer);
  return `${q.prompt} **${answer}** / ${wrong.join(", ")}`;
};
const esc = (s: string) => s.replace(/\|/g, "\|");
const rows = Object.keys(QUESTION_FIXES)
  .sort()
  .map(
    (k) =>
      `| ${k} | ${esc(show(before.get(k)!))} | ${esc(show(after.get(k)!))} | ${esc(QUESTION_FIXES[k]!.why)} |`,
  );
const doc = `# English A1/A2 question rewrites, phase 1

${rows.length} questions. Each keeps its id, its answer text and (for multiple choice) its answer
position, so saved progress stays valid. "before" and "after" show the prompt, the answer in bold,
then the wrong options.

| id (lesson/question) | before | after | why |
| --- | --- | --- | --- |
${rows.join("\n")}
`;
writeFileSync("docs/content-fixes-a1a2-phase1.md", doc);
console.log(rows.length, "rows");
