import { describe, expect, it } from "vitest";
import { planStoryAudio, recordingFile, storySentences } from "./story-audio-plan";

const linear = {
  id: "s1",
  course: "en",
  segments: ["Mia wakes up.", "She drinks tea.", "Mia wakes up."],
  nodes: null,
};
const branching = {
  id: "b1",
  course: "en",
  segments: [],
  nodes: {
    start: "a",
    map: {
      a: { segments: ["One.", "Two."], next: "b" },
      b: { segments: ["Two.", "Three."], ending: {} },
    },
  },
};

describe("story audio plan", () => {
  it("lists each distinct sentence once, in reading order, for linear and branching stories", () => {
    expect(storySentences(linear)).toEqual(["Mia wakes up.", "She drinks tea."]);
    expect(storySentences(branching)).toEqual(["One.", "Two.", "Three."]);
  });

  it("names a file from voice + text: stable, and new for a new voice or new wording", async () => {
    const a = await recordingFile("s1", "v1", "Hello.");
    expect(a).toMatch(/^stories\/s1\/[0-9a-f]{32}\.mp3$/);
    expect(await recordingFile("s1", "v1", " Hello. ")).toBe(a);
    expect(await recordingFile("s1", "v2", "Hello.")).not.toBe(a);
    expect(await recordingFile("s1", "v1", "Hello!")).not.toBe(a);
  });

  it("generates everything the first time", async () => {
    const plan = await planStoryAudio(linear, "v1", null);
    expect(plan.toGenerate.map((g) => g.text)).toEqual(["Mia wakes up.", "She drinks tea."]);
    expect(plan.reused).toBe(0);
    expect(plan.chars).toBe("Mia wakes up.".length + "She drinks tea.".length);
    expect(plan.manifest.entries).toHaveLength(2);
  });

  it("is idempotent: a second run over its own manifest generates nothing", async () => {
    const first = await planStoryAudio(linear, "v1", null);
    const second = await planStoryAudio(linear, "v1", first.manifest);
    expect(second.toGenerate).toEqual([]);
    expect(second.reused).toBe(2);
    expect(second.chars).toBe(0);
  });

  it("re-records only an edited sentence, and a changed voice re-records all", async () => {
    const first = await planStoryAudio(linear, "v1", null);
    const edited = { ...linear, segments: ["Mia wakes up.", "She drinks coffee."] };
    const plan = await planStoryAudio(edited, "v1", first.manifest);
    expect(plan.toGenerate.map((g) => g.text)).toEqual(["She drinks coffee."]);
    expect(plan.reused).toBe(1);
    expect(plan.manifest.entries.map((e) => e.text)).toEqual([
      "Mia wakes up.",
      "She drinks coffee.",
    ]);
    const otherVoice = await planStoryAudio(linear, "v2", first.manifest);
    expect(otherVoice.toGenerate).toHaveLength(2);
  });

  it("ignores a manifest it cannot read", async () => {
    const plan = await planStoryAudio(linear, "v1", { v: 9 });
    expect(plan.toGenerate).toHaveLength(2);
  });
});
