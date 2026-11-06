import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CapExceededError,
  HARD_CAP_USD,
  Ledger,
  PROVIDER_CAPS,
  statusOf,
  withLock,
  type LedgerPaths,
} from "./ledger";

// The ledger is the only thing between a bug and the owner's card. Each test below was checked to
// go red under the mutation named in its title (see the PR body's mutation table).

let dir: string;
let paths: LedgerPaths;
const meta = { phase: "review", provider: "anthropic", model: "claude-sonnet-5-5" };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));
  paths = {
    primary: path.join(dir, "state", "ledger.json"),
    mirror: path.join(dir, "home", "ledger.json"),
    stateDir: path.join(dir, "state"),
  };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("the US$99 hard cap", () => {
  it("is 99", () => {
    expect(HARD_CAP_USD).toBe(99);
  });

  it("refuses a reservation above the remaining budget, and records nothing (mutation: drop the check)", () => {
    const l = Ledger.open(paths);
    l.reserve("a", 60, meta);
    expect(() => l.reserve("b", 39.01, meta)).toThrow(CapExceededError);
    expect(l.status().openUsd).toBe(60);
    expect(l.entries()).toHaveLength(1);
  });

  it("allows a reservation that exactly reaches the cap (mutation: >= instead of >)", () => {
    const l = Ledger.open(paths);
    l.reserve("a", 60, meta);
    expect(() => l.reserve("b", 39, meta)).not.toThrow();
    expect(l.status().remainingUsd).toBe(0);
  });

  it("counts settled spend and open reservations together (mutation: ignore open reservations)", () => {
    const l = Ledger.open(paths);
    l.reserve("a", 50, meta);
    l.settle("a", 30);
    l.reserve("b", 40, meta);
    // settled 30 + open 40 = 70: 29 left, not 69.
    expect(l.status().remainingUsd).toBeCloseTo(29);
    expect(() => l.reserve("c", 30, meta)).toThrow(CapExceededError);
  });

  it("frees the difference when a job settles below its worst case", () => {
    const l = Ledger.open(paths);
    l.reserve("a", 90, meta);
    l.settle("a", 12.5);
    expect(l.status().remainingUsd).toBeCloseTo(86.5);
  });

  it("counts an actual above its reservation in full (mutation: cap the settle at the reservation)", () => {
    const l = Ledger.open(paths);
    l.reserve("a", 10, meta);
    l.settle("a", 15);
    expect(l.status().settledUsd).toBe(15);
    expect(l.status().remainingUsd).toBe(84);
  });

  it("refuses NaN, Infinity and negative amounts (mutation: drop validUsd)", () => {
    const l = Ledger.open(paths);
    for (const bad of [NaN, Infinity, -1])
      expect(() => l.reserve(`x${bad}`, bad, meta)).toThrow(/valid/);
    l.reserve("a", 5, meta);
    expect(() => l.settle("a", -3)).toThrow(/valid/);
  });

  it("a file cap cannot raise the hard cap (mutation: trust the file's cap)", () => {
    fs.mkdirSync(path.dirname(paths.primary), { recursive: true });
    fs.writeFileSync(paths.primary, JSON.stringify({ version: 1, capUsd: 500, entries: [] }));
    const l = Ledger.open(paths);
    expect(l.status().capUsd).toBe(99);
    expect(() => l.reserve("a", 100, meta)).toThrow(CapExceededError);
  });

  it("a new ledger can take a smaller cap, never a larger one", () => {
    expect(Ledger.open(paths, { capUsd: 2 }).status().capUsd).toBe(2);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(Ledger.open(paths, { capUsd: 1000 }).status().capUsd).toBe(99);
  });

  it("keep-back leaves budget for verification (mutation: ignore keepBackUsd)", () => {
    const l = Ledger.open(paths);
    expect(() => l.reserve("a", 90, { ...meta, keepBackUsd: 12 })).toThrow(CapExceededError);
    expect(() => l.reserve("a", 87, { ...meta, keepBackUsd: 12 })).not.toThrow();
    // A verification phase passes no keep-back and may use the rest.
    expect(() => l.reserve("b", 12, meta)).not.toThrow();
    expect(l.entries()[0]).not.toHaveProperty("keepBackUsd");
  });
});

describe("persistence: a restart cannot reset the budget", () => {
  it("a reopened ledger remembers every reservation (mutation: start empty on open)", () => {
    Ledger.open(paths).reserve("a", 70, meta);
    const again = Ledger.open(paths);
    expect(again.status().openUsd).toBe(70);
    expect(() => again.reserve("b", 30, meta)).toThrow(CapExceededError);
  });

  it("the reservation is on disk before reserve() returns", () => {
    const l = Ledger.open(paths);
    l.reserve("a", 10, meta);
    const onDisk = JSON.parse(fs.readFileSync(paths.primary, "utf8"));
    expect(statusOf(onDisk).openUsd).toBe(10);
  });

  it("deleting the primary file loses nothing: the mirror is read (mutation: read the primary only)", () => {
    Ledger.open(paths).reserve("a", 70, meta);
    fs.rmSync(paths.primary);
    expect(Ledger.open(paths).status().openUsd).toBe(70);
  });

  it("deleting the mirror loses nothing either", () => {
    Ledger.open(paths).reserve("a", 70, meta);
    fs.rmSync(paths.mirror);
    expect(Ledger.open(paths).status().openUsd).toBe(70);
  });

  it("an older copy does not win over a newer one (mutation: prefer the primary)", () => {
    const l = Ledger.open(paths);
    l.reserve("a", 10, meta);
    const old = fs.readFileSync(paths.primary, "utf8");
    l.reserve("b", 20, meta);
    fs.writeFileSync(paths.primary, old); // the primary rolled back, the mirror is current
    expect(Ledger.open(paths).status().openUsd).toBe(30);
  });

  it("a corrupt file is an error, never an empty ledger (mutation: treat parse errors as empty)", () => {
    Ledger.open(paths).reserve("a", 70, meta);
    fs.writeFileSync(paths.primary, "{ not json");
    expect(() => Ledger.open(paths)).toThrow(/not valid JSON/);
  });

  it("refuses to start empty next to a started run (mutation: drop the state.json check)", () => {
    fs.mkdirSync(paths.stateDir, { recursive: true });
    fs.writeFileSync(path.join(paths.stateDir, "state.json"), "{}");
    expect(() => Ledger.open(paths)).toThrow(/missing but a run has started/);
  });
});

