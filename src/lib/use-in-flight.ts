import { useMemo, useRef } from "react";

export type InFlightGuard = {
  /** True when nothing is in flight (and marks it started); false when a call is already running. */
  begin(): boolean;
  end(): void;
};

/**
 * A synchronous in-flight guard for a button's async handler. A `busy` state set by the first click is not visible to
 * a second click handled before React re-renders (both read the same render's closure), so a state check alone can
 * send the request twice. A ref is read and written at once. Keep the state too, for the disabled look and the label.
 */
export function useInFlight(): InFlightGuard {
  const ref = useRef(false);
  return useMemo(
    () => ({
      begin() {
        if (ref.current) return false;
        ref.current = true;
        return true;
      },
      end() {
        ref.current = false;
      },
    }),
    [],
  );
}
