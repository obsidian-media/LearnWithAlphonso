import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { turnstileSiteKey } from "@/lib/turnstile";

/**
 * The bot check on email sign-in for the iOS and Android apps. They show this page in a small web view on their
 * email forms (Cloudflare Turnstile only runs in a web page) and send its token with their email requests, exactly as
 * the website's own forms do.
 *
 * Messages to the app (iOS: the `alphonsoCaptcha` script message handler; Android: the `AlphonsoCaptcha` JavaScript
 * interface's `post`), each a JSON object:
 *   { type: "token", token }   a fresh single-use token
 *   { type: "expired" }        the last token can no longer be used; wait for the next one
 *   { type: "unavailable" }    no site key is configured, or Turnstile cannot load: send requests without a token
 * The app calls `window.alphonsoCaptchaReset()` after spending a token, which renders a new widget.
 */
export const Route = createFileRoute("/native-captcha")({
  component: NativeCaptcha,
  head: () => ({
    meta: [{ title: "Alphonso" }, { name: "robots", content: "noindex" }],
  }),
});

type NativeCaptchaMessage =
  { type: "token"; token: string } | { type: "expired" } | { type: "unavailable" };

type NativeBridges = {
  webkit?: { messageHandlers?: { alphonsoCaptcha?: { postMessage: (m: unknown) => void } } };
  AlphonsoCaptcha?: { post?: (json: string) => void };
  alphonsoCaptchaReset?: () => void;
};

function postToApp(message: NativeCaptchaMessage): void {
  const w = window as unknown as NativeBridges;
  try {
    w.webkit?.messageHandlers?.alphonsoCaptcha?.postMessage(message);
  } catch {
    /* not inside the iOS app */
  }
  try {
    w.AlphonsoCaptcha?.post?.(JSON.stringify(message));
  } catch {
    /* not inside the Android app */
  }
}

function NativeCaptcha() {
  const siteKey = turnstileSiteKey();
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const w = window as unknown as NativeBridges;
    w.alphonsoCaptchaReset = () => setResetKey((k) => k + 1);
    if (!siteKey) postToApp({ type: "unavailable" });
    return () => {
      delete w.alphonsoCaptchaReset;
    };
  }, [siteKey]);

  // "expired" only when a token this page handed over can no longer be used. The widget also reports "no token" as it
  // starts (and on a challenge error, which it retries); passing that on would tell the app the page has answered,
  // and then a check that never loads would hold the email form forever instead of falling back after its timeout.
  const handedOver = useRef(false);
  const onToken = useCallback((token: string | null) => {
    if (token) {
      handedOver.current = true;
      postToApp({ type: "token", token });
    } else if (handedOver.current) {
      handedOver.current = false;
      postToApp({ type: "expired" });
    }
  }, []);
  // Turnstile itself cannot load: email requests go without a token, as they do with no bot check configured.
  const onLoadFailed = useCallback(() => postToApp({ type: "unavailable" }), []);

  if (!siteKey) return null;
  return (
    <main className="flex min-h-[70px] items-center justify-center bg-transparent">
      <TurnstileWidget
        siteKey={siteKey}
        onToken={onToken}
        resetKey={resetKey}
        onLoadFailed={onLoadFailed}
      />
    </main>
  );
}