describe("settle and release", () => {
  it("a ref cannot be reserved twice or reused after it settled", () => {
    const l = Ledger.open(paths);
    l.reserve("a", 1, meta);
    expect(() => l.reserve("a", 1, meta)).toThrow(/already reserved/);
    l.settle("a", 1);
    expect(() => l.reserve("a", 1, meta)).toThrow(/already settled/);
  });

  it("only an open reservation can be settled or released", () => {
    const l = Ledger.open(paths);
    expect(() => l.settle("nope", 1)).toThrow(/no open reservation/);
    expect(() => l.release("nope", "x")).toThrow(/no open reservation/);
  });

  it("release frees the whole reservation", () => {
    const l = Ledger.open(paths);
    l.reserve("a", 50, meta);
    l.release("a", "rejected: HTTP 400");
    expect(l.status().remainingUsd).toBe(99);
  });
});

describe("the run lock", () => {
  it("a second runner fails fast while the first holds the lock", async () => {
    const lock = path.join(dir, "run.lock");
    await withLock(lock, async () => {
      await expect(withLock(lock, async () => 1)).rejects.toThrow(/Another content-review runner/);
    });
    expect(fs.existsSync(lock)).toBe(false);
  });
});

describe("separate provider caps (Anthropic US$99, Mistral US$10, no borrowing)", () => {
  const mpaths = () => ({
    primary: path.join(dir, "state", "ledger-mistral.json"),
    mirror: path.join(dir, "home", "ledger-mistral.json"),
    stateDir: path.join(dir, "state"),
  });
  const mmeta = { phase: "second", provider: "mistral", model: "mistral-large-4" };

  it("the caps are 99 and 10", () => {
    expect(PROVIDER_CAPS).toEqual({ anthropic: 99, mistral: 10 });
  });

  it("Mistral stops at US$10 even with the Anthropic budget untouched (mutation: Mistral at the 99 cap)", () => {
    Ledger.open(paths, { provider: "anthropic" });
    const m = Ledger.open(mpaths(), { provider: "mistral" });
    expect(m.status().capUsd).toBe(10);
    expect(() => m.reserve("m1", 10.01, mmeta)).toThrow(CapExceededError);
    expect(() => m.reserve("m1", 10, mmeta)).not.toThrow();
  });

  it("a Mistral file edited to a larger cap stays at 10 (mutation: trust the bound file's cap)", () => {
    Ledger.open(mpaths(), { provider: "mistral" });
    const f = JSON.parse(fs.readFileSync(mpaths().primary, "utf8"));
    f.capUsd = 99;
    fs.writeFileSync(mpaths().primary, JSON.stringify(f));
    fs.writeFileSync(mpaths().mirror, JSON.stringify(f));
    expect(Ledger.open(mpaths(), { provider: "mistral" }).status().capUsd).toBe(10);
  });

  it("a job cannot be booked on the other provider's ledger (mutation: drop the provider check)", () => {
    const a = Ledger.open(paths, { provider: "anthropic" });
    expect(() => a.reserve("x", 1, mmeta)).toThrow(/cannot be booked/);
  });

  it("a ledger is never opened as another provider's (mutation: drop the binding check)", () => {
    Ledger.open(mpaths(), { provider: "mistral" });
    expect(() => Ledger.open(mpaths(), { provider: "anthropic" })).toThrow(/belongs to mistral/);
    expect(() => Ledger.open(mpaths())).toThrow(/belongs to mistral/);
  });
});

describe("per-provider started marker", () => {
  it("a provider whose first job comes later can start; once started, a lost ledger is refused", () => {
    fs.mkdirSync(path.join(dir, "state"), { recursive: true });
    fs.writeFileSync(path.join(dir, "state", "state.json"), "{}"); // the review already started
    const m = {
      primary: path.join(dir, "state", "ledger-mistral.json"),
      mirror: path.join(dir, "home", "ledger-mistral.json"),
      stateDir: path.join(dir, "state"),
      marker: path.join(dir, "state", "started-mistral"),
    };
    const l = Ledger.open(m, { provider: "mistral" });
    l.reserve("m1", 1, { phase: "second", provider: "mistral", model: "x" });
    fs.rmSync(m.primary);
    fs.rmSync(m.mirror);
    expect(() => Ledger.open(m, { provider: "mistral" })).toThrow(/missing but a run has started/);
  });
});
