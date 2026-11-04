import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Buying a streak freeze with XP on iOS. The app target only compiles in CI, so these pin the source.
const norm = (s: string) => s.replace(/\r\n/g, "\n");
const app = (p: string) => norm(readFileSync(`ios/LearnWithAlphonso/Sources/${p}`, "utf8"));
const kit = (p: string) =>
  norm(readFileSync(`ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/${p}`, "utf8"));

const row = app("StreakFreezeRow.swift");
const browser = app("LessonBrowserView.swift");
const shop = kit("StreakFreezeShop.swift");
const client = kit("ProgressSyncClient.swift");

/** The cost in the newest migration that (re)defines the purchase function. */
function serverCost(): string | undefined {
  const dir = "supabase/migrations";
  const defining = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      /CREATE (OR REPLACE )?FUNCTION public\.buy_streak_freeze_with_xp/i.test(
        readFileSync(`${dir}/${f}`, "utf8"),
      ),
    );
  const sql = readFileSync(`${dir}/${defining[defining.length - 1]}`, "utf8");
  const fn = sql.slice(
    sql.search(/CREATE (OR REPLACE )?FUNCTION public\.buy_streak_freeze_with_xp/i),
  );
  return /cost constant integer := (\d+)/.exec(fn)?.[1];
}

function between(src: string, from: string, to?: string): string {
  const i = src.indexOf(from);
  expect(i, `missing: ${from}`).toBeGreaterThan(-1);
  const rest = src.slice(i);
  if (!to) return rest;
  const j = rest.indexOf(to, from.length);
  expect(j, `missing: ${to}`).toBeGreaterThan(-1);
  return rest.slice(0, j);
}

