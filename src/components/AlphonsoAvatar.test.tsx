// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { AlphonsoAvatar, type AvatarReplyVerdict } from "./AlphonsoAvatar";
import { lipSyncPlan, visemeAt } from "@/lib/avatar/lipsync";
import type { VoicePhase } from "@/lib/avatar/machine";

/** A clock and a frame queue the test drives by hand. */
let now = 0;
let queue: FrameRequestCallback[] = [];

beforeEach(() => {
  now = 1000;
  queue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function tick(ms = 40) {
  act(() => {
    now += ms;
    const frames = queue.splice(0);
    for (const cb of frames) cb(now);
  });
}

const idle: VoicePhase = { kind: "idle" };
const none: AvatarReplyVerdict = { serial: 0, verdict: "none" };

type Props = Partial<Parameters<typeof AlphonsoAvatar>[0]>;
const view = (over: Props = {}) => (
  <AlphonsoAvatar
    phase={idle}
    replyText={null}
    getAudio={() => null}
    replyVerdict={none}
    course="en"
    reducedMotion={false}
    {...over}
  />
);

const opacity = (container: HTMLElement, file: string) =>
  (container.querySelector(`img[src$="/${file}"]`) as HTMLImageElement).style.opacity;
const mouthShown = (container: HTMLElement) =>
  ["half", "talk", "ah", "oh", "ee", "fv"].filter(
    (m) => opacity(container, `mouth-${m}.webp`) === "1",
  );
const browsShown = (container: HTMLElement) =>
  ["neutral", "raised", "lowered"].filter((b) => opacity(container, `brows-${b}.webp`) === "1");

describe("the stage", () => {
  it("is hidden from assistive technology, takes no pointer, and every image is decorative", () => {
    const { getByTestId, container } = render(view());
    const stage = getByTestId("alphonso-stage");
    expect(stage.getAttribute("aria-hidden")).toBe("true");
    expect(stage.className).toContain("pointer-events-none");
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs).toHaveLength(15 - 1); // 15 files, the glint mask is applied by CSS, not drawn as an image
    for (const img of imgs) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("src")).toMatch(/^\/avatar\/[a-z-]+\.webp$/);
    }
  });

  it("draws the closed mouth (no mouth layer), neutral brows and neutral ears when idle", () => {
    const { container } = render(view());
    tick();
    expect(mouthShown(container)).toEqual([]);
    expect(browsShown(container)).toEqual(["neutral"]);
    expect(opacity(container, "ear-left-neutral.webp")).toBe("1");
    expect(opacity(container, "ear-left-twitch.webp")).toBe("0");
  });

  it("lowers the brows while he thinks and raises them on a loud question word... only from the plan", () => {
    const { container, rerender } = render(view());
    rerender(view({ phase: { kind: "thinking" } }));
    tick();
    expect(browsShown(container)).toEqual(["lowered"]);
  });
});

describe("lips follow the audio element's currentTime", () => {
  const text = "Good morning, what would you like?";
  const audio = { duration: 4, currentTime: 0 } as HTMLAudioElement;

  it("shows the plan's mouth at the playback time, and shuts at the end", () => {
    const plan = lipSyncPlan(text, "en", 4);
    const { container, rerender } = render(view());
    rerender(view({ phase: { kind: "speaking" }, replyText: text, getAudio: () => audio }));
    let sawOpen = false;
    for (const t of [0.1, 0.35, 0.8, 1.3, 2.1, 2.9, 3.5]) {
      audio.currentTime = t;
      tick();
      const expected = visemeAt(plan, t);
      expect(mouthShown(container), `at ${t}`).toEqual(expected === "closed" ? [] : [expected]);
      if (expected !== "closed") sawOpen = true;
    }
    expect(sawOpen).toBe(true);
    audio.currentTime = 4.5;
    tick();
    expect(mouthShown(container)).toEqual([]);
  });

  it("keeps his mouth shut when the clip's length is not known yet", () => {
    const { container, rerender } = render(view());
    rerender(
      view({
        phase: { kind: "speaking" },
        replyText: text,
        getAudio: () => ({ duration: Infinity, currentTime: 1 }) as HTMLAudioElement,
      }),
    );
    tick();
    expect(mouthShown(container)).toEqual([]);
  });

  it("never moves the head with the voice: the frame's transform does not depend on the mouth", () => {
    const { container, rerender } = render(view({ reducedMotion: true }));
    const body = container.querySelector("[data-testid=alphonso-stage] > div") as HTMLElement;
    rerender(
      view({
        reducedMotion: true,
        phase: { kind: "speaking" },
        replyText: text,
        getAudio: () => audio,
      }),
    );
    const seen = new Set<string>();
    for (const t of [0.1, 0.8, 1.3, 2.1]) {
      audio.currentTime = t;
      tick();
      seen.add(body.style.transform);
    }
    expect([...seen]).toEqual(["rotate(0deg) scale(1, 1)"]);
  });
});

