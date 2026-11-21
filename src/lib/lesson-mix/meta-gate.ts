// The meta-text gate of the lesson-mix content: an explanation or a prompt is shown to the LEARNER, so
// it must never talk about the learner, the item, the prompt, the answer key or the brief (text the
// model wrote for us), never tell the learner to "read this aloud", and never be just the target
// sentence said again. Quoted course text is exempt (a real sentence may contain "learner" or "aloud").
// Pure: no network.

export type MetaRole = "explanation" | "prompt";

/** The text with every double-quoted span (the target sentence, a quoted word) blanked out. */
const withoutQuotes = (s: string) => s.replace(/"[^"]*"|“[^”]*”/g, " ¤ ");

const RULES: { re: RegExp; why: string; roles?: MetaRole[] }[] = [
  { re: /\b(the|this) (learner|user)s?\b/i, why: "talks about the learner or the user" },
  {
    re: /\bthe student (reads|should|must|will|hears|is asked|needs|has to|can)\b/i,
    why: "talks about the student",
  },
  { re: /\bthis (item|question|exercise|task)\b/i, why: "talks about this item or question" },
  {
    re: /\bthe (prompt|audio ?text|answer key|distractors?|acceptable answers?|accepted (wording|answer)s?|first wording|canonical (wording|answer)|model answer)\b/i,
    why: "names the item's machinery (prompt, key, distractors, wordings)",
  },
  { re: /\b(first|canonical) wording\b/i, why: "names the first wording" },
  {
    re: /\btarget (sentence|answer|language|phrase)\b|\bcourse language\b/i,
    why: "names the target sentence or course language",
  },
  { re: /\baloud\b|\bout loud\b/i, why: "tells the learner to read aloud" },
  {
    re: /\b(read|say|repeat|pronounce)\b[^.!?]{0,40}\b(slowly|clearly|smoothly|as one)\b/i,
    why: "gives a how-to-say instruction",
    roles: ["explanation"],
  },
  {
    re: /^\s*(read|say|repeat|pronounce)\b/i,
    why: "opens with an instruction to read or say it",
    roles: ["explanation"],
  },
  {
    re: /\b(this|the) (phrase|sentence) (uses|says|names|describes|shows|gives)\b/i,
    why: "the generic 'this phrase uses' opener",
  },
  {
    re: /\[[^\]]*\]|\{[^}]*\}|<[^>]*>|\bTODO\b|\blorem\b/i,
    why: "has a placeholder or a bracketed note",
  },
  {
    re: /\b(this|the) lesson('s)?\b|\blesson's\b|\blesson (verb|word|vocabulary)s?\b/i,
    why: "points at the lesson",
  },
  { re: /\bCEFR\b|\b(A1|A2|B1|B2|C1)\b/, why: "names a CEFR level" },
  {
    re: /\bmake sure\b|\bensure (that|the)\b|\bnote:|\bplease (write|include|use|add)\b/i,
    why: "an instruction addressed to the author",
  },
];

const STOP = new Set(
  "the and are was were has had have for with that this from into onto its not but you your our they them their there here what when who how why all any can may one two via per then than also just only very more most some such each both either neither speaker says said say sentence phrase heard hear word words idea".split(
    " ",
  ),
);

/** The reasons `text` is not fit for the learner; empty when it is. `answer` is the target sentence, if known. */
export function metaTextProblems(text: string, role: MetaRole, answer?: string): string[] {
  const out: string[] = [];
  const bare = withoutQuotes(text);
  for (const r of RULES)
    if ((!r.roles || r.roles.includes(role)) && r.re.test(bare))
      out.push(`${role} is meta text (${r.why})`);
  if (role === "explanation") {
    // Said again, not explained: after removing the quoted text, little real content is left.
    const left = bare
      .toLowerCase()
      .replace(/[^a-zà-ÿ' -]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w) && w !== "¤");
    if (left.length < 3)
      out.push(
        `explanation is meta text (it only restates the sentence${answer ? ` "${answer}"` : ""} without explaining it)`,
      );
  }
  return out;
}
