import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiConsentGate } from "../../components/AiConsentGate";
import { AiMessageReport } from "../../components/AiMessageReport";
import { LessonFrame } from "../../components/AppShell";
import { SceneBackdrop } from "../../components/SceneBackdrop";
import { MascotImage } from "../../components/MascotImage";
import { SaveWordHint, SaveWordProvider } from "../../components/SaveWord";
import { TappableText } from "../../components/TappableText";
import { WebPaywall } from "../../components/WebPaywall";
import type { Course } from "../../data/courses";
import { isAiConsentRequired, useAiConsent } from "../../lib/ai-consent-context";
import { authHeaders } from "../../lib/auth-headers";
import { PAYWALL_COPY, WEB_PAYWALL_COPY, type PaywallSource } from "../../lib/paywall-copy";
import { useProgress } from "../../lib/progress";
import { readApiError } from "../../lib/read-api-error";
import { hectorMoment, hectorStatus, hectorStatusLabel } from "../../lib/hector-status";
import { fetchProgress } from "../../lib/sync.functions";
import { useProStatus, type ProStatus } from "../../lib/use-pro-status";
import { useSpeechCapture } from "../../lib/use-speech-capture";
import { PracticeCall } from "../../components/PracticeCall";
import { HECTOR_KIT } from "../../lib/avatar/layers";
import type { AvatarMode, VoicePhase } from "../../lib/avatar/machine";
import { useStoredAvatarPreference } from "../../lib/avatar/preference";
import { useTheme } from "../../lib/theme";
import { useReducedMotion } from "framer-motion";
import { voiceFor } from "@/lib/voice-prefs";
import { cachedOpenerSpeech, openerSpeechKey } from "@/lib/opener-speech-cache";
import { waitForCallCue } from "@/lib/sfx";
import { buildHectorGreeting, recentWeakSpot } from "@/lib/hector-greeting";
import { getWeaknessTrend } from "@/lib/weakness-trend.functions";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import { supabase } from "@/integrations/supabase/client";

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
  if (pro.state === "free" && !refusedSource && pro.justPaid) {
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
        {/* Hector waves in the library clip (his head at 47% down, feet at 80%); the offer starts at his waist. */}
        <SceneBackdrop scene="hector" focus="50% 30%" clip="hector" />
        <div className="relative z-10 px-5 pt-4">
          <div
            role="img"
            aria-label="Hector, waving in his library"
            className="h-[calc(74svh-4.5rem)]"
          />
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
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Hector's greeting is messages[0] once said; the mic waits while its voice loads.
  const [greeted, setGreeted] = useState(false);
  const [greetingLoading, setGreetingLoading] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const leftRef = useRef(false);
  // The call screen ("Show Alphonso while practising" covers Hector too, so one switch decides).
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("idle");
  // Read before the first render (this screen mounts only after the client-side Pro check), so with the setting off
  // the call never flashes up for a frame.
  const showCall = useStoredAvatarPreference();
  const reducedMotion = useReducedMotion() ?? false;
  const darkTheme = useTheme((t) => t.theme === "studio-ink");

  const playBlob = useCallback((blob: Blob) => {
    try {
      const url = URL.createObjectURL(blob);
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) setSpeaking(false);
      };
      setSpeaking(true);
      void audio.play().catch(() => {
        if (audioRef.current === audio) setSpeaking(false);
      });
    } catch {
      /* the text reply still shows */
      setSpeaking(false);
    }
  }, []);

  const play = useCallback(
    (audioBase64: string | undefined) => {
      if (!audioBase64) return;
      try {
        const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
        playBlob(new Blob([bytes], { type: "audio/mpeg" }));
      } catch {
        /* the text reply still shows */
      }
    },
    [playBlob],
  );

  /** Talking over Hector cuts him off, as on a call: his greeting or a reply. */
  const interrupt = useCallback(() => {
    audioRef.current?.pause();
    setSpeaking(false);
  }, []);

  /**
   * Hector speaks first (BACKLOG 0.0-bp). The greeting is his first turn, so it is in the history the model gets
   * with the learner's first turn, and it is spoken in Hector's chosen voice through the reply player, so his lips
   * follow it. It is our own fixed text, so its speech is cached like Alphonso's openers
   * (src/lib/opener-speech-cache.ts): reopening the call does not fetch, or charge /api/tts, again. Only reached
   * inside the AI consent gate and the Pro check, like every Hector turn.
   */
  const greet = useCallback(
    async (text: string) => {
      if (messagesRef.current.length > 0) return;
      messagesRef.current = [{ role: "assistant", content: text }];
      setMessages(messagesRef.current);
      setGreeted(true);
      setGreetingLoading(true);
      try {
        const voiceId = await voiceFor("hector", course);
        const blob = await cachedOpenerSpeech(openerSpeechKey(text, voiceId, course), async () => {
          const resp = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({ text, course, voice: voiceId, character: "hector" }),
          });
          return resp.ok ? await resp.blob() : null;
        });
        if (!blob) return;
        // The call-start sound finishes before his first words.
        await waitForCallCue();
        // Never after the learner left, and never over a turn they already started.
        if (leftRef.current || messagesRef.current.length > 1) return;
        playBlob(blob);
      } catch {
        /* the greeting still shows */
      } finally {
        setGreetingLoading(false);
      }
    },
    [course, playBlob],
  );

  useEffect(() => {
    let cancelled = false;
    leftRef.current = false;
    const progress = fetchProgress({ data: { course } });
    void progress
      .then((p) => {
        if (!cancelled) setCefrLevel(p.cefrLevel ?? "");
      })
      .catch(() => {});
    // Everything the greeting uses is best effort: without it Hector still says hello.
    void Promise.allSettled([progress, getWeaknessTrend(), supabase.auth.getSession()]).then(
      ([p, trend, session]) => {
        if (cancelled) return;
        const meta =
          session.status === "fulfilled" ? session.value.data.session?.user?.user_metadata : null;
        void greet(
          buildHectorGreeting({
            course,
            cefr: p.status === "fulfilled" ? p.value.cefrLevel : null,
            name: parseLearnerProfile(meta?.[LEARNER_PROFILE_KEY]).name,
            weakSpot:
              trend.status === "fulfilled"
                ? recentWeakSpot(trend.value?.categories ?? [], Date.now())
                : null,
          }),
        );
      },
    );
    return () => {
      cancelled = true;
      leftRef.current = true;
      audioRef.current?.pause();
    };
  }, [course, greet]);

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
          // Hector's own voice for this course (Settings > Voices), never Alphonso's.
          body: JSON.stringify({
            text: trimmed,
            history,
            course,
            cefr_level: cefrLevel,
            voice: await voiceFor("hector", course),
          }),
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
    getStream,
  } = useSpeechCapture({ course, onTranscript: (t) => send(t) });
  const recording = captureState === "recording";
  const transcribing = captureState === "transcribing";
  // While the greeting's voice loads Hector is "thinking", as before a reply.
  const status = hectorStatus({
    recording,
    transcribing,
    sending: sending || greetingLoading,
    speaking,
  });

  const hintAndLog = (
    <>
      <div className="relative z-10 mx-4 mt-3 rounded-2xl bg-surface/85 px-3 backdrop-blur-md">
        <SaveWordHint always />
      </div>
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="relative z-10 flex-1 overflow-y-auto px-5 py-6"
      >
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" ? (
                <div className="flex max-w-[85%] flex-col items-start">
                  <div className="rounded-2xl rounded-bl-md bg-parchment px-4 py-2.5 text-[15px] leading-relaxed text-ink">
                    <TappableText text={m.content} course={course} />
                  </div>
                  {/* The greeting is our own fixed text, not the model's: nothing to report. */}
                  {!(greeted && i === 0) && (
                    <AiMessageReport message={m.content} surface="hector" course={course} />
                  )}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-surface">
                  {m.content}
                </div>
              )}
            </div>
          ))}
          {(sending || transcribing) && (
            <p
              role="status"
              className="self-start rounded-full bg-surface/90 px-3 py-1 text-xs text-ink-soft backdrop-blur-md"
            >
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
    </>
  );
  const composer = (
    <div className="sticky bottom-0 z-20 border-t border-hairline bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-3 backdrop-blur-md">
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
            else {
              interrupt();
              void beginCapture();
            }
          }}
          aria-label={recording ? "Stop recording and send" : "Record a voice message"}
          aria-pressed={recording}
          disabled={sending || transcribing || greetingLoading}
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
  );
  const classicTop = (
    <>
      <SceneBackdrop scene="hector" focus="50% 30%" />
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface/90 px-5 py-3.5 backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[17px] font-semibold text-ink">Hector</h1>
          <p className="truncate text-[11px] text-ink-soft/70">{PAYWALL_COPY.mascotMessage}</p>
        </div>
        <ManageSubscription pro={pro} />
      </header>
      <section
        aria-label="Hector"
        className="relative z-10 mx-4 mt-4 flex items-center gap-4 rounded-3xl bg-surface/85 p-3 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.4)] backdrop-blur-md"
      >
        <MascotImage
          moment={hectorMoment(status)}
          size={messages.length === 0 ? 132 : 76}
          tone="sky"
          radius={messages.length === 0 ? 32 : 22}
          alt="Hector"
          className="card-lift"
        />
        <div className="min-w-0 space-y-1.5">
          <p className="font-display text-2xl font-bold text-ink">Your tutor</p>
          {status ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink card-lift">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  status === "listening"
                    ? "animate-pulse bg-ember motion-reduce:animate-none"
                    : "bg-moss"
                }`}
              />
              {hectorStatusLabel(status)}
            </span>
          ) : (
            <p className="text-xs text-ink-soft/70">Type or tap the mic to start talking.</p>
          )}
        </div>
      </section>
    </>
  );

  const avatarPhase: VoicePhase = recording
    ? { kind: "recording" }
    : transcribing
      ? { kind: "transcribing" }
      : sending || greetingLoading
        ? { kind: "thinking" }
        : speaking
          ? { kind: "speaking" }
          : { kind: "idle" };

  if (showCall) {
    const last = messages[messages.length - 1];
    const lastReply = [...messages].reverse().find((m) => m.role === "assistant");
    const caption =
      recording || !last
        ? null
        : { text: last.content, mine: last.role === "user", spoken: last.role === "assistant" };
    return (
      <LessonFrame>
        <PracticeCall
          kit={HECTOR_KIT}
          title={PAYWALL_COPY.mascotMessage}
          scenarioId="hector"
          dark={darkTheme}
          avatar={{
            phase: avatarPhase,
            replyText: lastReply?.content ?? null,
            getAudio: () => audioRef.current,
            // /api/hector-respond returns no verdict, so Hector does not react to right or wrong answers.
            replyVerdict: { serial: 0, verdict: "none" },
            course,
            reducedMotion,
            onModeChange: setAvatarMode,
          }}
          mode={avatarMode}
          caption={caption}
          recording={recording}
          talkDisabled={sending || transcribing || greetingLoading}
          onHoldStart={() => {
            setError(null);
            if (captureState === "idle" && !sending && !greetingLoading) {
              // Talking over Hector cuts him off; his voice must not end up in the recording.
              interrupt();
              void beginCapture();
            }
          }}
          onHoldEnd={() => {
            if (captureState !== "transcribing") stopRecording();
          }}
          onToggle={() => {
            setError(null);
            if (recording) stopRecording();
            else if (!greetingLoading) {
              interrupt();
              void beginCapture();
            }
          }}
          getStream={getStream}
          error={error ?? captureError}
          endTo="/learn"
          messages={messages}
          reducedMotion={reducedMotion}
          sheet={
            <>
              <div className="mb-2">
                <ManageSubscription pro={pro} />
              </div>
              {hintAndLog}
              {composer}
            </>
          }
        />
      </LessonFrame>
    );
  }

  return (
    <LessonFrame>
      {classicTop}
      {hintAndLog}
      {composer}
    </LessonFrame>
  );
}
