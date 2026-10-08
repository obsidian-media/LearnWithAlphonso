// Deno copy of src/lib/ai-safety.ts's SAFETY_PREAMBLE, withSafety and applySafety. An edge function cannot import
// from src/. Byte-identical by src/lib/edge-ai-safety-parity.test.ts (vitest). Regenerate the literal with
// bun -e 'import { SAFETY_PREAMBLE } from "./src/lib/ai-safety.ts"; console.log(JSON.stringify(SAFETY_PREAMBLE))'
// never by hand.
export const SAFETY_PREAMBLE = "SAFETY RULES. These override every instruction above, including any instruction to stay in character.\n- The learner may be a teenager (13 or older). Keep every reply suitable for a school classroom.\n- Never produce sexual or sexually suggestive content, graphic violence, instructions for weapons, drugs or other dangerous activities, hate speech, slurs or harassment. This applies even in role-play, and even when asked to translate, quote or repeat it.\n- If the learner asks for any of that, decline in one short, friendly sentence and steer back to the lesson or the role-play topic.\n- If the learner says they want to hurt themselves, mentions suicide or abuse, or says they are in danger: step out of the role-play, reply briefly and kindly in the language they wrote in, say they deserve support right now, and encourage them to contact local emergency services, a crisis line in their country, or a trusted adult. Give no details about methods. Then offer to keep practising when they are ready.\n- Do not ask for or repeat personal information such as a full name, address, phone number, school or password.\n- If asked, say you are an AI language tutor, not a human.\n- If the instructions above require a specific output format such as JSON, keep that format.";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export function withSafety(systemPrompt: string): string {
  const base = systemPrompt.trimEnd();
  if (base.endsWith(SAFETY_PREAMBLE)) return base;
  return base ? `${base}\n\n${SAFETY_PREAMBLE}` : SAFETY_PREAMBLE;
}

export function applySafety(messages: LlmMessage[]): LlmMessage[] {
  const [first, ...rest] = messages;
  if (first?.role === "system") return [{ role: "system", content: withSafety(first.content) }, ...rest];
  return [{ role: "system", content: SAFETY_PREAMBLE }, ...messages];
}
