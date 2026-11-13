import { postChat } from "../../lib/chat-request";
import { track } from "@/lib/analytics";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiConsentGate } from "../../components/AiConsentGate";
import { AiMessageReport } from "../../components/AiMessageReport";
import { isAiConsentRequired, useAiConsent } from "../../lib/ai-consent-context";
import { LessonFrame } from "../../components/AppShell";
import { SaveWordHint, SaveWordProvider } from "../../components/SaveWord";
import { TappableText } from "../../components/TappableText";
import type { Course } from "../../data/courses";
import { getScenario, localizeScenario, type LocalizedScenario } from "../../data/scenarios";
import { useProgress } from "../../lib/progress";
import { authHeaders } from "../../lib/auth-headers";
import { readApiError } from "../../lib/read-api-error";
import { useSpeechCapture } from "../../lib/use-speech-capture";
import { HectorInvite } from "../../components/HectorInvite";
import { type AvatarReplyVerdict } from "../../components/AlphonsoAvatar";
import { PracticeCall } from "../../components/PracticeCall";
import { useTheme } from "../../lib/theme";
import { parseVerdict, type AvatarMode, type VoicePhase } from "../../lib/avatar/machine";
import { useAvatarPreference } from "../../lib/avatar/preference";
import { useReducedMotion } from "framer-motion";
import { fetchProgress } from "../../lib/sync.functions";
import { voiceFor } from "@/lib/voice-prefs";
import { cachedOpenerSpeech, openerSpeechKey } from "@/lib/opener-speech-cache";
import { waitForCallCue } from "@/lib/sfx";
import { finishPracticeCall, newCallId, type PracticeResult as Result } from "@/lib/practice-api";
import { PracticeResult } from "@/components/practice/PracticeResult";
import { roomUrl } from "@/lib/practice-catalog";
import { firstSlip, practiceModeSearch, type PracticeModeSearch } from "@/lib/practice-session";

