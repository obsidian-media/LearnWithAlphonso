import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Final iPhone QA, P2 polish (2026-11-21). The SwiftUI cannot run here (the app target only compiles in CI), so each
 * fix is pinned from the source, and every check is proved to go red when its fix is taken out (on the property it
 * claims to guard, not on some unrelated string):
 *   3. Say it right's two model buttons never break a label mid-word: one line each, and a stacked fallback.
 *   4. Say it right and Say the picture draw a speech bubble whose tail points at Alphonso (the shared SpeechBubbleShape).
 *   5. Lesson complete: the CTA bar is opaque, so no stat label shows through it.
 *   6. The branching story reader: a stronger scrim by the first paragraph, and a text shadow on the eyebrow and text.
 *   7. First-run "Skip" uses a readable token on the cream surface, not the white card colour.
 */
const root = path.resolve(import.meta.dirname, "../..");
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => fs.readFileSync(path.join(root, SRC, p), "utf8").replace(/\r\n/g, "\n");

/** Code only: comments may describe other behaviour. */
const code = (text: string) =>
  text
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

/** The text from the first `a` to the next `b` after it ("" when either is missing). */
function between(text: string, a: string, b: string): string {
  const i = text.indexOf(a);
  if (i < 0) return "";
  const j = text.indexOf(b, i + a.length);
  return j < 0 ? "" : text.slice(i, j);
}

// ---- 3. buttons never break mid-word
function buttonProblems(pronunciation: string): string[] {
  const out: string[] = [];
  const src = code(pronunciation);
  const fits = between(src, "ViewThatFits(in: .horizontal) {", "        }\n");
  if (!/HStack[\s\S]*modelButtons/.test(fits) || !/VStack[\s\S]*modelButtons/.test(fits)) {
    out.push("the model buttons have no HStack -> VStack two-row fallback");
  }
  const buttons = between(src, "private func modelButtons", "func compare");
  for (const label of ["Hear it", "Say it slower"]) {
    const line = buttons.split("\n").find((l) => l.includes(`Label("${label}"`)) ?? "";
    if (!line.includes(".lineLimit(1)") || !line.includes(".fixedSize(horizontal: true")) {
      out.push(`"${label}" can wrap mid-word (needs lineLimit(1) + fixedSize(horizontal: true))`);
    }
  }
  return out;
}

// ---- 4. bubble tails
function tailProblems(shape: string, pronunciation: string, picture: string): string[] {
  const out: string[] = [];
  const s = code(shape);
  if (!/var tailLeading = false/.test(s) || !/tailLeading \? rect\.minX : rect\.maxX/.test(s)) {
    out.push("SpeechBubbleShape cannot point its tail out the leading edge");
  }
  if (!/body\.union\(tail\)/.test(s)) out.push("the tail is not unioned into one outline");
  const p = code(pronunciation);
  if (!/SpeechBubbleShape\([^)]*tailLeading: true[^)]*\)\.fill\(ds\.card\)/.test(p)) {
    out.push("Say it right's bubble is not drawn with a leading tail");
  }
  if (!/\.padding\(\.leading, showsTail \? 14 : 0\)/.test(p))
    out.push("Say it right's bubble reserves no room for the tail");
  const t = code(picture);
  if (!/SpeechBubbleShape\(cornerRadius: 16, tailLeading: true\)\.fill/.test(t)) {
    out.push("Say the picture's bubble is not drawn with a leading tail");
  }
  return out;
}

// ---- 5. lesson complete CTA
function completeProblems(stage: string): string[] {
  const at = stage.indexOf("struct LessonCompleteView");
  const complete = code(at < 0 ? "" : stage.slice(at));
  const bar = between(complete, ".safeAreaInset(edge: .bottom) {", ".onAppear");
  const out: string[] = [];
  if (!bar.includes("continueTitle")) out.push("the CTA is not the bottom safe-area inset");
  if (!/\.background\(ds\.surface\)\s*\n/.test(bar))
    out.push("the CTA bar is not an opaque surface");
  if (/ds\.surface\.opacity\(0\.95\)/.test(bar))
    out.push("the CTA bar is translucent: stat labels show through it");
  return out;
}

// ---- 6. story reader
function readerProblems(story: string): string[] {
  const s = code(story);
  const out: string[] = [];
  const fade = between(s, "private var fade: some View", "private var topBar");
  // The dark must be well in by where the first paragraph starts (about 40 % down): >= 0.7 at 0.44.
  const stops = [...fade.matchAll(/opacity\(([\d.]+)\), location: ([\d.]+)/g)].map((m) => [
    Number(m[2]),
    Number(m[1]),
  ]);
  const darkBy = stops.find(([loc]) => loc <= 0.45 && loc >= 0.4)?.[1] ?? 0;
  if (darkBy < 0.7)
    out.push(
      `the scrim is only ${darkBy} dark at 44 % down, so bright art washes the first paragraph`,
    );
  const eyebrow = between(s, 'Text("Scene \\(sceneNumber)")', "passage(current: current)");
  if (!eyebrow.includes(".shadow(")) out.push('the "Scene N" eyebrow has no text shadow');
  const passage = between(s, "private func passage", "private var narrationControls");
  if (!passage.includes(".shadow(")) out.push("the read-along text has no text shadow");
  return out;
}

