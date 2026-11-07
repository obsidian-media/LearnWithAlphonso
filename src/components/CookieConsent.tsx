import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTheme } from "../lib/theme";
import { promoteAttribution } from "../lib/signup-attribution";

const KEY = "lingua.cookie-consent.v1";

export type ConsentValue = "essential" | "all";

export function getConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "essential" || v === "all" ? v : null;
}

export function CookieConsent() {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // The apps' bot-check page (/native-captcha) is a few pixels inside the app's own screen: no banner there.
    if (window.location.pathname.startsWith("/native-captcha")) return;
    if (getConsent() === null) setOpen(true);
  }, []);

  function choose(value: ConsentValue) {
    window.localStorage.setItem(KEY, value);
    // "Accept all" keeps the campaign tags seen so far; "Essential only" discards them.
    promoteAttribution({
      consent: value,
      local: window.localStorage,
      session: window.sessionStorage,
    });
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4"
    >
      <div
        className={
          isStudioInk
            ? "mx-auto max-w-[430px] border-t border-hairline bg-surface p-4"
            : "mx-auto max-w-[430px] rounded-2xl border border-ds-line bg-ds-card p-4 shadow-lg"
        }
      >
        <p className="text-[13px] leading-relaxed text-ds-ink-soft">
          We use essential storage to keep you signed in and remember your progress. Optional
          analytics storage helps us improve lessons. You choose.{" "}
          <Link to="/cookies" className="underline hover:text-ink">
            Cookie Policy
          </Link>
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => choose("essential")}
            className="flex-1 rounded-full border border-ds-line bg-ds-sunk px-3 py-2.5 text-sm font-medium text-ds-ink"
          >
            Essential only
          </button>
          <button
            onClick={() => choose("all")}
            className="flex-1 rounded-full bg-ds-ink px-3 py-2.5 text-sm font-semibold text-ds-card"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
