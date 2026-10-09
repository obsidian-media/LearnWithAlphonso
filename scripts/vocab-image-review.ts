/**
 * Vocab image review CLI (coordinator-run; the reviewers are subagents).
 *   bun scripts/vocab-image-review.ts batches [--size 40] [--round r1]
 *   bun scripts/vocab-image-review.ts second-pass [--size 40] [--round r1]
 *   bun scripts/vocab-image-review.ts apply <work/review/<batch>.verdicts.json> [...]
 *   bun scripts/vocab-image-review.ts owner-sheet [--keys k1,k2]
 *   bun scripts/vocab-image-review.ts owner-sheet-local --out <dir>   # approved, not yet uploaded: copies the staged files next to the sheet
 *   bun scripts/vocab-image-review.ts apply-owner <objections.json>
 *   bun scripts/vocab-image-review.ts status
 */
import fs from "node:fs";
import path from "node:path";
import { VOCAB_IMAGES } from "../src/data/vocab-images";
import { LICENSE_FOR_SOURCE } from "../src/lib/vocab-images/types";
import { buildContactSheetHtml } from "../src/lib/vocab-images/contact-sheet";
import { statusCounts } from "../src/lib/vocab-images/manifest";
import {
  SECOND_PASS_RATE,
  SECOND_PASS_SEED,
  applyOwnerObjections,
  applyVerdictFile,
  buildBatches,
  firstPassEntries,
  secondPassEntries,
  validateVerdictFile,
  type ReviewBatch,
  type VerdictFile,
} from "../src/lib/vocab-images/review";
import {
  REVIEW_DIR,
  REVIEWS_DIR,
  WORK_DIR,
  addBans,
  readManifest,
  writeManifest,
} from "./vocab-images/workdir";

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = rest.indexOf(`--${name}`);
  return i > -1 ? rest[i + 1] : fallback;
};
const today = new Date().toISOString().slice(0, 10);

function writeBatches(batches: ReviewBatch[]): void {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  for (const b of batches) {
    fs.writeFileSync(path.join(REVIEW_DIR, `${b.batch}.json`), JSON.stringify(b, null, 2) + "\n");
    const html = buildContactSheetHtml({
      title: `${b.pass} pass ${b.batch}`,
      objections: false,
      items: b.items.map((i) => ({
        key: i.key,
        lang: i.lang,
        imgSrc: path.relative(REVIEW_DIR, i.imagePath).split(path.sep).join("/"),
        alt: i.providerAlt,
        credit: "",
        sourcePageUrl: i.sourcePageUrl,
        note: `query: ${i.query} · meaning: ${i.meaning}`,
      })),
    });
    fs.writeFileSync(path.join(REVIEW_DIR, `${b.batch}.html`), html);
    console.log(path.join(REVIEW_DIR, `${b.batch}.json`));
  }
  console.log(
    `${batches.length} batch(es), ${batches.reduce((n, b) => n + b.items.length, 0)} images`,
  );
}

