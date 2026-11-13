// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FullPlayer } from "./FullPlayer";
import { usePodcastPlayer } from "../lib/podcast-player";
import { SLEEP_OFF } from "../lib/sleep-timer";

vi.mock("../data/podcast-timings.json", () => ({
  default: {
    "ep-1": {
      lines: [
        { s: 0, t: "Hello there.", p: true },
        { s: 6, t: "How are you?", p: false },
      ],
    },
  },
}));

const base = {
  room: "radio",
  title: "Test episode",
  aiNarrated: false,
  duration: 100,
  isPlaying: true,
  failed: false,
  onToggle: () => {},
  onRetry: () => {},
  onTranscript: () => {},
  onClose: () => {},
};

function setup(over: Partial<React.ComponentProps<typeof FullPlayer>> = {}) {
  const props = {
    ...base,
    episodeId: "ep-1",
    transcript: "Hello there. How are you?",
    elapsed: 7,
    onSeek: vi.fn(),
    onCollapse: vi.fn(),
    ...over,
  };
  render(<FullPlayer {...props} />);
  return props;
}

beforeEach(() => {
  usePodcastPlayer.setState({ sleep: SLEEP_OFF, rate: 1 });
});

describe("FullPlayer follow-along", () => {
  it("highlights the line being spoken and seeks when a line is tapped", async () => {
    const p = setup();
    const current = await screen.findByRole("button", { name: "How are you?" });
    expect(current).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "Hello there." }));
    expect(p.onSeek).toHaveBeenCalledWith(0);
  });

  it("shows no timed lines for an episode without timings", async () => {
    setup({ episodeId: "ep-unknown" });
    await act(async () => {});
    expect(screen.queryByTestId("timed-transcript")).toBeNull();
    expect(screen.getByRole("button", { name: "Show transcript" })).toBeInTheDocument();
  });

  it("falls back to the plain transcript when the text no longer matches the timings", async () => {
    setup({ transcript: "Hello there. How are you today?" });
    await act(async () => {});
    expect(screen.queryByTestId("timed-transcript")).toBeNull();
  });
});

describe("FullPlayer sleep timer", () => {
  it("offers off, 15, 30, 45 and end of episode, and starts the chosen one", () => {
    setup({ episodeId: null });
    fireEvent.click(screen.getByRole("button", { name: "Sleep" }));
    const labels = screen.getAllByRole("radio").map((r) => r.textContent);
    expect(labels).toEqual(["Off", "15 min", "30 min", "45 min", "End of episode"]);
    fireEvent.click(screen.getByRole("radio", { name: "30 min" }));
    const s = usePodcastPlayer.getState().sleep;
    expect(s.choice).toBe("30");
    expect(s.endsAtMs! - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(screen.getByRole("button", { name: /Sleep: 30 min left/ })).toBeInTheDocument();
  });

  it("Off clears a running timer", () => {
    setup({ episodeId: null });
    fireEvent.click(screen.getByRole("button", { name: "Sleep" }));
    fireEvent.click(screen.getByRole("radio", { name: "15 min" }));
    fireEvent.click(screen.getByRole("button", { name: /Sleep: / }));
    fireEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(usePodcastPlayer.getState().sleep).toEqual(SLEEP_OFF);
  });
});

describe("FullPlayer minimise button", () => {
  it("draws a design-system chevron, not a text glyph", () => {
    setup({ episodeId: null });
    const button = screen.getByRole("button", { name: "Minimise player" });
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.textContent).toBe("");
  });
});

describe("FullPlayer minimise gestures", () => {
  it("minimises on a long swipe down on the top of the sheet", () => {
    const p = setup({ episodeId: null });
    const grab = screen.getByTestId("player-grab");
    fireEvent.pointerDown(grab, { clientY: 100 });
    fireEvent.pointerUp(grab, { clientY: 220 });
    expect(p.onCollapse).toHaveBeenCalledTimes(1);
  });

  it("stays open on a short swipe", () => {
    const p = setup({ episodeId: null });
    const grab = screen.getByTestId("player-grab");
    fireEvent.pointerDown(grab, { clientY: 100 });
    fireEvent.pointerUp(grab, { clientY: 140 });
    expect(p.onCollapse).not.toHaveBeenCalled();
  });

  it("minimises with Escape, and the chevron button works from the keyboard", () => {
    const p = setup({ episodeId: null });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onCollapse).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Minimise player" }));
    expect(p.onCollapse).toHaveBeenCalledTimes(2);
  });
});
