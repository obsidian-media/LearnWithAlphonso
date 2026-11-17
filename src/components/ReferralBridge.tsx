import { useEffect } from "react";
import { claimPendingRef, captureRef } from "@/lib/referral";
import { claimReferral } from "@/lib/referral.functions";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // storage blocked: the referral is simply not carried
  }
}

/**
 * Mounted once at the root: remembers the opaque `?ref=` code from the landing URL (read from the browser address, so it
 * survives a route that drops unknown query params) until the visitor signs up. Only the code is kept, for at most
 * 30 days, and it is not analytics: the visitor followed a friend's link on purpose. Renders nothing.
 */
export function ReferralCapture() {
  useEffect(() => {
    captureRef(window.location.search, storage());
  }, []);
  return null;
}

/**
 * Mounted in the signed-in layout: once there is a session, sends the kept code to the server once. The server decides
 * everything (only a new account, only once, never yourself); a refusal is final and quiet, a network error retries on
 * the next visit. Renders nothing.
 */
export function ReferralClaim() {
  useEffect(() => {
    void claimPendingRef(storage(), (code) => claimReferral({ data: { code } }));
  }, []);
  return null;
}
