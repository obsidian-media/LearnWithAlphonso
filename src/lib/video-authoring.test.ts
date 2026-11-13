import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCourse } from "@/data/courses";
import { CliArgError, parseCliArgs } from "./podcast-cli-args";
import {
  buildVideoRow,
  isLikelyJpeg,
  isLikelyMp4,
  isLikelyVtt,
  parsePracticeTarget,
  parseTags,
  pickEnv,
  practiceTargetProblem,
  publishProblems,
  validateVideoDraft,
  videoStoragePaths,
  type VideoDraft,
} from "./video-authoring";

const LEVELS = ["A1", "A2", "B1"];
const draft: VideoDraft = {
  slug: "en-id-like-vs-i-want",
  course: "en",
  title: "I'd like vs I want",
  description: "Order politely.",
  levelId: "A1",
  durationSeconds: 49,
  tags: ["food"],
  practice: { kind: "lesson", id: "u3l2" },
  sortOrder: 0,
};

describe("storage paths and the row", () => {
  it("names the three objects by course and slug", () => {
    expect(videoStoragePaths("en", "en-x")).toEqual({
      video: "en/en-x.mp4",
      poster: "en/en-x.jpg",
      captions: "en/en-x.en.vtt",
    });
  });
  it("always writes the row unpublished, with the practice pair and the paths", () => {
    const row = buildVideoRow(draft);
    expect(row).toMatchObject({
      slug: "en-id-like-vs-i-want",
      course: "en",
      published: false,
      published_at: null,
      video_path: "en/en-id-like-vs-i-want.mp4",
      captions_path: "en/en-id-like-vs-i-want.en.vtt",
      practice_kind: "lesson",
      practice_id: "u3l2",
      duration_seconds: 49,
    });
    expect(buildVideoRow({ ...draft, practice: null })).toMatchObject({
      practice_kind: null,
      practice_id: null,
    });
  });
});

describe("tags", () => {
  it("normalises, de-duplicates and keeps order", () => {
    expect(parseTags(" Food, travel ,food,,ordering-food")).toEqual([
      "food",
      "travel",
      "ordering-food",
    ]);
    expect(parseTags(undefined)).toEqual([]);
  });
  it("rejects a label that is not kebab-case and more than twelve", () => {
    expect(() => parseTags("good,Not Ok!")).toThrow(/must be lower-case/);
    expect(() => parseTags(Array.from({ length: 13 }, (_, i) => `t${i}`).join(","))).toThrow(
      /at most 12/,
    );
  });
});

describe("practice target", () => {
  it("parses kind:id and rejects everything else", () => {
    expect(parsePracticeTarget("talk:coffee")).toEqual({ kind: "talk", id: "coffee" });
    expect(parsePracticeTarget("lesson:u3l2")).toEqual({ kind: "lesson", id: "u3l2" });
    for (const bad of ["coffee", "quiz:x", "talk:", ":x", ""]) {
      expect(() => parsePracticeTarget(bad)).toThrow(/--practice must look like/);
    }
  });
  it("checks the id exists in this course's content", () => {
    expect(practiceTargetProblem("en", { kind: "lesson", id: "u3l2" })).toBeNull();
    expect(practiceTargetProblem("en", { kind: "lesson", id: "u99l9" })).toMatch(/no en lesson/);
    expect(practiceTargetProblem("en", { kind: "talk", id: "coffee" })).toBeNull();
    expect(practiceTargetProblem("en", { kind: "talk", id: "nope" })).toMatch(/no Talk scenario/);
    expect(practiceTargetProblem("en", { kind: "campaign", id: "city-day" })).toBeNull();
    expect(practiceTargetProblem("en", { kind: "campaign", id: "nope" })).toMatch(
      /no story campaign/,
    );
  });
});

describe("file sniffing", () => {
  const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0]);
  it("accepts an mp4 and refuses other bytes", () => {
    expect(isLikelyMp4(mp4)).toBe(true);
    expect(isLikelyMp4(new Uint8Array(20))).toBe(false);
    expect(isLikelyMp4(new TextEncoder().encode("WEBVTT\n\n00:00 --> 00:01\nhi"))).toBe(false);
  });
  it("accepts a jpeg and refuses a png", () => {
    expect(isLikelyJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(true);
    expect(isLikelyJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0]))).toBe(false);
  });
  it("accepts WebVTT with cues (and a BOM) and refuses SRT and an empty header", () => {
    expect(isLikelyVtt("WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHi")).toBe(true);
    expect(isLikelyVtt("﻿WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi")).toBe(true);
    expect(isLikelyVtt("1\n00:00:00,000 --> 00:00:01,000\nHi")).toBe(false);
    expect(isLikelyVtt("WEBVTT\n")).toBe(false);
  });
});

