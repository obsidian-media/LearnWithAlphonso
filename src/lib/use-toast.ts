import { useCallback, useEffect, useRef, useState } from "react";

/** A toast message that clears itself after `ms` (a newer message restarts the clock). */
export function useToast(ms = 3200): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const show = useCallback(
    (next: string) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setMessage(next);
      timer.current = window.setTimeout(() => setMessage(null), ms);
    },
    [ms],
  );
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return [message, show];
}
