import { useEffect, useRef, useState } from "react";
import { isRenderableVocabImageUrl } from "../lib/vocab-images/url-policy";

type Phase = "loading" | "loaded" | "failed";

/**
 * The one way the web app shows a vocab image (App Store review fix, 2026-10).
 * - Neutral placeholder only while loading.
 * - On failure the WHOLE slot collapses: no blank box, no broken-image icon.
 * - Only self-hosted bucket URLs ever render (url-policy.ts).
 * - Failure state is keyed by URL, so a new image gets a fresh chance.
 * - The effect catches an image that failed before hydration attached onError.
 */
export function VocabImage({
  url,
  alt,
  className = "",
}: {
  url: string;
  alt: string;
  className?: string;
}) {
  const [state, setState] = useState<{ url: string; phase: Phase }>({ url, phase: "loading" });
  const imgRef = useRef<HTMLImageElement>(null);
  const phase: Phase = state.url === url ? state.phase : "loading";

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete) setState({ url, phase: img.naturalWidth > 0 ? "loaded" : "failed" });
  }, [url]);

  if (!isRenderableVocabImageUrl(url) || phase === "failed") return null;
  return (
    <div
      data-testid="vocab-image"
      data-phase={phase}
      className={`overflow-hidden ${phase === "loading" ? "bg-parchment" : ""} ${className}`.trim()}
    >
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        loading="lazy"
        className={`h-full w-full object-cover transition-opacity ${phase === "loaded" ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setState({ url, phase: "loaded" })}
        onError={() => setState({ url, phase: "failed" })}
      />
    </div>
  );
}
