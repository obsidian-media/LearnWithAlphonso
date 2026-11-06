import { useEffect, useRef, useState } from "react";
import type { Course } from "@/data/courses";
import {
  AVATAR_BASE_PATH,
  BASE_FILE,
  BROWS_RECT,
  BROWS_STATES,
  EAR_RECTS,
  GLINT_MASK_FILE,
  GLINT_RECT,
  MOUTH_RECT,
  MOUTH_SHAPES,
  browsFile,
  earFile,
  mouthFile,
  type LayerRect,
} from "@/lib/avatar/layers";
import { IdleScheduler, breathScale, seededRandom, swayDegrees } from "@/lib/avatar/idle";
import { lipSyncPlan, type LipSyncPlan } from "@/lib/avatar/lipsync";
import {
  AvatarMachine,
  type AvatarMode,
  type ReplyVerdict,
  type SpeechPosition,
  type VoicePhase,
} from "@/lib/avatar/machine";

/** The verdict that came with the latest reply, numbered so one reply is reacted to once however often we render. */
export type AvatarReplyVerdict = { serial: number; verdict: ReplyVerdict };

const src = (file: string) => `${AVATAR_BASE_PATH}/${file}`;
const pct = (v: number) => `${v * 100}%`;
const place = (r: LayerRect) => ({
  left: pct(r.x),
  top: pct(r.y),
  width: pct(r.w),
  height: pct(r.h),
});

/** Seconds on a monotonic clock, from the page's start. */
const clock = () => performance.now() / 1000;

/**
 * The glint mask is white where the lenses are. CSS wants alpha, so the luminance is turned into alpha once, in an
 * offscreen canvas, and handed to the browser as a blob: URL (img-src allows 'self', data: and blob:). Resolves to
 * null where OffscreenCanvas is missing: he simply has no glint there.
 */
async function glintMaskUrl(): Promise<string | null> {
  if (typeof OffscreenCanvas === "undefined" || typeof Image === "undefined") return null;
  const image = new Image();
  image.src = src(GLINT_MASK_FILE);
  await image.decode();
  const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const luminance =
      (0.2126 * data.data[i] + 0.7152 * data.data[i + 1] + 0.0722 * data.data[i + 2]) / 255;
    data.data[i + 3] = Math.round(luminance * (data.data[i + 3] / 255) * 255);
    data.data[i] = data.data[i + 1] = data.data[i + 2] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
}

type Props = {
  phase: VoicePhase;
  /** The words being spoken (or about to be). */
  replyText: string | null;
  /** The element playing the reply; its currentTime drives the lips. Read every frame. */
  getAudio: () => HTMLAudioElement | null;
  replyVerdict: AvatarReplyVerdict;
  course: Course;
  /** The visitor prefers reduced motion: breathing, sway, ears and glint stop; mouth and brows still change. */
  reducedMotion: boolean;
  /** Called when the avatar's mode changes (idle, listening, thinking, speaking, a reaction): drives the state pill. */
  onModeChange?: (mode: AvatarMode) => void;
  /** Size and place the stage. The layout is the caller's: the stage fills a square of whatever size it is given. */
  className?: string;
};

/**
 * The talking 2D Alphonso at the top of the Practice speaking screen, "on a video call". The logic (mouth shapes,
 * timing, state, idle life) is src/lib/avatar, a port of the iOS Kit; this component only draws it.
 *
 * Decorative: hidden from assistive technology (the transcript bubbles are the accessible captions), never takes a
 * pointer, and nothing here waits on or blocks the voice flow. The reply's voice never moves his head: only the
 * mouth and brows change.
 */
