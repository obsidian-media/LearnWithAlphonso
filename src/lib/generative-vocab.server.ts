import { z } from "zod";
import nlp from "compromise";

/**
 * Generative sentence-content pilot -- LLM proposes vocab candidates
 * for a topic; verifyCandidatePos (added in Task 8) cross-checks each
 * one's claimed part-of-speech against `compromise`'s own tagging
 * before it's ever trusted into the curated vocab dataset. Same
 * NVIDIA NIM integration, same defensive-parse posture (never assume
 * clean JSON from the model) as practice-generation.server.ts and
 * weakness-detection.server.ts.
 */
const candidateSchema = z.object({
  word: z.string().min(1).max(40),
  pos: z.enum(["noun", "verb", "adjective"]),
});
const candidatesSchema = z.array(candidateSchema).max(30);
export type VocabCandidate = z.infer<typeof candidateSchema>;

/** Never throws -- any parse/shape failure yields an empty array. */
export function parseVocabCandidates(content: string): VocabCandidate[] {
  const stripped = content.replace(/```json\s*|```\s*/g, "").trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    const result = candidatesSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function vocabProposalPrompt(
  topic: string,
  posTypes: ("noun" | "verb" | "adjective")[],
): string {
  return (
    `List up to 20 simple, common English words for an A1 (beginner) ` +
    `learner on the topic "${topic}". Only include these parts of ` +
    `speech: ${posTypes.join(", ")}. Every verb must be given in its ` +
    `base/infinitive form (e.g. "walk", not "walks" or "walked"). Do ` +
    `not include "be" -- use a different verb instead. Respond with ` +
    `ONLY a JSON array, no other text, in this exact shape: ` +
    `[{"word": "<word>", "pos": "<noun|verb|adjective>"}]. If you ` +
    `can't think of good words for this topic, respond with [].`
  );
}

/** Calls NVIDIA NIM with vocabProposalPrompt and parses the result.
 *  Never throws -- any upstream/parse failure yields an empty array,
 *  matching this codebase's existing AI-feature fail-quiet design. */
export async function proposeVocabCandidates(params: {
  topic: string;
  posTypes: ("noun" | "verb" | "adjective")[];
  nvidiaApiKey: string;
  nvidiaModel: string;
}): Promise<VocabCandidate[]> {
  try {
    const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: params.nvidiaModel,
        messages: [{ role: "user", content: vocabProposalPrompt(params.topic, params.posTypes) }],
      }),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    return parseVocabCandidates(content);
  } catch {
    return [];
  }
}

const POS_TAG_MAP: Record<"noun" | "verb" | "adjective", string> = {
  noun: "Noun",
  verb: "Verb",
  adjective: "Adjective",
};

/**
 * Cross-checks an LLM-claimed part-of-speech against compromise's own
 * tagging -- the concrete implementation of "the LLM never writes
 * grammar-bearing text directly" (design doc component 3). A mismatch
 * is rejected outright by the caller (proposeVocabForTopic, added in
 * Task 9), never coerced or guessed.
 */
export function verifyCandidatePos(candidate: VocabCandidate): boolean {
  const doc = nlp(candidate.word);
  const tags: string[] = doc.json()[0]?.terms?.[0]?.tags ?? [];
  return tags.includes(POS_TAG_MAP[candidate.pos]);
}
