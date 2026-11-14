/**
 * The app screens a Help answer may point at ("Open the subscription screen"). The AI names one of these ids; it can
 * never write a URL. An id outside this list is dropped, never rendered as a link (support-links.test.ts).
 *
 * Where the id lives: support_messages has no column for it (this change adds no migration), so the server stores an
 * AI answer's link as a trailing marker in the body, `[[link:<id>]]`, and removes it again before the learner or the
 * model sees the text (`presentSupportMessages`). The marker is honoured for `ai` messages only: a learner who types
 * it gets their own text back, never a link. The staff inbox (milestone 3) must call `stripSupportLink` on AI bodies.
 *
 * Safe for the browser and the server: no server import here. Native twins: the same ids and labels (SupportCopy).
 */

export const SUPPORT_LINK_IDS = ["subscription", "ai-features", "settings", "league"] as const;
export type SupportLinkId = (typeof SUPPORT_LINK_IDS)[number];

/** The chip text, shared word for word with the apps. */
export const SUPPORT_LINK_LABELS: Record<SupportLinkId, string> = {
  subscription: "Open the subscription screen",
  "ai-features": "Open AI features",
  settings: "Open Settings",
  league: "Open your league",
};

/** Where each id goes on the web (a fixed path inside the app; never built from model text). */
export const SUPPORT_LINK_WEB_PATHS: Record<SupportLinkId, "/hector" | "/profile" | "/league"> = {
  subscription: "/hector",
  "ai-features": "/profile",
  settings: "/profile",
  league: "/league",
};

export function isSupportLinkId(value: unknown): value is SupportLinkId {
  return typeof value === "string" && (SUPPORT_LINK_IDS as readonly string[]).includes(value);
}

/** An id from the model, or null when it is missing, not a string or not on the list. */
export function parseSupportLinkId(value: unknown): SupportLinkId | null {
  return isSupportLinkId(value) ? value : null;
}

const MARKER = /\s*\[\[link:([^\]\s]*)\]\]\s*$/;

/** The body to store: the answer plus its marker, when it has an allowed link. */
export function withSupportLink(body: string, link: SupportLinkId | null): string {
  return link ? `${body}\n\n[[link:${link}]]` : body;
}

/** An AI body split into its text and its link. An unknown id leaves no link; the marker never shows. */
export function splitSupportLink(body: string): { text: string; link: SupportLinkId | null } {
  const m = MARKER.exec(body);
  if (!m) return { text: body, link: null };
  return { text: body.slice(0, m.index), link: parseSupportLinkId(m[1]) };
}

export const stripSupportLink = (body: string): string => splitSupportLink(body).text;

export type PresentedSupportMessage = {
  id: number;
  kind: "you" | "ai" | "support" | "system";
  body: string;
  at: string;
  link: SupportLinkId | null;
};

/** Messages as the learner's clients get them: `ai` bodies lose the marker and gain `link`; every other kind is left as typed. */
export function presentSupportMessages(
  messages: readonly {
    id: number;
    kind: PresentedSupportMessage["kind"];
    body: string;
    at: string;
  }[],
): PresentedSupportMessage[] {
  return messages.map((m) => {
    if (m.kind !== "ai") return { ...m, link: null };
    const { text, link } = splitSupportLink(m.body);
    return { ...m, body: text, link };
  });
}
