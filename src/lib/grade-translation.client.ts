import { authHeaders } from "./auth-headers";
import type { TranslationVerdict } from "../routes/api/grade-translation";

/**
 * Asks the server for a second opinion on a written translation the curated
 * phrasings rejected.
 *
 * Returns `null` for every failure -- offline, 5xx, a malformed body, a thrown
 * fetch. `null` means "no second opinion", and the caller keeps the local
 * verdict it already had. This function never throws for the same reason the
 * server-side grader never rejects: an exception at the call site would surface
 * to the learner as a wrong answer, and being offline is not evidence about
 * their English.
 */
export async function requestTranslationVerdict(args: {
  lessonId: string;
  questionId: string;
  submission: string;
  course: string;
}): Promise<TranslationVerdict | null> {
  try {
    const resp = await fetch("/api/grade-translation", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(args),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Partial<TranslationVerdict>;
    if (typeof data.correct !== "boolean") return null;
    return {
      correct: data.correct,
      reason: typeof data.reason === "string" ? data.reason : null,
      source: data.source === "ai" ? "ai" : "local",
    };
  } catch {
    return null;
  }
}
