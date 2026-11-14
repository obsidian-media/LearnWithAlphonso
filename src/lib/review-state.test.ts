import { describe, expect, it } from "vitest";
import { doneSummary, dueCount, emptyBody, reviewProgress, reviewStage } from "./review-state";

describe("reviewStage", () => {
  it("loads, then is empty, asking or done", () => {
    expect(reviewStage(null, 0)).toBe("loading");
    expect(reviewStage(0, 0)).toBe("empty");
    expect(reviewStage(3, 0)).toBe("question");
    expect(reviewStage(3, 2)).toBe("question");
    expect(reviewStage(3, 3)).toBe("done");
  });
  it("an empty queue is never done, whatever the index", () => {
    expect(reviewStage(0, 5)).toBe("empty");
  });
});

describe("reviewProgress", () => {
  it("counts the current question once it is checked", () => {
    expect(reviewProgress(0, 4, false)).toBe(0);
    expect(reviewProgress(0, 4, true)).toBe(0.25);
    expect(reviewProgress(3, 4, true)).toBe(1);
  });
  it("stays between 0 and 1 and survives an empty queue", () => {
    expect(reviewProgress(9, 4, true)).toBe(1);
    expect(reviewProgress(0, 0, true)).toBe(0);
  });
});

describe("dueCount", () => {
  it("is one-based and never runs past the end", () => {
    expect(dueCount(0, 2)).toEqual({ position: 1, of: 2 });
    expect(dueCount(1, 2)).toEqual({ position: 2, of: 2 });
    expect(dueCount(5, 2)).toEqual({ position: 2, of: 2 });
  });
});

describe("emptyBody", () => {
  it("says how many wait, with the right plural", () => {
    expect(emptyBody(1)).toBe("You have 1 item in review — none are due yet. Come back tomorrow.");
    expect(emptyBody(3)).toBe("You have 3 items in review — none are due yet. Come back tomorrow.");
  });
  it("explains how items arrive when there are none", () => {
    expect(emptyBody(0)).toMatch(/Miss a question in a lesson/);
  });
});

describe("doneSummary", () => {
  it("adds the retired part only when something was retired", () => {
    expect(doneSummary({ right: 4, wrong: 1, retired: 0 })).toBe("4 correct · 1 to revisit.");
    expect(doneSummary({ right: 0, wrong: 1, retired: 1 })).toBe(
      "0 correct · 1 to revisit · 1 mastered and retired.",
    );
  });
});
