import { describe, expect, it } from "vitest";
import { hectorMoment, hectorStatus, hectorStatusLabel } from "./hector-status";

const idle = { recording: false, transcribing: false, sending: false, speaking: false };

describe("hectorStatus (the web twin of the Kit's HectorStatus)", () => {
  it("recording is listening, transcribing or waiting for a reply is thinking, audio playing is speaking", () => {
    expect(hectorStatus({ ...idle, recording: true })).toBe("listening");
    expect(hectorStatus({ ...idle, transcribing: true })).toBe("thinking");
    expect(hectorStatus({ ...idle, sending: true })).toBe("thinking");
    expect(hectorStatus({ ...idle, speaking: true })).toBe("speaking");
    expect(hectorStatus(idle)).toBeNull();
  });

  it("the learner starting to talk wins over Hector still finishing a reply", () => {
    expect(hectorStatus({ ...idle, recording: true, speaking: true })).toBe("listening");
  });

  it("labels and poses match the iPhone", () => {
    expect(hectorStatusLabel("listening")).toBe("Listening");
    expect(hectorStatusLabel("thinking")).toBe("Thinking");
    expect(hectorStatusLabel("speaking")).toBe("Speaking");
    expect(hectorMoment("listening")).toBe("hectorListening");
    expect(hectorMoment("thinking")).toBe("hectorThinking");
    expect(hectorMoment("speaking")).toBe("hectorSpeaking");
    expect(hectorMoment(null)).toBe("hectorIdle");
  });
});
