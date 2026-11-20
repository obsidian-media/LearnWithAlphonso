// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { HectorComposer, HectorHeader, HectorChips } = await import("./HectorParts");
const { hectorPillText } = await import("./hector-style");

const composer = (over: Partial<Parameters<typeof HectorComposer>[0]> = {}) => (
  <HectorComposer
    value=""
    onChange={() => {}}
    onSend={() => {}}
    onMic={() => {}}
    recording={false}
    busy={false}
    disabled={false}
    reducedMotion={false}
    getStream={() => null}
    {...over}
  />
);

describe("Hector status pill words", () => {
  it("is Ready at rest and names what he is doing otherwise", () => {
    expect(hectorPillText(null)).toBe("Ready");
    expect(hectorPillText("listening")).toBe("Listening…");
    expect(hectorPillText("thinking")).toBe("Thinking…");
    expect(hectorPillText("speaking")).toBe("Speaking…");
  });

  it("the header announces it and says which course he teaches", () => {
    render(<HectorHeader course="es" status="thinking" menu={null} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Hector is thinking");
    expect(screen.getByText("Your Spanish tutor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Learn" })).toHaveAttribute("href", "/learn");
  });
});

describe("HectorComposer", () => {
  it("typing shows Send, which sends; Enter sends too", async () => {
    const onSend = vi.fn();
    render(composer({ value: "hello", onSend }));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByRole("textbox", { name: "Message Hector" }), "{Enter}");
    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it("the mic asks the page to start talking; while busy it is disabled", async () => {
    const onMic = vi.fn();
    const { rerender } = render(composer({ onMic }));
    await userEvent.click(screen.getByRole("button", { name: "Record a voice message" }));
    expect(onMic).toHaveBeenCalledTimes(1);
    rerender(composer({ onMic, busy: true }));
    expect(screen.getByRole("button", { name: "Record a voice message" })).toBeDisabled();
  });

  it("recording hides Send even with text typed, and the stop button stops", async () => {
    const onMic = vi.fn();
    render(composer({ recording: true, value: "draft", onMic }));
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Stop recording and send" }));
    expect(onMic).toHaveBeenCalledTimes(1);
  });

  it("under Reduce Motion the waveform is static bars of fixed, differing heights", () => {
    render(composer({ recording: true, reducedMotion: true }));
    const bars = Array.from(screen.getByTestId("hector-wave").children) as HTMLElement[];
    expect(bars).toHaveLength(5);
    expect(bars.map((b) => b.style.height)).toEqual(["7px", "14px", "20px", "11px", "16px"]);
  });
});

describe("HectorChips", () => {
  const chips = [
    { id: "chat", label: "Just chat", message: "Let's just chat.", icon: "chat" as const },
    { id: "explain", label: "Explain a rule", message: "Explain.", icon: "book" as const },
  ];
  it("are buttons that hand back the tapped chip, and lock while a turn is in flight", async () => {
    const onPick = vi.fn();
    const { rerender } = render(<HectorChips chips={chips} disabled={false} onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: "Explain a rule" }));
    expect(onPick).toHaveBeenCalledWith(chips[1]);
    rerender(<HectorChips chips={chips} disabled onPick={onPick} />);
    expect(screen.getByRole("button", { name: "Just chat" })).toBeDisabled();
  });
});
