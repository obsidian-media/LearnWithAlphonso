import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { AlphonsoAvatar } from "./AlphonsoAvatar";
import type { AvatarMode } from "@/lib/avatar/machine";
import { EVENING_OVERLAY, sceneArt } from "@/lib/avatar/scenes";
import { LEVEL_BARS, useMicLevel } from "@/lib/avatar/use-mic-level";

const GLASS = "rgba(18, 26, 21, 0.46)";
const GLASS_STRONG = "rgba(18, 26, 21, 0.62)";

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
  scenarioId: string;
  dark: boolean;
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
  ttsOn: boolean;
  onToggleTts: () => void;
  error: string | null;
  /** The screen the red hang-up button leads to. */
  endTo: string;
  /** The conversation so far, as plain text for assistive technology while the sheet is closed. */
  messages: { role: "user" | "assistant"; content: string }[];
  /** The full conversation, its hints and the typed-message box: shown in the bottom sheet. */
  sheet: ReactNode;
  reducedMotion: boolean;
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
    scenarioId,
    dark,
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
    messages,
    sheet,
    reducedMotion,
  } = props;
  const speaking = mode === "speaking";
  const stateLabel = MODE_LABEL[mode];
  const art = sceneArt(scenarioId);
  const room = dark ? art.dark : art.light;

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
        backgroundColor: dark ? "#1c2433" : "#efe3d2",
        backgroundImage: `url(${room})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        containerType: "size",
        color: "#fff",
      }}
    >
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
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,.28), transparent 18%, transparent 55%, rgba(0,0,0,.5) 100%)",
        }}
      />

      {/* Alphonso: the square kit scaled past the screen width so head and shoulders fill the frame. On a short
          screen the square is held to 72% of the height, so the caption and controls stay clear of his mouth. */}
      <div
        className="absolute z-[2]"
        style={{
          width: "min(128cqw, 72cqh)",
          left: "50%",
          transform: "translateX(-50%)",
          top: "15%",
        }}
      >
        <AlphonsoAvatar {...avatar} className="aspect-square w-full" />
      </div>

      <div className="absolute left-[18px] right-[18px] top-[18px] z-[5] flex items-center gap-2.5">
        <div className="grid leading-tight" style={{ textShadow: "0 1px 6px rgba(0,0,0,.35)" }}>
          <b className="font-display text-[19px] font-extrabold">Alphonso</b>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold opacity-95">
            <i
              aria-hidden="true"
              data-testid="live-dot"
              data-live={speaking}
              className="size-2 rounded-full"
              style={{
                background: speaking ? "#ff5a4f" : "#9aa39d",
                boxShadow: speaking ? "0 0 0 3px rgba(255,90,79,.25)" : "none",
              }}
            />
            <span>{title}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleTts}
          aria-pressed={ttsOn}
          aria-label={ttsOn ? "Mute voice" : "Unmute voice"}
          className="ml-auto grid size-8 place-items-center rounded-full"
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
        <span
          data-testid="call-timer"
          className="rounded-full px-2.5 py-[3px] text-[13px] font-bold"
          style={{ background: GLASS, fontVariantNumeric: "tabular-nums" }}
        >
          {formatClock(seconds)}
        </span>
      </div>

      <div
        aria-hidden="true"
        data-testid="you-tile"
        data-live={recording}
        className="absolute right-[18px] top-[74px] z-[5] grid h-[116px] w-[86px] place-items-center content-center gap-2 rounded-2xl"
        style={{
          background: GLASS_STRONG,
          backdropFilter: "blur(10px)",
          border: `1px solid ${recording ? "#6fe0a5" : "rgba(255,255,255,.18)"}`,
          boxShadow: recording ? "0 0 0 2px rgba(111,224,165,.45)" : "none",
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
          className="absolute left-[18px] right-[18px] z-[5] rounded-full bg-rose-50 px-3 py-1 text-center text-[11px] font-medium text-rose-700"
          style={{ bottom: 168 }}
        >
          {error}
        </div>
      )}

      <p
        ref={captionRef}
        aria-live="polite"
        data-testid="call-caption"
        data-mine={caption?.mine ?? false}
        className="absolute left-[18px] right-[18px] z-[5] grid min-h-[2.6em] items-end text-center text-[19px] font-extrabold leading-[1.3]"
        style={{
          bottom: 140,
          textWrap: "balance",
          textShadow: "0 1px 8px rgba(0,0,0,.55)",
          color: caption?.mine ? "#c9f5dc" : "#fff",
        }}
      >
        <span>
          {words.map((w, i) => (
            <span key={`${caption?.text}-${i}`} data-w style={{ transition: "opacity .12s" }}>
              {w}{" "}
            </span>
          ))}
        </span>
      </p>
      <div
        data-testid="call-state"
        className="absolute bottom-[112px] left-1/2 z-[5] -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-[.04em]"
        style={{ background: GLASS }}
      >
        {stateLabel}
      </div>

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
            background: recording ? "#6fe0a5" : "#fff",
            color: "#17241c",
            boxShadow: recording
              ? "0 0 0 9px rgba(111,224,165,.35)"
              : "0 0 0 5px rgba(255,255,255,.3)",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            transform: recording ? "scale(.96)" : "none",
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
        <Link
          to={endTo}
          aria-label="End the call"
          className="grid size-[54px] place-items-center rounded-full"
          style={{ background: "#e5483d", color: "#fff" }}
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
      </div>
      <div
        className="absolute inset-x-0 bottom-2 z-[6] text-center text-[11px] font-bold opacity-85"
        aria-hidden="true"
      >
        Hold the white button and answer out loud
      </div>

      {/* The conversation as text for assistive technology while the sheet is closed. */}
      <ul className="sr-only" aria-label="Conversation so far" hidden={sheetOpen}>
        {messages.map((m, i) => (
          <li key={i}>
            {m.role === "assistant" ? "Alphonso: " : "You: "}
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
          boxShadow: "0 -10px 30px rgba(0,0,0,.25)",
        }}
      >
        <div aria-hidden="true" className="mx-auto mb-2 h-[5px] w-10 rounded-[3px] bg-hairline" />
        <header className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-[18px] font-semibold">Conversation</h3>
          <button
            ref={backRef}
            type="button"
            onClick={closeSheet}
            className="min-h-9 rounded-[10px] border border-hairline px-3 text-sm font-bold"
          >
            Back to call
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{sheet}</div>
      </div>
    </div>
  );
}