switch (cmd) {
  case "batches": {
    const size = Number(opt("size", "40"));
    writeBatches(
      buildBatches(firstPassEntries(readManifest()), size, opt("round", "r1"), "first", WORK_DIR),
    );
    break;
  }
  case "second-pass": {
    const size = Number(opt("size", "40"));
    const entries = secondPassEntries(readManifest(), SECOND_PASS_RATE, SECOND_PASS_SEED);
    writeBatches(buildBatches(entries, size, `${opt("round", "r1")}-2nd`, "second", WORK_DIR));
    break;
  }
  case "apply": {
    for (const file of rest) {
      const verdicts = JSON.parse(fs.readFileSync(file, "utf8")) as VerdictFile;
      const batch = JSON.parse(
        fs.readFileSync(path.join(REVIEW_DIR, `${verdicts.batch}.json`), "utf8"),
      ) as ReviewBatch;
      const problems = validateVerdictFile(verdicts, batch, today);
      if (problems.length) {
        console.error(`${file}:\n  ${problems.join("\n  ")}`);
        process.exitCode = 1;
        continue;
      }
      const r = applyVerdictFile(readManifest(), verdicts);
      writeManifest(r.manifest);
      addBans(r.bans);
      fs.mkdirSync(REVIEWS_DIR, { recursive: true });
      fs.copyFileSync(file, path.join(REVIEWS_DIR, `${verdicts.batch}.verdicts.json`));
      console.log(
        `${verdicts.batch}: ${r.approved} approved, ${r.rejected} rejected, ${r.bans.length} banned`,
      );
    }
    break;
  }
  case "owner-sheet": {
    const only = opt("keys", "");
    const keys = only ? only.split(",") : Object.keys(VOCAB_IMAGES);
    const html = buildContactSheetHtml({
      title: `Vocab images: owner sign-off (${keys.length})`,
      objections: true,
      items: keys.map((k) => ({
        key: k,
        lang: VOCAB_IMAGES[k].url.split("/vocab-images/")[1].slice(0, 2),
        imgSrc: VOCAB_IMAGES[k].url,
        alt: VOCAB_IMAGES[k].alt,
        credit: VOCAB_IMAGES[k].credit,
        sourcePageUrl: VOCAB_IMAGES[k].sourcePageUrl,
        note: `reviewed by ${VOCAB_IMAGES[k].reviewedBy}`,
      })),
    });
    fs.mkdirSync(REVIEW_DIR, { recursive: true });
    const out = path.join(REVIEW_DIR, "owner-sheet.html");
    fs.writeFileSync(out, html);
    console.log(out);
    break;
  }
  case "owner-sheet-local": {
    const out = opt("out", "");
    if (!out) throw new Error("--out <dir> is required");
    const LANG_NAME: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };
    const approved = Object.values(readManifest().entries)
      .filter((e) => e.status === "approved" && e.candidate && e.review)
      .sort((a, b) => (a.lang === b.lang ? (a.key < b.key ? -1 : 1) : a.lang < b.lang ? -1 : 1));
    fs.mkdirSync(path.join(out, "images"), { recursive: true });
    const items = approved.map((e) => {
      const c = e.candidate!;
      const rel = `images/${e.lang}-${e.slug}.jpg`;
      fs.copyFileSync(path.join(WORK_DIR, c.stagingPath), path.join(out, rel));
      return {
        key: e.key,
        lang: e.lang,
        imgSrc: rel,
        alt: e.review!.alt,
        credit: c.credit,
        sourcePageUrl: c.sourcePageUrl,
        license: LICENSE_FOR_SOURCE[c.source],
        // The English search phrase is the meaning the photo was chosen for; English terms need none.
        gloss: e.lang === "en" ? undefined : e.query,
        section: LANG_NAME[e.lang],
        note: `reviewed by ${e.review!.reviewedBy}${e.review!.secondPassBy ? ` + ${e.review!.secondPassBy}` : ""}`,
      };
    });
    const html = buildContactSheetHtml({
      title: `Vocab photos, second batch: owner sign-off (${items.length})`,
      objections: true,
      items,
    });
    fs.writeFileSync(path.join(out, "owner-sheet.html"), html);
    console.log(path.join(out, "owner-sheet.html"), items.length);
    break;
  }
  case "apply-owner": {
    const objections = JSON.parse(fs.readFileSync(rest[0], "utf8")) as {
      objectedBy: string;
      keys: string[];
    };
    if (objections.objectedBy !== "owner")
      throw new Error('objections file must say "objectedBy": "owner"');
    const r = applyOwnerObjections(readManifest(), objections.keys);
    writeManifest(r.manifest);
    addBans(r.bans);
    fs.mkdirSync(REVIEWS_DIR, { recursive: true });
    fs.copyFileSync(rest[0], path.join(REVIEWS_DIR, `owner-objections-${today}.json`));
    console.log(
      `owner objections: ${r.bans.length} rejected; unknown keys: ${r.missing.join(", ") || "none"}`,
    );
    break;
  }
  case "status": {
    const m = readManifest();
    console.log(statusCounts(m));
    console.log(
      `awaiting second pass: ${secondPassEntries(m, SECOND_PASS_RATE, SECOND_PASS_SEED).length}`,
    );
    break;
  }
  default:
    console.error(
      "usage: bun scripts/vocab-image-review.ts batches|second-pass|apply|owner-sheet|apply-owner|status",
    );
    process.exit(1);
}
