import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { AlphonsoAvatar } from "./AlphonsoAvatar";
import { AiLabel } from "./AiLabel";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/rehearsal-rules";
import { ALPHONSO_KIT, type CharacterKit } from "@/lib/avatar/layers";
import type { AvatarMode } from "@/lib/avatar/machine";
import { EVENING_OVERLAY, sceneArt } from "@/lib/avatar/scenes";
import { useNight } from "@/lib/use-night";
import { LEVEL_BARS, useMicLevel } from "@/lib/avatar/use-mic-level";
import { playSfx, registerVoiceProbe } from "@/lib/sfx";
import { handsFreeStatusLine, HANDS_FREE_PAUSE, HANDS_FREE_RESUME } from "@/lib/hands-free-copy";
import { HandsFreeChip, HandsFreeSwitch, type HandsFreeCall } from "./HandsFreeSwitch";

/** A design token (a --c-* colour) at a share of its strength, over whatever is behind it. */
const tone = (token: string, percent: number) =>
  `color-mix(in srgb, var(--c-${token}) ${percent}%, transparent)`;
/** The theme's own faces (Baloo 2 / Fraunces and Geist), kept on the call; sizes come from the type tokens. */
const DISPLAY_FACE = "var(--font-display)";
const SANS_FACE = "var(--font-sans)";
const GLASS = tone("call-glass", 46);
const GLASS_STRONG = tone("call-glass", 62);
/** The red hang-up button. */
const HANG_UP = { background: "var(--c-call-end)", color: "var(--c-on-hero)" } as const;
/** The soft dark behind white words on the picture. */
const textShadow = (y: number, blur: number, percent: number) =>
  `0 ${y}px ${blur}px ${tone("call-glass", percent)}`;

/** The big white call button: the talk button (green while recording) and, in hands-free, the Pause button. */
function talkButtonStyle(recording: boolean) {
  return {
    background: recording ? "var(--c-call-record)" : "var(--c-on-hero)",
    color: "var(--c-call-dock)",
    boxShadow: recording
      ? `0 0 0 9px ${tone("call-record", 35)}`
      : `0 0 0 5px ${tone("on-hero", 30)}`,
    transform: recording ? "scale(.96)" : "none",
  };
}

export type CallCaption = {
  text: string;
  /** The learner's own words: shown in a green tint. */
  mine: boolean;
  /** The caption is what Alphonso is saying right now, so its words light up with the audio. */
  spoken: boolean;
};

type Props = {
  /** The scenario's name, shown under "Alphonso". */
  title: string;
  /**
   * A rehearsal run: the event is the title (with the AI label), "Alphonso · Stage N of 3: <stage>" goes under it and a
   * three-segment bar shows where the learner is in the plan.
   */
  rehearsal?: { title: string; stage: Stage };
  /** A visually hidden page heading, for a screen that is the whole page and has no other h1 (a call's). */
  heading?: string;
  /** Who is on the call: the name in the call bar, his art and his default room. Alphonso unless told otherwise. */
  kit?: CharacterKit;
  /** The scenario whose room is shown; null (a campaign, free talk) gets the character's default room. */
  scenarioId: string | null;
  /** The study room when scenarioId has no picture; left out, the character's own default room. A campaign passes the lessons' room. */
  room?: { light: string; dark: string };
  /** Evening room: left out, it follows the look (Royal night only; Meadow stays light in a dark device). */
  dark?: boolean;
  avatar: Omit<ComponentProps<typeof AlphonsoAvatar>, "className">;
  caption: CallCaption | null;
  /** The avatar's mode: drives the state pill and the call bar's dot (red while he speaks). */
  mode: AvatarMode;
  recording: boolean;
  talkDisabled: boolean;
  /** A press-and-hold on the talk button. */
  onHoldStart: () => void;
  onHoldEnd: () => void;
  /** A keyboard or assistive-technology activation, which has no hold: starts, then stops, the recording. */
  onToggle: () => void;
  getStream: () => MediaStream | null;
  /** The voice mute control in the call bar. Omit both for a screen with no mute (Hector always speaks). */
  ttsOn?: boolean;
  onToggleTts?: () => void;
  error: string | null;
  /** The screen the red hang-up button leads to. */
  endTo: string;
  /** Instead of leading to `endTo`, hanging up calls this (Practice scores the call, then shows its result). */
  onEnd?: () => void;
  /** The conversation so far, as plain text for assistive technology while the sheet is closed. */
  messages: { role: "user" | "assistant"; content: string }[];
  /** The full conversation, its hints and the typed-message box: shown in the bottom sheet. */
  sheet: ReactNode;
  /** Something that belongs on the call itself (a campaign's "Continue" button), shown above the caption. */
  extra?: ReactNode;
  reducedMotion: boolean;
  /**
   * Hands-free: the switch (in the conversation sheet), and, while it is on, the Pause button in place of the talk
   * button and a status pill. Omit it for a browser that cannot do it.
   */
  handsFree?: HandsFreeCall;
  /**
   * A reply the browser would not play by itself: the "Tap to hear" button (a tap is what lets the browser play it) and a
   * way to skip it. While it shows, hands-free keeps the microphone shut.
   */
  tapToHear?: { onTap: () => void; onSkip: () => void; partner: string } | null;
};

