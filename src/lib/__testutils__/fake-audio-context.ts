import { vi } from "vitest";

/**
 * A fake AudioContext whose analyser reports a level the test sets, so a hands-free call can be driven in jsdom
 * (which has no Web Audio). `rms` is the amplitude the room reads as: 0.001 is -60 dBFS (quiet), 0.1 is -20 dBFS.
 */
export const room = { rms: 0.001 };
export const QUIET = 0.001;
export const SPEECH = 0.1;

class FakeAnalyser {
  fftSize = 2048;
  getFloatTimeDomainData(out: Float32Array) {
    out.fill(room.rms);
  }
}

class FakeAudioContext {
  resume = async () => {};
  close = async () => {};
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createAnalyser() {
    return new FakeAnalyser();
  }
}

/** Installs the fake and starts the room quiet. Call `vi.unstubAllGlobals()` (the tests already do) to remove it. */
export function installFakeAudioContext(): void {
  room.rms = QUIET;
  vi.stubGlobal("AudioContext", FakeAudioContext);
}
