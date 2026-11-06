// The spend ledger for the full content review: a US$99 hard cap across every phase and provider,
// kept in a file so a restart, a crash or a new session cannot reset it.
//
// How it holds the cap:
// - Before anything is submitted, its WORST-CASE cost (pricing.ts) is RESERVED. A reservation that
//   would take settled spend plus open reservations above the cap is refused, and nothing is sent.
// - The reservation is written to disk BEFORE the submit call, so a crash after submitting still
//   counts it. When the results come back, the reservation is SETTLED at the actual cost; a submit
//   that provably failed (the provider returned an error, so nothing was accepted) is RELEASED.
// - The cap is min(HARD_CAP_USD, the file's cap): editing the file cannot raise it.
// - The ledger is written to two files (the primary, in the git-ignored .content-review/, and a
//   mirror outside the checkout). Each is read on open and the one with more entries wins, so deleting
//   either file loses nothing. A file that exists but cannot be parsed is an error, never "empty".
// - If both are missing while the state directory already holds a run (state.json), opening refuses:
//   a missing ledger next to a started run means the record was lost, not that nothing was spent.
// - A lock file stops two runners from reserving against the same remaining budget at once.

import fs from "node:fs";
import path from "node:path";

/** The owner's cap for the whole job (2026-11-06). Code, not config: nothing at runtime raises it. */
export const HARD_CAP_USD = 99;

export type LedgerEntry =
  | {
      type: "reserve";
      ref: string;
      usd: number;
      phase: string;
      provider: string;
      model: string;
      at: string;
      note?: string;
    }
  | { type: "settle"; ref: string; usd: number; at: string; note?: string }
  | { type: "release"; ref: string; at: string; note: string };

export type LedgerFile = { version: 1; capUsd: number; entries: LedgerEntry[] };

export class CapExceededError extends Error {
  constructor(
    readonly wantedUsd: number,
    readonly remainingUsd: number,
  ) {
    super(
      `Refused: the worst case $${wantedUsd.toFixed(2)} is above the remaining budget $${remainingUsd.toFixed(2)} of the $${HARD_CAP_USD} cap.`,
    );
  }
}

export type LedgerStatus = {
  capUsd: number;
  settledUsd: number;
  /** Reservations not yet settled or released, at their worst case. */
  openUsd: number;
  remainingUsd: number;
  open: string[];
};

/** Pure: the status a list of entries implies. */
export function statusOf(file: LedgerFile): LedgerStatus {
  const cap = Math.min(HARD_CAP_USD, Number.isFinite(file.capUsd) ? file.capUsd : 0);
  const reserved = new Map<string, number>();
  let settled = 0;
  for (const e of file.entries) {
    if (e.type === "reserve") reserved.set(e.ref, (reserved.get(e.ref) ?? 0) + e.usd);
    else if (e.type === "settle") {
      // A settle closes the reservation and counts the actual cost, even when the actual is above
      // the reservation (it should never be; if it is, later reservations see the real figure).
      settled += e.usd;
      reserved.delete(e.ref);
    } else reserved.delete(e.ref);
  }
  const open = [...reserved.values()].reduce((a, b) => a + b, 0);
  return {
    capUsd: cap,
    settledUsd: settled,
    openUsd: open,
    remainingUsd: cap - settled - open,
    open: [...reserved.keys()],
  };
}

function validUsd(usd: number, what: string) {
  // NaN or a negative amount would make every comparison with the cap false or add budget back.
  if (!Number.isFinite(usd) || usd < 0)
    throw new Error(`${what}: ${usd} is not a valid US$ amount`);
}

function readLedger(file: string): LedgerFile | null {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  let parsed: LedgerFile;
  try {
    parsed = JSON.parse(raw) as LedgerFile;
  } catch {
    throw new Error(
      `The ledger ${file} exists but is not valid JSON. Fix or restore it; it is never treated as empty.`,
    );
  }
  if (parsed?.version !== 1 || !Array.isArray(parsed.entries))
    throw new Error(`The ledger ${file} has an unknown shape. Fix or restore it.`);
  return parsed;
}

function writeAtomic(file: string, data: LedgerFile) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

export type LedgerPaths = {
  /** Primary file, normally .content-review/ledger.json. */
  primary: string;
  /** Mirror outside the checkout, normally ~/.lwa-content-review/ledger.json. */
  mirror: string;
  /** The run's state directory; a state.json there means a run has started. */
  stateDir: string;
};

