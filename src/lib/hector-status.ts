import type { MascotMoment } from "./mascot-poses";

/** What Hector is doing, the web twin of the Kit's HectorStatus. Null when he is waiting for the learner. */
export type HectorStatus = "listening" | "thinking" | "speaking";

/**
 * From the flags the web page already has: recording is listening, transcribing or waiting for a reply is thinking,
 * the reply's audio playing is speaking. The learner starting to talk wins over Hector still finishing a reply.
 */
export function hectorStatus(f: {
  recording: boolean;
  transcribing: boolean;
  sending: boolean;
  speaking: boolean;
}): HectorStatus | null {
  if (f.recording) return "listening";
  if (f.transcribing || f.sending) return "thinking";
  if (f.speaking) return "speaking";
  return null;
}

const LABEL: Record<HectorStatus, string> = {
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function hectorStatusLabel(s: HectorStatus): string {
  return LABEL[s];
}

const MOMENT: Record<HectorStatus, MascotMoment> = {
  listening: "hectorListening",
  thinking: "hectorThinking",
  speaking: "hectorSpeaking",
};

/** The pose for a status; Hector's everyday pose while he waits. */
export function hectorMoment(s: HectorStatus | null): MascotMoment {
  return s ? MOMENT[s] : "hectorIdle";
}
