import { describe, expect, it } from "vitest";
import { pngSize, screenshotFileProblems, planScreenshotReplacement } from "./screenshot-plan";

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

/** A minimal valid PNG header: signature, then an IHDR chunk with the given size. */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe("pngSize", () => {
  it("reads the size from the header", () => {
    expect(pngSize(png(1290, 2796))).toEqual({ width: 1290, height: 2796 });
  });

  it("refuses anything that is not a PNG", () => {
    expect(pngSize(Buffer.from("not a png at all, just text........"))).toBeNull();
    expect(pngSize(Buffer.alloc(0))).toBeNull();
  });
});

describe("screenshotFileProblems (checked before anything is deleted)", () => {
  it("accepts the sizes Apple takes for the 6.7-inch set, portrait or landscape", () => {
    for (const [w, h] of [
      [1290, 2796],
      [1284, 2778],
      [2796, 1290],
    ]) {
      expect(screenshotFileProblems("01-a.png", png(w, h), "APP_IPHONE_67"), `${w}x${h}`).toEqual(
        [],
      );
    }
  });

  it("flags a wrong size, a non-PNG, an empty file and an unknown display type", () => {
    expect(screenshotFileProblems("01-a.png", png(1179, 2556), "APP_IPHONE_67").join("|")).toMatch(
      /1179x2556/,
    );
    expect(
      screenshotFileProblems(
        "01-a.png",
        Buffer.from("junk junk junk junk junk junk junk junk"),
        "APP_IPHONE_67",
      ).join("|"),
    ).toMatch(/not a PNG/);
    expect(screenshotFileProblems("01-a.png", Buffer.alloc(0), "APP_IPHONE_67").join("|")).toMatch(
      /empty/,
    );
    expect(
      screenshotFileProblems("01-a.png", png(1290, 2796), "APP_SOMETHING_ELSE").join("|"),
    ).toMatch(/display type/);
  });
});
