import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, buildFullSchema } from "./__testutils__/full-schema";

/**
 * Gift a streak freeze (20261120130000), EXECUTED against the whole migration history in PGlite as seeded users.
 * PGlite has one connection, so true parallel calls cannot be raced here: the concurrency guarantee is covered by
 * the unique key (a duplicate row is refused by the table itself) plus a structural check that both balances are
 * locked in id order before any check is read.
 */
const STAFF = "00000000-0000-4000-8000-0000000000a1";
let db: PGlite;
let counter = 0x7000;

beforeAll(async () => {
  db = await buildFullSchema();
}, 600_000);
afterAll(async () => {
  await db.close();
});

async function newUser(freezes = 0): Promise<string> {
  const id = `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}`;
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [
    id,
    `g${counter}@example.com`,
  ]);
  await db.query(
    "INSERT INTO public.profiles (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [id, `Gifter${counter}`],
  );
  await db.query(
    "INSERT INTO public.user_progress (user_id, streak_freezes) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET streak_freezes = $2",
    [id, freezes],
  );
  return id;
}
async function befriend(a: string, b: string) {
  await db.query(
    "INSERT INTO public.friendships (user_id, friend_id, status) VALUES ($1,$2,'accepted'),($2,$1,'accepted')",
    [a, b],
  );
}
const as = <T>(x: string, fn: () => Promise<T>) => asUser(db, x, fn);
type Gift = { ok: boolean; reason: string | null; freezes: number | null };
const gift = async (from: string, to: string): Promise<Gift> =>
  (await as(from, () => db.query<Gift>("SELECT * FROM public.gift_streak_freeze($1)", [to])))
    .rows[0]!;
const balance = async (u: string) =>
  (
    await db.query<{ streak_freezes: number }>(
      "SELECT streak_freezes FROM public.user_progress WHERE user_id=$1",
      [u],
    )
  ).rows[0]!.streak_freezes;
const restrict = (id: string, kind: "block" | "ban") =>
  asUser(
    db,
    "",
    () =>
      db.query("SELECT public.staff_set_restriction($1,'owner',$2,$3,'probe')", [STAFF, id, kind]),
    "service_role",
  );

describe("gift_streak_freeze: credit and debit", () => {
  it("moves one freeze from the sender to the friend and records a receipt", async () => {
    const a = await newUser(2);
    const b = await newUser(0);
    await befriend(a, b);
    expect(await gift(a, b)).toMatchObject({ ok: true, reason: null, freezes: 1 });
    expect(await balance(a)).toBe(1);
    expect(await balance(b)).toBe(1);
    const receipt = await db.query("SELECT * FROM public.streak_freeze_gifts WHERE sender_id=$1", [
      a,
    ]);
    expect(receipt.rows).toHaveLength(1);
  });

  it("is a transfer: the total across both learners never changes", async () => {
    const a = await newUser(1);
    const b = await newUser(2);
    await befriend(a, b);
    await gift(a, b);
    expect((await balance(a)) + (await balance(b))).toBe(3);
  });

  it("a sender with no freeze gives nothing and the friend gains nothing", async () => {
    const a = await newUser(0);
    const b = await newUser(0);
    await befriend(a, b);
    expect(await gift(a, b)).toMatchObject({ ok: false, reason: "no-freeze" });
    expect(await balance(b)).toBe(0);
    expect(
      (await db.query("SELECT 1 FROM public.streak_freeze_gifts WHERE sender_id=$1", [a])).rows,
    ).toHaveLength(0);
  });
});

