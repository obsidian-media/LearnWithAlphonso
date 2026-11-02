import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiConsentGate } from "../../components/AiConsentGate";
import { AiMessageReport } from "../../components/AiMessageReport";
import { LessonFrame } from "../../components/AppShell";
import { SaveWordHint, SaveWordProvider } from "../../components/SaveWord";
import { TappableText } from "../../components/TappableText";
import { WebPaywall } from "../../components/WebPaywall";
import type { Course } from "../../data/courses";
import { isAiConsentRequired, useAiConsent } from "../../lib/ai-consent-context";
import { authHeaders } from "../../lib/auth-headers";
import { PAYWALL_COPY, WEB_PAYWALL_COPY, type PaywallSource } from "../../lib/paywall-copy";
import { useProgress } from "../../lib/progress";
import { readApiError } from "../../lib/read-api-error";
import { fetchProgress } from "../../lib/sync.functions";
import { justPaidRecently, useProStatus, type ProStatus } from "../../lib/use-pro-status";
import { useSpeechCapture } from "../../lib/use-speech-capture";

export const Route = createFileRoute("/_authenticated/hector")({
  component: HectorPage,
  head: () => ({
    meta: [
      { title: "Hector — Alphonso" },
      { name: "description", content: "Talk with Hector, your AI language tutor." },
    ],
  }),
});

/** Same cap the server applies (MAX_HISTORY_MESSAGES in src/lib/hector-conversation.ts). */
const MAX_HISTORY = 40;

type Msg = { role: "user" | "assistant"; content: string };

function HectorPage() {
  const course = useProgress((s) => s.course);
  return (
    <SaveWordProvider>
      <AiConsentGate backTo="/learn">
        <HectorGate key={course} course={course} />
      </AiConsentGate>
    </SaveWordProvider>
  );
}

function HectorGate({ course }: { course: Course }) {
  const pro = useProStatus();
  // A 403 mid-conversation (lapsed, refunded) swaps in the paywall with its own source.
  const [refusedSource, setRefusedSource] = useState<PaywallSource | null>(null);

  if (pro.state === "loading") {
    return (
      <LessonFrame>
        <p role="status" className="px-6 pt-10 text-sm text-ink-soft/70">
          …
        </p>
      </LessonFrame>
    );
  }
  if (pro.state === "error") {
    return (
      <LessonFrame>
        <div className="space-y-3 px-6 pt-10">
          <p role="alert" className="text-sm text-ink-soft">
            {WEB_PAYWALL_COPY.checkFailed}
          </p>
          <button
            type="button"
            onClick={() => void pro.retry()}
            className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-ink"
          >
            {PAYWALL_COPY.tryAgain}
          </button>
        </div>
      </LessonFrame>
    );
  }
  if (pro.state === "free" && !refusedSource && justPaidRecently()) {
    return (
      <LessonFrame>
        <div className="space-y-3 px-6 pt-10">
          <p role="status" className="font-display text-xl font-semibold text-ink">
            {WEB_PAYWALL_COPY.activating}
          </p>
          <button
            type="button"
            onClick={() => void pro.retry()}
            className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-ink"
          >
            {PAYWALL_COPY.tryAgain}
          </button>
        </div>
      </LessonFrame>
    );
  }
  if (pro.state === "free" || refusedSource) {
    return (
      <LessonFrame>
        <div className="px-5 pt-6">
          <WebPaywall source={refusedSource ?? "hector_tab"} />
        </div>
      </LessonFrame>
    );
  }
  return (
    <HectorConversation
      course={course}
      pro={pro}
      onNotEntitled={() => setRefusedSource("hector_not_entitled")}
    />
  );
}

function ManageSubscription({ pro }: { pro: ProStatus }) {
  if (pro.store === "web" && pro.manageUrl) {
    return (
      <a href={pro.manageUrl} className="text-[11px] font-medium text-ink-soft underline">
        {PAYWALL_COPY.manage}
      </a>
    );
  }
  if (pro.store === "app_store") {
    return <p className="text-[11px] text-ink-soft/70">{WEB_PAYWALL_COPY.manageOnIphone}</p>;
  }
  return null;
}