// ---- 7. Skip
function skipProblems(parts: string): string[] {
  const skip = between(code(parts), 'Button("Skip", action: onSkip)', ".accessibilityHint");
  const out: string[] = [];
  if (!skip.includes(".foregroundStyle(ds.brand)")) out.push("Skip is not the brand ink");
  if (skip.includes(".foregroundStyle(ds.card)"))
    out.push("Skip is the white card colour on a cream surface");
  if (!skip.includes(".background(Capsule().fill(ds.card))"))
    out.push("Skip has no card chip behind it (brand ink alone vanishes over the room art)");
  return out;
}

const files = () => ({
  pron: read("PronunciationView.swift"),
  picture: read("SayThePictureView.swift"),
  shape: read("DesignSystem/AlphonsoComponents.swift"),
  stage: read("LessonStageViews.swift"),
  story: read("BranchingStoryViews.swift"),
  parts: read("FirstRunParts.swift"),
});

describe("final QA P2 polish on iOS", () => {
  const f = files();

  it("3. Say it right's buttons never break mid-word and fall back to two rows", () => {
    expect(buttonProblems(f.pron)).toEqual([]);
  });
  it("4. both speech bubbles have a tail toward Alphonso", () => {
    expect(tailProblems(f.shape, f.pron, f.picture)).toEqual([]);
  });
  it("5. the lesson-complete CTA bar is opaque", () => {
    expect(completeProblems(f.stage)).toEqual([]);
  });
  it("6. the story reader's scrim and text shadow keep the first paragraph readable", () => {
    expect(readerProblems(f.story)).toEqual([]);
  });
  it("7. the first-run Skip is readable on cream", () => {
    expect(skipProblems(f.parts)).toEqual([]);
  });

  it("goes red when each fix is taken out", () => {
    const mutate = (text: string, from: string | RegExp, to: string) => {
      const next = text.replace(from, to);
      expect(next).not.toBe(text);
      return next;
    };
    // 3: drop the stacked fallback, then the one-line guard on a label.
    const noStack = mutate(
      f.pron,
      /VStack\(spacing: AlphonsoDS\.Space\.s2\) \{ modelButtons\(word\) \}/,
      "",
    );
    expect(buttonProblems(noStack)).not.toEqual([]);
    const wraps = mutate(
      f.pron,
      'Label("Say it slower", systemImage: "tortoise.fill").lineLimit(1)',
      'Label("Say it slower", systemImage: "tortoise.fill")',
    );
    expect(buttonProblems(wraps)).not.toEqual([]);
    // 4: the leading tail, then each bubble back to a plain rounded rectangle.
    const noLeading = mutate(f.shape, "tailLeading ? rect.minX : rect.maxX", "rect.maxX");
    expect(tailProblems(noLeading, f.pron, f.picture)).not.toEqual([]);
    const plainPron = mutate(
      f.pron,
      /SpeechBubbleShape\(cornerRadius: AlphonsoDS\.Radius\.bubble, tailLeading: true, showsTail: showsTail\)\.fill\(ds\.card\)/,
      "RoundedRectangle(cornerRadius: 1).fill(ds.card)",
    );
    expect(tailProblems(f.shape, plainPron, f.picture)).not.toEqual([]);
    const plainPicture = mutate(
      f.picture,
      /SpeechBubbleShape\(cornerRadius: 16, tailLeading: true\)\.fill\(Color\.white\)/,
      "RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white)",
    );
    expect(tailProblems(f.shape, f.pron, plainPicture)).not.toEqual([]);
    // 5: a translucent bar again.
    const at = f.stage.indexOf("struct LessonCompleteView");
    const translucent =
      f.stage.slice(0, at) +
      mutate(
        f.stage.slice(at),
        ".background(ds.surface)\n                .overlay(alignment: .top) {",
        ".background(ds.surface.opacity(0.95))\n                .overlay(alignment: .top) {",
      );
    expect(completeProblems(translucent)).not.toEqual([]);
    // 6: the old, lighter scrim; no shadow on the eyebrow.
    expect(
      readerProblems(
        mutate(
          f.story,
          "ds.heroB.opacity(0.78), location: 0.44",
          "ds.heroB.opacity(0.30), location: 0.44",
        ),
      ),
    ).not.toEqual([]);
    expect(
      readerProblems(
        mutate(f.story, ".shadow(color: ds.heroB.opacity(0.9), radius: 3, y: 1)\n", ""),
      ),
    ).not.toEqual([]);
    // 7: Skip back to the white card colour.
    const white = mutate(
      f.parts,
      /(Button\("Skip", action: onSkip\)\n\s*\.dsText\(\.headline\)\n\s*\.foregroundStyle\()ds\.brand\)/,
      "$1ds.card)",
    );
    expect(skipProblems(white)).not.toEqual([]);
    // 7: Skip without its card chip.
    const bare = mutate(
      f.parts,
      /(\.frame\(minHeight: AlphonsoDS\.Space\.minTouch\)\n)\s*\.background\(Capsule\(\)\.fill\(ds\.card\)\)\n/,
      "$1",
    );
    expect(skipProblems(bare)).not.toEqual([]);
  });
});