describe("gift_streak_freeze: the cap", () => {
  it("refuses a friend who already holds 3, with a reason, and debits nothing", async () => {
    const a = await newUser(2);
    const b = await newUser(3);
    await befriend(a, b);
    expect(await gift(a, b)).toMatchObject({ ok: false, reason: "recipient-full", freezes: 2 });
    expect(await balance(a)).toBe(2);
    expect(await balance(b)).toBe(3);
  });

  it("accepts a friend holding 2 (the last slot), then refuses at 3", async () => {
    const a = await newUser(5);
    const b = await newUser(2);
    const c = await newUser(0);
    await befriend(a, b);
    await befriend(c, b);
    await db.query("UPDATE public.user_progress SET streak_freezes=1 WHERE user_id=$1", [c]);
    expect((await gift(a, b)).ok).toBe(true);
    expect(await balance(b)).toBe(3);
    expect(await gift(c, b)).toMatchObject({ ok: false, reason: "recipient-full" });
    expect(await balance(c)).toBe(1);
  });
});

describe("gift_streak_freeze: one per friend per day, idempotent", () => {
  it("a second gift to the same friend the same day is refused and debits nothing", async () => {
    const a = await newUser(3);
    const b = await newUser(0);
    await befriend(a, b);
    expect((await gift(a, b)).ok).toBe(true);
    expect(await gift(a, b)).toMatchObject({ ok: false, reason: "already-gifted-today" });
    expect(await balance(a)).toBe(2);
    expect(await balance(b)).toBe(1);
  });

  it("a different friend the same day is fine", async () => {
    const a = await newUser(3);
    const b = await newUser(0);
    const c = await newUser(0);
    await befriend(a, b);
    await befriend(a, c);
    expect((await gift(a, b)).ok && (await gift(a, c)).ok).toBe(true);
  });

  it("yesterday's gift does not block today's", async () => {
    const a = await newUser(3);
    const b = await newUser(0);
    await befriend(a, b);
    await db.query(
      "INSERT INTO public.streak_freeze_gifts (sender_id, recipient_id, gift_day) VALUES ($1,$2,(now() AT TIME ZONE 'UTC')::date - 1)",
      [a, b],
    );
    expect((await gift(a, b)).ok).toBe(true);
  });

  it("the table itself refuses a duplicate (sender, friend, day) row: the backstop under concurrency", async () => {
    const a = await newUser(3);
    const b = await newUser(0);
    await befriend(a, b);
    await gift(a, b);
    await expect(
      db.query("INSERT INTO public.streak_freeze_gifts (sender_id, recipient_id) VALUES ($1,$2)", [
        a,
        b,
      ]),
    ).rejects.toThrow(/duplicate key/);
  });

  it("locks both balances in id order before reading any of them", async () => {
    const def = (
      await db.query<{ d: string }>(
        "SELECT pg_get_functiondef('public.gift_streak_freeze(uuid)'::regprocedure) AS d",
      )
    ).rows[0]!.d;
    const lock = def.indexOf("ORDER BY up.user_id FOR UPDATE");
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(def.indexOf("SELECT up.streak_freezes INTO my_freezes"));
    expect(def).toMatch(/SECURITY DEFINER/);
    expect(def).toMatch(/search_path TO ''/);
  });
});

