import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { track } from "../../lib/analytics";
import { RouteError } from "../../components/RouteError";
import { DsIcon } from "../../components/ds/DsIcon";
import { cancelSpeech } from "@/lib/speech";
import { claimAudioSession } from "@/lib/audio-session";
import { voicePlayback } from "@/lib/voice-playback";
import { useReplyVoice } from "@/lib/use-reply-voice";
import { fetchTurnSpeech } from "@/lib/hector-turn-speech";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AiConsentGate } from "../../components/AiConsentGate";
import { AiMessageReport } from "../../components/AiMessageReport";
import { ExplainInMyLanguage } from "../../components/ExplainInMyLanguage";
import { LessonFrame, MobileFrame } from "../../components/AppShell";
import { HectorPanel } from "../../components/hector/HectorPanel";
import { SaveWordHint, SaveWordProvider } from "../../components/SaveWord";
import { TappableText } from "../../components/TappableText";
import { WebPaywall } from "../../components/WebPaywall";
import type { Course } from "../../data/courses";
import { isAiConsentRequired, useAiConsent } from "../../lib/ai-consent-context";
import { authHeaders } from "../../lib/auth-headers";
import { PAYWALL_COPY, WEB_PAYWALL_COPY, type PaywallSource } from "../../lib/paywall-copy";
import { useProgress } from "../../lib/progress";
import { readApiError } from "../../lib/read-api-error";
import { hectorStatus } from "../../lib/hector-status";
import { hectorChips, type HectorChip } from "@/lib/hector-chips";
import { HECTOR_RECORDING_CAP_MS } from "@/lib/hector-recording-cap";
import { bubbleClass } from "@/components/hector/hector-style";
import { CorrectionCard } from "@/components/hector/CorrectionCard";
import { displayText, extractCorrection, validateCorrection } from "@/lib/hector-correction";
import type { HectorCorrection } from "@/lib/hector-correction";
import type { TutorReplyPayload } from "@/lib/hector-conversation";
import {
  HectorAvatar,
  HectorChips,
  HectorComposer,
  HectorHeader,
} from "@/components/hector/HectorParts";
import { fetchProgress } from "../../lib/sync.functions";
import { useProStatus, type ProStatus } from "../../lib/use-pro-status";
import { useHandsFreeCapture } from "../../lib/use-hands-free";
import { HECTOR_TUNING } from "../../lib/hands-free-loop";
import { PracticeCall } from "../../components/PracticeCall";
import { HECTOR_KIT } from "../../lib/avatar/layers";
import type { AvatarMode, VoicePhase } from "../../lib/avatar/machine";
import { useStoredAvatarPreference } from "../../lib/avatar/preference";
import { useReducedMotion } from "framer-motion";
import { voiceFor } from "@/lib/voice-prefs";
import { cachedOpenerSpeech, openerSpeechKey } from "@/lib/opener-speech-cache";
import { waitForCallCue } from "@/lib/sfx";
import { buildHectorGreeting, recentWeakSpot } from "@/lib/hector-greeting";
import { HECTOR_OUT_FOR_TODAY, isHectorAllowanceUsedUp } from "@/lib/hector-allowance";
import { getWeaknessTrend } from "@/lib/weakness-trend.functions";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "@/lib/learner-profile";
import { supabase } from "@/integrations/supabase/client";
import { chooseGreetingVariant, rememberedTopic } from "@/lib/hector-greeting-context";
import { createHectorCallEnd } from "@/lib/hector-call-end";

export const Route = createFileRoute("/_authenticated/hector")({
  component: HectorPage,
  errorComponent: ({ error, reset }) => (
    <RouteError error={error} reset={reset} boundary="hector_route" />
  ),
  head: () => ({
    meta: [
      { title: "Hector — Alphonso" },
      { name: "description", content: "Talk with Hector, your AI language tutor." },
    ],
  }),
});

/** Same cap the server applies (MAX_HISTORY_MESSAGES in src/lib/hector-conversation.ts). */
const MAX_HISTORY = 40;

