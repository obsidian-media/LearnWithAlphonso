import { describe, expect, it } from "vitest";
import {
  applyFirstVerdict,
  emptyManifest,
  planManifest,
  recordFetchResult,
  recordUpload,
  type Candidate,
  type Manifest,
} from "./manifest";
import {
  applyOwnerObjections,
  applyVerdictFile,
  buildBatches,
  firstPassEntries,
  secondPassEntries,
  validateVerdictFile,
  type VerdictFile,
} from "./review";
import type { PlannedTerm } from "./terms";

const KEYS = ["apple", "bread", "chair", "dog", "egg"];
const WORK = "/work";
const BUCKET_URL =
  "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/apple.jpg?v=0123abcd";
const approveV = {
  verdict: "approve" as const,
  alt: "A red apple on a table.",
  peopleVisible: false,
};
const planned = (key: string): PlannedTerm => ({
  key,
  lang: "en",
  query: key,
  category: "noun",
  meaning: `meaning of ${key}`,
});
const cand = (key: string): Candidate => ({
  source: "pexels",
  sourceId: `pexels:${key}`,
  sourcePageUrl: `https://www.pexels.com/photo/${key}-1/`,
  credit: "Jane",
  providerAlt: key,
  stagingPath: `staging/en/${key}-0123abcd.jpg`,
  sha8: "0123abcd",
  width: 700,
  height: 467,
});
function fetchedManifest(): Manifest {
  const m = planManifest(emptyManifest(), KEYS.map(planned));
  for (const k of KEYS) m.entries[k] = recordFetchResult(m.entries[k], cand(k));
  return m;
}
const firstBatch = () =>
  buildBatches(firstPassEntries(fetchedManifest()), 2, "r1", "first", WORK)[0];
const file = (over: Partial<VerdictFile> = {}): VerdictFile => ({
  batch: "r1-b001",
  pass: "first",
  reviewer: "agent:review-r1-b001",
  reviewedAt: "2026-10-08",
  verdicts: { apple: approveV, bread: { verdict: "reject", reasons: ["off-term"] } },
  ...over,
});

describe("buildBatches", () => {
  it("splits fetched entries into sorted, numbered batches with absolute image paths", () => {
    const batches = buildBatches(firstPassEntries(fetchedManifest()), 2, "r1", "first", WORK);
    expect(batches.map((b) => [b.batch, b.items.map((i) => i.key)])).toEqual([
      ["r1-b001", ["apple", "bread"]],
      ["r1-b002", ["chair", "dog"]],
      ["r1-b003", ["egg"]],
    ]);
    expect(batches[0].items[0]).toMatchObject({
      meaning: "meaning of apple",
      sourcePageUrl: "https://www.pexels.com/photo/apple-1/",
    });
    expect(batches[0].items[0].imagePath.replace(/\\/g, "/")).toBe(
      "/work/staging/en/apple-0123abcd.jpg",
    );
  });
});

describe("validateVerdictFile", () => {
  it("accepts a complete, well-formed file", () => {
    expect(validateVerdictFile(file(), firstBatch(), "2026-10-08")).toEqual([]);
  });

  it("reports every problem", () => {
    const bad = file({
      reviewer: "claude",
      reviewedAt: "2026-12-01",
      verdicts: {
        apple: { verdict: "approve", alt: "Sexy -- apple", peopleVisible: false },
        chair: { verdict: "approve", alt: "A wooden chair.", peopleVisible: false },
      },
    });
    expect(validateVerdictFile(bad, firstBatch(), "2026-10-08")).toEqual([
      'reviewer "claude" is not agent:<id>',
      'reviewedAt "2026-12-01" is not a past-or-today YYYY-MM-DD',
      "bread: no verdict",
      'apple: alt contains "--"',
      'apple: alt contains "sexy"',
      "chair: not in this batch",
    ]);
  });

  it("keeps owner-objection for the owner, and requires a reason", () => {
    const p = validateVerdictFile(
      file({
        verdicts: {
          apple: { verdict: "reject", reasons: ["owner-objection"] },
          bread: { verdict: "reject", reasons: [] },
        },
      }),
      firstBatch(),
      "2026-10-08",
    );
    expect(p).toEqual([
      'apple: unknown rejection reason "owner-objection"',
      "bread: a rejection needs at least one reason",
    ]);
  });

  it("refuses a second pass by the first-pass reviewer", () => {
    const m = fetchedManifest();
    m.entries.apple = applyFirstVerdict(
      m.entries.apple,
      { ...approveV, peopleVisible: true },
      "agent:x",
      "2026-10-08",
    ).entry;
    const [b] = buildBatches(secondPassEntries(m, 0, "seed"), 40, "r1-2nd", "second", WORK);
    const p = validateVerdictFile(
      {
        batch: b.batch,
        pass: "second",
        reviewer: "agent:x",
        reviewedAt: "2026-10-08",
        verdicts: { apple: approveV },
      },
      b,
      "2026-10-08",
    );
    expect(p).toEqual(["apple: second pass by the first-pass reviewer"]);
  });
});

describe("applyVerdictFile", () => {
  it("applies approvals and rejections and collects bans", () => {
    const r = applyVerdictFile(
      fetchedManifest(),
      file({
        verdicts: {
          apple: approveV,
          bread: { verdict: "reject", reasons: ["alcohol-tobacco-drugs-gambling"] },
        },
      }),
    );
    expect(r.manifest.entries.apple.status).toBe("approved");
    expect(r.manifest.entries.bread.status).toBe("pending-fetch");
    expect(r.bans).toEqual([
      { sourceId: "pexels:bread", key: "bread", reasons: ["alcohol-tobacco-drugs-gambling"] },
    ]);
    expect([r.approved, r.rejected]).toEqual([1, 1]);
  });
});

describe("secondPassEntries", () => {
  it("selects every approved image showing people, plus a deterministic sample", () => {
    const m = fetchedManifest();
    for (const k of KEYS) {
      m.entries[k] = applyFirstVerdict(
        m.entries[k],
        { ...approveV, peopleVisible: k === "dog" },
        "agent:x",
        "2026-10-08",
      ).entry;
    }
    expect(secondPassEntries(m, 0, "seed").map((e) => e.key)).toEqual(["dog"]);
    expect(secondPassEntries(m, 1, "seed").map((e) => e.key)).toEqual(KEYS);
    expect(secondPassEntries(m, 0.5, "seed").map((e) => e.key)).toEqual(
      secondPassEntries(m, 0.5, "seed").map((e) => e.key),
    );
  });
});

describe("applyOwnerObjections", () => {
  it("rejects the listed uploaded entries and reports unknown keys", () => {
    const m = fetchedManifest();
    m.entries.apple = recordUpload(
      applyFirstVerdict(m.entries.apple, approveV, "agent:x", "2026-10-08").entry,
      BUCKET_URL,
    );
    const r = applyOwnerObjections(m, ["apple", "zebra"]);
    expect(r.manifest.entries.apple.status).toBe("pending-fetch");
    expect(r.bans[0]).toMatchObject({ key: "apple", reasons: ["owner-objection"] });
    expect(r.missing).toEqual(["zebra"]);
  });
});
