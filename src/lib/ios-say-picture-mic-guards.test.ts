import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Say the picture's iOS mic follows the same tap-or-hold rule as Say it right (#661): the decision is the Kit's
 * SayItRight.releaseStops (unit-tested there), and this pins that the ring's gesture really goes through it. The
 * SwiftUI view cannot run here, so the wiring is read from the source.
 */
const root = path.resolve(import.meta.dirname, "../..");
const view = () =>
  fs.readFileSync(path.join(root, "ios/LearnWithAlphonso/Sources/SayThePictureView.swift"), "utf8");

/** The body of the `private struct SayPictureMicRing`, up to the next top-level declaration. */
function micRing(text: string): string {
  const start = text.indexOf("private struct SayPictureMicRing");
  expect(start, "SayPictureMicRing exists").toBeGreaterThan(-1);
  const end = text.indexOf("\n}\n", start);
  return text.slice(start, end);
}

/** Code only: comments may describe the old behaviour. */
const code = (text: string) =>
  text
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

function micProblems(text: string): string[] {
  const ring = code(micRing(text));
  const problems: string[] = [];
  const ended = ring.slice(ring.indexOf(".onEnded"), ring.indexOf(".accessibilityAction"));
  if (
    !ended.includes("SayItRight.releaseStops(heldSeconds: held, wasRecording: wasRecordingAtPress)")
  ) {
    problems.push("the release does not go through SayItRight.releaseStops");
  }
  if (/\.onEnded \{ _ in onRelease\(\) \}/.test(ring)) {
    problems.push("the release always stops (no latch)");
  }
  const changed = ring.slice(ring.indexOf(".onChanged"), ring.indexOf(".onEnded"));
  if (!changed.includes("wasRecordingAtPress = isRecording")) {
    problems.push(
      "the press does not remember whether it was recording (a second tap could not stop)",
    );
  }
  return problems;
}

describe("iOS Say the picture mic: tap to toggle or hold to talk", () => {
  it("the ring's release is decided by SayItRight.releaseStops", () => {
    expect(micProblems(view())).toEqual([]);
  });

  it("the hints say how it works", () => {
    const text = view();
    expect(text).toContain('"What is this? Hold to talk, or tap to start and tap to stop."');
    expect(text).toContain('"Listening. Let go or tap to send."');
    expect(text).not.toContain("Let go when you are done");
  });

  it("the check itself catches a release that always stops", () => {
    const text = view();
    const broken = text.replace(
      /\.onEnded \{ _ in\n[\s\S]*?if SayItRight\.releaseStops\(heldSeconds: held, wasRecording: wasRecordingAtPress\) \{ onRelease\(\) \}\n\s*\}/,
      ".onEnded { _ in onRelease() }",
    );
    expect(broken).not.toBe(text);
    expect(micProblems(broken)).toEqual([
      "the release does not go through SayItRight.releaseStops",
      "the release always stops (no latch)",
    ]);
  });
});
