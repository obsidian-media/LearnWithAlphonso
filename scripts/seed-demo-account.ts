/**
 * Seeds (or re-seeds) a demo/review account into "review-ready" state:
 * three completed lessons (XP, streak, activity days), two due review
 * items, one podcast episode resumed part-way, a placement in all three
 * courses, a chosen display name, and a pre-paired demo study buddy (so the
 * "Matched learner" card, its preset messages and Block/Report are reachable
 * without waiting for a real match). The AI consent is reset to "not given"
 * so the reviewer sees the consent sheet the way a new user does. Re-runnable by
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
import {
  DEMO_SEED,
  assertDemoPaired,
  assertNoWriteErrors,
  demoSeedProblems,
  pickResumeEpisode,
  type DemoSeedState,
  type EpisodeRow,
} from "../src/lib/app-store/demo-seed-plan";
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

// The episode the review notes name ("Ordering Coffee", English A1) is looked up by slug at run
// time and must be published: a hard-coded id would silently point at an unpublished episode.
async function resolveResumeEpisode(): Promise<EpisodeRow> {
  const { data, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select("id, slug, course, published, duration_seconds")
    .eq("slug", DEMO_SEED.resumeEpisodeSlug);
  if (error) throw error;
  return pickResumeEpisode((data ?? []) as EpisodeRow[]);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// supabase-js has no "get user by email" lookup, only a paginated list, so walk every page.
async function findUserId(address: string): Promise<string | null> {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Couldn't list users: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function resolveOrCreateUser(address: string, mayCreate: boolean): Promise<string> {
  const existing = await findUserId(address);
  if (existing) return existing;

  if (!mayCreate) {
    console.error(
      `No account for ${address}. Pass --create to make one, or use an existing address.`,
    );
    process.exit(1);
  }
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: address,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`Couldn't create the account: ${createError?.message}`);
  }
  console.log(`Created an account (${created.user.id}).`);
  return created.user.id;
}

async function resetSeededRows(userId: string): Promise<void> {
  // Delete first so re-running this script twice produces the same state,
  // not accumulated duplicate rows -- this runs again on every future
  // build, not once.
  const results = await Promise.all([
    supabaseAdmin.from("lesson_completions").delete().eq("user_id", userId),
    supabaseAdmin.from("review_items").delete().eq("user_id", userId),
    supabaseAdmin.from("activity_days").delete().eq("user_id", userId),
    supabaseAdmin.from("podcast_playback").delete().eq("user_id", userId),
  ]);
  assertNoWriteErrors("reset seeded rows", results);
}

async function seedProgress(userId: string, episode: EpisodeRow): Promise<void> {
  // An established learner, not a fresh account -- this is both the App
  // Store hero screenshot and the account a reviewer signs into, so it
  // should read as someone who has genuinely been using the app. Mirrors
  // the account owner's own real device (Sapphire, advanced band, real
  // streak).
  const streakDays = 12;

  const results = await Promise.all([
    // The demo account has a chosen public name, so App Review and the screenshot run land on Learn, not on
    // the one-time name prompt. A service-role write (auth.uid() NULL) is not re-stamped by the profile
    // trigger, so set both columns explicitly. The name passes the name filter.
    // ai_consent_at goes back to NULL (the consent guard lets the service role do this), so the
    // reviewer sees the consent sheet the way a new user does instead of an already-accepted account.
    supabaseAdmin
      .from("profiles")
      .update({
        display_name: DEMO_SEED.displayName,
        name_confirmed_at: new Date().toISOString(),
        ai_consent_at: null,
      })
      .eq("id", userId),
    supabaseAdmin.from("user_progress").upsert({
      user_id: userId,
      streak: streakDays,
      longest_streak: streakDays,
      last_active_date: today(),
      hearts: 5,
      hearts_refill_at: null,
      streak_freezes: 0,
      league_tier: "sapphire",
    }),
    // One placement per course. RootView presents PlacementView once whenever `fetchPlacementTakenAt`
    // is null, so without it a freshly seeded account (or a switch to FR/ES) lands on the placement
    // exam instead of the Learn tab, which also broke the screenshot pipeline (the lesson button was
    // in the hierarchy but covered). It is also what makes the account coherent: the review notes
    // promise an established learner with a placement in all 3 courses.
    //
    // cefr_level is the level both apps actually read (fetchCEFRLevel on iOS and Android,
    // sync.functions.ts on the web). The league tier column keeps its internal key; only the
    // displayed names changed.
    ...DEMO_SEED.placements.map(({ language, level, xp }) =>
      supabaseAdmin.from("language_progress").upsert(
        {
          user_id: userId,
          language,
          xp,
          ...(language === "en" ? { league_tier: "sapphire" } : {}),
          placement_taken_at: new Date(Date.now() - streakDays * 86_400_000).toISOString(),
          placement_level: level,
          cefr_level: level,
        },
        { onConflict: "user_id,language" },
      ),
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
        episode_id: episode.id,
        position_seconds: Math.round(episode.duration_seconds * 0.4),
        completed_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,episode_id" },
    ),
  ]);
  assertNoWriteErrors("seed progress", results);
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

// The demo account must never be looking for a real learner, and a re-seed starts from no pairing.
async function clearDemoBuddyState(userId: string): Promise<void> {
  const { error: poolError } = await supabaseAdmin
    .from("buddy_pool")
    .delete()
    .eq("user_id", userId);
  if (poolError) throw poolError;
  const { data: members, error: membersError } = await supabaseAdmin
    .from("buddy_members")
    .select("pair_id")
    .eq("user_id", userId);
  if (membersError) throw membersError;
  const pairIds = (members ?? []).map((m) => m.pair_id as string);
  if (pairIds.length > 0) {
    // Deleting the pair cascades to its members, messages and weeks.
    const { error } = await supabaseAdmin.from("buddy_pairs").delete().in("id", pairIds);
    if (error) throw error;
  }
}

// Creates (or refreshes) the second demo learner and pairs the demo account with them as a
// matched pair, with a couple of preset messages from them. Idempotent: the old pair is removed
// first, and the buddy's own pool row and pair are cleared too.
async function seedDemoBuddy(demoUserId: string): Promise<string> {
  const buddy = DEMO_SEED.buddy;
  const buddyId = await resolveOrCreateUser(buddy.email, true);
  await clearDemoBuddyState(buddyId);
  await clearDemoBuddyState(demoUserId);

  // The demo account can never be matched with a real learner: it is excluded from the pool for good.
  const { error: excludeError } = await supabaseAdmin
    .from("buddy_pool_exclusions")
    .upsert({ user_id: demoUserId, reason: "App Review demo account" }, { onConflict: "user_id" });
  if (excludeError) throw excludeError;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ display_name: buddy.displayName, name_confirmed_at: new Date().toISOString() })
    .eq("id", buddyId);
  if (profileError) throw profileError;

  // The demo learner has no XP and no completions, so she never shows on a leaderboard or in a league;
  // only the pairing needs her. Clear anything an earlier seed may have left.
  const cleanup = await Promise.all([
    supabaseAdmin.from("language_progress").delete().eq("user_id", buddyId),
    supabaseAdmin.from("lesson_completions").delete().eq("user_id", buddyId),
  ]);
  assertNoWriteErrors("clear the demo learner's progress", cleanup);

  // A reviewer may have used Block or Report on the demo learner. Remove only what exists between these
  // two accounts (both directions), or the pairing below would be refused as blocked.
  const neutralise = await Promise.all([
    supabaseAdmin.from("blocked_users").delete().eq("blocker", demoUserId).eq("blocked", buddyId),
    supabaseAdmin.from("blocked_users").delete().eq("blocker", buddyId).eq("blocked", demoUserId),
    supabaseAdmin
      .from("content_reports")
      .delete()
      .eq("reporter", demoUserId)
      .eq("reported", buddyId),
    supabaseAdmin
      .from("content_reports")
      .delete()
      .eq("reporter", buddyId)
      .eq("reported", demoUserId),
  ]);
  assertNoWriteErrors("clear block and report rows between the demo accounts", neutralise);

  // The same helper the real matcher calls, so the pair is exactly what a match produces.
  const { data: status, error: pairError } = await supabaseAdmin.rpc("_create_buddy_pair", {
    _x: demoUserId,
    _y: buddyId,
    _source: "match",
  });
  if (pairError) throw pairError;
  assertDemoPaired(status as string | null);

  const { data: member, error: memberError } = await supabaseAdmin
    .from("buddy_members")
    .select("pair_id")
    .eq("user_id", demoUserId)
    .single();
  if (memberError) throw memberError;
  // Seed-only: these inserts deliberately bypass send_buddy_message. That function enforces the rate
  // limit, the matching switch and the sender's own session, none of which applies to fixture data
  // written by the service role. Production code must never insert into buddy_messages directly.
  for (const presetId of buddy.presets) {
    const { error } = await supabaseAdmin
      .from("buddy_messages")
      .insert({ pair_id: member.pair_id, sender_id: buddyId, preset_id: presetId });
    if (error) throw error;
  }
  return buddyId;
}

// Reads the seeded state back and fails unless it is what the review notes promise. Nothing is reported
// as seeded before this passes.
async function verifyDemoSeed(demoUserId: string, buddyId: string): Promise<void> {
  const [profile, pool, languages, exclusion, membership] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("display_name, name_confirmed_at, ai_consent_at")
      .eq("id", demoUserId)
      .maybeSingle(),
    supabaseAdmin.from("buddy_pool").select("user_id").eq("user_id", demoUserId),
    supabaseAdmin.from("language_progress").select("language").eq("user_id", demoUserId),
    supabaseAdmin.from("buddy_pool_exclusions").select("user_id").eq("user_id", demoUserId),
    supabaseAdmin.from("buddy_members").select("pair_id").eq("user_id", demoUserId).maybeSingle(),
  ]);
  assertNoWriteErrors("read back the demo account", [
    profile,
    pool,
    languages,
    exclusion,
    membership,
  ]);

  let pair: DemoSeedState["pair"] = null;
  if (membership.data) {
    const [pairRow, members] = await Promise.all([
      supabaseAdmin
        .from("buddy_pairs")
        .select("source, ended_at")
        .eq("id", membership.data.pair_id)
        .single(),
      supabaseAdmin.from("buddy_members").select("user_id").eq("pair_id", membership.data.pair_id),
    ]);
    assertNoWriteErrors("read back the demo pair", [pairRow, members]);
    pair = {
      source: pairRow.data!.source as string,
      endedAt: pairRow.data!.ended_at as string | null,
      memberIds: (members.data ?? []).map((m) => m.user_id as string),
    };
  }

  const state: DemoSeedState = {
    profile: profile.data,
    poolRows: pool.data?.length ?? 0,
    languages: (languages.data ?? []).map((l) => l.language as string),
    excluded: (exclusion.data?.length ?? 0) === 1,
    pair,
  };
  const problems = demoSeedProblems(state, demoUserId, buddyId);
  if (problems.length > 0) {
    throw new Error(`Demo seed read-back failed:\n${problems.join("\n")}`);
  }
}

async function main(): Promise<void> {
  const userId = await resolveOrCreateUser(email, create);
  const episode = await resolveResumeEpisode();
  await resetSeededRows(userId);
  await seedProgress(userId, episode);
  const buddyId = await seedDemoBuddy(userId);
  await verifyDemoSeed(userId, buddyId);
  await reportProEntitlement(userId);

  console.log(`\nSeeded the demo account (${userId}); read-back passed:`);
  console.log(`  - ${SEEDED_LESSONS.length} completed lessons, streak 12`);
  console.log(`  - ${SEEDED_REVIEW_ITEMS.length} review items due today`);
  console.log(
    `  - placement in ${DEMO_SEED.placements.map((p) => p.language).join(", ")}; display name ${DEMO_SEED.displayName}`,
  );
  console.log(
    `  - "${DEMO_SEED.resumeEpisodeSlug}" resumed at ${Math.round(episode.duration_seconds * 0.4)}s of ${episode.duration_seconds}s`,
  );
  console.log(
    `  - paired with the demo study buddy (${DEMO_SEED.buddy.displayName}) with ${DEMO_SEED.buddy.presets.length} preset message(s); no pool row`,
  );
  console.log("  - excluded from stranger matching");
  console.log("  - AI consent reset: the reviewer sees the consent sheet");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
