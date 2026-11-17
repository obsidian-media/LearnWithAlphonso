import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, buildFullSchema } from "./__testutils__/full-schema";
import { REFERRAL_FREEZE_CAP, REFERRAL_MONTHLY_CAP, REFERRAL_REWARD_HEARTS } from "./referral";

/**
 * The referral program (20261120140000), EXECUTED against the whole migration history in PGlite as seeded users.
 * PGlite has one connection, so truly parallel calls cannot be raced here: exactly-once is proven by calling the
 * grant repeatedly (a retry, a second lesson) and by the structural checks on the lock order at the end.
 */
let db: PGlite;
let counter = 0x9000;

beforeAll(async () => {
  db = await buildFullSchema();
}, 600_000);
afterAll(async () => {
  await db.close();
});

async function newUser(opts: { hearts?: number; freezes?: number } = {}): Promise<string> {
  const id = `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}`;
  await db.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [
    id,
    `r${counter}@example.com`,
  ]);
  await db.query(
    "INSERT INTO public.user_progress (user_id, hearts, streak_freezes) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET hearts=$2, streak_freezes=$3",
    [id, opts.hearts ?? 5, opts.freezes ?? 0],
  );
  return id;
}
const as = <T>(x: string, fn: () => Promise<T>) => asUser(db, x, fn);
const codeOf = async (u: string) =>
  (
    await as(u, () =>
      db.query<{ code: string }>("SELECT * FROM public.get_or_create_my_friend_code()"),
    )
  ).rows[0]!.code;
type Claim = { ok: boolean; reason: string | null };
const claim = async (who: string, code: string): Promise<Claim> =>
  (await as(who, () => db.query<Claim>("SELECT * FROM public.claim_referral($1)", [code])))
    .rows[0]!;
const completeLesson = (u: string, lesson = `en-${++counter}`) =>
  db.query(
    "INSERT INTO public.lesson_completions (user_id, lesson_id, language, correct, total, xp_earned) VALUES ($1,$2,'en',5,5,10)",
    [u, lesson],
  );
const grant = async (referee: string, pro = false) =>
  (
    await asUser(
      db,
      "",
      () =>
        db.query<{ r: { status: string; reward_kind?: string } }>(
          "SELECT public.grant_referral_reward($1,$2) AS r",
          [referee, pro],
        ),
      "service_role",
    )
  ).rows[0]!.r;
const progress = async (u: string) =>
  (
    await db.query<{ hearts: number; streak_freezes: number }>(
      "SELECT hearts, streak_freezes FROM public.user_progress WHERE user_id=$1",
      [u],
    )
  ).rows[0]!;
const row = async (referee: string) =>
  (
    await db.query<Record<string, unknown>>("SELECT * FROM public.referrals WHERE referee_id=$1", [
      referee,
    ])
  ).rows[0];

/** A referrer with `n` already-completed, uncapped referrals this month (inserted directly, as the grant would). */
async function referrerWithCompleted(n: number, when = "now()"): Promise<string> {
  const referrer = await newUser({ hearts: 2 });
  for (let i = 0; i < n; i++) {
    const friend = await newUser();
    await db.query(
      `INSERT INTO public.referrals (referrer_id, referee_id, status, completed_at, reward_kind, reward_granted)
       VALUES ($1,$2,'completed',${when},'hearts',true)`,
      [referrer, friend],
    );
  }
  return referrer;
}

describe("constants", () => {
  it("the TypeScript constants equal the ones in the SQL function", () => {
    const sql = readFileSync("supabase/migrations/20261120140000_referral_program.sql", "utf8");
    const num = (name: string) =>
      Number(new RegExp(`${name} constant integer := (\\d+);`).exec(sql)![1]);
    expect(num("reward_hearts")).toBe(REFERRAL_REWARD_HEARTS);
    expect(num("monthly_cap")).toBe(REFERRAL_MONTHLY_CAP);
    expect(num("freeze_cap")).toBe(REFERRAL_FREEZE_CAP);
  });
});

