import { describe, expect, it } from "vitest";
import { planScreenshotReplacement } from "./screenshot-plan";

const existing = Array.from({ length: 7 }, (_, n) => ({
  id: `old${n}`,
  fileName: `0${n + 1}-old.png`,
}));
const files = [
  "01-learn.png",
  "02-lesson.png",
  "03-practice-fr.png",
  "04-hector.png",
  "05-listen.png",
  "06-listen-episode.png",
  "07-review.png",
  "08-friends.png",
];

describe("planScreenshotReplacement", () => {
  it("deletes every existing shot and uploads the new set in file-name order", () => {
    const plan = planScreenshotReplacement(existing, [...files].reverse());
    expect(plan.deleteIds).toEqual(existing.map((e) => e.id));
    expect(plan.uploadOrder).toEqual(files);
  });

  it("ignores files that are not PNGs", () => {
    expect(planScreenshotReplacement([], [...files, "notes.txt"]).uploadOrder).toEqual(files);
  });

  it("refuses more than 10, fewer than 3, or unnumbered files", () => {
    expect(() =>
      planScreenshotReplacement(
        [],
        Array.from({ length: 11 }, (_, n) => `${String(n).padStart(2, "0")}-x.png`),
      ),
    ).toThrow(/10/);
    expect(() => planScreenshotReplacement([], ["01-a.png", "02-b.png"])).toThrow(/at least 3/);
    expect(() => planScreenshotReplacement([], ["learn.png", "02-b.png", "03-c.png"])).toThrow(
      /numbered/,
    );
  });
});