export class Ledger {
  private data: LedgerFile;
  private constructor(
    private readonly paths: LedgerPaths,
    data: LedgerFile,
  ) {
    this.data = data;
  }

  /**
   * Opens (or, on a fresh state directory, creates) the ledger. See the header for the rules.
   * `capUsd` sets a NEW ledger's cap (a small per-PR check uses its own ledger and a cap of a few
   * dollars); it never changes an existing file's cap, and no cap exceeds HARD_CAP_USD.
   */
  static open(paths: LedgerPaths, opts: { capUsd?: number } = {}): Ledger {
    const a = readLedger(paths.primary);
    const b = readLedger(paths.mirror);
    let data: LedgerFile;
    if (a && b) data = a.entries.length >= b.entries.length ? a : b;
    else if (a || b) data = (a ?? b)!;
    else {
      if (fs.existsSync(path.join(paths.stateDir, "state.json")))
        throw new Error(
          "Both ledger files are missing but a run has started (state.json exists). Restore the ledger; it is never recreated empty next to a started run.",
        );
      const cap = opts.capUsd ?? HARD_CAP_USD;
      validUsd(cap, "cap");
      data = { version: 1, capUsd: Math.min(cap, HARD_CAP_USD), entries: [] };
    }
    const ledger = new Ledger(paths, data);
    ledger.persist();
    return ledger;
  }

  status(): LedgerStatus {
    return statusOf(this.data);
  }

  entries(): readonly LedgerEntry[] {
    return this.data.entries;
  }

  /**
   * Reserves `usd` (a worst case) under `ref`, or throws CapExceededError and records nothing.
   * Written to disk before it returns, so the caller submits only after the reservation is durable.
   * `keepBackUsd` leaves that much of the remaining budget untouched (the runner keeps the
   * verification phases affordable while the earlier phases run).
   */
  reserve(
    ref: string,
    usd: number,
    meta: { phase: string; provider: string; model: string; note?: string; keepBackUsd?: number },
    now = new Date().toISOString(),
  ): LedgerStatus {
    validUsd(usd, `reserve ${ref}`);
    const keepBack = meta.keepBackUsd ?? 0;
    validUsd(keepBack, `keep-back for ${ref}`);
    const s = this.status();
    if (s.open.includes(ref)) throw new Error(`${ref} is already reserved`);
    if (this.data.entries.some((e) => e.ref === ref && e.type === "settle"))
      throw new Error(`${ref} was already settled; use a new ref`);
    if (usd > s.remainingUsd - keepBack)
      throw new CapExceededError(usd, Math.max(0, s.remainingUsd - keepBack));
    const { keepBackUsd: _keepBack, ...rest } = meta;
    this.data.entries.push({ type: "reserve", ref, usd, ...rest, at: now });
    this.persist();
    return this.status();
  }

  /** Replaces the open reservation `ref` by its actual cost. */
  settle(ref: string, usd: number, note?: string, now = new Date().toISOString()): LedgerStatus {
    validUsd(usd, `settle ${ref}`);
    if (!this.status().open.includes(ref)) throw new Error(`${ref} has no open reservation`);
    this.data.entries.push({ type: "settle", ref, usd, at: now, ...(note ? { note } : {}) });
    this.persist();
    return this.status();
  }

  /**
   * Drops the open reservation `ref`. Only for a submit the provider REJECTED (nothing was
   * accepted, nothing can be billed). A submit whose outcome is unknown stays reserved.
   */
  release(ref: string, note: string, now = new Date().toISOString()): LedgerStatus {
    if (!this.status().open.includes(ref)) throw new Error(`${ref} has no open reservation`);
    this.data.entries.push({ type: "release", ref, at: now, note });
    this.persist();
    return this.status();
  }

  private persist() {
    writeAtomic(this.paths.primary, this.data);
    writeAtomic(this.paths.mirror, this.data);
  }
}

/** Runs `fn` holding an exclusive lock file; a second runner fails fast instead of racing. */
export async function withLock<T>(lockFile: string, fn: () => Promise<T>): Promise<T> {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  let fd: number;
  try {
    fd = fs.openSync(lockFile, "wx");
  } catch {
    throw new Error(
      `Another content-review runner holds ${lockFile}. If none is running, delete the file.`,
    );
  }
  fs.writeSync(fd, String(process.pid));
  fs.closeSync(fd);
  try {
    return await fn();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}
