// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

// The player is unit-tested in sfx.test.ts; here only what the call asks for, and its voice probe (real).
const playSfx = vi.fn((_event: string, _key?: string) => true);
vi.mock("@/lib/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sfx")>();
  return { ...actual, playSfx: (event: string, key?: string) => playSfx(event, key) };
});

const { PracticeCall } = await import("./PracticeCall");
const { isVoiceActive } = await import("@/lib/sfx");

const base = {
  title: "Ordering a coffee",
  scenarioId: "coffee",
  dark: false,
  avatar: {
    phase: { kind: "idle" as const },
    replyText: null,
    getAudio: () => null,
    replyVerdict: { serial: 0, verdict: "none" as const },
    course: "en" as const,
    reducedMotion: false,
  },
  mode: "idle" as const,
  caption: null,
  recording: false,
  talkDisabled: false,
  onHoldStart: () => {},
  onHoldEnd: () => {},
  onToggle: () => {},
  getStream: () => null,
  error: null,
  endTo: "/converse",
  messages: [],
  sheet: null,
  reducedMotion: false,
};

const calls = (event: string) => playSfx.mock.calls.filter((c) => c[0] === event).length;

describe("the call's sounds", () => {
  it("plays the call-start sound once when the call opens, not again on a re-render", () => {
    playSfx.mockClear();
    const view = render(<PracticeCall {...base} />);
    view.rerender(<PracticeCall {...base} mode="thinking" />);
    view.rerender(<PracticeCall {...base} mode="idle" />);
    expect(calls("callStart")).toBe(1);
    expect(calls("callEnd")).toBe(0);
  });

  it("hanging up plays the call-end sound", () => {
    playSfx.mockClear();
    render(<PracticeCall {...base} />);
    fireEvent.click(screen.getByRole("link", { name: "End the call" }));
    expect(calls("callEnd")).toBe(1);
  });

  it("tells the effects Alphonso is speaking while he speaks, and stops once the call is gone", () => {
    const view = render(<PracticeCall {...base} mode="idle" />);
    expect(isVoiceActive()).toBe(false);
    view.rerender(<PracticeCall {...base} mode="speaking" />);
    expect(isVoiceActive()).toBe(true);
    view.unmount();
    expect(isVoiceActive()).toBe(false);
  });
});