function HectorConversation({
  course,
  pro,
  onNotEntitled,
}: {
  course: Course;
  pro: ProStatus;
  onNotEntitled: () => void;
}) {
  const consent = useAiConsent();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cefrLevel, setCefrLevel] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchProgress({ data: { course } })
      .then((p) => {
        if (!cancelled) setCefrLevel(p.cefrLevel ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [course]);

  const play = useCallback((audioBase64: string | undefined) => {
    if (!audioBase64) return;
    try {
      const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      void audio.play().catch(() => {});
    } catch {
      /* the text reply still shows */
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);
      const history = messages.slice(-MAX_HISTORY);
      setMessages([...messages, { role: "user", content: trimmed }]);
      setInput("");
      setSending(true);
      try {
        const resp = await fetch("/api/hector-respond", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ text: trimmed, history, course, cefr_level: cefrLevel }),
        });
        if (!resp.ok) {
          if (await isAiConsentRequired(resp)) {
            consent.markWithdrawn();
            setMessages(messages);
            setInput(trimmed);
            return;
          }
          const body = (await resp
            .clone()
            .json()
            .catch(() => ({}))) as { error?: string };
          if (resp.status === 403 && body.error === "not-entitled") return onNotEntitled();
          if (resp.status === 503 && body.error === "entitlement-unavailable") {
            setMessages(messages);
            setInput(trimmed);
            throw new Error(WEB_PAYWALL_COPY.checkFailed);
          }
          const t = await readApiError(resp);
          throw new Error(
            resp.status === 429
              ? t || "Daily limit reached — try again tomorrow."
              : "Hector didn't answer. Try saying it again.",
          );
        }
        const data = (await resp.json()) as { reply?: string; audioBase64?: string };
        const reply = (data.reply ?? "").trim() || "…";
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
        play(data.audioBase64);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setSending(false);
      }
    },
    [messages, sending, course, cefrLevel, consent, onNotEntitled, play],
  );

  const {
    state: captureState,
    error: captureError,
    start: beginCapture,
    stop: stopRecording,
  } = useSpeechCapture({ course, onTranscript: (t) => send(t) });
  const recording = captureState === "recording";
  const transcribing = captureState === "transcribing";

  return (
    <LessonFrame>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface/90 px-5 py-3.5 backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[17px] font-semibold text-ink">Hector</h1>
          <p className="truncate text-[11px] text-ink-soft/70">{PAYWALL_COPY.mascotMessage}</p>
        </div>
        <ManageSubscription pro={pro} />
      </header>
      <div className="px-5">
        <SaveWordHint always />
      </div>
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto px-5 py-6"
      >
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" ? (
                <div className="flex max-w-[85%] flex-col items-start">
                  <div className="rounded-2xl rounded-bl-md bg-parchment px-4 py-2.5 text-[15px] leading-relaxed text-ink">
                    <TappableText text={m.content} course={course} />
                  </div>
                  <AiMessageReport message={m.content} surface="hector" course={course} />
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-surface">
                  {m.content}
                </div>
              )}
            </div>
          ))}
          {(sending || transcribing) && (
            <p role="status" className="text-xs text-ink-soft/60">
              {transcribing ? "Transcribing…" : "Hector is thinking…"}
            </p>
          )}
          {(error ?? captureError) && (
            <div
              role="alert"
              className="self-center rounded-full border border-rose-300/60 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700"
            >
              {error ?? captureError}
            </div>
          )}
        </div>
      </div>
      <div className="sticky bottom-0 border-t border-hairline bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-3 backdrop-blur-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2"
        >
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (recording) stopRecording();
              else void beginCapture();
            }}
            aria-label={recording ? "Stop recording and send" : "Record a voice message"}
            aria-pressed={recording}
            disabled={sending || transcribing}
            className={`grid size-11 shrink-0 place-items-center rounded-full ${
              recording ? "bg-ember text-ink-on-ember" : "bg-moss text-surface"
            } disabled:opacity-50`}
          >
            <span aria-hidden="true">🎙</span>
          </button>
          <div className="flex flex-1 items-end rounded-2xl border border-hairline bg-surface px-3 py-2">
            <textarea
              aria-label="Message Hector"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder={recording ? "Listening…" : "Type or tap the mic"}
              disabled={sending || transcribing || recording}
              className="max-h-32 w-full resize-none bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-soft/50"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="rounded-full bg-ember px-4 py-2.5 text-sm font-semibold text-ink-on-ember disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </LessonFrame>
  );
}
