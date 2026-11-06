import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

/**
 * Voice time reservations under real parallel transactions (20261105100900). PGlite has one connection, so this runs
 * only against the local Supabase stack the e2e-signed-in CI job starts from the migrations: every RPC below is its
 * own HTTP request and its own Postgres transaction, sent all at once.
 *
 * Skipped elsewhere; when the job says the stack is required (E2E_REQUIRED=1) a missing URL is a failure, so the job
 * cannot go green having tested nothing.
 */
const url = process.env.E2E_SUPABASE_URL;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const required = process.env.E2E_REQUIRED === "1";

describe("voice time reservations under parallel calls (local Supabase stack)", () => {
  it.runIf(required && !(url && serviceKey))("has the stack it was told to expect", () => {
    expect(url && serviceKey).toBeTruthy();
  });

  it.skipIf(!(url && serviceKey))(
    "of 20 simultaneous 120 s reservations with 600 s left, exactly 5 are booked",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: `voice-race-${Date.now()}@example.com`,
        password: `pw-${crypto.randomUUID()}`,
        email_confirm: true,
      });
      expect(createError).toBeNull();
      const userId = created.user!.id;
      try {
        const rpc = admin.rpc.bind(admin) as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
        const first = await rpc("reserve_stt_audio_seconds", {
          _user_id: userId,
          _seconds: 600,
          _budget: 1200,
        });
        expect(first.error).toBeNull();
        expect(first.data).not.toBeNull();

        const results = await Promise.all(
          Array.from({ length: 20 }, () =>
            rpc("reserve_stt_audio_seconds", { _user_id: userId, _seconds: 120, _budget: 1200 }),
          ),
        );
        expect(results.map((r) => r.error)).toEqual(Array(20).fill(null));
        expect(results.filter((r) => r.data !== null)).toHaveLength(5);

        const { data: rows, error } = await admin
          .from("ai_usage")
          .select("count")
          .eq("user_id", userId)
          .eq("kind", "stt_seconds");
        expect(error).toBeNull();
        expect(rows).toEqual([{ count: 1200 }]);
      } finally {
        await admin.auth.admin.deleteUser(userId);
      }
    },
    60_000,
  );
});
