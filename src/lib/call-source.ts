import type { Course } from "@/data/course-meta";
import type { Stage } from "./rehearsal-rules";

/**
 * Where a call's conversation partner comes from. A scenario sends its own system prompt (one the server knows by
 * heart). A rehearsal sends only its id and stage: the server builds the prompt from the learner's stored brief and the
 * memory of earlier runs, so the app never holds or sends prompt text for it.
 */
export type CallSource = { kind: "scenario" } | { kind: "rehearsal"; id: string; stage: Stage };

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
      rehearsal: { id: args.source.id, stage: args.source.stage },
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
