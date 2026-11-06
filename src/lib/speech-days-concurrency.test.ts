import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

/**
 * Minutes spoken (20261106100000) under real parallel transactions, and the service-role account deletion. PGlite has
 * one connection, so this runs only against the local Supabase stack the e2e-signed-in CI job starts from the
 * migrations: every RPC below is its own HTTP request and its own Postgres transaction, sent all at once.
 *
 * Skipped elsewhere; when the job says the stack is required (E2E_REQUIRED=1) a missing URL is a failure, so the job
 * cannot go green having tested nothing.
 */
const url = process.env.E2E_SUPABASE_URL;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const required = process.env.E2E_REQUIRED === "1";

describe("minutes spoken under parallel calls (local Supabase stack)", () => {
  it.runIf(required && !(url && serviceKey))("has the stack it was told to expect", () => {
    expect(url && serviceKey).toBeTruthy();
  });

  it.skipIf(!(url && serviceKey))(
    "20 simultaneous additions all count, and deleting the account removes the rows",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: `speech-race-${Date.now()}@example.com`,
        password: `pw-${crypto.randomUUID()}`,
        email_confirm: true,
      });
      expect(createError).toBeNull();
      const userId = created.user!.id;
      let deleted = false;
      try {
        const rpc = admin.rpc.bind(admin) as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
        const results = await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            rpc("add_speech_seconds", { _user_id: userId, _seconds: i + 1 }),
          ),
        );
        expect(results.map((r) => r.error)).toEqual(Array(20).fill(null));

        const read = () => admin.from("speech_days").select("speech_seconds").eq("user_id", userId);
        const { data: rows, error } = await read();
        expect(error).toBeNull();
        // One row for the day, holding every addition: 1 + 2 + ... + 20.
        expect(rows).toEqual([{ speech_seconds: 210 }]);

        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        expect(deleteError).toBeNull();
        deleted = true;
        const after = await read();
        expect(after.error).toBeNull();
        expect(after.data).toEqual([]);
      } finally {
        if (!deleted) await admin.auth.admin.deleteUser(userId);
      }
    },
    60_000,
  );
});
