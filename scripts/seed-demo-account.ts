/**
 * Seeds (or re-seeds) a demo/review account into "review-ready" state:
 * three completed lessons (XP, streak, activity days), two due review
 * items, and one podcast episode resumed part-way. Re-runnable by
 * design -- app-review-notes.md's own demand is "the account must
 * already have progress," and this will be run again for every future
 * build, not just once, so it deletes this account's existing seeded
 * rows first rather than accumulating duplicates on each run.
 *
 * Deliberately does NOT grant Pro entitlement. Hector re-parenting
 * Phase 1 added a server-side gate keyed on RevenueCat's own
 * `app_user_id` (see src/lib/revenuecat-entitlement.ts's header comment
 * on why that must equal this Supabase user id, via
 * `Purchases.shared.logIn`), and granting a promotional entitlement is
 * a real, consequential RevenueCat dashboard/API action -- the account
 * owner's call, not a side effect of a seed script. This script only
 * VERIFIES entitlement live (via the same REST lookup the real gate
 * uses) and reports the result; it warns rather than fails when
 * REVENUECAT_SECRET_API_KEY isn't set, so seeding progress data never
 * silently depends on that secret being present.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role --
 * same convention as seed-curriculum-db.ts). Points at whatever
 * SUPABASE_URL resolves to; does not default to or assume a production
 * target.
 *
 * Usage:
 *   bun scripts/seed-demo-account.ts --email reviewer@example.com [--create]
 *
 * --create makes the account via the admin API (email_confirm: true,
 * skipping the OTP email) if it doesn't already exist. Fine for a
 * designated demo account; never point this at a real user's address.
 */
import { createClient } from "@supabase/supabase-js";
import { isProSubscriber, revenueCatConfigFromEnv } from "../src/lib/revenuecat-entitlement";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  const missing = [
    ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
    ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

function parseArgs(argv: string[]): { email: string; create: boolean } {
  const emailIndex = argv.indexOf("--email");
  const email = emailIndex >= 0 ? argv[emailIndex + 1] : undefined;
  if (!email) {
    console.error("Usage: bun scripts/seed-demo-account.ts --email <address> [--create]");
    process.exit(1);
  }
  return { email, create: argv.includes("--create") };
}

const { email, create } = parseArgs(process.argv.slice(2));

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Real curriculum content (src/data/curriculum.ts), not placeholder text --
// a reviewer who taps into a seeded review item sees the same question
// they'd see from actually missing it.
const SEEDED_LESSONS = [
  { lessonId: "u1l1", correct: 3, total: 5, xpEarned: 20 },
  { lessonId: "u1l2", correct: 4, total: 4, xpEarned: 20 },
  { lessonId: "u1l3", correct: 4, total: 5, xpEarned: 20 },
] as const;

const SEEDED_REVIEW_ITEMS = [
  {
    itemKey: "u1l1:q1",
    lessonId: "u1l1",
    prompt: "Which is a formal greeting?",
    choices: ["Hey!", "What's up?", "Good morning.", "Yo."],
    answerIndex: 2,
    explanation: '"Good morning" is polite and used in professional settings.',
  },
  {
    itemKey: "u1l1:q5",
    lessonId: "u1l1",
    prompt: "Choose the correct farewell for the night.",
    choices: ["Good night.", "Good day.", "Good hello.", "Good time."],
    answerIndex: 0,
    explanation: '"Good night" is used when parting in the evening or before sleep.',
  },
] as const;

// "Ordering Coffee", English A1 -- the exact episode app-review-notes.md
// and the screenshot shot list both name. Real id/duration from the live
// podcast_episodes table, not guessed.
const RESUME_EPISODE_ID = "06626649-e831-49c3-a893-dac871ffb67a";
const RESUME_EPISODE_DURATION_SECONDS = 172;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

async function resolveOrCreateUser(): Promise<string> {
  // supabase-js has no "get user by email" lookup, only a paginated list --
  // fine at this scale (a handful of demo/review accounts, not real users).
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`Couldn't list users: ${error.message}`);
  const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;

  if (!create) {
    console.error(
      `No account for ${email}. Pass --create to make one, or use an existing address.`,
    );
    process.exit(1);
  }
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`Couldn't create ${email}: ${createError?.message}`);
  }
  console.log(`Created ${email} (${created.user.id}).`);
  return created.user.id;
}

async function resetSeededRows(userId: string): Promise<void> {
  // Delete first so re-running this script twice produces the same state,
  // not accumulated duplicate rows -- this runs again on every future
  // build, not once.
  await Promise.all([
    supabaseAdmin.from("lesson_completions").delete().eq("user_id", userId),
    supabaseAdmin.from("review_items").delete().eq("user_id", userId),
    supabaseAdmin.from("activity_days").delete().eq("user_id", userId),
    supabaseAdmin.from("podcast_playback").delete().eq("user_id", userId),
  ]);
}

