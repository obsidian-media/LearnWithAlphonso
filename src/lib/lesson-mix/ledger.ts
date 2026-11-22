// The lesson-mix run's money: ONE new ledger with a US$60 hard cap across Anthropic and Mistral
// together (owner, 2026-11-21: "Content run approved, $60 cap"). It reuses the closure run's Ledger
// (src/lib/content-review/ledger.ts): durable reservations written before anything is sent, a
// refusal when the worst case would pass the cap, a mirror outside the checkout, a lock.
//
// The closure run's own ledgers (US$99 Anthropic, US$10 Mistral) are finished and are never opened here:
// this ledger is a separate file in a separate directory and is bound to no provider.
//
// Two things the closure Ledger does not do alone, done here in code:
// - the cap is 60 whatever the file says (editing the file to 99 cannot raise it), by holding back
//   whatever the file allows above 60;
// - a projection: `refuseIfOver` answers "would this plan fit" without reserving, so a bulk plan that
//   would pass the cap is refused before any single batch is built.

import os from "node:os";
import path from "node:path";
import { Ledger, type LedgerStatus } from "../content-review/ledger";

/** The owner's cap for this run. Code, not config. */
export const LESSON_MIX_CAP_USD = 60;

export function lessonMixLedgerPaths(stateDir: string, mirrorDir?: string) {
  return {
    primary: path.join(stateDir, "ledger.json"),
    mirror: path.join(
      mirrorDir ??
        process.env.LESSON_MIX_LEDGER_MIRROR_DIR ??
        path.join(os.homedir(), ".lwa-lesson-mix"),
      "ledger.json",
    ),
    stateDir,
    marker: path.join(stateDir, "started"),
  };
}

export function openLessonMixLedger(stateDir: string, mirrorDir?: string): Ledger {
  return Ledger.open(lessonMixLedgerPaths(stateDir, mirrorDir), { capUsd: LESSON_MIX_CAP_USD });
}

/** What is left under the 60, whatever cap the file carries. */
export function remainingUnderCap(ledger: Ledger): number {
  const s = ledger.status();
  return Math.min(s.remainingUsd, LESSON_MIX_CAP_USD - s.settledUsd - s.openUsd);
}

/** Reserves `usd` or throws CapExceededError; never lets the total pass LESSON_MIX_CAP_USD. */
export function reserveWithinCap(
  ledger: Ledger,
  ref: string,
  usd: number,
  meta: { phase: string; provider: string; model: string; note?: string; keepBackUsd?: number },
): LedgerStatus {
  const s = ledger.status();
  const fileSlack = Math.max(0, s.capUsd - LESSON_MIX_CAP_USD);
  return ledger.reserve(ref, usd, { ...meta, keepBackUsd: (meta.keepBackUsd ?? 0) + fileSlack });
}

/** True when a whole plan of worst-case costs would not fit in what is left (nothing is reserved). */
export function refuseIfOver(ledger: Ledger, planUsd: number): boolean {
  return planUsd > remainingUnderCap(ledger);
}
