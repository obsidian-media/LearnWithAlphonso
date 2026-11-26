import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { captureRefCode } from "@/lib/referral";

/**
 * The referral share link, https://learnwithalphonso.com/r/<code>. The apps open it as an app link; in a browser this
 * page keeps the code exactly as a `?ref=` landing does (same storage, same claim after sign-up) and sends the visitor
 * to the landing page. A code that is not shaped like one is ignored, and the visitor still lands on the home page.
 */
export const Route = createFileRoute("/r/$code")({
  // The code is kept in this browser's storage; there is nothing to render on the server.
  ssr: false,
  component: ReferralVisit,
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
});

function keepReferral(code: string): void {
  let store: Storage | null = null;
  try {
    store = window.localStorage;
  } catch {
    // storage blocked: the referral is simply not carried
  }
  captureRefCode(code, store);
}

function ReferralVisit() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    // Keep first, then leave: the order matters, the page is gone the moment the navigation lands.
    keepReferral(code);
    void navigate({ to: "/", replace: true });
  }, [code, navigate]);
  return null;
}
