// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PracticeResult } from "./PracticeResult";
import type { RecapController } from "@/lib/use-call-recap";
import type { PracticeResult as Result } from "@/lib/practice-api";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const result: Result = {
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
};
const recapData = {
  corrections: [
    {
      said: "Soy cansado hoy",
      fixed: "Estoy cansado hoy",
      why: "Use estar for how you feel.",
      topic: "ser-estar",
      label: "Ser or estar",
    },
  ],
  phrase: { text: "¿Me trae la cuenta?", meaning: "Could you bring me the bill?" },
  reviewToken: "tok",
  saved: true,
  reviewCount: 2,
};
const ctl = (over: Partial<RecapController>): RecapController => ({
  status: "ready",
  recap: recapData,
  review: "idle",
  onRetry: vi.fn(),
  onReview: vi.fn(),
  speaking: null,
  onSpeak: vi.fn(),
  ...over,
});
const show = (recap: RecapController | undefined) =>
  render(
    <PracticeResult
      result={result}
      course="es"
      room="/avatar/scenes/coffee.webp"
      seconds={232}
      slip={{ said: "Soy cansado hoy", reply: "¡Ay!" }}
      campaign={null}
      recap={recap}
      onRetry={vi.fn()}
      onForward={vi.fn()}
    />,
  );

describe("the recap takes the slip's slot and gives it back", () => {
  it("ready: the recap shows and the slip does not", () => {
    const { container } = show(ctl({}));
    expect(container.querySelector("[data-recap=ready]")).not.toBeNull();
    expect(container.querySelector("[data-slip]")).toBeNull();
    expect(screen.getByText("Estoy cansado hoy")).toBeInTheDocument();
    expect(screen.getByText("¿Me trae la cuenta?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "What Alphonso remembers" })).toBeInTheDocument();
  });
  it("pending: a placeholder, no slip yet, and the buttons are already there", () => {
    const { container } = show(ctl({ status: "pending", recap: null }));
    expect(container.querySelector("[data-recap=pending]")).not.toBeNull();
    expect(container.querySelector("[data-slip]")).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });
  it.each([
    ["no recap controller (older caller)", undefined],
    ["off: a short call, offline, an AI error or consent off", ctl({ status: "off", recap: null })],
  ])("hidden (%s): the slip shows exactly as before", (_n, c) => {
    const { container } = show(c);
    expect(container.querySelector("[data-recap]")).toBeNull();
    expect(container.querySelector("[data-slip]")).not.toBeNull();
  });
  it("failed: a Try again card shows beside the slip, and tapping it asks again", () => {
    const c = ctl({ status: "failed", recap: null });
    const { container } = show(c);
    expect(container.querySelector("[data-recap=failed]")).not.toBeNull();
    expect(container.querySelector("[data-slip]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(c.onRetry).toHaveBeenCalledTimes(1);
  });
  it("no 'saved' line for a free learner", () => {
    show(ctl({ recap: { ...recapData, saved: false } }));
    expect(screen.queryByText(/What Alphonso remembers/)).toBeNull();
  });
});

describe("the recap's actions", () => {
  it("a speaker button hears just that phrase", () => {
    const c = ctl({});
    show(c);
    fireEvent.click(screen.getByRole("button", { name: "Hear: Estoy cansado hoy" }));
    expect(c.onSpeak).toHaveBeenCalledWith("Estoy cansado hoy");
    fireEvent.click(screen.getByRole("button", { name: "Hear: ¿Me trae la cuenta?" }));
    expect(c.onSpeak).toHaveBeenLastCalledWith("¿Me trae la cuenta?");
  });
  it("Review these counts its items, then becomes a confirmation", () => {
    const c = ctl({});
    const { rerender } = show(c);
    fireEvent.click(screen.getByRole("button", { name: /Review these/ }));
    expect(c.onReview).toHaveBeenCalled();
    expect(screen.getByText("2")).toBeInTheDocument();
    rerender(
      <PracticeResult
        result={result}
        course="es"
        room="/r.webp"
        seconds={1}
        slip={null}
        campaign={null}
        recap={ctl({ review: "added" })}
        onRetry={vi.fn()}
        onForward={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Added to your review");
    expect(screen.queryByRole("button", { name: /Review these/ })).toBeNull();
  });
  it("without a review token there is no Review these button", () => {
    show(ctl({ recap: { ...recapData, reviewToken: null } }));
    expect(screen.queryByRole("button", { name: /Review these/ })).toBeNull();
  });
});
