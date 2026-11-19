import { describe, expect, it, vi } from "vitest";
import {
  allRecorded,
  fetchStoryRecordings,
  parseStoryManifest,
  recordingPathFor,
  storyAudioPublicUrl,
} from "./story-recordings";

const manifest = (entries: { text: string; file: string }[]) => ({ v: 1, voice: "x", entries });

describe("story recordings", () => {
  it("looks a sentence up by normalised text", () => {
    const m = parseStoryManifest(manifest([{ text: "Mia wakes up.", file: "stories/s/a.mp3" }]));
    expect(recordingPathFor(m, "  Mia   wakes\nup. ")).toBe("stories/s/a.mp3");
    expect(recordingPathFor(m, "Mia wakes up!")).toBeNull();
    expect(recordingPathFor(null, "Mia wakes up.")).toBeNull();
  });

  it("collapses no-break spaces the way the native readers and the generator do", () => {
    const m = parseStoryManifest(
      manifest([{ text: "Tu viens\u00a0? Oui\u202f!", file: "stories/s/a.mp3" }]),
    );
    expect(recordingPathFor(m, "Tu viens ? Oui !")).toBe("stories/s/a.mp3");
    expect(recordingPathFor(m, "\ufeffTu  viens\u00a0?\u3000Oui\u202f!")).toBe("stories/s/a.mp3");
  });

  it("matches composed and decomposed accents as the same sentence", () => {
    const m = parseStoryManifest(manifest([{ text: "Café.", file: "stories/s/a.mp3" }]));
    expect(recordingPathFor(m, "Café.")).toBe("stories/s/a.mp3");
  });

  it("rejects a manifest of another version, and files outside stories/", () => {
    expect(parseStoryManifest({ v: 2, entries: [] })).toBeNull();
    expect(parseStoryManifest("nope")).toBeNull();
    const m = parseStoryManifest(
      manifest([
        { text: "a", file: "podcast/x.mp3" },
        { text: "b", file: "stories/../x.mp3" },
        { text: "c", file: "stories/s/c.mp3" },
      ]),
    );
    expect([...m!.keys()]).toEqual(["c"]);
  });

  it("allRecorded needs every sentence and at least one", () => {
    const m = parseStoryManifest(manifest([{ text: "a", file: "stories/s/a.mp3" }]));
    expect(allRecorded(m, ["a"])).toBe(true);
    expect(allRecorded(m, ["a", "b"])).toBe(false);
    expect(allRecorded(m, [])).toBe(false);
  });

  it("builds the public URL", () => {
    expect(storyAudioPublicUrl("https://p.supabase.co/", "stories/s/a b.mp3")).toBe(
      "https://p.supabase.co/storage/v1/object/public/podcast-audio/stories/s/a%20b.mp3",
    );
  });

  it("a missing, failing or malformed manifest is no recordings, never a throw", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(manifest([])), { status: 200 }));
    expect(await fetchStoryRecordings("https://p", "s", ok as never)).not.toBeNull();
    const notFound = vi.fn(async () => new Response("", { status: 404 }));
    expect(await fetchStoryRecordings("https://p", "s", notFound as never)).toBeNull();
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchStoryRecordings("https://p", "s", boom as never)).toBeNull();
    const junk = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect(await fetchStoryRecordings("https://p", "s", junk as never)).toBeNull();
    expect(await fetchStoryRecordings(undefined, "s", ok as never)).toBeNull();
    expect(await fetchStoryRecordings("https://p", undefined, ok as never)).toBeNull();
  });
});
