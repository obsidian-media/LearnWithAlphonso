import { describe, expect, it } from "vitest";
import {
  NOTES_LIMIT,
  REQUIRED_NOTE_MARKERS,
  buildBetaReviewNotes,
  buildReviewNotes,
  reviewNotesProblems,
  type ReviewNotesInput,
} from "./review-notes";

const worst: ReviewNotesInput = {
  demoAccountEmail: `${"d".repeat(49)}@example.com`, // 61 chars
  reviewContactEmail: `${"c".repeat(48)}@gmail.com`, // 58 chars
  demoCodeURL: `https://learn.alphonsoecosystem.app/api/review-demo-code?key=${"k".repeat(80)}`, // 140 chars
  recordingURL: `https://www.youtube.com/watch?v=${"r".repeat(68)}`, // 100 chars
  productTitle: "Alphonso Pro",
};

describe("buildReviewNotes", () => {
  it("fits App Store Connect's 4,000-character limit with worst-case values", () => {
    const notes = buildReviewNotes(worst);
    expect(notes.length).toBeLessThanOrEqual(NOTES_LIMIT);
    expect(reviewNotesProblems(notes, worst)).toEqual([]);
  });

  it("answers every 2.1 question and covers every required topic", () => {
    const notes = buildReviewNotes(worst);
    for (const m of REQUIRED_NOTE_MARKERS) expect(notes).toContain(m);
  });

  it("describes the pre-paired demo study buddy and how to reach the opt-in", () => {
    const notes = buildReviewNotes(worst);
    expect(REQUIRED_NOTE_MARKERS).toContain("Matched learner");
    expect(REQUIRED_NOTE_MARKERS).toContain("End study buddy");
    expect(notes).toContain("Matched learner");
    expect(notes).toContain("End study buddy");
  });

  it("names the seeded display name, the skip example and the report path", () => {
    const notes = buildReviewNotes(worst);
    expect(notes).toContain("display name Alex");
    expect(notes).toContain("Learner-4F2A");
    expect(notes).toContain("Report this response");
  });

  it("quotes the StoreKit title exactly", () => {
    const notes = buildReviewNotes(worst);
    expect(notes).toContain('"Alphonso Pro"');
    expect(notes).not.toContain("Alphonso Pro Monthly");
  });

  it("cites only the published A1 episode title and says Resend, not SES", () => {
    const notes = buildReviewNotes(worst);
    expect(notes).toContain('"Ordering Coffee"');
    expect(notes).toContain("Resend");
    expect(notes).not.toMatch(/Amazon SES|\bSES\b/);
  });

  it("says the podcast audio is AI-narrated and never implies a human voice", () => {
    const notes = buildReviewNotes(worst);
    expect(notes).toContain("podcast audio is AI-narrated (Deepgram) from scripts we wrote");
    expect(notes).not.toMatch(/audio is our own/i);
  });

  it("is plain ASCII with no literal double hyphen, whatever the secret values contain", () => {
    const unlucky = {
      ...worst,
      demoCodeURL: "https://learn.alphonsoecosystem.app/api/review-demo-code?key=a--b",
    };
    const notes = buildReviewNotes(unlucky);
    expect(notes).not.toMatch(/[^\n\r\t -~]/);
    expect(reviewNotesProblems(notes, unlucky)).toEqual([]);
  });

  it("never names the old league tiers", () => {
    expect(buildReviewNotes(worst)).not.toMatch(/Bronze|Silver|Diamond/);
  });
});

describe("reviewNotesProblems (each mutation removes exactly the property its rule guards)", () => {
  const good = () => buildReviewNotes(worst);

  it("flags a notes body over 4,000 characters", () => {
    expect(reviewNotesProblems(good() + "x".repeat(4000), worst).join("|")).toMatch(/4000/);
  });

  it("draws the length line at exactly 4,000 characters", () => {
    expect(NOTES_LIMIT).toBe(4000);
    const base = good();
    const at = base + "x".repeat(4000 - base.length);
    expect(at.length).toBe(4000);
    expect(reviewNotesProblems(at, worst).join("|")).not.toMatch(/4000/);
    expect(reviewNotesProblems(at + "x", worst).join("|")).toMatch(/4000/);
  });

  it("flags a product title that differs from the live one", () => {
    expect(
      reviewNotesProblems(good(), { ...worst, productTitle: "Alphonso Pro Monthly" }).join("|"),
    ).toMatch(/product title/);
  });

  it("flags notes that still say Alphonso Pro Monthly while the live title differs", () => {
    const notes = good().replace('"Alphonso Pro"', '"Alphonso Pro Monthly"');
    expect(reviewNotesProblems(notes, worst).join("|")).toMatch(/Alphonso Pro Monthly/);
  });

  it("flags a missing marker", () => {
    const notes = good().replace(/Report/g, "R"); // every occurrence, or the marker survives
    expect(reviewNotesProblems(notes, worst).join("|")).toMatch(/missing/);
  });

  it("flags a missing pre-paired buddy description", () => {
    expect(
      reviewNotesProblems(good().replace(/Matched learner/g, "Buddy"), worst).join("|"),
    ).toMatch(/missing "Matched learner"/);
    expect(reviewNotesProblems(good().replace(/End study buddy/g, "End"), worst).join("|")).toMatch(
      /missing "End study buddy"/,
    );
  });

  it("flags the provider being named as SES", () => {
    expect(reviewNotesProblems(good().replace("Resend", "Amazon SES"), worst).join("|")).toMatch(
      /Resend/,
    );
  });

  it("flags notes that imply human narration", () => {
    for (const claim of [
      "audio is our own",
      "narrated by a human",
      "recorded by native speakers",
      "voiced by voice actors",
      "human-narrated podcasts",
    ]) {
      const notes = good().replace(
        "podcast audio is AI-narrated (Deepgram) from scripts we wrote",
        claim,
      );
      expect(reviewNotesProblems(notes, worst).join("|"), claim).toMatch(/human|AI-narrated/i);
    }
  });

  it("flags a non-https recording or code link", () => {
    expect(reviewNotesProblems(good(), { ...worst, recordingURL: "http://x" }).join("|")).toMatch(
      /recording/,
    );
    expect(reviewNotesProblems(good(), { ...worst, demoCodeURL: "http://x" }).join("|")).toMatch(
      /demo code/,
    );
  });

  it("flags a literal double hyphen or a non-ASCII character in the text", () => {
    expect(reviewNotesProblems(good().replace("SIGN IN", "SIGN -- IN"), worst).join("|")).toMatch(
      /--/,
    );
    expect(reviewNotesProblems(good().replace("SIGN IN", "SIGN — IN"), worst).join("|")).toMatch(
      /ASCII/,
    );
  });
});

describe("buildBetaReviewNotes", () => {
  it("fits and explains the code page", () => {
    const b = buildBetaReviewNotes(worst);
    expect(b.length).toBeLessThanOrEqual(NOTES_LIMIT);
    expect(b).toContain(worst.demoCodeURL);
    expect(b).toContain("Send code");
  });
});
