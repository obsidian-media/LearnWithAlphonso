import { authHeaders } from "./auth-headers";
import type { SavedWordInput } from "./saved-word";

/**
 * The browser side of `POST /api/define-word` (the iOS twin is
 * AIConversationClient.defineWord + SavedWord.swift). The route builds and
 * stores the card; this only asks for it and tells the learner how it went.
 */
export type SavedWordResult = {
  alreadySaved: boolean;
  word: string;
  sentence: string;
  explanation: string;
};

export type SavedWordErrorKind =
  "invalid" | "limitReached" | "quotaExceeded" | "notSignedIn" | "unavailable" | "offline";

export class SavedWordError extends Error {
  constructor(readonly kind: SavedWordErrorKind) {
    super(kind);
    this.name = "SavedWordError";
  }
}

/** What the learner is told for each failure; same wording as the iOS app. */
export function saveErrorFor(kind: SavedWordErrorKind): string {
  switch (kind) {
    case "invalid":
      return "That word can't be saved.";
    case "limitReached":
      return "You've reached the limit of 500 saved words. Finish some reviews first.";
    case "quotaExceeded":
      return "You've saved a lot of words for now. Try again in a bit.";
    case "notSignedIn":
      return "Sign in again to save words.";
    case "unavailable":
      return "Couldn't look that word up. Try again.";
    case "offline":
      return "Saving a word needs a connection.";
  }
}

function kindForStatus(status: number): SavedWordErrorKind {
  switch (status) {
    case 400:
      return "invalid";
    case 401:
    case 403:
      return "notSignedIn";
    case 409:
      return "limitReached";
    case 429:
      return "quotaExceeded";
    default:
      return "unavailable";
  }
}

function isResult(value: unknown): value is SavedWordResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.alreadySaved === "boolean" &&
    typeof v.word === "string" &&
    typeof v.sentence === "string" &&
    typeof v.explanation === "string"
  );
}

/**
 * Saving is limited to the English course for now. French and Spanish lesson
 * text mixes the course language with English instructions, so a tapped word
 * could be saved under the wrong language. Same rule as the iOS SavedWordPolicy;
 * widen both together once course-language text can be told apart.
 */
export function allowsSaving(course: string): boolean {
  return course === "en";
}

export async function saveWord(
  input: SavedWordInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SavedWordResult> {
  let response: Response;
  try {
    response = await fetchImpl("/api/define-word", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(input),
    });
  } catch {
    throw new SavedWordError("offline");
  }
  if (!response.ok) throw new SavedWordError(kindForStatus(response.status));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SavedWordError("unavailable");
  }
  // A 200 that is not the contract's shape is not a save: showing "Saved" for it
  // would tell the learner a word is in their reviews when it may not be.
  if (!isResult(body)) throw new SavedWordError("unavailable");
  return body;
}
