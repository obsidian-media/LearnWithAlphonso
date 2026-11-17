// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { fakeConsentApi, withAiConsent } from "@/lib/__testutils__/ai-consent";
import { SayThePicture } from "./SayThePicture";
import { drawRounds, type PictureWord } from "@/lib/say-the-picture";

const h = vi.hoisted(() => ({
  words: [] as unknown[],
  capture: {
    state: "idle" as "idle" | "recording" | "transcribing",
    error: null as string | null,
    failed: false,
    canRecord: true,
    start: vi.fn(),
    stop: vi.fn(),
    onTranscript: null as ((t: string, c: number | null) => void) | null,
    course: undefined as string | undefined,
  },
  model: vi.fn(),
}));

vi.mock("@/lib/say-the-picture", async (orig) => {
  const real = await orig<typeof import("@/lib/say-the-picture")>();
  return { ...real, imageWordPool: () => h.words };
});
vi.mock("@/lib/use-speech-capture", () => ({
  useSpeechCapture: (o: {
    onTranscript: (t: string, c: number | null) => void;
    course?: string;
  }) => {
    h.capture.onTranscript = o.onTranscript;
    h.capture.course = o.course;
    return h.capture;
  },
}));
vi.mock("@/lib/use-model-speech", () => ({ useModelSpeech: () => h.model }));

const url =
  "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/x.jpg";
const mk = (n: number): PictureWord[] =>
  Array.from({ length: n }, (_, i) => ({
    term: `word${String.fromCharCode(97 + i)}`,
    meaning: "",
    example: "",
    image: { url, alt: "alt", credit: "c", source: "pexels" } as PictureWord["image"],
  }));

const say = (t: string) => act(() => h.capture.onTranscript?.(t, 0.9));
const view = (consent = fakeConsentApi()) =>
  render(withAiConsent(<SayThePicture course="en" onExit={() => {}} />, consent));
const currentTerm = () => screen.queryByText(/^word[a-z]$/)?.textContent;

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  h.words = mk(12);
  Object.assign(h.capture, { state: "idle", error: null, failed: false, canRecord: true });
  h.capture.start.mockClear();
  h.model.mockClear();
});

describe("Say the picture", () => {
  it("shows the picture only, with no written word, and a labelled record button", () => {
    view();
    expect(screen.getByText("Word 1 of 8")).toBeTruthy();
    expect(screen.queryByText(/^word[a-z]$/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Record your answer" }));
    expect(h.capture.start).toHaveBeenCalled();
  });

  it("sends speech through the existing speak capture (the /api/stt speaking quota) in the course language", () => {
    view();
    expect(h.capture.course).toBe("en");
  });

  it("a correct say shows a star with the word and advances", () => {
    view();
    const hit = (drawRounds(h.words as PictureWord[], 8, () => 0)[0] as PictureWord).term;
    say(`the ${hit}`);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(currentTerm()).toBe(hit);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Word 2 of 8")).toBeTruthy();
    expect(h.model).not.toHaveBeenCalled();
  });

  it("a miss reveals the word, plays the model, lets the learner repeat once, with no penalty", () => {
    view();
    say("zzzz");
    expect(h.model).toHaveBeenCalledTimes(1);
    const term = currentTerm()!;
    expect(term).toMatch(/^word[a-z]$/);
    expect(h.model).toHaveBeenCalledWith(term);
    expect(screen.getByText("Now say it once yourself.")).toBeTruthy();
    say("whatever");
    expect(screen.getByText(/Nice/)).toBeTruthy();
    expect(screen.queryByText(/heart/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next word" }));
    expect(screen.getByText("Word 2 of 8")).toBeTruthy();
  });

  it("runs 8 rounds then shows a stars summary with 'Practised 8 words'", () => {
    view();
    for (let i = 0; i < 8; i++) {
      say("zzzz");
      fireEvent.click(screen.getByRole("button", { name: i === 7 ? "Finish" : "Next word" }));
    }
    expect(screen.getByText("Practised 8 words")).toBeTruthy();
    expect(screen.getByRole("img", { name: /of 3 stars/ })).toBeTruthy();
  });

  it("'Show me the word' teaches without a recording", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Show me the word" }));
    expect(h.model).toHaveBeenCalled();
    expect(currentTerm()).toMatch(/^word[a-z]$/);
  });

  it("says so, with no dead mic button, when this device cannot record", () => {
    h.capture.canRecord = false;
    view();
    expect(screen.getByRole("status").textContent).toMatch(/microphone/i);
    expect(screen.queryByRole("button", { name: "Record your answer" })).toBeNull();
  });

  it("says so when AI consent is off", () => {
    view(fakeConsentApi(null));
    expect(screen.queryByRole("button", { name: "Record your answer" })).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows 'not enough words with pictures yet' for an empty or tiny pool, without crashing", () => {
    for (const n of [0, 3]) {
      h.words = mk(n);
      const { unmount } = view();
      expect(screen.getByText(/not enough words with pictures yet/i)).toBeTruthy();
      unmount();
    }
  });

  it("introduces no new quota kind", async () => {
    const fs = await import("node:fs");
    const quota = fs.readFileSync("src/lib/ai-quota.server.ts", "utf8");
    expect(quota).not.toMatch(/say|picture/i);
    for (const f of [
      "src/components/practice/SayThePicture.tsx",
      "src/lib/say-the-picture.ts",
      "src/lib/use-model-speech.ts",
    ])
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/authorizeAiRequest|AiKind/);
  });
});