describe("streak freeze purchase on iOS", () => {
  it("charges the price the newest migration charges, and web and Android say the same number", () => {
    const cost = serverCost();
    expect(cost).toMatch(/^\d+$/);
    const web = /XP_STREAK_FREEZE_COST = (\d+)/.exec(
      readFileSync("src/lib/sync.functions.ts", "utf8"),
    )?.[1];
    expect(web).toBe(cost);
    expect(shop).toContain(`static let xpCost = ${cost}`);
    const learnDir =
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/learn";
    const vm = norm(readFileSync(`${learnDir}/LearnViewModel.kt`, "utf8"));
    const screen = norm(readFileSync(`${learnDir}/LearnScreen.kt`, "utf8"));
    expect(vm).toContain(`const val STREAK_FREEZE_XP_COST = ${cost}`);
    expect(vm).toContain("costs $STREAK_FREEZE_XP_COST XP");
    expect(screen).toContain("Buy freeze ($STREAK_FREEZE_XP_COST XP)");
    // No stale literal price anywhere in the Android purchase copy.
    expect(vm + screen).not.toMatch(/freeze[^\n]*\b50 XP/i);
  });

  it("the Learn screen shows the row under the status header, for the active course", () => {
    const header = browser.indexOf("StatusHeaderView(progress:");
    const at = browser.indexOf("StreakFreezeRow(");
    const next = browser.indexOf("if let next = nextLesson");
    expect(header).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(header);
    expect(at).toBeLessThan(next);
    const call = between(browser, "StreakFreezeRow(", "if let next = nextLesson");
    expect(call).toContain("course: course");
    expect(call).toContain("isOnline: networkMonitor.isConnected");
  });

  it("checks XP for the course being charged, not the header cache's most-recent course", () => {
    // The row takes no XP from the cache at all.
    expect(row).not.toMatch(/progress\.xp|cachedXp|lastKnownProgress/);
    expect(row).toContain("client.fetchStreakFreezeStatus(course: course.wireCode)");
    expect(row).toContain("StreakFreezeShop.disabledReason(isOnline: isOnline, xp: status?.xp");
    // Switching course drops the old balance before the new one loads.
    const task = between(
      row,
      '.task(id: "\\(course.wireCode)-\\(isOnline)")',
      "private var summary",
    );
    expect(task.indexOf("status = nil")).toBeGreaterThan(-1);
    expect(task.indexOf("status = nil")).toBeLessThan(task.indexOf("fetchStreakFreezeStatus"));
    // The status read filters by language and never uses the "latest row" query.
    const fetch = between(client, "func fetchStreakFreezeStatus", "func buyHeartWithXp");
    expect(fetch).toContain('URLQueryItem(name: "language", value: "eq.\\(course)")');
    expect(fetch).not.toContain("updated_at.desc");
  });

  it("the shared header cache only ever gets the freeze count, never another course's XP", () => {
    const cached = between(
      shop,
      "public static func cachedProgress",
      "public static func recoveryMessage",
    );
    expect(cached).toContain("xp: p.xp");
    const wire = between(browser, "onFreezesChanged:", "if let next = nextLesson");
    expect(wire).toContain("StreakFreezeShop.cachedProgress(freezes: freezes, from: latest)");
    expect(wire).toContain("syncQueueStore.lastKnownProgress()");
    expect(browser).not.toMatch(/updateLastKnownProgress\([^)]*\.xp/);
  });

  it("a second tap cannot start a second purchase", () => {
    const button = between(row, "Button {", "} label: {");
    const guardAt = button.indexOf("guard !buying else { return }");
    const setAt = button.indexOf("buying = true");
    const taskAt = button.indexOf("Task {");
    expect(guardAt).toBeGreaterThan(-1);
    expect(setAt).toBeGreaterThan(guardAt);
    expect(taskAt).toBeGreaterThan(setAt);
    expect(row).toContain(".disabled(disabledReason != nil)");
    expect(between(row, "private func buy()", undefined)).toContain("defer { buying = false }");
  });

  it("is disabled with a visible reason offline or short of XP", () => {
    expect(row).toContain("Text(reason)");
    expect(shop).toContain("Go online to buy a streak freeze.");
    expect(shop).toContain("if xp < xpCost");
    expect(row).toContain(".accessibilityHint(disabledReason ??");
  });

  it("updates the cache only after the server confirms (no optimistic spend)", () => {
    const buy = between(row, "private func buy()", undefined);
    const call = buy.indexOf("buyStreakFreezeWithXp");
    const confirm = buy.indexOf("if StreakFreezeShop.isSuccess(result)");
    const cache = buy.indexOf("onFreezesChanged(confirmed.streakFreezes)");
    expect(call).toBeGreaterThan(-1);
    expect(confirm).toBeGreaterThan(call);
    expect(cache).toBeGreaterThan(confirm);
    expect(buy.slice(0, call)).not.toContain("onFreezesChanged");
    expect(buy.slice(0, call)).not.toContain("status =");
    expect(
      between(shop, "public static func status", "public static func cachedProgress"),
    ).toContain(
      "case let .ok(freezes, xp): return StreakFreezeStatus(xp: xp, streakFreezes: freezes)",
    );
  });

  it("a lost response re-reads the server and applies it instead of inviting another tap", () => {
    const buy = between(row, "private func buy()", undefined);
    const caught = between(buy, "} catch {", undefined);
    expect(caught).toContain("fetchStreakFreezeStatus(course: course.wireCode)");
    expect(caught).toContain("onFreezesChanged(reread.streakFreezes)");
    expect(caught).toContain("StreakFreezeShop.recoveryMessage(before: before, after: reread)");
  });

  it("a refusal updates the balance so Buy disables, and a signed-out answer is not 'not enough XP'", () => {
    expect(client).toContain(
      '(row["reason"] as? String) == "unauthenticated" { return .signedOut }',
    );
    expect(client).toContain(
      '.insufficientXp(streakFreezes: row["streak_freezes"] as? Int, xp: row["xp"] as? Int)',
    );
    expect(between(shop, "public static func message", "public static func isSuccess")).toContain(
      "case .signedOut: return TutorError.signedOut.userMessage()",
    );
    expect(between(row, "private func buy()", undefined)).toContain(
      "status = StreakFreezeShop.status(after: result, from: current)",
    );
  });

  it("every outcome is announced to VoiceOver, and the labels are set", () => {
    const buy = between(row, "private func buy()", undefined);
    // The token-nil path, the result path and the lost-response path each call say(...).
    expect(between(buy, "guard let client", "let before")).toContain("say(Copy.connectionFailure)");
    expect(between(buy, "let result", "} catch {")).toContain(
      "say(StreakFreezeShop.message(for: result))",
    );
    expect(between(buy, "} catch {", undefined)).toContain("say(StreakFreezeShop.recoveryMessage");
    expect(between(row, "private func say", "private func buy()")).toContain(
      "UIAccessibility.post(notification: .announcement, argument: message)",
    );
    expect(row).not.toContain(".updatesFrequently");
    expect(row).toContain(".accessibilityLabel(StreakFreezeShop.accessibilityLabel(");
  });

  it("wraps under Dynamic Type: no line limits, no fixed heights, text sizes are scalable fonts", () => {
    expect(row).toContain("ViewThatFits(in: .horizontal)");
    expect(row).not.toMatch(/lineLimit\(/);
    expect(row).not.toMatch(/\.frame\(\s*(min|max|ideal)?[Hh]eight/);
    expect(row).not.toMatch(/minimumScaleFactor|truncationMode/);
    expect(
      row.match(/\.fixedSize\(horizontal: false, vertical: true\)/g)?.length,
    ).toBeGreaterThanOrEqual(4);
  });
});
