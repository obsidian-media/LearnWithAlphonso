import { useEffect, useRef, type ReactNode } from "react";
import { clipPoster, clipSrc, sceneSrc, type Clip, type Scene } from "@/lib/scenes";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/** How much of the scroll the scene follows, and the furthest it moves (px). */
const DRIFT = 0.25;
const MAX_DRIFT = 160;

/** Something drawn on the clip itself, at a spot in the clip's own frame (percent of its width and height). */
export type ScenePin = { x: number; y: number; node: ReactNode };

/**
 * A rendered scene behind a whole screen, fixed to the app column, with a theme-aware readability scrim
 * (`.scene-scrim` in styles.css). It drifts at a quarter of the scroll for depth, a bounded distance, and stays
 * still under Reduce Motion. Decorative: content above it sits on its own surfaces.
 *
 * With `clip`, the scene is a looping video of the whole scene with its character in it, framed like a cover
 * image; under Reduce Motion its first frame stands still. `pin` draws something (a speech bubble) at a spot in
 * the clip's frame, so it stays on the character whatever the screen size.
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
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    if (reduce) return;
    let pending = false;
    let frame = 0;
    const apply = () => {
      pending = false;
      const y = Math.min(window.scrollY * DRIFT, MAX_DRIFT);
      if (layer.current) layer.current.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
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

  return (
    <div
      aria-hidden="true"
      data-scene={scene}
      className="pointer-events-none fixed inset-y-0 left-1/2 z-0 w-full max-w-[430px] -translate-x-1/2 overflow-hidden"
    >
      <div
        ref={layer}
        data-parallax
        className="absolute inset-x-0 top-0 h-[calc(100%+160px)] overflow-hidden will-change-transform [container-type:size]"
      >
        {clip ? (
          // The clip's own 9:16 frame, sized like object-fit: cover and placed like object-position, so a pin
          // in its percent coordinates lands on the same spot of the picture at any screen size.
          <div
            data-clip-frame
            className="absolute aspect-[9/16] h-[max(100cqh,calc(100cqw*16/9))]"
            style={{ left: fx, top: fy, transform: `translate(-${fx}, -${fy})` }}
          >
            {reduce ? (
              <img
                src={clipPoster(clip)}
                alt=""
                decoding="async"
                className="absolute inset-0 h-full w-full"
              />
            ) : (
              <video
                src={clipSrc(clip)}
                poster={clipPoster(clip)}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full"
              />
            )}
            {pin && (
              <div
                data-pin
                className="absolute -translate-x-1/2 -translate-y-full"
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              >
                {pin.node}
              </div>
            )}
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
    </div>
  );
}
