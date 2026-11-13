import type { Question } from "../data/curriculum";
import { correctAnswerText } from "./answer-verdict";
import { authHeaders } from "./auth-headers";
import type { ExplainRequest } from "./explain";

/**
 * The browser side of `POST /api/explain` (the iOS and Android twins are ExplainClient.swift / ExplainClient.kt).
 * The route reads the learner's language from the account, so a request carries only the item.
 */
export type Explanation = {
  explanation: string;
  /** The language the text is in (an ISO 639-1 code from the learner's profile). */
  language: string;
  direction: "rtl" | "ltr";
  cached: boolean;
};

export type ExplainErrorKind =
  | "offline"
  | "quotaExceeded"
  | "aiConsentRequired"
  | "notSignedIn"
  | "notEntitled"
  | "unsupported"
  | "unavailable";

export class ExplainError extends Error {
  constructor(readonly kind: ExplainErrorKind) {
    super(kind);
    this.name = "ExplainError";
  }
}

/** What the learner is told for each failure; same wording as the apps. */
export function explainErrorCopy(kind: ExplainErrorKind): string {
  switch (kind) {
    case "offline":
      return "Explaining needs a connection. Try again when you are back online.";
    case "quotaExceeded":
      return "You have used today's explanations. They come back tomorrow.";
    case "aiConsentRequired":
      return "AI features are turned off. Allow them to get explanations.";
    case "notSignedIn":
      return "Sign in again to get explanations.";
    case "notEntitled":
      return "Explanations in Hector need Hector Pro.";
    case "unsupported":
      return "There is no explanation in your language for this one.";
    case "unavailable":
      return "Couldn't explain that. Try again.";
  }
}

async function errorField(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : undefined;
  } catch {
    return undefined;
  }
}

async function kindForFailure(response: Response): Promise<ExplainErrorKind> {
  switch (response.status) {
    case 400:
    case 422:
      return "unsupported";
    case 401:
      return "notSignedIn";
    case 403: {
      // A 403 is the AI consent or a missing Pro entitlement; only the body tells them apart.
      const error = await errorField(response);
      return error === "ai-consent-required" ? "aiConsentRequired" : "notEntitled";
    }
    case 429:
      return "quotaExceeded";
    default:
      return "unavailable";
  }
}

function isExplanation(value: unknown): value is Explanation {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.explanation === "string" &&
    v.explanation.trim().length > 0 &&
    typeof v.language === "string" &&
    (v.direction === "rtl" || v.direction === "ltr") &&
    typeof v.cached === "boolean"
  );
}

export async function requestExplanation(
  input: ExplainRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<Explanation> {
  let response: Response;
  try {
    response = await fetchImpl("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ExplainError("offline");
  }
  if (!response.ok) throw new ExplainError(await kindForFailure(response));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ExplainError("unavailable");
  }
  if (!isExplanation(body)) throw new ExplainError("unavailable");
  return body;
}

const cut = (s: string, max: number) => Array.from(s.trim()).slice(0, max).join("");

/**
 * The wrong-answer item for a lesson question, or null when there is nothing to explain (no answer was given).
 * Text is cut to the lengths the route accepts, so a long question never turns the tap into a 400.
 */
export function wrongAnswerRequest(
  q: Question,
  submittedAnswer: string | null | undefined,
  course: "en" | "fr" | "es",
): Extract<ExplainRequest, { kind: "wrong-answer" }> | null {
  const wrongAnswer = cut(submittedAnswer ?? "", 400);
  const correctAnswer = cut(correctAnswerText(q), 400);
  const question = cut("prompt" in q ? q.prompt : "", 400);
  if (!wrongAnswer || !correctAnswer || !question) return null;
  return { kind: "wrong-answer", course, question, wrongAnswer, correctAnswer };
}
