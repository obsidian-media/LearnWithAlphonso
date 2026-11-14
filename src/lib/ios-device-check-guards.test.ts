import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards for the build 63 device-check defects, which compile and pass every other check:
//  - a `.task` on a conditional container that draws nothing while empty never fires (the Watch shelf never loaded);
//  - the system confirmationDialog draws pale accent-tinted text on iOS 26 glass (the report menu was unreadable).
const ROOT = path.resolve(import.meta.dirname, "../..");
const APP_DIR = path.join(ROOT, "ios/LearnWithAlphonso/Sources");

function swiftFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...swiftFiles(full));
    else if (entry.name.endsWith(".swift")) out.push(full);
  }
  return out;
}

const stripComments = (text: string) =>
  text.replace(/\r\n/g, "\n").replace(/^\s*\/\/[^\n]*$/gm, "");
const sources = swiftFiles(APP_DIR).map((file) => ({
  file: path.relative(ROOT, file).split(path.sep).join("/"),
  text: stripComments(fs.readFileSync(file, "utf8")),
}));

/** The index just past the brace that closes the block opened at `open` (the index of a `{`). */
function closeOfBlock(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i + 1;
  }
  return -1;
}

/** True when a block body is an `if` chain with no final `else`: it draws nothing whenever the condition is false. */
function canDrawNothing(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed.startsWith("if")) return false;
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0 && /^else\b/.test(trimmed.slice(i)) && /\W/.test(trimmed[i - 1] ?? " "))
      return false;
  }
  return true;
}

/** Every `Group { if ... }` that can draw nothing and whose very next modifier is `.task` or `.onAppear`: the dead loader. */
export function groupsCarryingLoaders(text: string): string[] {
  const found: string[] = [];
  const open = /\bGroup\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(text))) {
    const start = match.index + match[0].length - 1;
    const end = closeOfBlock(text, start);
    if (end < 0) continue;
    if (!/^\s*\.(task|onAppear)\b/.test(text.slice(end))) continue;
    if (canDrawNothing(text.slice(start + 1, end - 1)))
      found.push(text.slice(match.index, match.index + 60));
  }
  return found;
}

describe("a loader never sits on a Group that can draw nothing", () => {
  it("the scanner recognises the shape that shipped in build 63", () => {
    const bad = `var body: some View {\n Group {\n if visible { Text("hint") }\n }\n .task { await load() }\n }`;
    expect(groupsCarryingLoaders(bad)).toHaveLength(1);
    const withElse = `Group {
 if failed { Text("x") } else { Shelf() }
 }
 .task { await load() }`;
    expect(groupsCarryingLoaders(withElse)).toHaveLength(0);
    const ok = `var body: some View {\n VStack(spacing: 0) {\n Shelf()\n Color.clear.task { await load() }\n }\n }`;
    expect(groupsCarryingLoaders(ok)).toHaveLength(0);
  });

  it("no app view puts .task or .onAppear straight on a Group", () => {
    const offenders = sources.flatMap((s) =>
      groupsCarryingLoaders(s.text).map((g) => `${s.file}: ${g}`),
    );
    expect(offenders).toEqual([]);
  });

  it("WatchShelfHost loads from an always-present anchor, not from the shelf content", () => {
    const host = sources.find((s) => s.file.endsWith("ListenShelfViews.swift"))!.text;
    const start = host.indexOf("struct WatchShelfHost");
    const end = host.indexOf("private struct WatchShelfSection");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = host.slice(start, end);
    const anchor = body.slice(body.indexOf("private var loadAnchor"));
    expect(anchor).toMatch(/Color\.clear[\s\S]*?\.task\s*\{\s*await loadVideos\(\)/);
    expect(anchor).toMatch(/\.task\(id: deepLink\.pending\)/);
    // The anchor is a real child of the body's stack, outside the `if videosFailed` branches.
    const bodyOnly = body.slice(body.indexOf("var body"), body.indexOf("private var loadAnchor"));
    expect(bodyOnly).toMatch(/\n\s*loadAnchor\n/);
    expect(bodyOnly).not.toMatch(/\.task\s*\{\s*await loadVideos\(\)/);
  });
});

describe("choices are the app's own sheet, not the system dialog", () => {
  it("no app view uses confirmationDialog", () => {
    const offenders = sources
      .filter((s) => /\.confirmationDialog\(/.test(s.text))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("the choice sheet draws with design tokens, never the accent tint", () => {
    const dialog = sources.find((s) => s.file.endsWith("AlphonsoChoiceDialog.swift"))!.text;
    expect(dialog).toMatch(/foregroundStyle\(destructive \? ds\.wrongInk : ds\.ink\)/);
    expect(dialog).not.toMatch(/\.tint\(|AlphonsoColor\.moss|Color\(hex/);
    // The action runs before the sheet closes: a call site that clears its state in the action must still see it.
    expect(dialog.indexOf("configuration.trigger()")).toBeGreaterThan(-1);
    expect(dialog.indexOf("configuration.trigger()")).toBeLessThan(dialog.indexOf("dismiss()\n"));
  });
});

describe("a scene is never painted over by a flat background", () => {
  /** `.screenScene(` calls that have a `.background(...)` earlier in the same modifier chain (same indent): it hides the scene. */
  function scenesHiddenByBackground(text: string): number[] {
    const lines = text.split("\n");
    const hidden: number[] = [];
    lines.forEach((line, index) => {
      if (!/^\s*\.screenScene\(/.test(line)) return;
      const indent = line.match(/^\s*/)![0].length;
      for (let up = index - 1; up >= 0; up--) {
        const prev = lines[up];
        if (prev.trim() === "") continue;
        const prevIndent = prev.match(/^\s*/)![0].length;
        if (prevIndent < indent) break;
        if (prevIndent === indent && /^\s*\.background\(/.test(prev)) hidden.push(index + 1);
      }
    });
    return hidden;
  }

  it("the scanner finds a background placed before the scene, and not one placed after it", () => {
    const hidden =
      "  List {}\n  .scrollContentBackground(.hidden)\n  .background(ds.surface)\n  .overlay(alignment: .bottom) {\n    X()\n  }\n  .screenScene(.learn)";
    expect(scenesHiddenByBackground(hidden)).toEqual([7]);
    const fine = "  List {}\n  .screenScene(.learn)\n  .background(ds.surface)";
    expect(scenesHiddenByBackground(fine)).toEqual([]);
  });

  it("Learn, Profile and every other scene screen draw their scene above the flat surface", () => {
    const offenders = sources.flatMap((s) =>
      scenesHiddenByBackground(s.text).map((line) => `${s.file}:${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