export const Route = createFileRoute("/_authenticated/converse_/$scenarioId")({
  component: ConverseChatPageWithSave,
  // ?mode=call|chat from the pre-call sheet; without it the learner's own setting decides.
  validateSearch: (search: Record<string, unknown>): PracticeModeSearch =>
    practiceModeSearch(search),
  loader: ({ params }) => {
    const scenario = getScenario(params.scenarioId);
    if (!scenario) throw notFound();
    return { scenario };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.scenario.title.en ?? "Chat"} — Alphonso` },
      {
        name: "description",
        content: `Roleplay ${loaderData?.scenario.title.en.toLowerCase() ?? "a scene"} with an AI English tutor.`,
      },
      { property: "og:title", content: `${loaderData?.scenario.title.en ?? "Chat"} — Alphonso` },
      { property: "og:description", content: "Practice real English out loud with an AI tutor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Tapping a word in this page's text opens the save dialog (phase 4 of save-any-word). */
function ConverseChatPageWithSave() {
  const { scenario: raw } = Route.useLoaderData();
  const course = useProgress((s) => s.course);
  const scenario = useMemo(() => localizeScenario(raw, course), [raw, course]);
  const { mode } = Route.useSearch();
  // "Try again" on the result screen starts a fresh call: a new mount, a new call id, the opener again.
  const [attempt, setAttempt] = useState(0);
  return (
    <SaveWordProvider>
      {/* Keyed by course, so switching course mid-chat starts a fresh
          conversation in the new language instead of mixing two. */}
      <AiConsentGate backTo="/converse">
        <ConverseChatPage
          key={`${raw.id}:${course}:${attempt}`}
          scenario={scenario}
          course={course}
          mode={mode}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      </AiConsentGate>
    </SaveWordProvider>
  );
}

/**
 * V3 package 3a: maps Deepgram's utterance-level STT confidence to a
 * lightweight pronunciation-clarity label -- not real phoneme-level
 * pronunciation scoring, just "how clearly did the recognizer hear you."
 * Thresholds are a starting judgment call, not tuned against real data.
 */
function clarityLabel(confidence: number): { label: string; dotClassName: string } {
  if (confidence >= 0.85) return { label: "Clear", dotClassName: "bg-emerald-500" };
  if (confidence >= 0.6) return { label: "Okay", dotClassName: "bg-amber-500" };
  return { label: "Unclear", dotClassName: "bg-rose-500" };
}

type Msg = {
  role: "user" | "assistant";
  content: string;
  /** V3 package 3a: Deepgram's utterance-level STT confidence (0-1) for a
   * voice-transcribed user message, used as a lightweight pronunciation-
   * clarity heuristic. Undefined for typed messages and assistant replies. */
  confidence?: number | null;
  /** The scene's fixed opening line: written by us, not the model, so there is nothing to report. */
  opener?: boolean;
  /** The reply verdict on the learner turn before this reply (assistant replies only). */
  verdict?: ReturnType<typeof parseVerdict>;
};

function ConverseChatPage({
  scenario,
  course,
  mode,
  onRetry,
}: {
  scenario: LocalizedScenario;
  course: Course;
  mode: PracticeModeSearch["mode"];
  onRetry: () => void;
}) {
  const consent = useAiConsent();
  const navigate = useNavigate();
  // Practice stars: every reply of this call carries its id to /api/chat, which records the judged reply; hanging
  // up asks the server to score the call. The client never sends stars.
  const [callId] = useState(newCallId);
  const [startedAt] = useState(() => Date.now());
  useEffect(() => {
    void track("practice_call_started", { scenario_id: scenario.id });
  }, [scenario.id]);
  const [ending, setEnding] = useState(false);
  const [result, setResult] = useState<{ result: Result; seconds: number } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: scenario.opener, opener: true },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttsOn, setTtsOn] = useState(true);
  // Adaptive difficulty (V3 package 3a), per course: the level comes from
  // the course this conversation is in. Best-effort -- if the
  // fetch fails, /api/chat just falls back to no difficulty hint at all
  // (see chat.ts's withDifficultyHint), same as before this feature.
  const [cefrLevel, setCefrLevel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchProgress({ data: { course } })
      .then((p) => {
        if (!cancelled) setCefrLevel(p.cefrLevel);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [course]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Set once the screen is gone, so a reply voice that finishes loading afterwards is never played. */
  const leftRef = useRef(false);
  // The talking Alphonso: what is being spoken, whether its audio is loading or playing, and what the latest reply
  // said about the learner's turn (he reacts to it once the reply has been spoken).
  const [spoken, setSpoken] = useState<string | null>(null);
  const [voice, setVoice] = useState<"idle" | "loading" | "playing">("idle");
  const [replyVerdict, setReplyVerdict] = useState<AvatarReplyVerdict>({
    serial: 0,
    verdict: "none",
  });
  const showAlphonso = useAvatarPreference((s) => s.enabled);
  const hydrateAvatarPreference = useAvatarPreference((s) => s.hydrate);
  useEffect(() => hydrateAvatarPreference(), [hydrateAvatarPreference]);
  const reducedMotion = useReducedMotion() ?? false;
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("idle");
  const darkTheme = useTheme((t) => t.theme === "studio-ink");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const speak = useCallback(
    async (text: string, opts?: { opener?: boolean }) => {
      if (!ttsOn) return;
      setSpoken(text);
      setVoice("loading");
      try {
        // Alphonso's voice for this course (Settings > Voices); the server re-checks it against the allow-list.
        const voiceId = await voiceFor("alphonso", course);
        const fetchBlob = async () => {
          const resp = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({ text, course, voice: voiceId }),
          });
          return resp.ok ? await resp.blob() : null;
        };
        // An opener is static text: returning to the call replays it instead of fetching (and charging) again.
        const blob = opts?.opener
          ? await cachedOpenerSpeech(openerSpeechKey(text, voiceId, course), fetchBlob)
          : await fetchBlob();
        if (!blob) {
          setVoice("idle");
          return;
        }
        // The call-start sound finishes before his first words.
        if (opts?.opener) await waitForCallCue();
        // The learner hung up (or left) while the voice was loading: it must not start on the next screen.
        if (leftRef.current) return;
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.pause();
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        // A replaced or stopped clip must not flip the avatar back to idle under the clip that replaced it.
        const settle = () => {
          if (audioRef.current === audio) setVoice("idle");
        };
        audio.onplaying = () => {
          if (audioRef.current === audio) setVoice("playing");
        };
        audio.onended = () => {
          URL.revokeObjectURL(url);
          settle();
        };
        audio.onpause = settle;
        audio.onerror = settle;
        void audio.play().catch(settle);
      } catch {
        setVoice("idle");
      }
    },
    [ttsOn, course],
  );

  // Auto-speak the opener once on mount
  const openerSpokenRef = useRef(false);
  useEffect(() => {
    if (openerSpokenRef.current) return;
    // Delay so user gesture-less autoplay policies are less strict after nav
    const t = setTimeout(() => {
      // Marked when it actually starts: a cleared timer (an effect re-run) must not leave the opener unsaid.
      openerSpokenRef.current = true;
      void speak(scenario.opener, { opener: true });
    }, 400);
    return () => clearTimeout(t);
  }, [scenario.opener, speak]);

  const send = useCallback(
    async (text: string, confidence?: number | null) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);
      const next: Msg[] = [...messages, { role: "user", content: trimmed, confidence }];
      setMessages(next);
      setInput("");
      setSending(true);
      try {
        const resp = await postChat(
          {
            systemPrompt: scenario.systemPrompt,
            cefrLevel,
            course,
            callId,
            // Only role/content -- confidence is this app's own UI
            // metadata, not part of the chat wire format.
            messages: next.map(({ role, content }) => ({ role, content })),
          },
          await authHeaders(),
        );
        if (!resp.ok) {
          if (await isAiConsentRequired(resp)) {
            // Consent was withdrawn elsewhere: back to the gate, with the learner's words kept.
            consent.markWithdrawn();
            setMessages(messages);
            setInput(trimmed);
            return;
          }
          const t = await readApiError(resp);
          throw new Error(
            resp.status === 429
              ? t || "Daily limit reached — try again tomorrow."
              : resp.status === 402
                ? "AI credits exhausted. Add credits to keep chatting."
                : resp.status === 502
                  ? "Your partner didn't answer. Try saying it again."
                  : t || "Something went wrong.",
          );
        }
        const data = (await resp.json()) as { content?: string; verdict?: unknown };
        const reply = (data.content ?? "").trim() || "…";
        const verdict = parseVerdict(data.verdict);
        setMessages((m) => [...m, { role: "assistant", content: reply, verdict }]);
        // An older server sends no verdict, which reads as "none".
        setReplyVerdict((v) => ({ serial: v.serial + 1, verdict }));
        void speak(reply);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setSending(false);
      }
    },
    [messages, scenario.systemPrompt, cefrLevel, course, callId, sending, speak, consent],
  );

  // The capture flow lives in useSpeechCapture so the speaking question type
  // uses the same implementation rather than a second copy of it. The hook
  // only calls back on a real transcript; every failure path surfaces through
  // `captureError` instead.
  const {
    state: captureState,
    error: captureError,
    start: beginCapture,
    stop: stopRecording,
    getStream,
  } = useSpeechCapture({
    course,
    onTranscript: (text, confidence) => send(text, confidence ?? undefined),
  });
  // Before the hook existed, startRecording began with setError(null). The hook
  // clears only its OWN error, so without this a stale send failure
  // ("Something went wrong.") kept winning the `error ?? captureError` display
  // and masked every later capture message.
  const startRecording = useCallback(() => {
    setError(null);
    return beginCapture();
  }, [beginCapture]);
  const recording = captureState === "recording";
  const transcribing = captureState === "transcribing";
  const avatarPhase: VoicePhase = recording
    ? { kind: "recording" }
    : transcribing
      ? { kind: "transcribing" }
      : sending || voice === "loading"
        ? { kind: "thinking" }
        : voice === "playing"
          ? { kind: "speaking" }
          : { kind: "idle" };

  useEffect(() => {
    leftRef.current = false;
    return () => {
      leftRef.current = true;
      audioRef.current?.pause();
    };
  }, []);

  const learnerReplies = messages.filter((m) => m.role === "user").length;
  /** Hang up or finish: with no reply there is nothing to score, so straight back to Practice. */
  const endCall = useCallback(async () => {
    if (ending) return;
    audioRef.current?.pause();
    if (learnerReplies === 0) {
      void navigate({ to: "/converse" });
      return;
    }
    setEnding(true);
    const scored = await finishPracticeCall(callId);
    if (!scored) {
      void navigate({ to: "/converse" });
      return;
    }
    void track("practice_call_completed", { scenario_id: scenario.id, stars: scored.stars });
    setResult({ result: scored, seconds: Math.round((Date.now() - startedAt) / 1000) });
  }, [ending, learnerReplies, navigate, callId, startedAt, scenario.id]);

  const hint = (
    <div className="px-5">
      <SaveWordHint always />
    </div>
  );
  const conversationLog = (
    <div
      ref={scrollRef}
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
                <div className="rounded-2xl rounded-bl-md bg-ds-sunk px-4 py-2.5 ds-type-footnote leading-relaxed text-ds-ink">
                  <TappableText text={m.content} course={course} />
                </div>
                {!m.opener && (
                  <AiMessageReport
                    message={m.content}
                    surface="conversation"
                    course={course}
                    scenarioId={scenario.id}
                  />
                )}
              </div>
            ) : (
              <div className="flex max-w-[85%] flex-col items-end gap-1">
                <div className="rounded-2xl rounded-br-md bg-ds-ink px-4 py-2.5 ds-type-footnote leading-relaxed text-ds-card">
                  {m.content}
                </div>
                {typeof m.confidence === "number" &&
                  (() => {
                    const clarity = clarityLabel(m.confidence);
                    return (
                      <span className="flex items-center gap-1 pr-1 ds-type-caption text-ds-ink-soft/60">
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${clarity.dotClassName}`}
                        />
                        {clarity.label} pronunciation
                      </span>
                    );
                  })()}
              </div>
            )}
          </div>
        ))}
        {(sending || transcribing) && (
          <div className="flex justify-start" role="status">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-ds-sunk px-4 py-3">
              <span className="size-1.5 animate-bounce rounded-full bg-ds-ink-soft/60 [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-ds-ink-soft/60 [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-ds-ink-soft/60" />
            </div>
            <span className="sr-only">{transcribing ? "Transcribing…" : "Thinking…"}</span>
          </div>
        )}
        {/* After a few turns, offer to keep going with Hector (hidden for Pro). Once shown it stays mounted, so a
              later turn neither re-checks Pro nor closes a paywall the learner opened. */}
        {messages.filter((m) => m.role === "user").length >= 3 && (
          <HectorInvite source="practice_end_prompt" />
        )}
        {(error ?? captureError) && (
          <div
            role="alert"
            className="self-center rounded-full border border-rose-300/60 bg-rose-50 px-3 py-1 ds-type-caption font-medium text-rose-700"
          >
            {error ?? captureError}
          </div>
        )}
      </div>
    </div>
  );
  const composer = (
    <div className="sticky bottom-0 border-t border-ds-line bg-ds-card/95 px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-3 backdrop-blur-md">
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
            if (recording) {
              stopRecording();
            } else {
              void startRecording();
            }
          }}
          aria-label={recording ? "Stop recording and send" : "Record a voice message"}
          aria-pressed={recording}
          disabled={sending || transcribing}
          className={`grid size-11 shrink-0 place-items-center rounded-full transition-transform ${
            recording
              ? "bg-ember text-ink-on-ember scale-110 hard-shadow-ember"
              : "bg-ds-brand text-ds-card hard-shadow"
          } disabled:opacity-50`}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <rect
              x="9"
              y="3"
              width="6"
              height="12"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M5 11a7 7 0 0 0 14 0M12 18v3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="flex flex-1 items-end rounded-2xl border border-ds-line bg-ds-card px-3 py-2">
          <textarea
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
            className="max-h-32 min-h-[24px] w-full resize-none bg-transparent ds-type-footnote text-ds-ink outline-none placeholder:text-ds-ink-soft/50"
          />
        </div>
        <button
          type="submit"
          disabled={sending || transcribing || !input.trim()}
          aria-label="Send"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-ink text-ds-card transition-opacity disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M5 12l14-7-4 7 4 7-14-7z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  );
  const classicHeader = (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ds-line bg-ds-card/90 px-5 py-3.5 backdrop-blur-md">
      <Link
        to="/converse"
        aria-label="Back"
        className="grid size-9 place-items-center rounded-full border border-ds-line bg-ds-card text-ds-ink-soft transition-colors hover:text-ds-ink"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            d="M15 6l-6 6 6 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{scenario.emoji}</span>
          <h1 className="truncate font-display ds-type-headline font-semibold text-ds-ink">
            {scenario.title}
          </h1>
        </div>
        <p className="truncate ds-type-caption text-ds-ink-soft/70">{scenario.blurb}</p>
      </div>
      {learnerReplies > 0 && (
        <button
          type="button"
          onClick={() => void endCall()}
          disabled={ending || sending}
          className="rounded-full border border-ds-line bg-ds-card px-3 py-1.5 text-xs font-semibold text-ds-ink disabled:opacity-50"
        >
          Finish
        </button>
      )}
      <button
        onClick={() => setTtsOn((v) => !v)}
        aria-pressed={ttsOn}
        aria-label={ttsOn ? "Mute voice" : "Unmute voice"}
        className={`grid size-9 place-items-center rounded-full border transition-colors ${
          ttsOn
            ? "border-ds-brand/30 bg-ds-brand/10 text-ds-brand"
            : "border-ds-line bg-ds-card text-ds-ink-soft/60"
        }`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          {ttsOn ? (
            <>
              <path
                d="M4 10v4h4l5 4V6L8 10H4z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M16 9c1.2 1 1.2 5 0 6M18.5 7c2.2 2 2.2 8 0 10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <path
                d="M4 10v4h4l5 4V6L8 10H4z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M17 9l5 6M22 9l-5 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
      </button>
    </header>
  );

  if (result) {
    return (
      <LessonFrame>
        <PracticeResult
          result={result.result}
          course={course}
          room={roomUrl(scenario.id)}
          seconds={result.seconds}
          slip={firstSlip(messages)}
          onRetry={onRetry}
          next={{ label: "Done", onClick: () => void navigate({ to: "/converse" }) }}
        />
      </LessonFrame>
    );
  }

  if (mode ? mode === "call" : showAlphonso) {
    const last = messages[messages.length - 1];
    const caption =
      recording || !last
        ? null
        : {
            text: last.content,
            mine: last.role === "user",
            spoken: last.role === "assistant" && last.content === spoken,
          };
    return (
      <LessonFrame>
        <PracticeCall
          title={scenario.title}
          scenarioId={scenario.id}
          dark={darkTheme}
          avatar={{
            phase: avatarPhase,
            replyText: spoken,
            getAudio: () => audioRef.current,
            replyVerdict,
            course,
            reducedMotion,
            onModeChange: setAvatarMode,
          }}
          mode={avatarMode}
          caption={caption}
          recording={recording}
          talkDisabled={sending || transcribing}
          onHoldStart={() => {
            if (captureState !== "idle" || sending) return;
            // Talking over Alphonso cuts him off, as on a call; his voice must not end up in the recording.
            audioRef.current?.pause();
            void startRecording();
          }}
          onHoldEnd={() => {
            if (captureState !== "transcribing") stopRecording();
          }}
          onToggle={() => {
            if (recording) stopRecording();
            else {
              audioRef.current?.pause();
              void startRecording();
            }
          }}
          getStream={getStream}
          ttsOn={ttsOn}
          onToggleTts={() => setTtsOn((v) => !v)}
          error={error ?? captureError}
          endTo="/converse"
          onEnd={() => void endCall()}
          messages={messages}
          reducedMotion={reducedMotion}
          sheet={
            <>
              {hint}
              {conversationLog}
              {composer}
            </>
          }
        />
      </LessonFrame>
    );
  }

  return (
    <LessonFrame>
      {classicHeader}
      {hint}
      {conversationLog}
      {composer}
    </LessonFrame>
  );
}
