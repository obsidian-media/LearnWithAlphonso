import { useEffect, useRef } from "react";
import { TURNSTILE_SCRIPT } from "@/lib/turnstile";

type Turnstile = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
};

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  const w = window as unknown as { turnstile?: Turnstile };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * One Turnstile widget. Hands each new token to `onToken`, and null when it expires or fails, so the form can wait
 * for a fresh one. Changing `resetKey` renders a new widget (a token is single-use, so each attempt needs its own).
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  resetKey,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  resetKey: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let turnstile: Turnstile | undefined;
    let cancelled = false;
    onToken(null);
    loadTurnstile()
      .then((t) => {
        if (cancelled || !ref.current) return;
        turnstile = t;
        id = t.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      cancelled = true;
      if (turnstile && id) turnstile.remove(id);
    };
  }, [siteKey, onToken, resetKey]);
  return <div ref={ref} className="flex justify-center" />;
}
