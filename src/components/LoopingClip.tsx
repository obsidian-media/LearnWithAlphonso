import { useEffect, useRef, useState, type CSSProperties } from "react";
import { clipPoster, clipSrc, type Clip } from "@/lib/scenes";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * A scene clip playing silently on a loop. Its first frame stands still instead under Reduce Motion, and when the
 * browser refuses to autoplay (iOS Low Power Mode), so a learner never sees a stuck play button. Decorative: the
 * caller names the picture for screen readers.
 */
export function LoopingClip({
  clip,
  className = "",
  style,
}: {
  clip: Clip;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = usePrefersReducedMotion();
  const [blocked, setBlocked] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const started = video.current?.play?.();
    if (started && typeof started.catch === "function") started.catch(() => setBlocked(true));
  }, []);

  if (reduce || blocked) {
    return (
      <img src={clipPoster(clip)} alt="" decoding="async" className={className} style={style} />
    );
  }
  return (
    <video
      ref={video}
      src={clipSrc(clip)}
      poster={clipPoster(clip)}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      className={`scene-clip ${className}`}
      style={style}
    />
  );
}
