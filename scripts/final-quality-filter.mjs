import fs from "node:fs";

const [, , ...files] = process.argv;
const merged = {};
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, "utf-8"));
  for (const [k, v] of Object.entries(d)) merged[k] = v;
}

// Rule 1: reject terms shaped like leaked instructional text/questions/phrases
// rather than a single searchable concept -- these are the worst offenders
// found in manual spot-checking ("Parlez-vous anglais ?", "This suggests…",
// "to be daydreaming", "in the community").
function isPhraseLike(term) {
  if (/[?…]/.test(term)) return true;
  const words = term.trim().split(/\s+/);
  if (words.length >= 4) return true;
  if (words.length >= 2 && /^(to|not|in|on|at|slightly|most)\b/i.test(term)) return true;
  return false;
}

// Rule 2: reject any image URL that got assigned to 3+ different terms --
// a strong signal the search returned a generic/irrelevant fallback rather
// than a real match (confirmed pattern: 3 different French terms all got
// the identical "Vietnam rice terraces" photo).
const urlCounts = {};
const fallbackKey = (v) => v.alt + "|" + v.credit;
for (const v of Object.values(merged))
  urlCounts[fallbackKey(v)] = (urlCounts[fallbackKey(v)] || 0) + 1;

const rejectedPhrase = [];
const rejectedDuplicate = [];
const safe = {};
for (const [term, v] of Object.entries(merged)) {
  if (isPhraseLike(term)) {
    rejectedPhrase.push(term);
    continue;
  }
  if (urlCounts[fallbackKey(v)] >= 3) {
    rejectedDuplicate.push(term);
    continue;
  }
  safe[term] = v;
}

fs.writeFileSync("scripts/vocab-images-SAFE-merged.json", JSON.stringify(safe, null, 2));
fs.writeFileSync(
  "scripts/vocab-images-rejected.json",
  JSON.stringify({ phraseLike: rejectedPhrase, duplicateImage: rejectedDuplicate }, null, 2),
);
console.log(`Total: ${Object.keys(merged).length}`);
console.log(`Rejected (phrase/question-shaped): ${rejectedPhrase.length}`);
console.log(`Rejected (duplicate-image fallback): ${rejectedDuplicate.length}`);
console.log(`Remaining after automated rules: ${Object.keys(safe).length}`);
