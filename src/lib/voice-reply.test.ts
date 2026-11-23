import { describe, expect, it, vi } from "vitest";
import type { PlayOutcome, VoicePlayback } from "./voice-playback";
import { createReplyVoice, DEVICE_VOICE_START_MS, type ReplyVoiceState } from "./voice-reply";

function setup(outcomes: PlayOutcome[], device: "works" | "refused" | "absent" = "works") {
  const queue = [...outcomes];
  const play = vi.fn(async () => queue.shift() ?? { result: "ended" as const });
  const playback = {
    play,
    stop: vi.fn(),
    unlock: vi.fn(),
    element: () => null,
    isPlaying: () => false,
    installGestureUnlock: () => () => {},
  } as unknown as VoicePlayback;
  type DeviceCb = { onStart?: () => void; onEnd: () => void; onError: (reason?: string) => void };
  let deviceCb: DeviceCb | null = null;
  const speakDevice = vi.fn((_t: string, _l: string, cb: DeviceCb) => {
    if (device === "absent") return false;
    deviceCb = cb;
    if (device === "refused") cb.onError();
    return true;
  });
  const states: ReplyVoiceState[] = [];
  const report = vi.fn();
  const voice = createReplyVoice({
    playback,
    speakDevice,
    cancelDevice: vi.fn(),
    report,
    onChange: (s) => states.push(s),
    surface: "hector",
  });
  return {
    voice,
    play,
    speakDevice,
    report,
    states,
    last: () => states[states.length - 1],
    finishDevice: () => deviceCb?.onEnd(),
    failDevice: (reason?: string) => deviceCb?.onError(reason),
  };
}

const reply = (clip: Blob | null = new Blob(["a"])) => ({ text: "Bonjour !", lang: "fr-FR", clip });

describe("a reply that plays", () => {
  it("is speaking while it plays and settles when it ends, with no button", async () => {
    const t = setup([{ result: "ended" }]);
    await t.voice.say(reply());
    expect(t.states[0]).toEqual({ speaking: true, awaitingTap: false });
    expect(t.last()).toEqual({ speaking: false, awaitingTap: false });
    expect(t.report).not.toHaveBeenCalled();
    expect(t.speakDevice).not.toHaveBeenCalled();
  });

  it("settles when the system pauses it (a locked screen): the learner is not left stuck on speaking", async () => {
    const t = setup([{ result: "stopped" }]);
    await t.voice.say(reply());
    expect(t.last()).toEqual({ speaking: false, awaitingTap: false });
    expect(t.speakDevice).not.toHaveBeenCalled();
  });
});

describe("a reply the browser refuses to play", () => {
  it("falls back to the device voice, shows the tap button, and reports the failure with the error name", async () => {
    const t = setup([{ result: "blocked", errorName: "NotAllowedError" }]);
    await t.voice.say(reply());
    expect(t.speakDevice).toHaveBeenCalledWith("Bonjour !", "fr-FR", expect.anything());
    expect(t.last().awaitingTap).toBe(true);
    expect(t.report).toHaveBeenCalledWith({
      surface: "hector",
      reason: "play_blocked",
      errorName: "NotAllowedError",
    });
  });

  it("does not release hands-free (awaitingTap holds) while the device voice speaks, or when it is refused too", async () => {
    const t = setup([{ result: "blocked", errorName: "NotAllowedError" }], "refused");
    await t.voice.say(reply());
    expect(t.last()).toEqual({ speaking: false, awaitingTap: true });
  });

  it("releases once the device voice has finished the line", async () => {
    const t = setup([{ result: "error", errorName: "MediaError" }]);
    await t.voice.say(reply());
    expect(t.last().awaitingTap).toBe(true);
    t.finishDevice();
    expect(t.last()).toEqual({ speaking: false, awaitingTap: false });
  });

  it("keeps the tap button when the device cannot speak at all", async () => {
    const t = setup([{ result: "blocked" }], "absent");
    await t.voice.say(reply());
    expect(t.last()).toEqual({ speaking: false, awaitingTap: true });
  });

  it("the tap plays the same clip again and releases on success", async () => {
    const t = setup([{ result: "blocked" }, { result: "ended" }], "refused");
    const clip = new Blob(["a"]);
    await t.voice.say(reply(clip));
    t.voice.replay();
    await vi.waitFor(() => expect(t.last()).toEqual({ speaking: false, awaitingTap: false }));
    expect(t.play).toHaveBeenLastCalledWith(clip, expect.anything());
  });

  it("the tap keeps the button when the clip fails again", async () => {
    const t = setup([{ result: "blocked" }, { result: "blocked" }], "refused");
    await t.voice.say(reply());
    t.voice.replay();
    await vi.waitFor(() => expect(t.play).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(t.last().awaitingTap).toBe(true));
  });

  it("skip() releases it: the learner moved on", async () => {
    const t = setup([{ result: "blocked" }], "refused");
    await t.voice.say(reply());
    expect(t.last().awaitingTap).toBe(true);
    t.voice.skip();
    expect(t.last()).toEqual({ speaking: false, awaitingTap: false });
    expect(t.voice.hasPending()).toBe(false);
  });
});

describe("a reply with no audio (the server could not make the voice)", () => {
  it("is read by the device voice, never silent", async () => {
    const t = setup([]);
    await t.voice.say(reply(null));
    expect(t.play).not.toHaveBeenCalled();
    expect(t.speakDevice).toHaveBeenCalledOnce();
    expect(t.report).toHaveBeenCalledWith({ surface: "hector", reason: "no_audio" });
    expect(t.last().awaitingTap).toBe(true);
  });
});

describe("when nothing can say the line", () => {
  it("a device that cannot speak, with no clip, releases the call instead of holding hands-free shut", async () => {
    const t = setup([], "absent");
    await t.voice.say(reply(null));
    expect(t.last()).toEqual({ speaking: false, awaitingTap: false });
  });

  it("a device voice the browser refused for want of a tap keeps the button, even with no clip", async () => {
    const t = setup([], "works");
    await t.voice.say(reply(null));
    t.failDevice("not-allowed");
    expect(t.last()).toEqual({ speaking: false, awaitingTap: true });
  });

  it("a device voice that fails for any other reason, with no clip, releases", async () => {
    const t = setup([], "works");
    await t.voice.say(reply(null));
    t.failDevice("synthesis-failed");
    expect(t.last()).toEqual({ speaking: false, awaitingTap: false });
  });

  it("a device voice that never starts is treated as failed after a few seconds", async () => {
    vi.useFakeTimers();
    try {
      const t = setup([], "works");
      await t.voice.say(reply(null));
      expect(t.last().awaitingTap).toBe(true);
      vi.advanceTimersByTime(DEVICE_VOICE_START_MS + 1);
      expect(t.last()).toEqual({ speaking: false, awaitingTap: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a newer reply wins", () => {
  it("an old clip that settles late does not touch the state of the newer reply", async () => {
    let finishOld!: (o: PlayOutcome) => void;
    const t = setup([]);
    t.play.mockImplementationOnce(() => new Promise<PlayOutcome>((r) => (finishOld = r)));
    const old = t.voice.say(reply());
    const next = t.voice.say(reply());
    await next;
    expect(t.last()).toEqual({ speaking: false, awaitingTap: false });
    finishOld({ result: "blocked" });
    await old;
    expect(t.last()).toEqual({ speaking: false, awaitingTap: false });
    expect(t.speakDevice).not.toHaveBeenCalled();
  });
});
