import type { Course } from "@/data/course-meta";
import type { Persona, Stage } from "./rehearsal-rules";

/**
 * Where a call's conversation partner comes from. A scenario sends its own system prompt (one the server knows by
 * heart). A rehearsal sends only its id and stage: the server builds the prompt from the learner's stored brief and the
 * memory of earlier runs, so the app never holds or sends prompt text for it.
 */
export type CallSource =
  | { kind: "scenario" }
  | {
      kind: "rehearsal";
      id: string;
      stage: Stage;
      /** Who plays the partner (Hector is Pro) and hard mode (Hector, last stage). Omitted: Alphonso, normal level. */
      persona?: Persona;
      hardMode?: boolean;
    };

export const SCENARIO_SOURCE: CallSource = { kind: "scenario" };

/** The /api/chat body for one reply of a call. */
export function chatRequestBody(args: {
  source: CallSource;
  systemPrompt: string;
  cefrLevel: string | null;
  course: Course;
  callId: string;
  messages: { role: "user" | "assistant"; content: string }[];
}) {
  if (args.source.kind === "rehearsal") {
    return {
      // Alphonso's body is exactly what it was before Hector rehearsals: the two fields are sent only for Hector.
      rehearsal: {
        id: args.source.id,
        stage: args.source.stage,
        ...(args.source.persona === "hector"
          ? { persona: "hector", ...(args.source.hardMode ? { hardMode: true } : {}) }
          : {}),
      },
      cefrLevel: args.cefrLevel,
      callId: args.callId,
      messages: args.messages,
    };
  }
  return {
    systemPrompt: args.systemPrompt,
    cefrLevel: args.cefrLevel,
    course: args.course,
    callId: args.callId,
    messages: args.messages,
  };
}
