import { useCallback, useEffect, useRef, useState } from "react";
import {
  SupportError,
  fetchConversation,
  mergeMessages,
  requestSupportHandoff,
  sendSupportMessage,
  type SupportConversation,
  type SupportErrorKind,
  type SupportMessage,
  type SupportStatus,
  type SupportUpdate,
} from "@/lib/support-client";
import { POLL_INTERVAL_MS, shouldPoll, unreadDividerId, type SendLimit } from "@/lib/support-view";

/** The three calls, injectable so the screen can be tested without a network. */
export type HelpClient = {
  fetchConversation: () => Promise<SupportConversation>;
  send: (input: { text: string; clientId: string }) => Promise<SupportUpdate>;
  handoff: () => Promise<SupportUpdate>;
};

export const liveHelpClient: HelpClient = {
  fetchConversation: () => fetchConversation(),
  send: (input) => sendSupportMessage(input),
  handoff: () => requestSupportHandoff(),
};

/** A message the learner has sent that the server has not confirmed. Its text is kept until a retry succeeds. */
export type PendingMessage = {
  clientId: string;
  text: string;
  /** The newest message id on screen when it was sent, so a stored copy is not drawn twice. */
  baseId: number;
  at: string;
  state: "sending" | "failed";
  failure: SupportErrorKind | null;
};

export type HelpChatState = {
  load: "loading" | "error" | "ready";
  status: SupportStatus | null;
  aiAvailable: boolean;
  messages: SupportMessage[];
  /** Where the "New reply" divider goes (a message id), or null. */
  dividerId: number | null;
  pending: PendingMessage | null;
  limit: SendLimit;
  /** Ids of the learner messages sent in this visit (they read "Sent"). */
  sentIds: number[];
  handoffBusy: boolean;
  handoffFailed: boolean;
};

const newClientId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "00000000-0000-4000-8000-000000000000".replace(/0/g, () =>
        Math.floor(Math.random() * 16).toString(16),
      );

const maxId = (messages: readonly SupportMessage[]) =>
  messages.reduce((n, m) => Math.max(n, m.id), 0);

export function useHelpChat(client: HelpClient, online: boolean) {
  const [state, setState] = useState<HelpChatState>({
    load: "loading",
    status: null,
    aiAvailable: false,
    messages: [],
    dividerId: null,
    pending: null,
    limit: null,
    sentIds: [],
    handoffBusy: false,
    handoffFailed: false,
  });
  const [draft, setDraft] = useState("");
  const live = useRef(state);
  live.current = state;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const patch = useCallback((p: Partial<HelpChatState>) => {
    if (alive.current) setState((s) => ({ ...s, ...p }));
  }, []);

  const load = useCallback(async () => {
    patch({ load: "loading" });
    try {
      const c = await client.fetchConversation();
      patch({
        load: "ready",
        status: c.status,
        aiAvailable: c.aiAvailable,
        messages: c.messages,
        dividerId: unreadDividerId(c.messages, c.unread),
      });
    } catch {
      patch({ load: "error" });
    }
  }, [client, patch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll every 20 s while the chat is open and a person (not the AI) has it. Quiet: a failed poll changes nothing.
  const poll = useCallback(async () => {
    const s = live.current;
    if (s.load !== "ready" || s.pending?.state === "sending" || !shouldPoll(s.status)) return;
    try {
      const c = await client.fetchConversation();
      if (!alive.current) return;
      setState((cur) => {
        const known = new Set(cur.messages.map((m) => m.id));
        const fresh = c.messages.filter((m) => m.kind === "support" && !known.has(m.id));
        return {
          ...cur,
          status: c.status,
          aiAvailable: c.aiAvailable,
          messages: mergeMessages(cur.messages, c.messages),
          dividerId: cur.dividerId ?? fresh[0]?.id ?? null,
        };
      });
    } catch {
      /* try again at the next tick */
    }
  }, [client]);
  useEffect(() => {
    if (state.load !== "ready" || !online || !shouldPoll(state.status)) return;
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.load, state.status, online, poll]);

  const attempt = useCallback(
    async (p: PendingMessage) => {
      patch({ pending: { ...p, state: "sending", failure: null }, limit: null });
      try {
        const u = await client.send({ text: p.text, clientId: p.clientId });
        if (!alive.current) return;
        setState((cur) => ({
          ...cur,
          pending: null,
          status: u.status,
          messages: mergeMessages(cur.messages, u.messages),
          sentIds: [...cur.sentIds, ...u.messages.filter((m) => m.kind === "you").map((m) => m.id)],
        }));
      } catch (err) {
        const kind: SupportErrorKind = err instanceof SupportError ? err.kind : "failed";
        if (kind === "dailyLimit" || kind === "conversationLimit") {
          // Nothing was stored: the draft is not kept (the box is closed for today).
          patch({ pending: null, limit: kind === "dailyLimit" ? "daily" : "conversation" });
        } else {
          patch({ pending: { ...p, state: "failed", failure: kind } });
        }
      }
    },
    [client, patch],
  );

  const send = useCallback(() => {
    const text = draft.trim();
    const s = live.current;
    if (!text || !online || s.limit || s.pending?.state === "sending" || s.load !== "ready") return;
    if (s.pending?.state === "failed") return;
    setDraft("");
    void attempt({
      clientId: newClientId(),
      text,
      baseId: maxId(s.messages),
      at: new Date().toISOString(),
      state: "sending",
      failure: null,
    });
  }, [draft, online, attempt]);

  /** Same text, same client id: the server returns the stored message instead of posting twice. */
  const retry = useCallback(() => {
    const p = live.current.pending;
    if (p?.state === "failed") void attempt(p);
  }, [attempt]);

  const talkToPerson = useCallback(async () => {
    if (live.current.handoffBusy || !online) return;
    patch({ handoffBusy: true, handoffFailed: false });
    try {
      const u = await client.handoff();
      if (!alive.current) return;
      setState((cur) => ({
        ...cur,
        handoffBusy: false,
        status: u.status,
        messages: mergeMessages(cur.messages, u.messages),
        // A conversation opened by this tap: the server's first read is the page's first read.
        load: "ready",
      }));
    } catch {
      patch({ handoffBusy: false, handoffFailed: true });
    }
  }, [client, online, patch]);

  return { state, draft, setDraft, send, retry, talkToPerson, reload: load };
}
