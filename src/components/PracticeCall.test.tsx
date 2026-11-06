// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { PracticeCall } = await import("./PracticeCall");

const base = {
  title: "Ordering a coffee",
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
  ttsOn: true,
  onToggleTts: () => {},
  error: null,
  endTo: "/converse",
  messages: [],
  sheet: null,
  reducedMotion: false,
};

const room = (c: HTMLElement) =>
  (c.firstElementChild as HTMLElement).style.backgroundImage.replace(/url\(["']?|["']?\)/g, "");

describe("the room", () => {
  it("shows the scenario's own picture in light mode with no dimming", () => {
    const { container, queryByTestId } = render(
      <PracticeCall {...base} scenarioId="coffee" dark={false} />,
    );
    expect(room(container)).toBe("/avatar/scenes/coffee.webp");
    expect(queryByTestId("evening-overlay")).toBeNull();
  });

  it("dims the same picture with the navy multiply in dark mode", () => {
    const { container, getByTestId } = render(
      <PracticeCall {...base} scenarioId="coffee" dark={true} />,
    );
    expect(room(container)).toBe("/avatar/scenes/coffee.webp");
    const overlay = getByTestId("evening-overlay");
    expect(overlay.style.mixBlendMode).toBe("multiply");
    expect(overlay.style.background).toContain("22, 32, 60");
  });

  it("swaps the default room for its evening picture instead of dimming it", () => {
    const light = render(<PracticeCall {...base} scenarioId="city-day" dark={false} />);
    expect(room(light.container)).toBe("/avatar/scenes/room-light.webp");
    light.unmount();
    const dark = render(<PracticeCall {...base} scenarioId="city-day" dark={true} />);
    expect(room(dark.container)).toBe("/avatar/scenes/room-dark.webp");
    expect(dark.queryByTestId("evening-overlay")).toBeNull();
  });

  it("marks the live dot red only while he speaks", () => {
    const quiet = render(<PracticeCall {...base} scenarioId="coffee" dark={false} />);
    expect(quiet.getByTestId("live-dot")).toHaveAttribute("data-live", "false");
    quiet.unmount();
    const talking = render(
      <PracticeCall {...base} scenarioId="coffee" dark={false} mode="speaking" />,
    );
    expect(talking.getByTestId("live-dot")).toHaveAttribute("data-live", "true");
    expect(talking.getByTestId("call-state")).toHaveTextContent("Speaking");
  });
});