async function seedProgress(userId: string): Promise<void> {
  const streakDays = 5;

  await Promise.all([
    supabaseAdmin.from("user_progress").upsert({
      user_id: userId,
      streak: streakDays,
      longest_streak: streakDays,
      last_active_date: today(),
      hearts: 5,
      hearts_refill_at: null,
      streak_freezes: 0,
      league_tier: "bronze",
      cefr_level: "A1",
    }),
    supabaseAdmin.from("language_progress").upsert(
      {
        user_id: userId,
        language: "en",
        xp: SEEDED_LESSONS.reduce((sum, l) => sum + l.xpEarned, 0),
        league_tier: "bronze",
        // Mark placement as already taken. RootView presents PlacementView
        // once whenever `fetchPlacementTakenAt` is null, so without this a
        // freshly seeded account lands on the placement exam instead of
        // the Learn tab -- which broke the screenshot pipeline (the lesson
        // button reported hit point {-1,-1}: present in the hierarchy,
        // covered on screen).
        //
        // It is also what makes the account COHERENT. The review notes
        // promise a reviewer an established learner with lessons done, a
        // streak and due reviews; an account with all of that which has
        // somehow never been placed is a state no real user reaches.
        placement_taken_at: new Date(Date.now() - streakDays * 86_400_000).toISOString(),
        placement_level: "A1",
      },
      { onConflict: "user_id,language" },
    ),
    ...Array.from({ length: streakDays }, (_, i) =>
      supabaseAdmin.from("activity_days").upsert({
        user_id: userId,
        day: daysAgo(i),
        xp_earned: i === 0 ? SEEDED_LESSONS.reduce((sum, l) => sum + l.xpEarned, 0) : 20,
      }),
    ),
    ...SEEDED_LESSONS.map(({ lessonId, correct, total, xpEarned }) =>
      supabaseAdmin.from("lesson_completions").upsert(
        {
          user_id: userId,
          lesson_id: lessonId,
          correct,
          total,
          xp_earned: xpEarned,
          language: "en",
        },
        { onConflict: "user_id,lesson_id" },
      ),
    ),
    ...SEEDED_REVIEW_ITEMS.map(({ itemKey, lessonId, prompt, choices, answerIndex, explanation }) =>
      supabaseAdmin.from("review_items").upsert(
        {
          user_id: userId,
          item_key: itemKey,
          lesson_id: lessonId,
          level: "A1",
          language: "en",
          ease: 2.5,
          interval_days: 1,
          repetitions: 0,
          lapses: 1,
          due_on: today(),
          source: "lesson",
          prompt,
          choices,
          answer_index: answerIndex,
          explanation,
        },
        { onConflict: "user_id,item_key,language" },
      ),
    ),
    supabaseAdmin.from("podcast_playback").upsert(
      {
        user_id: userId,
        episode_id: RESUME_EPISODE_ID,
        position_seconds: Math.round(RESUME_EPISODE_DURATION_SECONDS * 0.4),
        completed_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,episode_id" },
    ),
  ]);
}

async function reportProEntitlement(userId: string): Promise<void> {
  const config = revenueCatConfigFromEnv();
  if (!config) {
    console.warn(
      "REVENUECAT_SECRET_API_KEY not set -- skipping the Pro-entitlement check. " +
        "This script never grants one; see this file's header comment for why.",
    );
    return;
  }
  // Same lookup key the real server-side gate uses: RevenueCat's
  // app_user_id must equal this Supabase user id, which only happens
  // after Purchases.shared.logIn(userId) has run at least once client-side.
  const isPro = await isProSubscriber(config, userId);
  if (isPro) {
    console.log(`Pro entitlement: ACTIVE for ${userId} (verified live via RevenueCat).`);
  } else {
    console.warn(
      `Pro entitlement: NOT active for ${userId}. If you already granted a promotional ` +
        "entitlement in the RevenueCat dashboard, confirm it was granted to this exact " +
        "Supabase user id as the app_user_id (not an email, device id, or anonymous " +
        "$RCAnonymousID) -- that's the only key the server-side gate looks up.",
    );
  }
}

async function main(): Promise<void> {
  const userId = await resolveOrCreateUser();
  await resetSeededRows(userId);
  await seedProgress(userId);
  await reportProEntitlement(userId);

  console.log(`\nSeeded ${email} (${userId}):`);
  console.log(`  - ${SEEDED_LESSONS.length} completed lessons, streak ${5}`);
  console.log(`  - ${SEEDED_REVIEW_ITEMS.length} review items due today`);
  console.log(
    `  - "Ordering Coffee" resumed at ${Math.round(RESUME_EPISODE_DURATION_SECONDS * 0.4)}s of ${RESUME_EPISODE_DURATION_SECONDS}s`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
