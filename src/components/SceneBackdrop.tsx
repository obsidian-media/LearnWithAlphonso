import { useEffect, useRef } from "react";
import { sceneSrc, type Scene } from "@/lib/scenes";

/** How much of the scroll the scene follows, and the furthest it moves (px). */
const DRIFT = 0.25;
const MAX_DRIFT = 160;

/**
 * A rendered scene behind a whole screen, fixed to the app column, with a theme-aware readability scrim
 * (`.scene-scrim` in styles.css). It drifts at a quarter of the scroll for depth, a bounded distance, and stays
 * still under Reduce Motion. Decorative: content above it sits on its own surfaces.
 */
export function SceneBackdrop({ scene, focus = "50% 100%" }: { scene: Scene; focus?: string }) {
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let pending = false;
    let frame = 0;
    const apply = () => {
      pending = false;
      const y = Math.min(window.scrollY * DRIFT, MAX_DRIFT);
      if (img.current) img.current.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
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
  }, []);

  return (
    <div
      aria-hidden="true"
      data-scene={scene}
      className="pointer-events-none fixed inset-y-0 left-1/2 z-0 w-full max-w-[430px] -translate-x-1/2 overflow-hidden"
    >
      <img
        ref={img}
        src={sceneSrc(scene)}
        alt=""
        decoding="async"
        style={{ objectPosition: focus }}
        className="absolute inset-x-0 top-0 h-[calc(100%+160px)] w-full object-cover will-change-transform"
      />
      <div className="scene-scrim absolute inset-0" />
    </div>
  );
}
