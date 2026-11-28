// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../tests/fixtures/rehearsal-api.json";
import type { Rehearsal } from "@/lib/rehearsal-api";

vi.mock("@/lib/voice-prefs", () => ({ voiceFor: async () => "voice" }));
vi.mock("@/lib/auth-headers", () => ({ authHeaders: async () => ({}) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/voice-playback", () => ({
  voicePlayback: () => ({
    stop: vi.fn(),
    unlock: vi.fn(),
    play: vi.fn(async () => ({ result: "played" })),
  }),
}));

const { Phrasebook, phraseRows } = await import("./Phrasebook");

const rehearsal = fixture.state.active as unknown as Rehearsal;
const withMeanings = (meanings: string[] | undefined) =>
  ({ ...rehearsal, brief: { ...rehearsal.brief, keyPhraseMeanings: meanings } }) as Rehearsal;

const synth = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] };

beforeEach(() => {
  synth.speak.mockReset();
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      lang = "";
      rate = 1;
      constructor(public text: string) {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("phraseRows", () => {
  it("pairs a meaning with its phrase by position", () => {
    const rows = phraseRows(withMeanings(["a", "b", "c", "d", "e", "f"]).brief);
    expect(rows[1]).toEqual({ phrase: "I am hoping for around", meaning: "b" });
  });
  it("has no meanings when the brief has none (a generated brief)", () => {
    expect(phraseRows(withMeanings(undefined).brief).every((r) => r.meaning === null)).toBe(true);
  });
  it("drops ALL meanings when the list is not aligned with the phrases", () => {
    expect(phraseRows(withMeanings(["a", "b"]).brief).every((r) => r.meaning === null)).toBe(true);
  });
});

describe("Phrasebook", () => {
  it("lists every key phrase with a named 44px play button", () => {
    render(<Phrasebook rehearsal={withMeanings(undefined)} onBack={vi.fn()} />);
    for (const p of rehearsal.brief.keyPhrases) {
      const btn = screen.getByRole("button", { name: `Hear: ${p}` });
      expect(btn.className).toContain("size-11");
    }
    expect(
      screen.getByRole("heading", { name: /Your phrases for this job interview/i }),
    ).toBeTruthy();
  });

  it("shows a meaning line only where it exists", () => {
    render(
      <Phrasebook
        rehearsal={withMeanings(["m1", "m2", "m3", "m4", "m5", "m6"])}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText("m3")).toBeTruthy();
    expect(screen.getAllByText(/^m\d$/)).toHaveLength(6);
  });

  it("falls back to the device voice in the course language when /api/tts fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<Phrasebook rehearsal={withMeanings(undefined)} onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Hear: I have experience in" }));
    await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
    const utterance = synth.speak.mock.calls[0]![0] as { text: string; lang: string };
    expect(utterance.text).toBe("I have experience in");
    expect(utterance.lang).toMatch(/^en/);
  });

  it("plays from /api/tts first and does not use the device voice when it works", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) });
    vi.stubGlobal("fetch", fetchMock);
    render(<Phrasebook rehearsal={withMeanings(undefined)} onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Hear: I have experience in" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/tts");
    expect(synth.speak).not.toHaveBeenCalled();
  });
});
