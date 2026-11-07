// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PracticeResult } from "./PracticeResult";
import { headline, nextStarHint } from "@/lib/practice-result-copy";
import type { PracticeResult as Result } from "@/lib/practice-api";
import { campaignSearch, firstSlip, practiceModeSearch } from "@/lib/practice-session";

const r = (over: Partial<Result>): Result => ({
  kind: "scenario",
  itemKey: "coffee",
  stars: 2,
  bestBefore: 0,
  bestAfter: 2,
  replies: 8,
  rightReplies: 7,
  shortReplies: 0,
  englishReplies: 0,
  finishMinReplies: 3,
  ...over,
});

describe("the result headline", () => {
  it("names the stars, praising in the course language from two up", () => {
    expect(headline(0, "es")).toBe("No stars this time");
    expect(headline(1, "es")).toBe("One star. You finished.");
    expect(headline(2, "es")).toBe("Two stars. Muy bien.");
    expect(headline(3, "fr")).toBe("Three stars. Très bien.");
  });
});

describe("what kept the call from the next star, from the server's tally", () => {
  it("no stars: how many more replies would have finished it", () => {
    expect(nextStarHint(r({ stars: 0, replies: 1 }))).toBe(
      "Finish the call for your first star: 2 more replies next time.",
    );
  });
  it("one star: the right share against the two-star line", () => {
    expect(nextStarHint(r({ stars: 1, replies: 5, rightReplies: 3 }))).toBe(
      "3 of 5 replies right. Two stars take 80%.",
    );
  });
  it("two stars: one slip", () => {
    expect(nextStarHint(r({}))).toBe("1 slip kept you from three. Fix it and try again.");
  });
  it("two stars: every reason, counted", () => {
    expect(nextStarHint(r({ rightReplies: 8, shortReplies: 2, englishReplies: 1 }))).toBe(
      "2 short replies and 1 reply in English kept you from three. Fix them and try again.",
    );
  });
  it("three stars: nothing left to win", () => {
    expect(nextStarHint(r({ stars: 3, rightReplies: 8 }))).toMatch(/Nothing left to win/);
  });
});

describe("the result screen", () => {
  it("shows exactly the server's stars and counts", () => {
    render(
      <PracticeResult
        result={r({ stars: 1, replies: 4, rightReplies: 2, shortReplies: 1 })}
        course="es"
        room="/avatar/scenes/coffee.webp"
        seconds={232}
        slip={null}
        onRetry={vi.fn()}
        next={{ label: "Done", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole("img", { name: "1 of 3 stars" })).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.getByText("3:52")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try for 2" })).toBeInTheDocument();
  });
});

describe("session helpers", () => {
  it("first slip: the first corrected learner reply, from a scene's anchor on", () => {
    const msgs = [
      { role: "assistant" as const, content: "Hi", opener: true },
      { role: "user" as const, content: "Soy cansado" },
      { role: "assistant" as const, content: "¿Está cansado?", verdict: "corrected" },
      { role: "user" as const, content: "Sí" },
      { role: "assistant" as const, content: "Bien", verdict: "correct" },
    ];
    expect(firstSlip(msgs)).toEqual({ said: "Soy cansado", reply: "¿Está cansado?" });
    expect(firstSlip(msgs, 3)).toBeNull();
  });
  it("search params: only call or chat, and a whole scene index in range", () => {
    expect(practiceModeSearch({ mode: "video" })).toEqual({});
    expect(campaignSearch({ scene: "2", mode: "chat" }, 3)).toEqual({ scene: 2, mode: "chat" });
    expect(campaignSearch({ scene: 3 }, 3)).toEqual({});
    expect(campaignSearch({ scene: -1 }, 3)).toEqual({});
    expect(campaignSearch({ scene: 1.5 }, 3)).toEqual({});
  });
});
