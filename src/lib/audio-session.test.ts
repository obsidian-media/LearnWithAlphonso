import { describe, expect, it, vi } from "vitest";
import { claimAudioSession, registerAudioOwner } from "./audio-session";

describe("audio session: one voice at a time", () => {
  it("claiming for the voice stops the podcast, and the podcast stops the voice, never the claimant", () => {
    const stopPodcast = vi.fn();
    const stopVoice = vi.fn();
    const offPodcast = registerAudioOwner("podcast", stopPodcast);
    const offVoice = registerAudioOwner("voice", stopVoice);

    claimAudioSession("voice");
    expect(stopPodcast).toHaveBeenCalledOnce();
    expect(stopVoice).not.toHaveBeenCalled();

    claimAudioSession("podcast");
    expect(stopVoice).toHaveBeenCalledOnce();
    expect(stopPodcast).toHaveBeenCalledOnce();
    offPodcast();
    offVoice();
  });

  it("an owner that was unregistered is no longer stopped, and one that throws does not block the claim", () => {
    const stopVoice = vi.fn();
    const off = registerAudioOwner("voice", stopVoice);
    off();
    const offPodcast = registerAudioOwner("podcast", () => {
      throw new Error("boom");
    });
    expect(() => claimAudioSession("voice")).not.toThrow();
    expect(stopVoice).not.toHaveBeenCalled();
    offPodcast();
  });
});