describe("claim_referral", () => {
  it("creates a pending referral for a new account with a valid code", async () => {
    const referrer = await newUser();
    const friend = await newUser();
    expect(await claim(friend, await codeOf(referrer))).toEqual({ ok: true, reason: null });
    const r = await row(friend);
    expect(r).toMatchObject({ referrer_id: referrer, status: "pending", reward_granted: false });
  });

  it("claiming alone grants nothing (signup is not the trigger)", async () => {
    const referrer = await newUser({ hearts: 1 });
    const friend = await newUser({ hearts: 1 });
    await claim(friend, await codeOf(referrer));
    expect((await progress(referrer)).hearts).toBe(1);
    expect((await progress(friend)).hearts).toBe(1);
  });

  it("refuses an unknown code, with no row", async () => {
    const friend = await newUser();
    expect(await claim(friend, "nope-nope")).toEqual({ ok: false, reason: "unknown-code" });
    expect(await row(friend)).toBeUndefined();
  });

  it("refuses self-referral", async () => {
    const u = await newUser();
    expect(await claim(u, await codeOf(u))).toEqual({ ok: false, reason: "self" });
    expect(await row(u)).toBeUndefined();
  });

  it("refuses the direct circle (A referred B, so B cannot refer A)", async () => {
    const a = await newUser();
    const b = await newUser();
    await claim(b, await codeOf(a));
    expect(await claim(a, await codeOf(b))).toEqual({ ok: false, reason: "self" });
  });

  it("refuses a second referral: once, at signup", async () => {
    const first = await newUser();
    const second = await newUser();
    const friend = await newUser();
    await claim(friend, await codeOf(first));
    expect(await claim(friend, await codeOf(second))).toEqual({
      ok: false,
      reason: "already-referred",
    });
    expect(await claim(friend, await codeOf(first))).toEqual({
      ok: false,
      reason: "already-referred",
    });
    expect((await row(friend))!.referrer_id).toBe(first);
  });

  it("refuses retroactively: an old account, or one that already completed a lesson", async () => {
    const referrer = await newUser();
    const code = await codeOf(referrer);
    const old = await newUser();
    await db.query("UPDATE auth.users SET created_at = now() - interval '3 days' WHERE id=$1", [
      old,
    ]);
    expect(await claim(old, code)).toEqual({ ok: false, reason: "too-late" });
    const learner = await newUser();
    await completeLesson(learner);
    expect(await claim(learner, code)).toEqual({ ok: false, reason: "too-late" });
    expect(await row(old)).toBeUndefined();
    expect(await row(learner)).toBeUndefined();
  });

  it("a blocked or banned referrer reads as an unknown code", async () => {
    for (const kind of ["block", "ban"] as const) {
      const referrer = await newUser();
      const code = await codeOf(referrer);
      await asUser(
        db,
        "",
        () =>
          db.query("SELECT public.staff_set_restriction($1,'owner',$2,$3,'probe')", [
            "00000000-0000-4000-8000-0000000000a1",
            referrer,
            kind,
          ]),
        "service_role",
      );
      const friend = await newUser();
      expect(await claim(friend, code)).toEqual({ ok: false, reason: "unknown-code" });
      expect(await row(friend)).toBeUndefined();
    }
  });

  it("a signed-out caller is refused", async () => {
    const referrer = await newUser();
    const code = await codeOf(referrer);
    await expect(
      asUser(db, "", () => db.query("SELECT * FROM public.claim_referral($1)", [code]), "anon"),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("grant_referral_reward", () => {
  async function referred(opts: { referrerHearts?: number; referrerFreezes?: number } = {}) {
    const referrer = await newUser({
      hearts: opts.referrerHearts ?? 2,
      freezes: opts.referrerFreezes ?? 0,
    });
    const referee = await newUser({ hearts: 2 });
    await claim(referee, await codeOf(referrer));
    return { referrer, referee };
  }

  it("does nothing before the referee's first lesson", async () => {
    const { referrer, referee } = await referred();
    expect((await grant(referee)).status).toBe("not-yet");
    expect((await progress(referrer)).hearts).toBe(2);
    expect((await progress(referee)).hearts).toBe(2);
    expect((await row(referee))!.status).toBe("pending");
  });

  it("a free referrer and the friend both get hearts on the first completed lesson", async () => {
    const { referrer, referee } = await referred();
    await completeLesson(referee);
    expect(await grant(referee)).toMatchObject({ status: "granted", reward_kind: "hearts" });
    expect((await progress(referrer)).hearts).toBe(Math.min(5, 2 + REFERRAL_REWARD_HEARTS));
    expect((await progress(referee)).hearts).toBe(Math.min(5, 2 + REFERRAL_REWARD_HEARTS));
    expect((await progress(referrer)).streak_freezes).toBe(0);
    expect(await row(referee)).toMatchObject({
      status: "completed",
      reward_kind: "hearts",
      reward_granted: true,
      capped: false,
    });
  });

  it("is granted exactly once: a retry and a second lesson grant nothing more", async () => {
    const { referrer, referee } = await referred({ referrerFreezes: 0 });
    await completeLesson(referee);
    await grant(referee);
    // Spend the hearts, then retry and complete another lesson: nothing comes back.
    await db.query("UPDATE public.user_progress SET hearts=1 WHERE user_id IN ($1,$2)", [
      referrer,
      referee,
    ]);
    expect((await grant(referee)).status).toBe("noop");
    await completeLesson(referee);
    expect((await grant(referee)).status).toBe("noop");
    expect((await progress(referrer)).hearts).toBe(1);
    expect((await progress(referee)).hearts).toBe(1);
  });

  it("many concurrent callers grant once (all but one are no-ops)", async () => {
    const { referrer, referee } = await referred({ referrerFreezes: 0 });
    await completeLesson(referee);
    const results = await Promise.all(Array.from({ length: 6 }, () => grant(referee, true)));
    expect(results.filter((r) => r.status === "granted")).toHaveLength(1);
    expect((await progress(referrer)).streak_freezes).toBe(1);
  });

  it("a Pro referrer gets one streak freeze, not hearts; the friend still gets hearts", async () => {
    const { referrer, referee } = await referred({ referrerFreezes: 1 });
    await completeLesson(referee);
    expect(await grant(referee, true)).toMatchObject({ status: "granted", reward_kind: "freeze" });
    expect(await progress(referrer)).toMatchObject({ streak_freezes: 2, hearts: 2 });
    expect((await progress(referee)).hearts).toBe(5);
    expect((await row(referee))!.reward_kind).toBe("freeze");
  });

  it("a Pro referrer at the freeze cap is skipped gracefully (friend rewarded, no error)", async () => {
    const { referrer, referee } = await referred({ referrerFreezes: REFERRAL_FREEZE_CAP });
    await completeLesson(referee);
    expect(await grant(referee, true)).toMatchObject({ status: "granted", reward_kind: "none" });
    expect((await progress(referrer)).streak_freezes).toBe(REFERRAL_FREEZE_CAP);
    expect((await progress(referee)).hearts).toBe(5);
    expect(await row(referee)).toMatchObject({
      reward_kind: "none",
      reward_granted: true,
      note: "freeze-cap",
    });
  });

  it("a referee with no referral is a no-op", async () => {
    const lone = await newUser({ hearts: 2 });
    await completeLesson(lone);
    expect((await grant(lone)).status).toBe("noop");
    expect((await progress(lone)).hearts).toBe(2);
  });

  it("the 20th referral of the month is rewarded; the 21st grants nothing but still completes", async () => {
    const referrer = await referrerWithCompleted(REFERRAL_MONTHLY_CAP - 1);
    const twentieth = await newUser({ hearts: 2 });
    await claim(twentieth, await codeOf(referrer));
    await completeLesson(twentieth);
    expect((await grant(twentieth)).status).toBe("granted");
    expect((await progress(referrer)).hearts).toBe(5);

    await db.query("UPDATE public.user_progress SET hearts=2 WHERE user_id=$1", [referrer]);
    const twentyFirst = await newUser({ hearts: 2 });
    await claim(twentyFirst, await codeOf(referrer));
    await completeLesson(twentyFirst);
    expect(await grant(twentyFirst)).toMatchObject({ status: "capped" });
    expect((await progress(referrer)).hearts).toBe(2);
    expect((await progress(twentyFirst)).hearts).toBe(2);
    expect(await row(twentyFirst)).toMatchObject({
      status: "completed",
      capped: true,
      reward_granted: false,
      reward_kind: "none",
      note: "monthly-cap",
    });
  });

  it("the cap resets with the calendar month, and capped rows do not count against it", async () => {
    const lastMonth = await referrerWithCompleted(
      REFERRAL_MONTHLY_CAP,
      "now() - interval '40 days'",
    );
    const friend = await newUser({ hearts: 2 });
    await claim(friend, await codeOf(lastMonth));
    await completeLesson(friend);
    expect((await grant(friend)).status).toBe("granted");

    const cappedOnly = await newUser({ hearts: 2 });
    for (let i = 0; i < REFERRAL_MONTHLY_CAP; i++) {
      await db.query(
        "INSERT INTO public.referrals (referrer_id, referee_id, status, completed_at, capped) VALUES ($1,$2,'completed',now(),true)",
        [cappedOnly, await newUser()],
      );
    }
    const next = await newUser({ hearts: 2 });
    await claim(next, await codeOf(cappedOnly));
    await completeLesson(next);
    expect((await grant(next)).status).toBe("granted");
  });

  it("a client cannot call the grant, forge a completion, or write referrals", async () => {
    const { referrer, referee } = await referred();
    await completeLesson(referee);
    await expect(
      as(referee, () => db.query("SELECT public.grant_referral_reward($1,false)", [referee])),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(referee, () =>
        db.query(
          "UPDATE public.referrals SET status='completed', completed_at=now() WHERE referee_id=$1",
          [referee],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    const spare = await newUser();
    await expect(
      as(referee, () =>
        db.query("INSERT INTO public.referrals (referrer_id, referee_id) VALUES ($1,$2)", [
          referrer,
          spare,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(referee, () => db.query("DELETE FROM public.referrals WHERE referee_id=$1", [referee])),
    ).rejects.toThrow(/permission denied/i);
    expect((await row(referee))!.status).toBe("pending");
  });
});

describe("referrals row level security", () => {
  it("a learner sees only their own referral rows", async () => {
    const referrer = await newUser();
    const friend = await newUser();
    const stranger = await newUser();
    await claim(friend, await codeOf(referrer));
    const count = async (u: string) =>
      (
        await as(u, () =>
          db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.referrals"),
        )
      ).rows[0]!.n;
    expect(await count(referrer)).toBeGreaterThanOrEqual(1);
    expect(await count(friend)).toBe(1);
    const mine = await as(stranger, () =>
      db.query("SELECT * FROM public.referrals WHERE referrer_id=$1", [referrer]),
    );
    expect(mine.rows).toHaveLength(0);
    await expect(
      asUser(db, "", () => db.query("SELECT * FROM public.referrals"), "anon"),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("structure", () => {
  const sql = readFileSync("supabase/migrations/20261120140000_referral_program.sql", "utf8");
  it("both functions are SECURITY DEFINER with an empty search_path", () => {
    expect((sql.match(/SECURITY DEFINER\nSET search_path = ''/g) ?? []).length).toBe(2);
  });
  it("locks the referral row first, then both balances in id order, then counts the month", () => {
    const body = sql.slice(sql.indexOf("CREATE FUNCTION public.grant_referral_reward"));
    const iRef = body.indexOf("FOR UPDATE;");
    const iProgress = body.indexOf("ORDER BY up.user_id FOR UPDATE");
    const iCount = body.indexOf("SELECT count(*) INTO used");
    expect(iRef).toBeGreaterThan(-1);
    expect(iRef).toBeLessThan(iProgress);
    expect(iProgress).toBeLessThan(iCount);
  });
});
