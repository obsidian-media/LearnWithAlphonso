import { useEffect, useRef, type ReactNode } from "react";
import { sceneSrc, type Clip, type Scene } from "@/lib/scenes";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { LoopingClip } from "./LoopingClip";

/** How much of the scroll the scene follows, and the furthest it moves (px). */
const DRIFT = 0.25;
const MAX_DRIFT = 160;
/** The pin is fully gone after this much scroll (px), before any card can slide across it. */
const PIN_FADE = 60;

/** Something drawn on the clip itself, at a spot in the clip's own frame (percent of its width and height). */
export type ScenePin = { x: number; y: number; node: ReactNode };

/** The parallax layer: taller than the screen by the furthest drift, and a size container for the clip frame. */
const LAYER =
  "absolute inset-x-0 top-0 h-[calc(100%+160px)] overflow-hidden will-change-transform [container-type:size]";
/** The clip's own 9:16 frame, sized like object-fit: cover; placed like object-position by `frameStyle`. */
const FRAME = "absolute aspect-[9/16] h-[max(100cqh,calc(100cqw*16/9))]";

/**
 * A rendered scene behind a whole screen, fixed to the app column, with a theme-aware readability scrim
 * (`.scene-scrim` in styles.css). It drifts at a quarter of the scroll for depth, a bounded distance, and stays
 * still under Reduce Motion. Decorative: content above it sits on its own surfaces.
 *
 * With `clip`, the scene is a looping video of the whole scene with its character in it, framed like a cover
 * image. `pin` draws something (a speech bubble) at a spot in the clip's frame, so it stays on the character at
 * any screen size. The pin sits in its own layer above the scrim (it keeps its own contrast), moves with the
 * clip, and fades out within the first 60 px of scroll, so cards never slide across its words.
 */
export function SceneBackdrop({
  scene,
  focus = "50% 100%",
  clip,
  pin,
}: {
  scene: Scene;
  focus?: string;
  clip?: Clip;
  pin?: ScenePin;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const pinLayer = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    let pending = false;
    let frame = 0;
    const apply = () => {
      pending = false;
      const y = window.scrollY;
      if (!reduce) {
        const t = `translate3d(0, ${-Math.round(Math.min(y * DRIFT, MAX_DRIFT))}px, 0)`;
        if (layer.current) layer.current.style.transform = t;
        if (pinLayer.current) pinLayer.current.style.transform = t;
      }
      // Fading is not motion: the bubble leaves the way under Reduce Motion too.
      if (pinLayer.current) {
        pinLayer.current.style.opacity = String(
          Math.max(0, Math.round((1 - y / PIN_FADE) * 100) / 100),
        );
      }
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reduce]);

  const [fx = "50%", fy = "100%"] = focus.split(" ");
  const frameStyle = { left: fx, top: fy, transform: `translate(-${fx}, -${fy})` };

  return (
    <div
      aria-hidden="true"
      data-scene={scene}
      className="pointer-events-none fixed inset-y-0 left-1/2 z-0 w-full max-w-[430px] -translate-x-1/2 overflow-hidden"
    >
      <div ref={layer} data-parallax className={LAYER}>
        {clip ? (
          <div data-clip-frame className={FRAME} style={frameStyle}>
            <LoopingClip clip={clip} className="absolute inset-0 h-full w-full" />
          </div>
        ) : (
          <img
            src={sceneSrc(scene)}
            alt=""
            decoding="async"
            style={{ objectPosition: focus }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div className="scene-scrim absolute inset-0" />
      {clip && pin && (
        <div ref={pinLayer} data-pin-layer className={LAYER}>
          <div className={FRAME} style={frameStyle}>
            <div
              data-pin
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            >
              {pin.node}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
