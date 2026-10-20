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

Deno.test("offline completion refuses timestamps before session issue or after server time", () => {
  const issued = Date.parse("2026-10-17T23:30:00.000Z");
  const now = new Date("2026-10-18T00:20:00.000Z");
  assertEquals(verifiedOfflineCompletionDay("2026-10-17T23:29:59.999Z", issued, now), null);
  assertEquals(verifiedOfflineCompletionDay("2026-10-18T00:20:00.001Z", issued, now), null);
  assertEquals(verifiedOfflineCompletionDay("not-a-date", issued, now), null);
});
