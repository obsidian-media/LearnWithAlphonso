import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicError } from "./public-error";

afterEach(() => vi.restoreAllMocks());

describe("errors a server function sends to the browser", () => {
  it("replaces a database message with a stable code and logs the original on the server", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = 'duplicate key value violates unique constraint "buddy_requests_pair_key"';
    const err = publicError("requestBuddy", { message: raw });
    expect(err.message).toBe("requestBuddy: request-failed");
    expect(err.message).not.toContain("buddy_requests_pair_key");
    expect(String(log.mock.calls[0][0])).toContain(raw);
  });

  it("keeps a code the database raised on purpose, so the page can show its own message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(publicError(null, { message: "blocked-content" }).message).toBe("blocked-content");
    expect(publicError("joinBuddyPool", { message: "rate-limited" }).message).toBe("joinBuddyPool: rate-limited");
    expect(publicError(null, { message: "unauthenticated" }).message).toBe("unauthenticated");
  });

  it("does not pass through a sentence or a relation name that merely looks short", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(publicError(null, { message: "permission denied for table profiles" }).message).toBe("request-failed");
    expect(publicError(null, { message: "relation public.x does not exist" }).message).toBe("request-failed");
    expect(publicError(null, { message: "profiles_pkey" }).message).toBe("request-failed");
  });
});

describe("learner-facing server functions never rethrow a raw database message", () => {
  const dir = "src/lib";
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".functions.ts") && f !== "admin.functions.ts");

  it("has no `throw new Error(...error.message...)` outside the operator-only admin functions", () => {
    const hits = files.flatMap((f) =>
      fs
        .readFileSync(path.join(dir, f), "utf8")
        .split(/\r?\n/)
        .map((line, i) => ({ line, at: `${f}:${i + 1}` }))
        .filter(({ line }) => /throw new Error\([^)]*\b(error|\w+\.error)\.message/.test(line))
        .map(({ at, line }) => `${at} ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });
});
