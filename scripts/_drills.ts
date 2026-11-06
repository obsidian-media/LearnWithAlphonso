import { BANK_FR } from "../src/data/lesson-bank-fr";
import { BANK_ES } from "../src/data/lesson-bank-es";
import { drillNonFormIds } from "../src/lib/content-review/gates";
import { packQuestions } from "../src/data/bank-engine";
const packs = [BANK_FR, BANK_ES].flatMap((b) => [...b.B1, ...b.B2, ...b.C1]);
const bad = drillNonFormIds(packs);
for (const p of packs) {
  const qs = packQuestions(p).filter((q) => bad.has(q.id));
  if (!qs.length) continue;
  const q = qs[0] as any;
  console.log(p.id, qs.length, "|", p.title, "|", q.prompt, "=>", q.type === "mc" ? q.choices[q.answer] : q.answer);
}
