import { describe, expect, it } from "vitest";
import {
  MAX_FETCH_ATTEMPTS,
  applyFirstVerdict,
  applyOwnerObjection,
  applySecondVerdict,
  emptyManifest,
  planManifest,
  recordFetchResult,
  recordUpload,
  referencedObjectPaths,
  statusCounts,
  toVocabImages,
  type Candidate,
  type ManifestEntry,
} from "./manifest";
import type { PlannedTerm } from "./terms";
import { LICENSE_FOR_SOURCE } from "./types";

const planned = (key: string, query = key): PlannedTerm => ({
  key,
  lang: "en",
  query,
  category: "food",
  meaning: "m",
});
const cand = (id: string): Candidate => ({
  source: "pexels",
  sourceId: `pexels:${id}`,
  sourcePageUrl: `https://www.pexels.com/photo/x-${id}/`,
  credit: "Jane Doe",
  providerAlt: "An apple",
  stagingPath: `staging/en/apple-${id}.jpg`,
  sha8: "0123abcd",
  width: 700,
  height: 467,
});
const fresh = (): ManifestEntry => planManifest(emptyManifest(), [planned("apple")]).entries.apple;
const fetched = (id = "1") => recordFetchResult(fresh(), cand(id));
const approve = {
  verdict: "approve" as const,
  alt: "A red apple on a table.",
  peopleVisible: false,
};
const BUCKET_URL =
  "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/apple.jpg?v=0123abcd";

describe("planManifest", () => {
  it("adds new planned terms as pending-fetch with their slug", () => {
    expect(fresh()).toMatchObject({
      key: "apple",
      slug: "apple",
      status: "pending-fetch",
      attempts: 0,
      rejectedSourceIds: [],
    });
  });

  it("keeps progress when lang and query are unchanged, drops unplanned keys", () => {
    const m = { version: 1 as const, entries: { apple: fetched(), pear: fresh() } };
    const next = planManifest(m, [planned("apple")]);
    expect(next.entries.apple.status).toBe("fetched");
    expect(next.entries.pear).toBeUndefined();
  });

  it("re-fetches when the query changed but remembers rejected sources", () => {
    const rejected = applyFirstVerdict(
      fetched(),
      { verdict: "reject", reasons: ["off-term"] },
      "agent:a",
      "2026-10-08",
    ).entry;
    const next = planManifest({ version: 1, entries: { apple: rejected } }, [
      planned("apple", "green apple"),
    ]);
    expect(next.entries.apple).toMatchObject({
      status: "pending-fetch",
      query: "green apple",
      rejectedSourceIds: ["pexels:1"],
    });
  });
});

describe("fetch and review transitions", () => {
  it("no provider result means no image", () => {
    expect(recordFetchResult(fresh(), null)).toMatchObject({ status: "no-image" });
  });

  it("refuses a candidate already rejected for this term", () => {
    const e = { ...fresh(), rejectedSourceIds: ["pexels:1"] };
    expect(() => recordFetchResult(e, cand("1"))).toThrow(/already rejected/);
  });

  it("approval records the review", () => {
    const r = applyFirstVerdict(fetched(), approve, "agent:w1-review-r1-b001", "2026-10-08");
    expect(r.entry).toMatchObject({
      status: "approved",
      review: {
        reviewedBy: "agent:w1-review-r1-b001",
        reviewedAt: "2026-10-08",
        alt: "A red apple on a table.",
      },
    });
    expect(r.ban).toBeUndefined();
  });

  it("an off-term rejection re-queues without a global ban", () => {
    const r = applyFirstVerdict(
      fetched(),
      { verdict: "reject", reasons: ["off-term"] },
      "agent:a",
      "2026-10-08",
    );
    expect(r.entry).toMatchObject({
      status: "pending-fetch",
      attempts: 1,
      rejectedSourceIds: ["pexels:1"],
    });
    expect(r.entry.candidate).toBeUndefined();
    expect(r.ban).toBeUndefined();
  });

  it("a content rejection bans the photo everywhere", () => {
    const r = applyFirstVerdict(
      fetched(),
      { verdict: "reject", reasons: ["nudity-or-suggestive"] },
      "agent:a",
      "2026-10-08",
    );
    expect(r.ban).toEqual({
      sourceId: "pexels:1",
      key: "apple",
      reasons: ["nudity-or-suggestive"],
    });
  });

  it(`gives up after ${MAX_FETCH_ATTEMPTS} rejected candidates`, () => {
    let e = fresh();
    for (let i = 1; i <= MAX_FETCH_ATTEMPTS; i++) {
      e = recordFetchResult(e, cand(String(i)));
      e = applyFirstVerdict(
        e,
        { verdict: "reject", reasons: ["off-term"] },
        "agent:a",
        "2026-10-08",
      ).entry;
    }
    expect(e).toMatchObject({ status: "no-image", attempts: MAX_FETCH_ATTEMPTS });
  });

  it("a second-pass rejection after upload clears the url (so prune removes the object)", () => {
    const approved = applyFirstVerdict(fetched(), approve, "agent:a", "2026-10-08").entry;
    const uploaded = recordUpload(approved, BUCKET_URL);
    const r = applySecondVerdict(
      uploaded,
      { verdict: "reject", reasons: ["brand-logo-or-foreign-text"] },
      "agent:b",
    );
    expect(r.entry).toMatchObject({ status: "pending-fetch" });
    expect(r.entry.url).toBeUndefined();
    expect(referencedObjectPaths({ version: 1, entries: { apple: r.entry } })).toEqual(new Set());
  });

  it("an owner objection rejects and bans", () => {
    const uploaded = recordUpload(
      applyFirstVerdict(fetched(), approve, "agent:a", "2026-10-08").entry,
      BUCKET_URL,
    );
    const r = applyOwnerObjection(uploaded);
    expect(r.entry.status).toBe("pending-fetch");
    expect(r.ban?.reasons).toEqual(["owner-objection"]);
  });

  it("refuses transitions from the wrong status", () => {
    expect(() => applyFirstVerdict(fresh(), approve, "agent:a", "2026-10-08")).toThrow(
      /expected status fetched/,
    );
    expect(() => recordUpload(fetched(), BUCKET_URL)).toThrow(
      /expected status approved or uploaded/,
    );
  });
});

describe("toVocabImages / statusCounts", () => {
  it("emits only uploaded entries, with license from the source and both reviewers", () => {
    const approved = applyFirstVerdict(fetched(), approve, "agent:a", "2026-10-08").entry;
    const second = applySecondVerdict(approved, approve, "agent:b").entry;
    const m = {
      version: 1 as const,
      entries: { apple: recordUpload(second, BUCKET_URL), pear: fresh() },
    };
    expect(toVocabImages(m)).toEqual({
      apple: {
        url: BUCKET_URL,
        alt: "A red apple on a table.",
        credit: "Jane Doe",
        source: "pexels",
        sourcePageUrl: "https://www.pexels.com/photo/x-1/",
        license: LICENSE_FOR_SOURCE.pexels,
        reviewedBy: "agent:a+agent:b",
        reviewedAt: "2026-10-08",
      },
    });
    expect(statusCounts(m)).toEqual({
      "pending-fetch": 1,
      fetched: 0,
      approved: 0,
      uploaded: 1,
      "no-image": 0,
    });
    expect(referencedObjectPaths(m)).toEqual(new Set(["en/apple.jpg"]));
  });
});
