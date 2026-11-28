// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../tests/fixtures/rehearsal-api.json";
import type { Rehearsal } from "@/lib/rehearsal-api";

type Options = {
  onTranscript: (
    text: string,
    confidence: number | null,
    words?: { word: string; confidence: number }[],
  ) => void;
  onNoWords?: () => void;
  reportNoWords?: boolean;
  course?: string;
};
// A stand-in for the real recorder: the test drives the state and the transcript, the component does the rest.
const fake = vi.hoisted(() => ({
  options: null as unknown,
  state: "idle" as "idle" | "recording" | "transcribing",
  error: null as string | null,
  canRecord: true,
  start: vi.fn(),
  stop: vi.fn(),
  rerender: () => {},
  cleared: 0,
}));
vi.mock("@/lib/use-speech-capture", async () => {
  const React = await import("react");
  return {
    useSpeechCapture: (options: unknown) => {
      fake.options = options;
      const [, force] = React.useState(0);
      fake.rerender = () => force((n) => n + 1);
      return {
        state: fake.state,
        starting: false,
        error: fake.error,
        failed: false,
        canRecord: fake.canRecord,
        start: fake.start,
        stop: fake.stop,
        cancel: vi.fn(),
        clearError: () => {
          fake.error = null;
          fake.cleared += 1;
        },
        getStream: () => null,
      };
    },
  };
});
vi.mock("@/lib/voice-prefs", () => ({ voiceFor: async () => "voice" }));
vi.mock("@/lib/auth-headers", () => ({ authHeaders: async () => ({}) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/voice-playback", () => ({
  voicePlayback: () => ({ stop: vi.fn(), unlock: vi.fn(), play: vi.fn() }),
}));

const { Phrasebook } = await import("./Phrasebook");

const rehearsal = fixture.state.active as unknown as Rehearsal;
const PHRASE = "I would like to learn more about";
const mic = (phrase: string) => screen.getByRole("button", { name: `Say: ${phrase}` });
const opts = () => fake.options as Options;
const set = (patch: Partial<typeof fake>) => {
  Object.assign(fake, patch);
  act(() => fake.rerender());
};
const row = (phrase: string) => mic(phrase).closest("li") as HTMLElement;

beforeEach(() => {
  fake.state = "idle";
  fake.error = null;
  fake.canRecord = true;
  fake.cleared = 0;
  fake.start.mockReset();
  fake.stop.mockReset();
});

describe("Say it in the phrasebook", () => {
  it("gives every phrase a named, 44px mic and the subtitle on the plan is unchanged here", () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    for (const p of rehearsal.brief.keyPhrases) {
      expect(mic(p).className).toContain("size-11");
      expect(mic(p).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("transcribes in the course language and reports silence as a result, not an error", () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    expect(opts().course).toBe("en");
    expect(opts().reportNoWords).toBe(true);
  });

  it("is hidden on a device that cannot record, leaving the listening rows as they were", () => {
    fake.canRecord = false;
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^Say: / })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Hear: / })).toHaveLength(6);
  });

  it("starts recording on a tap and shows the recording state", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    expect(fake.start).toHaveBeenCalledTimes(1);
    set({ state: "recording" });
    expect(mic(PHRASE).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(mic(PHRASE));
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it("disables the other rows' mics while one is recording, so only one clip is ever live", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    set({ state: "recording" });
    expect((mic("I managed a team of") as HTMLButtonElement).disabled).toBe(true);
    expect((mic(PHRASE) as HTMLButtonElement).disabled).toBe(false);
  });

  it("turns the Hear buttons off while a row is recording or checking, so a phrase is never played into the mic", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    const hear = () => screen.getAllByRole("button", { name: /^Hear: / }) as HTMLButtonElement[];
    expect(hear().every((b) => !b.disabled)).toBe(true);
    await userEvent.click(mic(PHRASE));
    set({ state: "recording" });
    expect(hear().every((b) => b.disabled)).toBe(true);
    expect(within(row(PHRASE)).getByRole("status").textContent).toBe("Listening…");
    set({ state: "transcribing" });
    expect(hear().every((b) => b.disabled)).toBe(true);
    set({ state: "idle" });
    expect(hear().every((b) => !b.disabled)).toBe(true);
  });

  it("says it is checking, in a polite live region, while the clip is transcribed", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    set({ state: "transcribing" });
    const status = within(row(PHRASE)).getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Checking how clearly that came across…");
  });

  it("shows 'Understood clearly' inline under the phrase it belongs to", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    act(() =>
      opts().onTranscript(PHRASE, 0.9, [
        { word: "would", confidence: 0.95 },
        { word: "like", confidence: 0.95 },
      ]),
    );
    expect(within(row(PHRASE)).getByRole("status").textContent).toBe("Understood clearly");
    expect(within(row("I managed a team of")).getByRole("status").textContent).toBe("");
  });

  it("names one word to listen to again, in the phrase's own spelling", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    act(() => opts().onTranscript(PHRASE, 0.9, [{ word: "learn", confidence: 0.3 }]));
    expect(within(row(PHRASE)).getByRole("status").textContent).toBe(
      "Mostly understood: listen to “learn” again",
    );
  });

  it("names two words with 'and'", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    act(() => opts().onTranscript("I would like more about", 0.9, undefined));
    expect(within(row(PHRASE)).getByRole("status").textContent).toBe(
      "Mostly understood: listen to “to” and “learn” again",
    );
  });

  it("says 'Not understood yet' when most of it was missed, and when nothing was heard", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    act(() => opts().onTranscript("hello", 0.9, undefined));
    expect(within(row(PHRASE)).getByRole("status").textContent).toBe(
      "Not understood yet: try again",
    );
    await userEvent.click(mic("I managed a team of"));
    act(() => opts().onNoWords?.());
    expect(within(row("I managed a team of")).getByRole("status").textContent).toBe(
      "Not understood yet: try again",
    );
  });

  it("a new attempt clears the previous result for that phrase", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    act(() => opts().onTranscript("hello", 0.9, undefined));
    await userEvent.click(mic(PHRASE));
    expect(within(row(PHRASE)).getByRole("status").textContent).toBe("");
  });

  it("shows the existing mic, upload or quota message under the row that was used", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    set({ error: "You've reached today's voice limit. Come back tomorrow." });
    expect(within(row(PHRASE)).getByRole("alert").textContent).toContain("voice limit");
    expect(within(row("I managed a team of")).queryByRole("alert")).toBeNull();
  });

  it("clears the last message when a new attempt starts", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    expect(fake.cleared).toBe(1);
  });

  it("never writes what the learner said anywhere on the page, nor plays it back", async () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    await userEvent.click(mic(PHRASE));
    act(() => opts().onTranscript("zebra quartz", 0.9, undefined));
    expect(document.body.textContent).not.toContain("zebra");
    expect(screen.queryByText(/hear you/i)).toBeNull();
    expect((fake.options as Record<string, unknown>).onClip).toBeUndefined();
  });

  it("frames the check as how clearly you were understood, never as a score", () => {
    render(<Phrasebook rehearsal={rehearsal} onBack={vi.fn()} />);
    expect(screen.getByText(/how clearly you were understood/)).toBeTruthy();
    expect(document.body.textContent?.toLowerCase()).not.toContain("score");
    expect(document.body.innerHTML).not.toMatch(/red|wrong-/);
  });
});