export function AlphonsoAvatar({
  phase,
  replyText,
  getAudio,
  replyVerdict,
  course,
  reducedMotion,
  onModeChange,
  className = "mx-auto aspect-square h-[clamp(88px,20dvh,170px)]",
}: Props) {
  const live = useRef({
    phase,
    replyText,
    getAudio,
    replyVerdict,
    course,
    reducedMotion,
    onModeChange,
  });
  useEffect(() => {
    live.current = {
      phase,
      replyText,
      getAudio,
      replyVerdict,
      course,
      reducedMotion,
      onModeChange,
    };
  });

  const body = useRef<HTMLDivElement>(null);
  const layers = useRef(new Map<string, HTMLImageElement>());
  const glint = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    glintMaskUrl()
      .then((made) => {
        if (cancelled && made) URL.revokeObjectURL(made);
        else {
          url = made;
          setMaskUrl(made);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    const machine = new AvatarMachine();
    const idle = new IdleScheduler(seededRandom(BigInt(Math.floor(Math.random() * 2 ** 31))));
    // A verdict that was already there when the stage appeared belongs to a turn that is over.
    let handledSerial = live.current.replyVerdict.serial;
    let plan: { key: string; plan: LipSyncPlan } | null = null;
    const applied = new Map<string, string>();
    const show = (file: string, on: boolean) => {
      const el = layers.current.get(file);
      if (!el) return;
      const value = on ? "1" : "0";
      if (applied.get(file) === value) return;
      applied.set(file, value);
      el.style.opacity = value;
    };
    let raf = 0;
    let last = 0;
    let lastMode: AvatarMode = "idle";

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = clock();
      if (t - last < 1 / 30 - 0.002) return;
      last = t;
      const now = live.current;
      if (now.replyVerdict.serial !== handledSerial) {
        handledSerial = now.replyVerdict.serial;
        // He reacts once the reply has been spoken; the machine holds the reaction until then.
        machine.replyArrived(now.replyVerdict.verdict);
      }
      machine.update(now.phase, t);
      if (machine.mode !== lastMode) {
        lastMode = machine.mode;
        now.onModeChange?.(lastMode);
      }

      let speech: SpeechPosition | null = null;
      if (now.phase.kind === "speaking" && now.replyText) {
        const audio = now.getAudio();
        const duration = audio?.duration ?? NaN;
        if (audio && Number.isFinite(duration) && duration > 0) {
          const key = `${duration}|${now.replyText}`;
          if (plan?.key !== key)
            plan = { key, plan: lipSyncPlan(now.replyText, now.course, duration) };
          speech = { plan: plan.plan, time: audio.currentTime };
        }
      }
      const pose = machine.pose(t, speech);
      for (const shape of MOUTH_SHAPES) show(mouthFile(shape)!, pose.mouth === shape);
      for (const brows of BROWS_STATES) show(browsFile(brows), pose.brows === brows);

      // Reduced motion stills the body (breathing, sway, ears, glint). Mouth and brows still change: they carry
      // what he is doing.
      const still = now.reducedMotion;
      if (!still) idle.advance(t);
      for (const side of ["left", "right"] as const) {
        const twitching = !still && idle.twitchingEar === side;
        show(earFile(side, true), twitching);
        show(earFile(side, false), !twitching);
      }
      if (body.current) {
        const scale = still ? { x: 1, y: 1 } : breathScale(t);
        const sway = still ? 0 : swayDegrees(t);
        body.current.style.transform = `rotate(${sway}deg) scale(${scale.x}, ${scale.y})`;
      }
      if (glint.current && band.current) {
        const progress = still ? null : idle.glintProgress;
        glint.current.style.visibility = progress === null ? "hidden" : "visible";
        if (progress !== null)
          band.current.style.transform = `translateX(${(progress - 0.5) * 400}%) rotate(20deg)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const layer = (file: string, rect: LayerRect | null, initial: "0" | "1") => (
    <img
      key={file}
      ref={(el) => {
        if (el) layers.current.set(file, el);
        else layers.current.delete(file);
      }}
      src={src(file)}
      alt=""
      draggable={false}
      decoding="async"
      style={{
        position: "absolute",
        ...(rect ? place(rect) : { left: 0, top: 0, width: "100%", height: "100%" }),
        opacity: initial,
        transition: file.startsWith("brows-")
          ? "opacity 140ms ease"
          : file.startsWith("ear-")
            ? "opacity 50ms linear"
            : "opacity 55ms linear",
        maxWidth: "none",
        userSelect: "none",
      }}
    />
  );

  return (
    <div
      data-testid="alphonso-stage"
      aria-hidden="true"
      className={`pointer-events-none relative select-none ${className}`}
    >
      <div ref={body} style={{ position: "absolute", inset: 0, transformOrigin: "50% 100%" }}>
        <img
          src={src(BASE_FILE)}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            maxWidth: "none",
          }}
        />
        {layer(earFile("left", false), EAR_RECTS.left, "1")}
        {layer(earFile("left", true), EAR_RECTS.left, "0")}
        {layer(earFile("right", false), EAR_RECTS.right, "1")}
        {layer(earFile("right", true), EAR_RECTS.right, "0")}
        {MOUTH_SHAPES.map((shape) => layer(mouthFile(shape)!, MOUTH_RECT, "0"))}
        {BROWS_STATES.map((brows) =>
          layer(browsFile(brows), BROWS_RECT, brows === "neutral" ? "1" : "0"),
        )}
        {maskUrl && (
          <div
            ref={glint}
            style={{
              position: "absolute",
              ...place(GLINT_RECT),
              overflow: "hidden",
              visibility: "hidden",
              WebkitMaskImage: `url(${maskUrl})`,
              maskImage: `url(${maskUrl})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
            }}
          >
            <div
              ref={band}
              style={{
                position: "absolute",
                top: "-70%",
                left: "30%",
                width: "40%",
                height: "240%",
                transform: "rotate(20deg)",
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.65), rgba(255,255,255,0))",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
