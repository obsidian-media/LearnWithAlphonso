// The owner's review page for a lesson-mix sample: per lesson, the new items as a learner meets them,
// the panel's verdicts and anything flagged, in a plain readable layout. One self-contained HTML file
// (no script, no network). Pure.

import type { Course } from "../../data/course-meta";
import type { Level } from "../../data/levels";
import type { ExtraType, LessonExtra } from "./extras";
import { toQuestion } from "./extras";

export type PageVerdict = { who: string; verdict: string; detail?: string };
export type PageItem = {
  type: ExtraType;
  extra: LessonExtra;
  /** Gate warnings (soft) and any problems the final item still has. */
  warnings: string[];
  problems: string[];
  verdicts: PageVerdict[];
  /** "clean", "fixed" (the judge patched it), "held" (the judge or the gates left a question for the owner), "dropped" (failed the gates twice). */
  status: "clean" | "fixed" | "held" | "dropped";
  note?: string;
};
export type PageLesson = {
  course: Course;
  level: Level;
  lessonId: string;
  title: string;
  unitTitle: string;
  /** The lesson's own first questions, for context (prompt text only). */
  context: string[];
  items: PageItem[];
};
export type PageSummary = {
  generatedAt: string;
  lines: [string, string][];
  note?: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const COURSE_NAME: Record<Course, string> = { en: "English", fr: "French", es: "Spanish" };
const TYPE_NAME: Record<ExtraType, string> = {
  listening: "Listening",
  speak: "Speak",
  translate: "Translate",
};

function itemHtml(lessonId: string, it: PageItem): string {
  const q = toQuestion(lessonId, it.type, it.extra);
  let body = "";
  if (q?.type === "listening") {
    body = `<p class="k">Plays aloud (the learner cannot see this)</p><p class="say">${esc(q.audioText)}</p>
<p class="k">Question shown</p><p>${esc(q.prompt)}</p>
<p class="k">Choices</p><ol type="A">${q.choices
      .map(
        (c) =>
          `<li${c === q.answer ? ' class="key"' : ""}>${esc(c)}${c === q.answer ? ' <span class="tag">answer</span>' : ""}</li>`,
      )
      .join("")}</ol>`;
  } else if (q?.type === "speak") {
    body = `<p class="k">The learner reads this aloud (speech recognition checks it)</p><p class="say">${esc(q.answer)}</p>`;
  } else if (q?.type === "translate") {
    body = `<p class="k">Shown to the learner (English)</p><p>${esc(q.prompt)}</p>
<p class="k">Accepted answers, canonical first</p><ol>${q.acceptableAnswers.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>`;
  }
  const ex =
    q && "explanation" in q
      ? `<p class="k">Explanation shown after</p><p>${esc(q.explanation)}</p>`
      : "";
  const verdicts = it.verdicts.length
    ? `<ul class="v">${it.verdicts
        .map(
          (v) =>
            `<li class="${v.verdict === "ok" ? "ok" : "bad"}"><b>${esc(v.who)}</b>: ${esc(v.verdict)}${v.detail ? ` &mdash; ${esc(v.detail)}` : ""}</li>`,
        )
        .join("")}</ul>`
    : `<p class="k">No panel verdict recorded.</p>`;
  const flags = [
    ...it.problems.map((p) => `<li class="bad">${esc(p)}</li>`),
    ...it.warnings.map((w) => `<li class="warn">${esc(w)}</li>`),
  ];
  return `<section class="item st-${it.status}">
<h4>${TYPE_NAME[it.type]} <span class="badge b-${it.status}">${it.status}</span></h4>
${body}${ex}
<p class="k">Panel</p>${verdicts}
${it.note ? `<p class="note">${esc(it.note)}</p>` : ""}
${flags.length ? `<p class="k">Automatic checks</p><ul class="v">${flags.join("")}</ul>` : ""}
</section>`;
}

export function renderPage(title: string, summary: PageSummary, lessons: PageLesson[]): string {
  const courses = (["en", "fr", "es"] as Course[]).filter((c) =>
    lessons.some((l) => l.course === c),
  );
  const flagged = lessons.reduce(
    (n, l) => n + l.items.filter((i) => i.status !== "clean").length,
    0,
  );
  const total = lessons.reduce((n, l) => n + l.items.length, 0);
  const nav = courses
    .map(
      (c) =>
        `<a href="#${c}">${COURSE_NAME[c]} (${lessons.filter((l) => l.course === c).length} lessons)</a>`,
    )
    .join(" ");
  const sections = courses
    .map(
      (c) => `<h2 id="${c}">${COURSE_NAME[c]}</h2>
${lessons
  .filter((l) => l.course === c)
  .map(
    (l) => `<article class="lesson">
<h3>${esc(l.title)} <span class="meta">${l.level} &middot; ${esc(l.unitTitle)} &middot; lesson ${esc(l.lessonId)}</span></h3>
${l.context.length ? `<details><summary>The lesson already asks (${l.context.length} shown)</summary><ul>${l.context.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></details>` : ""}
${l.items.map((i) => itemHtml(l.lessonId, i)).join("")}
</article>`,
  )
  .join("\n")}`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1d1b;--mut:#66625b;--card:#fff;--line:#dedad0;--ok:#1d6b3a;--bad:#a4261b;--warn:#8a5a00;--key:#e7f3ea;--acc:#2b4a8b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17171a;--fg:#ecebe6;--mut:#a29f96;--card:#1f2024;--line:#35363c;--ok:#6cc58a;--bad:#ef8a7f;--warn:#e0b25a;--key:#1d3326;--acc:#8fb0f0}}
:root[data-theme="dark"]{--bg:#17171a;--fg:#ecebe6;--mut:#a29f96;--card:#1f2024;--line:#35363c;--ok:#6cc58a;--bad:#ef8a7f;--warn:#e0b25a;--key:#1d3326;--acc:#8fb0f0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:1.5rem;margin:.2em 0}h2{margin-top:2.2em;border-bottom:2px solid var(--line);padding-bottom:.2em}h3{margin:0 0 .4em;font-size:1.1rem}h4{margin:.2em 0 .4em;font-size:1rem}
.meta{color:var(--mut);font-weight:400;font-size:.85rem}nav a{margin-right:1em;color:var(--acc)}
.sum{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:12px 0}.sum dt{color:var(--mut);font-size:.85rem}.sum dd{margin:0 0 .5em;font-weight:600}
.lesson{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:16px 0}
.item{border-top:1px solid var(--line);padding:10px 0}.item:first-of-type{border-top:0}
.k{margin:.6em 0 .1em;color:var(--mut);font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}p{margin:.2em 0}
.say{font-size:1.15rem;font-weight:600}ol,ul{margin:.2em 0;padding-left:1.4em}li.key{background:var(--key);border-radius:4px;padding:0 4px;list-style-position:inside}
.tag{font-size:.7rem;color:var(--ok);text-transform:uppercase}.v{list-style:none;padding:0}.v li{padding:2px 0}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.badge{font-size:.7rem;padding:1px 8px;border-radius:99px;border:1px solid currentColor;text-transform:uppercase}.b-clean{color:var(--ok)}.b-fixed{color:var(--acc)}.b-held,.b-dropped{color:var(--bad)}
.note{color:var(--mut);font-style:italic}details{color:var(--mut);font-size:.9rem}
</style></head><body><main>
<h1>${esc(title)}</h1>
<p class="meta">Generated ${esc(summary.generatedAt)}. ${total} new items in ${lessons.length} lessons; ${flagged} not clean (fixed, held or dropped). Items marked answer are what the app grades as correct.</p>
<dl class="sum">${summary.lines.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
${summary.note ? `<p>${esc(summary.note)}</p>` : ""}
<nav>${nav}</nav>
${sections}
</main></body></html>
`;
}