/** A learner message may carry Hector's correction card; it is shown, never sent back as history. */
type Msg = { role: "user" | "assistant"; content: string; correction?: HectorCorrection };

function HectorPage() {
  const course = useProgress((s) => s.course);
  useEffect(() => {
    void track("hector_opened");
  }, []);
  return (
    <SaveWordProvider>
      <AiConsentGate backTo="/learn">
        <HectorGate key={course} course={course} />
      </AiConsentGate>
    </SaveWordProvider>
  );
}

/**
 * The Hector tab keeps the tab bar (as on iOS and Android) except in the full-screen call and the paywall, so those states need their own way out; the exit link stays on every state.
 * Without one a free learner was left on the paywall with no exit but the browser's back button.
 */
function HectorExit({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/learn"
      aria-label={HECTOR_EXIT_LABEL}
      data-hector-exit=""
      className={`grid size-11 shrink-0 place-items-center rounded-full bg-ds-card/90 text-ds-brand shadow-[var(--ds-shadow-resting)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-choice ${className}`}
    >
      <DsIcon name="close" className="size-4" />
    </Link>
  );
}

const HECTOR_EXIT_LABEL = "Back to Learn";

function HectorGate({ course }: { course: Course }) {
  const pro = useProStatus();
  const navigate = useNavigate();
  // A 403 mid-conversation (lapsed, refunded) swaps in the paywall with its own source.
  const [refusedSource, setRefusedSource] = useState<PaywallSource | null>(null);

  if (pro.state === "loading") {
    return (
      <MobileFrame>
        <div className="px-4 pt-4">
          <HectorExit />
        </div>
        <p role="status" className="px-6 pt-10 text-sm text-ds-ink-soft/70">
          …
        </p>
      </MobileFrame>
    );
  }
  if (pro.state === "error") {
    return (
      <MobileFrame>
        <div className="px-4 pt-4">
          <HectorExit />
        </div>
        <div className="space-y-3 px-6 pt-6">
          <p role="alert" className="text-sm text-ds-ink-soft">
            {WEB_PAYWALL_COPY.checkFailed}
          </p>
          <button
            type="button"
            onClick={() => void pro.retry()}
            className="rounded-full border border-ds-line px-4 py-2 text-sm font-semibold text-ds-ink"
          >
            {PAYWALL_COPY.tryAgain}
          </button>
        </div>
      </MobileFrame>
    );
  }
  if (pro.state === "free" && !refusedSource && pro.justPaid) {
    return (
      <MobileFrame>
        <div className="px-4 pt-4">
          <HectorExit />
        </div>
        <div className="space-y-3 px-6 pt-6">
          <p role="status" className="font-display text-xl font-semibold text-ds-ink">
            {WEB_PAYWALL_COPY.activating}
          </p>
          <button
            type="button"
            onClick={() => void pro.retry()}
            className="rounded-full border border-ds-line px-4 py-2 text-sm font-semibold text-ds-ink"
          >
            {PAYWALL_COPY.tryAgain}
          </button>
        </div>
      </MobileFrame>
    );
  }
  if (pro.state === "free" || refusedSource) {
    return (
      <LessonFrame>
        {/* The round-6 paywall paints Hector in his library itself. */}
        <WebPaywall
          source={refusedSource ?? "hector_tab"}
          onClose={() => void navigate({ to: "/learn" })}
        />
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

/** Whether there is anything to say about the subscription: an empty row in a menu is just noise. */
function hasManageSubscription(pro: ProStatus): boolean {
  return (pro.store === "web" && !!pro.manageUrl) || pro.store === "app_store";
}

function ManageSubscription({ pro, menuItem = false }: { pro: ProStatus; menuItem?: boolean }) {
  if (pro.store === "web" && pro.manageUrl) {
    return (
      <a
        href={pro.manageUrl}
        role={menuItem ? "menuitem" : undefined}
        className="ds-type-caption font-medium text-ds-ink-soft underline"
      >
        {PAYWALL_COPY.manage}
      </a>
    );
  }
  if (pro.store === "app_store") {
    return <p className="ds-type-caption text-ds-ink-soft/70">{WEB_PAYWALL_COPY.manageOnIphone}</p>;
  }
  return null;
}

/** Hector's reply audio (base64 mp3) as a clip, or null when the server sent none or it cannot be decoded. */
function clipFrom(audioBase64: string | undefined): Blob | null {
  if (!audioBase64) return null;
  try {
    const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: "audio/mpeg" });
  } catch {
    return null;
  }
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
  // Hector's voice: one persistent audio element (unlocked by the learner's first tap), the device voice and a "Tap to
  // hear Hector" button when the browser refuses to play a reply by itself, and no hands-free turn over an unheard reply.
  const voice = useReplyVoice("hector", course);
  const { speaking, awaitingTap, say: sayReply, skip: skipReply, replay: replayReply } = voice;
  // The turn in flight, aborted when the screen is left so a late reply is never shown or spoken.
  const turnAbortRef = useRef<AbortController | null>(null);
  // Hector's greeting is messages[0] once said; the mic waits while its voice loads.
  const [greeted, setGreeted] = useState(false);
  const [greetingLoading, setGreetingLoading] = useState(false);
  // Suggestion chips under the greeting: generated from the same context, gone after the learner's first message.
  const [chips, setChips] = useState<HectorChip[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const leftRef = useRef(false);
  // The call screen ("Show Alphonso while practicing" covers Hector too, so one switch decides).
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("idle");
  // Read before the first render (this screen mounts only after the client-side Pro check), so with the setting off
  // the call never flashes up for a frame.
  const showCall = useStoredAvatarPreference();
  const reducedMotion = useReducedMotion() ?? false;

  /** Talking over Hector cuts him off, as on a call: his greeting or a reply. */
  const interrupt = skipReply;

  /**
   * Hector speaks first (BACKLOG 0.0-bp). The greeting is his first turn, so it is in the history the model gets
   * with the learner's first turn, and it is spoken in Hector's chosen voice through the reply player, so his lips
   * follow it. It is our own fixed text, so its speech is cached like Alphonso's openers
   * (src/lib/opener-speech-cache.ts): reopening the call does not fetch, or charge /api/tts, again. Only reached
   * inside the AI consent gate and the Pro check, like every Hector turn.
   */
  const greet = useCallback(
    async (text: string, suggestions: HectorChip[]) => {
      if (messagesRef.current.length > 0) return;
      messagesRef.current = [{ role: "assistant", content: text }];
      setMessages(messagesRef.current);
      setChips(suggestions);
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
        // The call-start sound finishes before his first words.
        await waitForCallCue();
        // Never after the learner left, and never over a turn they already started.
        if (leftRef.current || messagesRef.current.length > 1) return;
        setGreetingLoading(false);
        // No audio (the voice could not be made) is not silence: the device voice reads the greeting.
        await sayReply(text, blob);
      } catch {
        /* the greeting still shows */
      } finally {
        setGreetingLoading(false);
      }
    },
    [course, sayReply],
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
    void Promise.allSettled([
      progress,
      getWeaknessTrend(),
      supabase.auth.getSession(),
      isHectorAllowanceUsedUp(supabase),
      rememberedTopic(supabase, course),
    ]).then(([p, trend, session, usedUp, remembered]) => {
      if (cancelled) return;
      // Today's allowance is used up (BACKLOG 0.0-bq #5): the "out for today" message, and no greeting, so no speech.
      if (usedUp.status === "fulfilled" && usedUp.value) {
        setError(HECTOR_OUT_FOR_TODAY);
        return;
      }
      const meta =
        session.status === "fulfilled" ? session.value.data.session?.user?.user_metadata : null;
      // What earlier calls saved comes first ("Last time we worked on..."), then the recent weak spots.
      const weakSpot =
        (remembered.status === "fulfilled" ? remembered.value : null) ??
        (trend.status === "fulfilled"
          ? recentWeakSpot(trend.value?.categories ?? [], Date.now())
          : null);
      void greet(
        buildHectorGreeting({
          course,
          cefr: p.status === "fulfilled" ? p.value.cefrLevel : null,
          name: parseLearnerProfile(meta?.[LEARNER_PROFILE_KEY]).name,
          weakSpot,
          variant: chooseGreetingVariant(course),
        }),
        hectorChips({ course, weakSpot, streakDays: useProgress.getState().streak }),
      );
    });
    return () => {
      cancelled = true;
      leftRef.current = true;
      turnAbortRef.current?.abort();
      skipReply();
    };
  }, [course, greet, skipReply]);

  // The call ends when the learner leaves the screen or closes the tab: what it taught Hector about them is saved
  // once, for the next call (/api/hector-call-end; Pro only, decided on the server).
  const cefrRef = useRef(cefrLevel);
  cefrRef.current = cefrLevel;
  useEffect(() => {
    const endCall = createHectorCallEnd({
      callId: crypto.randomUUID(),
      course,
      getTurns: () => messagesRef.current,
      getCefr: () => cefrRef.current,
    });
    const onHide = () => void endCall();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void endCall();
    };
  }, [course]);

  // Starting a call pauses the podcast (one voice at a time).
  useEffect(() => claimAudioSession("voice"), []);

  // Leaving the screen stops the fix being spoken.
  useEffect(() => () => cancelSpeech(), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setError(null);
      const history = messages.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
      setMessages([...messages, { role: "user", content: trimmed }]);
      setInput("");
      setSending(true);
      const abort = new AbortController();
      turnAbortRef.current = abort;
      try {
        const voiceId = await voiceFor("hector", course);
        const resp = await fetch("/api/hector-respond", {
          method: "POST",
          signal: abort.signal,
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          // Hector's own voice for this course (Settings > Voices), never Alphonso's.
          body: JSON.stringify({
            text: trimmed,
            history,
            course,
            cefr_level: cefrLevel,
            voice: voiceId,
            // Text first: the speech is fetched from /api/tts with the token this answers with (web only; native
            // does not send this and gets the audio inline).
            split_tts: true,
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
        const data = (await resp.json()) as {
          reply?: string;
          audio_base64?: TutorReplyPayload["audio_base64"];
          tts_token?: string;
          correction?: unknown;
        };
        if (abort.signal.aborted) return;
        // The server already took the block out; parsing the reply here too means a tag can never be shown.
        const parsed = extractCorrection(data.reply ?? "");
        const reply = parsed.text || "…";
        const correction = validateCorrection(data.correction) ?? parsed.correction;
        setMessages((m) => {
          // The card belongs under the learner's message this reply answers: the last one.
          const at = m.map((x) => x.role).lastIndexOf("user");
          const withCard = correction ? m.map((x, i) => (i === at ? { ...x, correction } : x)) : m;
          return [...withCard, { role: "assistant", content: reply }];
        });
        // The turn's speech: inline audio (a server that did not split), or the pieces of the reply fetched with the
        // turn token (first sentence first). With neither, the device voice reads it.
        const inline = clipFrom(data.audio_base64);
        const parts =
          !inline && data.tts_token && data.reply
            ? fetchTurnSpeech({
                token: data.tts_token,
                reply: data.reply,
                course,
                voice: voiceId,
                signal: abort.signal,
              })
            : undefined;
        void sayReply(reply, inline, parts);
      } catch (e) {
        // The screen was left mid-turn: nothing to show.
        if (abort.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        if (turnAbortRef.current === abort) turnAbortRef.current = null;
        if (!abort.signal.aborted) setSending(false);
      }
    },
    [messages, sending, course, cefrLevel, consent, onNotEntitled, sayReply],
  );

  // Hands-free starts as the learner last left it on this device (see useHandsFreeCapture) and is carried by this screen's state. It runs on the call screen
  // only (the classic screen has no Pause button), and Hector is Pro already: this screen mounts only for Pro.
  const [handsFreeWanted, setHandsFreeWanted] = useState(false);
  const {
    state: captureState,
    error: captureError,
    start: beginCapture,
    stop: stopRecording,
    getStream,
    handsFreeCall,
  } = useHandsFreeCapture({
    course,
    onTranscript: (t) => send(t),
    wanted: handsFreeWanted,
    live: showCall,
    tuning: HECTOR_TUNING,
    // Until his greeting has begun (or the day is used up) he is "about to speak", so the mic stays shut. A reply the
    // browser would not play (waiting for the learner's tap) counts as still speaking: the mic opens only once it was
    // heard or skipped.
    replyPhase:
      sending || greetingLoading || (!greeted && !error)
        ? "thinking"
        : speaking || awaitingTap
          ? "speaking"
          : "idle",
    failure: error,
    onBeginTurn: () => setError(null),
    partner: "Hector",
    onWantedChange: setHandsFreeWanted,
  });
  const recording = captureState === "recording";
  // A tapped recording has no finger to bound it: it is stopped and sent after the cap (the same minute on every platform).
  const stopRef = useRef(stopRecording);
  stopRef.current = stopRecording;
  useEffect(() => {
    if (!recording) return;
    const t = setTimeout(() => stopRef.current(), HECTOR_RECORDING_CAP_MS);
    return () => clearTimeout(t);
  }, [recording]);
  const transcribing = captureState === "transcribing";
  // While the greeting's voice loads Hector is "thinking", as before a reply.
  const status = hectorStatus({
    recording,
    transcribing,
    sending: sending || greetingLoading,
    speaking,
  });

  const learnerHasSpoken = messages.some((m) => m.role === "user");
  const busy = sending || transcribing || greetingLoading;
  const shownError = error ?? captureError;

  // "Try again" on a correction card: the corrected phrase, said once more. Where there is a microphone it is the
  // composer's own tap-to-talk path (so the same 60 s cap applies); in hands-free the loop re-opens the mic itself once
  // Hector stops talking; with no microphone it puts the cursor in the composer.
  const composerInput = useRef<HTMLTextAreaElement | null>(null);
  const tryAgain = useCallback(() => {
    setError(null);
    // The mic must not record the fix being spoken, nor Hector.
    cancelSpeech();
    interrupt();
    if (handsFreeWanted && showCall) return;
    const canRecord =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function";
    if (canRecord) void beginCapture();
    else composerInput.current?.focus();
  }, [interrupt, handsFreeWanted, showCall, beginCapture]);

  const hintAndLog = (
    <>
      <div className="relative z-10 mx-4 mt-3 rounded-2xl bg-ds-card/85 px-3 backdrop-blur-md">
        <SaveWordHint always />
      </div>
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="relative z-10 flex-1 overflow-y-auto bg-gradient-to-b from-ds-surface to-ds-sunk px-3.5 py-4"
      >
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <Fragment key={i}>
              <div
                className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" ? (
                  <>
                    <HectorAvatar />
                    <div className="flex max-w-[85%] flex-col items-start">
                      <div className={bubbleClass("assistant")}>
                        <TappableText text={displayText("assistant", m.content)} course={course} />
                      </div>
                      {/* The greeting is our own fixed text, not the model's: nothing to report. */}
                      {!(greeted && i === 0) && (
                        <AiMessageReport message={m.content} surface="hector" course={course} />
                      )}
                      <ExplainInMyLanguage
                        className="mt-1"
                        surface="hector"
                        request={{ kind: "message", course, text: m.content.slice(0, 1000) }}
                      />
                    </div>
                  </>
                ) : (
                  <div className={`max-w-[85%] ${bubbleClass("user")}`}>{m.content}</div>
                )}
              </div>
              {m.correction && (
                <CorrectionCard
                  correction={m.correction}
                  course={course}
                  onTryAgain={tryAgain}
                  tryAgainDisabled={sending || transcribing || greetingLoading || recording}
                  hearDisabled={recording}
                  onBeforeHear={interrupt}
                />
              )}
            </Fragment>
          ))}
          {/* Gone as soon as the learner says anything, by chip, keyboard or voice. */}
          {greeted && chips.length > 0 && !learnerHasSpoken && (
            <HectorChips
              chips={chips}
              disabled={sending || transcribing}
              onPick={(chip) => {
                interrupt();
                void send(chip.message);
              }}
            />
          )}
          {awaitingTap && (
            <button
              type="button"
              onClick={replayReply}
              className="self-center rounded-full bg-ds-brand px-4 py-2 ds-type-footnote font-semibold text-ds-on-brand"
            >
              Tap to hear Hector
            </button>
          )}
          {shownError && (
            <div
              role="alert"
              className="self-center rounded-full border border-ds-wrong/40 bg-ds-wrong-tint px-3 py-1 ds-type-footnote font-medium text-ds-wrong-ink"
            >
              {shownError}
            </div>
          )}
        </div>
      </div>
    </>
  );
  // The form itself. In the call's sheet it sticks to the sheet; on the classic screen it rides in the shell's dock
  // above the tab bar (MobileFrame aboveTabs), because a second bottom-sticky bar would hide behind the tabs.
  const composerForm = (
    <HectorComposer
      value={input}
      onChange={setInput}
      onSend={() => void send(input)}
      onMic={() => {
        setError(null);
        if (recording) stopRecording();
        else {
          interrupt();
          // Inside the tap: keeps the voice element playable for his next reply.
          voicePlayback().unlock();
          void beginCapture();
        }
      }}
      recording={recording}
      busy={busy}
      disabled={sending || transcribing}
      reducedMotion={reducedMotion}
      getStream={getStream}
      inputRef={composerInput}
    />
  );
  const composer = (
    <div className="sticky bottom-0 z-20 border-t border-ds-line bg-ds-card/95 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2.5 shadow-[0_-8px_20px_-16px_rgba(20,27,61,0.4)] backdrop-blur-md">
      {composerForm}
    </div>
  );
  const dockComposer = (
    <div className="border-t border-ds-line bg-ds-card/95 px-3 pb-3 pt-2.5 shadow-[0_-8px_20px_-16px_rgba(20,27,61,0.4)] backdrop-blur-md">
      {composerForm}
    </div>
  );
  const classicTop = (
    <HectorHeader
      course={course}
      status={status}
      menu={
        <>
          {hasManageSubscription(pro) && (
            <div role="none" className="px-2 py-1.5">
              <ManageSubscription pro={pro} menuItem />
            </div>
          )}
          <Link
            to="/profile"
            role="menuitem"
            className="rounded-xl px-2 py-2 ds-type-footnote font-semibold text-ds-ink hover:bg-ds-sunk"
          >
            Settings and voices
          </Link>
        </>
      }
    />
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
          heading="Hector"
          scenarioId="hector"
          avatar={{
            phase: avatarPhase,
            replyText: lastReply?.content ?? null,
            getAudio: () => voicePlayback().element(),
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
              voicePlayback().unlock();
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
              voicePlayback().unlock();
              void beginCapture();
            }
          }}
          getStream={getStream}
          error={error ?? captureError}
          endTo="/learn"
          messages={messages}
          reducedMotion={reducedMotion}
          handsFree={handsFreeCall}
          tapToHear={
            awaitingTap ? { onTap: replayReply, onSkip: skipReply, partner: "Hector" } : null
          }
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
    <MobileFrame
      aboveTabs={dockComposer}
      panel={
        <HectorPanel
          course={course}
          chips={chips}
          disabled={sending || transcribing || greetingLoading}
          onPick={(chip) => {
            interrupt();
            void send(chip.message);
          }}
        />
      }
    >
      {classicTop}
      {hintAndLog}
    </MobileFrame>
  );
}