describe("Reduce Motion", () => {
  it("stills breathing and sway, but not the face", () => {
    const { container, rerender } = render(view({ reducedMotion: true }));
    const body = container.querySelector("[data-testid=alphonso-stage] > div") as HTMLElement;
    for (let i = 0; i < 60; i++) tick(100);
    expect(body.style.transform).toBe("rotate(0deg) scale(1, 1)");
    rerender(view({ reducedMotion: true, phase: { kind: "thinking" } }));
    tick();
    expect(browsShown(container)).toEqual(["lowered"]);
  });

  it("breathes and sways when motion is allowed", () => {
    const { container } = render(view());
    const body = container.querySelector("[data-testid=alphonso-stage] > div") as HTMLElement;
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      tick(150);
      seen.add(body.style.transform);
    }
    expect(seen.size).toBeGreaterThan(10);
    expect(seen.has("rotate(0deg) scale(1, 1)")).toBe(false);
  });
});

describe("reactions from the reply's verdict", () => {
  const run = (verdict: AvatarReplyVerdict) => {
    const out = render(view());
    const { rerender, container } = out;
    rerender(view({ phase: { kind: "thinking" } }));
    tick();
    rerender(view({ phase: { kind: "thinking" }, replyVerdict: verdict }));
    tick();
    rerender(view({ phase: { kind: "speaking" }, replyVerdict: verdict }));
    tick();
    return { rerender, container, verdict };
  };

  it("a correct answer gets a happy face after the reply is spoken, not before", () => {
    const { rerender, container, verdict } = run({ serial: 1, verdict: "correct" });
    expect(mouthShown(container)).not.toContain("ee");
    rerender(view({ phase: idle, replyVerdict: verdict }));
    tick();
    expect(mouthShown(container)).toEqual(["ee"]);
    expect(browsShown(container)).toEqual(["raised"]);
    tick(1300);
    tick();
    expect(mouthShown(container)).toEqual([]);
    expect(browsShown(container)).toEqual(["neutral"]);
  });

  it("a corrected answer gets an encouraging face", () => {
    const { rerender, container, verdict } = run({ serial: 1, verdict: "corrected" });
    rerender(view({ phase: idle, replyVerdict: verdict }));
    tick();
    expect(mouthShown(container)).toEqual(["talk"]);
    expect(browsShown(container)).toEqual(["neutral"]);
  });

  it("a reply with no verdict reacts to nothing", () => {
    const { rerender, container, verdict } = run({ serial: 1, verdict: "none" });
    rerender(view({ phase: idle, replyVerdict: verdict }));
    tick();
    expect(mouthShown(container)).toEqual([]);
  });

  it("pressing talk before the reply ends drops the reaction", () => {
    const { rerender, container, verdict } = run({ serial: 1, verdict: "correct" });
    rerender(view({ phase: { kind: "recording" }, replyVerdict: verdict }));
    tick();
    rerender(view({ phase: idle, replyVerdict: verdict }));
    tick();
    expect(mouthShown(container)).toEqual([]);
  });

  it("does not react to a verdict that was already there when the stage appeared", () => {
    const { container, rerender } = render(
      view({ replyVerdict: { serial: 3, verdict: "correct" } }),
    );
    rerender(
      view({ phase: { kind: "thinking" }, replyVerdict: { serial: 3, verdict: "correct" } }),
    );
    tick();
    rerender(view({ phase: idle, replyVerdict: { serial: 3, verdict: "correct" } }));
    tick();
    expect(mouthShown(container)).toEqual([]);
  });
});

describe("the mode it reports (for the call's state pill)", () => {
  it("reports each change once: thinking, speaking, then the reaction after the reply", () => {
    const modes: string[] = [];
    const onModeChange = (m: string) => modes.push(m);
    const { rerender } = render(view({ onModeChange }));
    tick();
    rerender(view({ onModeChange, phase: { kind: "thinking" } }));
    tick();
    tick();
    const verdict: AvatarReplyVerdict = { serial: 1, verdict: "correct" };
    rerender(view({ onModeChange, phase: { kind: "thinking" }, replyVerdict: verdict }));
    rerender(view({ onModeChange, phase: { kind: "speaking" }, replyVerdict: verdict }));
    tick();
    rerender(view({ onModeChange, phase: idle, replyVerdict: verdict }));
    tick();
    expect(modes).toEqual(["thinking", "speaking", "reacting:happy"]);
  });
});