const MODE_LABEL: Record<AvatarMode, string> = {
  idle: "Listening",
  listening: "Listening to you",
  thinking: "Thinking",
  speaking: "Speaking",
  "reacting:happy": "Nice!",
  "reacting:encouraging": "Let's fix that",
};

const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * The Practice speaking session as a full-screen call with Alphonso: his room behind him, a call bar, a "You" tile
 * with the learner's voice level, one live caption, and the call controls. The conversation itself (bubbles, hints,
 * typing) lives in the bottom sheet. Everything here that is not a button is decorative.
 */
export function PracticeCall(props: Props) {
  const {
    title,
    rehearsal,
    heading,
    kit = ALPHONSO_KIT,
    scenarioId,
    dark: darkProp,
    room: studyRoom,
    avatar,
    caption,
    mode,
    recording,
    talkDisabled,
    onHoldStart,
    onHoldEnd,
    onToggle,
    getStream,
    ttsOn,
    onToggleTts,
    error,
    endTo,
    onEnd,
    messages,
    sheet,
    extra,
    reducedMotion,
    handsFree,
    tapToHear,
  } = props;
  const night = useNight();
  const dark = darkProp ?? night;
  const handsFreeOn = !!handsFree?.on;
  const handsFreePaused = handsFree?.status.kind === "paused";
  const handsFreeLine = handsFree ? handsFreeStatusLine(handsFree.status, kit.displayName) : null;
  // The hands-free pill sits above the controls, so everything that was above them moves up by its room.
  const lift = handsFreeOn ? 52 : 0;
  const speaking = mode === "speaking";
  const stateLabel = MODE_LABEL[mode];
  const art = sceneArt(scenarioId, undefined, studyRoom ?? kit.defaultRoom);
  const room = dark ? art.dark : art.light;

  // The call-start sound, once per call (keyed, so a re-render or a development double effect cannot repeat it).
  const [callKey] = useState(() => `call:${Date.now()}:${Math.random()}`);
  useEffect(() => {
    playSfx("callStart", callKey);
  }, [callKey]);
  // While he speaks, no effect plays over him: the effects ask this probe before playing.
  const voiceNow = useRef({ speaking, getAudio: avatar.getAudio });
  voiceNow.current = { speaking, getAudio: avatar.getAudio };
  useEffect(
    () =>
      registerVoiceProbe(() => {
        const audio = voiceNow.current.getAudio();
        return voiceNow.current.speaking || (!!audio && !audio.paused && !audio.ended);
      }),
    [],
  );

  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const barRefs = useRef<(HTMLElement | null)[]>([]);
  useMicLevel(recording, getStream, () => barRefs.current);

  // Words light up with the audio while Alphonso speaks his caption; otherwise the whole caption is lit.
  const captionRef = useRef<HTMLParagraphElement>(null);
  const getAudio = avatar.getAudio;
  const lit = caption?.spoken && speaking;
  useEffect(() => {
    const words = captionRef.current?.querySelectorAll<HTMLElement>("[data-w]");
    if (!words) return;
    const light = (count: number) =>
      words.forEach((w, i) => (w.style.opacity = i < count ? "1" : "0.55"));
    if (!lit) {
      light(words.length);
      return;
    }
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const audio = getAudio();
      const d = audio?.duration ?? NaN;
      if (!audio || !Number.isFinite(d) || d <= 0) return light(0);
      light(Math.ceil(Math.min(1, audio.currentTime / d) * words.length * 1.03));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [lit, getAudio, caption?.text]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const chatRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (sheetOpen) backRef.current?.focus();
  }, [sheetOpen]);
  const closeSheet = () => {
    setSheetOpen(false);
    chatRef.current?.focus();
  };
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheetOpen(false);
        chatRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const words = caption ? caption.text.split(/\s+/).filter(Boolean) : [];

  return (
    <div
      className="relative h-dvh w-full overflow-hidden"
      style={{
        backgroundColor: dark
          ? "var(--c-call-glass)"
          : "color-mix(in srgb, var(--c-on-hero) 85%, var(--c-call-glass))",
        backgroundImage: `url(${room})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        containerType: "size",
        color: "var(--c-on-hero)",
      }}
    >
      {heading && <h1 className="sr-only">{heading}</h1>}
      {art.dimInDark && dark && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          data-testid="evening-overlay"
          style={{ background: EVENING_OVERLAY, mixBlendMode: "multiply" }}
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] "
        style={{
          backgroundImage: `linear-gradient(to bottom, ${tone("call-glass", 28)}, transparent 18%, transparent 55%, ${tone("call-glass", 50)} 100%)`,
        }}
      />

      {/* Alphonso: the square kit scaled past the screen width so head and shoulders fill the frame. On a short
          screen the square is held to 72% of the height, so the caption and controls stay clear of his mouth. */}
      <div
        data-testid="call-avatar"
        className="call-avatar-fade absolute z-[2]"
        style={{
          width: "min(128cqw, 72cqh)",
          left: "50%",
          transform: "translateX(-50%)",
          top: "15%",
        }}
      >
        <AlphonsoAvatar {...avatar} kit={kit} className="aspect-square w-full" />
      </div>

      <div className="absolute left-[18px] right-[18px] top-[18px] z-[5] flex items-center gap-2.5">
        <div className="grid leading-tight" style={{ textShadow: textShadow(1, 6, 35) }}>
          <b
            className="flex items-center gap-1.5 ds-type-question-small"
            style={{ fontFamily: DISPLAY_FACE, fontWeight: 800 }}
          >
            {rehearsal ? rehearsal.title : kit.displayName}
            {rehearsal && <AiLabel />}
          </b>
          <span
            className="flex items-center gap-1.5 ds-type-footnote opacity-95"
            style={{ fontFamily: SANS_FACE }}
          >
            <i
              aria-hidden="true"
              data-testid="live-dot"
              data-live={speaking}
              className="size-2 rounded-full"
              style={{
                background: speaking
                  ? "var(--c-call-end)"
                  : "color-mix(in srgb, var(--c-on-hero) 60%, var(--c-call-glass))",
                boxShadow: speaking ? `0 0 0 3px ${tone("call-end", 25)}` : "none",
              }}
            />
            <span>
              {rehearsal
                ? `${kit.displayName} · Stage ${STAGES.indexOf(rehearsal.stage) + 1} of ${STAGES.length}: ${STAGE_LABELS[rehearsal.stage]}`
                : title}
            </span>
          </span>
          {rehearsal && (
            <span
              role="progressbar"
              aria-label="Rehearsal stage"
              aria-valuemin={1}
              aria-valuemax={STAGES.length}
              aria-valuenow={STAGES.indexOf(rehearsal.stage) + 1}
              className="mt-1.5 flex gap-1"
            >
              {STAGES.map((s, i) => (
                <i
                  key={s}
                  data-filled={i <= STAGES.indexOf(rehearsal.stage)}
                  className="h-1 flex-1 rounded-full"
                  style={{
                    background:
                      i <= STAGES.indexOf(rehearsal.stage)
                        ? "var(--c-on-hero)"
                        : "color-mix(in srgb, var(--c-on-hero) 30%, var(--c-call-glass))",
                  }}
                />
              ))}
            </span>
          )}
        </div>
        {onToggleTts && (
          <button
            type="button"
            onClick={onToggleTts}
            aria-pressed={ttsOn}
            aria-label={ttsOn ? "Mute voice" : "Unmute voice"}
            className="grid size-8 place-items-center rounded-full"
            style={{ background: GLASS }}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
              <path
                d="M4 10v4h4l5 4V6L8 10H4z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              {ttsOn ? (
                <path
                  d="M16 9c1.2 1 1.2 5 0 6M18.5 7c2.2 2 2.2 8 0 10"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M17 9l5 6M22 9l-5 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        )}
        <span
          data-testid="call-timer"
          className="ml-auto rounded-full px-2.5 py-[3px] ds-type-caption"
          style={{ background: GLASS, fontFamily: SANS_FACE, fontVariantNumeric: "tabular-nums" }}
        >
          {formatClock(seconds)}
        </span>
      </div>

      {handsFree && (
        <HandsFreeChip
          call={handsFree}
          className="absolute left-[18px] top-[64px] z-[5]"
          style={{
            background: handsFree.on ? tone("call-mint", 40) : GLASS,
            backdropFilter: "blur(10px)",
            border: `1px solid ${tone("on-hero", handsFree.on ? 40 : 18)}`,
            fontFamily: SANS_FACE,
          }}
        />
      )}
      {tapToHear && (
        <div
          className="absolute inset-x-[18px] z-[7] flex items-center justify-center gap-2"
          style={{ bottom: 212 + lift }}
        >
          <button
            type="button"
            data-testid="tap-to-hear"
            onClick={tapToHear.onTap}
            className="min-h-11 rounded-full px-5 text-sm font-bold"
            style={{ background: "var(--c-on-hero)", color: "var(--c-call-glass)" }}
          >
            Tap to hear {tapToHear.partner}
          </button>
          <button
            type="button"
            data-testid="tap-to-hear-skip"
            onClick={tapToHear.onSkip}
            className="min-h-11 rounded-full px-4 text-sm font-bold"
            style={{ background: GLASS_STRONG, backdropFilter: "blur(10px)" }}
          >
            Skip
          </button>
        </div>
      )}
      <div
        aria-hidden="true"
        data-testid="you-tile"
        data-live={recording}
        className="absolute right-[18px] top-[74px] z-[5] grid h-[116px] w-[86px] place-items-center content-center gap-2 rounded-2xl"
        style={{
          background: GLASS_STRONG,
          backdropFilter: "blur(10px)",
          border: `1px solid ${recording ? "var(--c-call-record)" : tone("on-hero", 18)}`,
          boxShadow: recording ? `0 0 0 2px ${tone("call-record", 45)}` : "none",
        }}
      >
        <div className="flex h-[34px] items-center gap-[3px]">
          {Array.from({ length: LEVEL_BARS }, (_, i) => (
            <i
              key={i}
              ref={(el) => {
                barRefs.current[i] = el;
              }}
              className="w-[5px] rounded-[3px] bg-white opacity-85"
              style={{ height: 6, transition: reducedMotion ? "none" : "height 90ms linear" }}
            />
          ))}
        </div>
        <span className="text-xs font-bold opacity-90">You</span>
      </div>

      {error && (
        <div
          role="alert"
          className="absolute left-[18px] right-[18px] z-[5] rounded-full bg-ds-wrong-tint px-3 py-1 text-center ds-type-caption text-ds-wrong-ink"
          style={{ bottom: 168 + lift, fontFamily: SANS_FACE, fontWeight: 500 }}
        >
          {error}
        </div>
      )}

      {extra && (
        <div
          className="absolute inset-x-[18px] z-[6] flex justify-center"
          style={{ bottom: 212 + lift }}
        >
          {extra}
        </div>
      )}
      <p
        ref={captionRef}
        aria-live="polite"
        data-testid="call-caption"
        data-mine={caption?.mine ?? false}
        className="absolute left-[18px] right-[18px] z-[5] grid min-h-[2.6em] items-end text-center ds-type-answer leading-[1.3]"
        style={{
          bottom: 140 + lift,
          textWrap: "balance",
          fontFamily: SANS_FACE,
          fontWeight: 800,
          textShadow: textShadow(1, 8, 55),
          color: caption?.mine ? "var(--c-call-mint)" : "var(--c-on-hero)",
        }}
      >
        {/* At most four lines on screen, so a long reply never climbs over his mouth. The whole text is still in
            the live region and in the conversation sheet. */}
        <span className="line-clamp-4">
          {words.map((w, i) => (
            <span key={`${caption?.text}-${i}`} data-w style={{ transition: "opacity .12s" }}>
              {w}{" "}
            </span>
          ))}
        </span>
      </p>
      <div
        data-testid="call-state"
        className="absolute left-1/2 z-[5] -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-[.04em]"
        style={{ background: GLASS, bottom: 112 + lift }}
      >
        {stateLabel}
      </div>
      {handsFree && (
        // Always mounted, so a pause is announced when its text appears (a region that appears with its text is
        // often skipped). The other states are not announced as they change.
        <p role="status" aria-live="polite" className="sr-only" data-testid="hands-free-announce">
          {handsFreeOn && handsFreePaused ? handsFreeLine : ""}
        </p>
      )}
      {handsFreeOn && handsFreeLine && (
        // A paused hands-free call is a safety stop: it gets the stronger glass and a pause mark, so it cannot be
        // missed over the picture, and it is announced. The other states are not announced as they change.
        <div
          data-testid="hands-free-status"
          data-paused={handsFreePaused}
          className="absolute inset-x-[18px] z-[5] mx-auto flex w-fit max-w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-center text-xs font-bold"
          style={{ bottom: 106, background: handsFreePaused ? GLASS_STRONG : GLASS }}
        >
          {handsFreePaused && (
            <svg
              viewBox="0 0 24 24"
              className="size-3 shrink-0"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          )}
          <span>{handsFreeLine}</span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-[26px] z-[6] flex items-center justify-center gap-[26px]">
        <button
          ref={chatRef}
          type="button"
          aria-label="Show the conversation"
          onClick={() => setSheetOpen(true)}
          className="grid size-[54px] place-items-center rounded-full"
          style={{ background: GLASS_STRONG, backdropFilter: "blur(10px)" }}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
        </button>
        {handsFreeOn && handsFree ? (
          // Hands-free has no button to hold: one Pause or Resume button takes its place.
          <button
            type="button"
            aria-label={handsFreePaused ? HANDS_FREE_RESUME : HANDS_FREE_PAUSE}
            onClick={handsFree.onTogglePause}
            className="grid size-[78px] place-items-center rounded-full"
            style={talkButtonStyle(false)}
          >
            <svg viewBox="0 0 24 24" className="size-[30px]" fill="currentColor" aria-hidden="true">
              {handsFreePaused ? (
                <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" />
              ) : (
                <>
                  <rect x="6" y="4.5" width="4.2" height="15" rx="1.2" />
                  <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" />
                </>
              )}
            </svg>
          </button>
        ) : (
          <button
            type="button"
            aria-label="Hold to talk"
            aria-pressed={recording}
            disabled={talkDisabled}
            onPointerDown={(e) => {
              e.preventDefault();
              onHoldStart();
            }}
            onPointerUp={onHoldEnd}
            onPointerCancel={onHoldEnd}
            onPointerLeave={onHoldEnd}
            onContextMenu={(e) => e.preventDefault()}
            // Keyboard and screen-reader activations arrive as a click with no pointer (detail 0): they toggle.
            onClick={(e) => {
              if (e.detail === 0) onToggle();
            }}
            className="grid size-[78px] place-items-center rounded-full disabled:opacity-55"
            style={{
              ...talkButtonStyle(recording),
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-[30px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        {onEnd ? (
          <button
            type="button"
            onClick={() => {
              playSfx("callEnd");
              onEnd();
            }}
            aria-label="End the call"
            className="grid size-[54px] place-items-center rounded-full"
            style={HANG_UP}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 15.5c5-4.7 13-4.7 18 0l-2.4 2.4-3.2-1.3v-2.5a12 12 0 0 0-6.8 0v2.5l-3.2 1.3z" />
            </svg>
          </button>
        ) : (
          <Link
            to={endTo}
            onClick={() => playSfx("callEnd")}
            aria-label="End the call"
            className="grid size-[54px] place-items-center rounded-full"
            style={HANG_UP}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 15.5c5-4.7 13-4.7 18 0l-2.4 2.4-3.2-1.3v-2.5a12 12 0 0 0-6.8 0v2.5l-3.2 1.3z" />
            </svg>
          </Link>
        )}
      </div>
      {!handsFreeOn && (
        <div
          className="absolute inset-x-0 bottom-2 z-[6] text-center ds-type-caption opacity-85"
          style={{ fontFamily: SANS_FACE, fontWeight: 700 }}
          aria-hidden="true"
        >
          Hold the white button and answer out loud
        </div>
      )}

      {/* The conversation as text for assistive technology while the sheet is closed. */}
      <ul className="sr-only" aria-label="Conversation so far" hidden={sheetOpen}>
        {messages.map((m, i) => (
          <li key={i}>
            {m.role === "assistant" ? `${kit.displayName}: ` : "You: "}
            {m.content}
          </li>
        ))}
      </ul>

      <div
        role="dialog"
        aria-label="Conversation"
        aria-modal="true"
        data-testid="call-sheet"
        data-open={sheetOpen}
        className="absolute inset-x-0 bottom-0 z-[8] flex max-h-[78%] flex-col rounded-t-3xl bg-surface px-[18px] pb-6 pt-2.5 text-ink"
        style={{
          transform: sheetOpen ? "translateY(0)" : "translateY(105%)",
          visibility: sheetOpen ? "visible" : "hidden",
          transition: reducedMotion ? "none" : "transform .28s ease, visibility .28s",
          boxShadow: "var(--ds-shadow-sheet)",
        }}
      >
        <div aria-hidden="true" className="mx-auto mb-2 h-[5px] w-10 rounded-[3px] bg-hairline" />
        <header className="mb-2 flex items-center justify-between">
          <h2 className="ds-type-headline" style={{ fontFamily: DISPLAY_FACE, fontWeight: 600 }}>
            Conversation
          </h2>
          <button
            ref={backRef}
            type="button"
            onClick={closeSheet}
            className="min-h-9 rounded-[10px] border border-hairline px-3 text-sm font-bold"
          >
            Back to call
          </button>
        </header>
        {handsFree && <HandsFreeSwitch call={handsFree} />}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{sheet}</div>
      </div>
    </div>
  );
}
