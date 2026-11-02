import { assertEquals } from "jsr:@std/assert@1";
import { verifiedOfflineCompletionDay } from "./offline-completion-date.ts";

Deno.test("offline completion keeps its original UTC day within the signed lesson session", () => {
  const issued = Date.parse("2026-10-17T23:30:00.000Z");
  const now = new Date("2026-10-18T00:20:00.000Z");
  assertEquals(
    verifiedOfflineCompletionDay("2026-10-17T23:55:00.000Z", issued, now),
    "2026-10-17",
  );
});

Deno.test("a time before the session is clamped to the session's day, never earlier", () => {
  const issued = Date.parse("2026-10-17T23:30:00.000Z");
  const now = new Date("2026-10-18T00:20:00.000Z");
  assertEquals(verifiedOfflineCompletionDay("2026-10-17T23:29:59.999Z", issued, now), "2026-10-17");
  // A days-old claim cannot reach back past the signed session.
  assertEquals(verifiedOfflineCompletionDay("2026-10-10T12:00:00.000Z", issued, now), "2026-10-17");
});

Deno.test("a time after server now (fast device clock) is clamped to the server's day", () => {
  const issued = Date.parse("2026-10-17T23:30:00.000Z");
  const now = new Date("2026-10-18T00:20:00.000Z");
  assertEquals(verifiedOfflineCompletionDay("2026-10-18T00:20:05.000Z", issued, now), "2026-10-18");
  assertEquals(verifiedOfflineCompletionDay("2026-10-25T00:00:00.000Z", issued, now), "2026-10-18");
});

Deno.test("nothing trustworthy to clamp to yields null (the caller uses the server's day)", () => {
  const now = new Date("2026-10-18T00:20:00.000Z");
  assertEquals(verifiedOfflineCompletionDay("not-a-date", Date.parse("2026-10-17T23:30:00Z"), now), null);
  assertEquals(verifiedOfflineCompletionDay("2026-10-18T00:00:00Z", Number.NaN, now), null);
  assertEquals(
    verifiedOfflineCompletionDay("2026-10-18T00:00:00Z", Date.parse("2026-10-18T01:00:00Z"), now),
    null,
  );
});
