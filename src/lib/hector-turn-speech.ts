import { authHeaders } from "./auth-headers";
import { splitReplyForSpeech } from "./speech-chunks";

/**
 * The spoken version of a split Hector turn (web). /api/hector-respond answered with the text and a turn token; this
 * starts one /api/tts request per piece of the reply (the first sentence, then the rest) at once. The server streams
 * each, so the first piece, a short one, is back in a fraction of the time the whole reply took when it was made
 * inside the turn, and the voice layer plays it while the rest is still arriving.
 *
 * A piece that fails (a refused token, a network error, an aborted fetch) resolves to null, never rejects: the voice
 * layer reads that piece and the rest with the device voice.
 */
export function fetchTurnSpeech(args: {
  token: string;
  /** Exactly the reply text the server vouched for (`reply` of the turn's answer). */
  reply: string;
  course: string;
  voice?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  headers?: () => Promise<Record<string, string>>;
}): { text: string; clip: Promise<Blob | null> }[] {
  const { token, reply, course, voice, signal } = args;
  const doFetch = args.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const getHeaders = args.headers ?? authHeaders;
  return splitReplyForSpeech(reply).map((text, part) => {
    const clip = (async () => {
      try {
        const resp = await doFetch(`/api/tts?turn=${encodeURIComponent(token)}&part=${part}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await getHeaders()) },
          body: JSON.stringify({ text: reply, course, voice, character: "hector" }),
          signal,
        });
        return resp.ok ? await resp.blob() : null;
      } catch {
        return null;
      }
    })();
    // Never an unhandled rejection, even for a piece nobody gets to await (the learner moved on before its turn).
    clip.catch(() => undefined);
    return { text, clip };
  });
}