describe("validateVideoDraft", () => {
  it("passes the first video's draft", () => {
    expect(validateVideoDraft(draft, LEVELS)).toEqual([]);
  });
  it("names each problem", () => {
    const text = (d: Partial<VideoDraft>) =>
      validateVideoDraft({ ...draft, ...d }, LEVELS).join("|");
    expect(text({ slug: "Bad Slug" })).toMatch(/invalid slug/);
    expect(text({ course: null })).toMatch(/--course is required/);
    expect(text({ slug: "fr-x", course: "en" })).toMatch(/should start with "en-"/);
    expect(text({ title: "  " })).toMatch(/--title is required/);
    expect(text({ levelId: "Z9" })).toMatch(/level "Z9"/);
    expect(text({ durationSeconds: 0 })).toMatch(/duration/);
    expect(text({ practice: { kind: "lesson", id: "nope" } })).toMatch(/--practice: no en lesson/);
  });
});

describe("publishProblems", () => {
  const row = {
    slug: "en-x",
    published: false,
    video_path: "en/en-x.mp4",
    poster_path: "en/en-x.jpg",
    captions_path: "en/en-x.en.vtt",
  };
  const all = ["en/en-x.mp4", "en/en-x.jpg", "en/en-x.en.vtt"];
  it("is clean when captions are set and every object exists", () => {
    expect(publishProblems(row, all)).toEqual([]);
  });
  it("refuses a video without captions", () => {
    expect(publishProblems({ ...row, captions_path: null }, all).join("|")).toMatch(/no captions/);
  });
  it("refuses a missing object, naming which", () => {
    const text = publishProblems(row, ["en/en-x.mp4", "en/en-x.en.vtt"]).join("|");
    expect(text).toMatch(/poster file en\/en-x.jpg is not in the videos bucket/);
  });
});

describe("pickEnv", () => {
  it("picks only the wanted names, with export, quotes and comments handled", () => {
    const text = [
      "# comment",
      "SUPABASE_URL=https://x.supabase.co",
      'export SUPABASE_SERVICE_ROLE_KEY="abc.def"',
      "DEEPGRAM_API_KEY=should-not-come-back",
      "EMPTY=",
    ].join("\r\n");
    expect(pickEnv(text, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])).toEqual({
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "abc.def",
    });
  });
});

describe("scripts/video-tool.ts wiring", () => {
  const source = readFileSync(path.join(process.cwd(), "scripts/video-tool.ts"), "utf8");
  it("takes its flags from the loud shared parser: a boolean with a value, an unknown flag and a bare word all throw", () => {
    const spec = { booleans: ["confirm"], values: ["slug"] } as const;
    expect(() => parseCliArgs(["publish", "--confirm", "yes"], spec)).toThrow(CliArgError);
    expect(() => parseCliArgs(["publish", "--nope"], spec)).toThrow(/Unknown flag/);
    expect(() => parseCliArgs(["publish", "stray"], spec)).toThrow(/Unexpected argument/);
  });
  it("never writes without --confirm and never prints the key", () => {
    expect(source.match(/flags\.confirm !== true/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).not.toMatch(/console\.\w+\([^)]*SERVICE_ROLE_KEY[^)]*\)\s*;?\s*$/m);
    expect(source).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
  it("uploads the objects before it writes the row, and the row is the unpublished one", () => {
    expect(source.indexOf(".upload(")).toBeLessThan(source.indexOf('.from("videos").upsert('));
    expect(source).toContain("buildVideoRow(draft)");
  });
});

describe("the first three videos' practice targets still exist in the curriculum", () => {
  it.each([
    ["en-id-like-vs-i-want", "u3l2", "At a Café"],
    ["en-can-you-could-you", "u3l1", "Please & Thank You"],
    ["en-saying-no-politely", "u3l4", "Making Plans"],
  ])("%s -> lesson %s (%s)", (_slug, id, title) => {
    expect(practiceTargetProblem("en", { kind: "lesson", id })).toBeNull();
    const lesson = getCourse("en")
      .curriculum.flatMap((u) => u.lessons)
      .find((l) => l.id === id);
    expect(lesson?.title).toBe(title);
  });
});
