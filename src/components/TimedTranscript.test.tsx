// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimedTranscript } from "./TimedTranscript";
import type { TimedLine } from "../lib/podcast-timings";

const lines: TimedLine[] = [
  { s: 0, t: "First line.", p: true },
  { s: 5, t: "Second line.", p: false },
  { s: 10, t: "Third line.", p: true },
];

describe("TimedTranscript", () => {
  it("marks only the line being spoken as current", () => {
    render(<TimedTranscript lines={lines} elapsed={6} onSeek={() => {}} />);
    expect(screen.getByRole("button", { name: /Second line/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /First line/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: /Third line/ })).not.toHaveAttribute("aria-current");
  });

  it("follows the audio as time moves on", () => {
    const { rerender } = render(<TimedTranscript lines={lines} elapsed={1} onSeek={() => {}} />);
    expect(screen.getByRole("button", { name: /First line/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    rerender(<TimedTranscript lines={lines} elapsed={11} onSeek={() => {}} />);
    expect(screen.getByRole("button", { name: /Third line/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /First line/ })).not.toHaveAttribute("aria-current");
  });

  it("seeks to a line's start when it is tapped", () => {
    const onSeek = vi.fn();
    render(<TimedTranscript lines={lines} elapsed={0} onSeek={onSeek} />);
    fireEvent.click(screen.getByRole("button", { name: /Third line/ }));
    expect(onSeek).toHaveBeenCalledWith(10);
  });

  it("scrolls the current line into view, instantly under reduced motion", () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
    window.matchMedia = ((q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    render(<TimedTranscript lines={lines} elapsed={6} onSeek={() => {}} />);
    expect(scrollTo).toHaveBeenCalled();
    expect(scrollTo.mock.calls.at(-1)![0].behavior).toBe("auto");
  });

  it("uses smooth scrolling when motion is allowed", () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    render(<TimedTranscript lines={lines} elapsed={6} onSeek={() => {}} />);
    expect(scrollTo.mock.calls.at(-1)![0].behavior).toBe("smooth");
  });
});