describe("gift_streak_freeze: who may gift", () => {
  it("refuses a non-friend and yourself", async () => {
    const a = await newUser(2);
    const b = await newUser(0);
    expect(await gift(a, b)).toMatchObject({ ok: false, reason: "not-friends" });
    expect(await gift(a, a)).toMatchObject({ ok: false, reason: "not-friends" });
    expect(await balance(a)).toBe(2);
  });

  it("refuses a one-way or pending friendship", async () => {
    const a = await newUser(2);
    const b = await newUser(0);
    await db.query(
      "INSERT INTO public.friendships (user_id, friend_id, status) VALUES ($1,$2,'pending')",
      [a, b],
    );
    expect(await gift(a, b)).toMatchObject({ ok: false, reason: "not-friends" });
  });

  it("a learner under a block or ban can neither gift nor be gifted, and it reads as not-friends", async () => {
    for (const kind of ["block", "ban"] as const) {
      const a = await newUser(2);
      const b = await newUser(0);
      await befriend(a, b);
      await restrict(b, kind);
      expect(await gift(a, b)).toMatchObject({ ok: false, reason: "not-friends" });
      expect(await gift(b, a)).toMatchObject({ ok: false, reason: "not-friends" });
      expect(await balance(a)).toBe(2);
      expect(await balance(b)).toBe(0);
    }
  });

  it("an unauthenticated call is refused", async () => {
    const r = await db.query<Gift>(
      "SELECT * FROM public.gift_streak_freeze('00000000-0000-4000-8000-000000000001')",
    );
    expect(r.rows[0]).toMatchObject({ ok: false, reason: "unauthenticated" });
  });

  it("anon cannot execute it", async () => {
    await expect(
      asUser(
        db,
        "",
        () => db.query("SELECT * FROM public.gift_streak_freeze(gen_random_uuid())"),
        "anon",
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("streak_freeze_gifts: RLS and the receipt", () => {
  it("the recipient reads their gift, the sender reads theirs, a third learner reads none", async () => {
    const a = await newUser(2);
    const b = await newUser(0);
    const c = await newUser(0);
    await befriend(a, b);
    await gift(a, b);
    const read = async (u: string) =>
      (await as(u, () => db.query("SELECT id FROM public.streak_freeze_gifts"))).rows.length;
    expect(await read(b)).toBe(1);
    expect(await read(a)).toBe(1);
    expect(await read(c)).toBe(0);
  });

  it("the recipient marks it read; the sender cannot mark it read; no one can change the sender", async () => {
    const a = await newUser(2);
    const b = await newUser(0);
    await befriend(a, b);
    await gift(a, b);
    const bySender = await as(a, () =>
      db.query("UPDATE public.streak_freeze_gifts SET read_at = now() WHERE sender_id=$1", [a]),
    );
    expect(bySender.affectedRows).toBe(0);
    const byRecipient = await as(b, () =>
      db.query("UPDATE public.streak_freeze_gifts SET read_at = now() WHERE recipient_id=$1", [b]),
    );
    expect(byRecipient.affectedRows).toBe(1);
    await expect(
      as(b, () =>
        db.query(
          "UPDATE public.streak_freeze_gifts SET sender_id = recipient_id WHERE recipient_id=$1",
          [b],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("a learner cannot insert a gift row (no client insert) or delete one", async () => {
    const a = await newUser(2);
    const b = await newUser(0);
    await befriend(a, b);
    await expect(
      as(a, () =>
        db.query(
          "INSERT INTO public.streak_freeze_gifts (sender_id, recipient_id) VALUES ($1,$2)",
          [a, b],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await gift(a, b);
    await expect(as(a, () => db.query("DELETE FROM public.streak_freeze_gifts"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("a learner cannot read another learner's balance through the gift surface, and cannot raise their own", async () => {
    const a = await newUser(1);
    const b = await newUser(2);
    // The gift answer to the sender carries only the sender's own count.
    await befriend(a, b);
    const r = await gift(a, b);
    expect(r.freezes).toBe(0);
    await expect(
      as(a, () =>
        db.query("UPDATE public.user_progress SET streak_freezes = 99 WHERE user_id=$1", [a]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("a gift from a learner who is later restricted is not shown to the recipient", async () => {
    const a = await newUser(2);
    const b = await newUser(0);
    await befriend(a, b);
    await gift(a, b);
    await restrict(a, "ban");
    const rows = (await as(b, () => db.query("SELECT id FROM public.streak_freeze_gifts"))).rows;
    expect(rows).toHaveLength(0);
  });

  it("deleting the sender's account removes the gift row (cascade)", async () => {
    const a = await newUser(2);
    const b = await newUser(0);
    await befriend(a, b);
    await gift(a, b);
    await db.query("DELETE FROM auth.users WHERE id=$1", [a]);
    expect(
      (await db.query("SELECT 1 FROM public.streak_freeze_gifts WHERE recipient_id=$1", [b])).rows,
    ).toHaveLength(0);
  });
});
