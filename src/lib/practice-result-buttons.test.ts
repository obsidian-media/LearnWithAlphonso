import { describe, expect, it } from "vitest";
import { practiceResultButtons, repliesMeter, retryLabel } from "./practice-result-buttons";

const row = (stars: number, campaign: { isLastScene: boolean } | null) => {
  const b = practiceResultButtons({ stars, campaign });
  return [
    b.retry ? `${b.retry.label}:${b.retry.tone}` : "-",
    `${b.forward.label}:${b.forward.tone}`,
  ];
};

describe("the result buttons: scenario talk", () => {
  it("0 stars: Try again is gold, Done is quiet", () => {
    expect(row(0, null)).toEqual(["Try again:gold", "Done:quiet"]);
  });
  it("1 and 2 stars: Try for the next star is quiet, Done is gold", () => {
    expect(row(1, null)).toEqual(["Try for 2:quiet", "Done:gold"]);
    expect(row(2, null)).toEqual(["Try for 3:quiet", "Done:gold"]);
  });
  it("3 stars: Play again stays, Done is gold", () => {
    expect(row(3, null)).toEqual(["Play again:quiet", "Done:gold"]);
  });
});

describe("the result buttons: campaign scene", () => {
  it("0 stars never moves on: Try again gold, Done quiet, no Next scene", () => {
    expect(row(0, { isLastScene: false })).toEqual(["Try again:gold", "Done:quiet"]);
    expect(row(0, { isLastScene: true })).toEqual(["Try again:gold", "Done:quiet"]);
  });
  it("1 and 2 stars: a quiet Try for N and a gold Next scene", () => {
    expect(row(1, { isLastScene: false })).toEqual(["Try for 2:quiet", "Next scene:gold"]);
    expect(row(2, { isLastScene: false })).toEqual(["Try for 3:quiet", "Next scene:gold"]);
  });
  it("3 stars: no retry, only the gold forward button", () => {
    expect(row(3, { isLastScene: false })).toEqual(["-", "Next scene:gold"]);
  });
  it("the last scene's forward button finishes the campaign", () => {
    expect(row(2, { isLastScene: true })).toEqual(["Try for 3:quiet", "Finish campaign:gold"]);
    expect(row(3, { isLastScene: true })).toEqual(["-", "Finish campaign:gold"]);
    expect(practiceResultButtons({ stars: 1, campaign: { isLastScene: true } }).forward.kind).toBe(
      "finish",
    );
  });
  it("only the forward kind differs between a middle and a last scene", () => {
    expect(practiceResultButtons({ stars: 2, campaign: { isLastScene: false } }).forward.kind).toBe(
      "next",
    );
  });
});

describe("retryLabel", () => {
  it("names the next star", () => {
    expect([0, 1, 2, 3].map(retryLabel)).toEqual([
      "Try again",
      "Try for 2",
      "Try for 3",
      "Play again",
    ]);
  });
});

describe("the replies meter", () => {
  it("is replies given of replies needed", () => {
    expect(repliesMeter({ replies: 1, finishMinReplies: 3 })).toEqual({ given: 1, needed: 3 });
    expect(repliesMeter({ replies: 0, finishMinReplies: 3 })).toEqual({ given: 0, needed: 3 });
  });
  it("never fills past the finish line", () => {
    expect(repliesMeter({ replies: 9, finishMinReplies: 4 })).toEqual({ given: 4, needed: 4 });
  });
  it("draws nothing without a finish count", () => {
    expect(repliesMeter({ replies: 2, finishMinReplies: 0 })).toBeNull();
  });
});
