import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Buying a streak freeze with XP on iOS. The app target only compiles in CI, so these pin the source.
const app = (p: string) =>
  readFileSync(`ios/LearnWithAlphonso/Sources/${p}`, "utf8").replace(/\r\n/g, "\n");
const kit = (p: string) =>
  readFileSync(`ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/${p}`, "utf8").replace(
    /\r\n/g,
    "\n",
  );

const row = app("StreakFreezeRow.swift");
const browser = app("LessonBrowserView.swift");
const shop = kit("StreakFreezeShop.swift");

describe("streak freeze purchase on iOS", () => {
  it("charges the price the server charges (migration and web agree)", () => {
    const sql = readFileSync(
      "supabase/migrations/20260930130000_fix_xp_purchase_cost_injection.sql",
      "utf8",
    );
    const serverCost =
      /CREATE FUNCTION public.buy_streak_freeze_with_xp[\s\S]*?cost constant integer := (\d+)/.exec(
        sql,
      )?.[1];
    const web = /XP_STREAK_FREEZE_COST = (\d+)/.exec(
      readFileSync("src/lib/sync.functions.ts", "utf8"),
    )?.[1];
    expect(serverCost).toBe(web);
    expect(shop).toContain(`static let xpCost = ${serverCost}`);
  });

  it("the Learn screen shows the row under the status header, fed by the cached progress and the network state", () => {
    const header = browser.indexOf("StatusHeaderView(progress:");
    const at = browser.indexOf("StreakFreezeRow(");
    const next = browser.indexOf("if let next = nextLesson");
    expect(header).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(header);
    expect(at).toBeLessThan(next);
    expect(browser).toContain("isOnline: networkMonitor.isConnected");
    expect(browser).toContain("onBought: { syncQueueStore.updateLastKnownProgress($0) }");
  });

  it("buy calls the Kit RPC for the active course and is disabled with a reason", () => {
    expect(row).toContain("client.buyStreakFreezeWithXp(course: course.wireCode)");
    expect(row).toContain(".disabled(disabledReason != nil)");
    expect(row).toContain("StreakFreezeShop.disabledReason(isOnline: isOnline");
    expect(row).toContain("Text(reason)"); // the reason is shown, not only implied by a dimmed button
    expect(shop).toContain("Go online to buy a streak freeze.");
  });

  it("updates the cache only after the server confirms (no optimistic spend)", () => {
    const buy = row.slice(row.indexOf("private func buy()"));
    const call = buy.indexOf("buyStreakFreezeWithXp");
    const confirm = buy.indexOf("if StreakFreezeShop.isSuccess(result)");
    const cache = buy.indexOf("onBought(updated)");
    expect(call).toBeGreaterThan(-1);
    expect(confirm).toBeGreaterThan(call);
    expect(cache).toBeGreaterThan(confirm);
    expect(buy.slice(0, call)).not.toContain("onBought");
    expect(buy.slice(0, call)).not.toContain("confirmed =");
    expect(shop).toContain("guard case let .ok(freezes, xp) = result else { return p }");
  });

  it("handles not-enough-XP and a failed request with a visible message", () => {
    expect(shop).toContain("Not enough XP. A streak freeze costs");
    expect(row).toContain("notice = StreakFreezeShop.message(for: result)");
    expect(row).toContain("notice = Copy.connectionFailure");
  });

  it("has VoiceOver labels and wraps under Dynamic Type", () => {
    expect(row).toContain(".accessibilityLabel(StreakFreezeShop.accessibilityLabel(");
    expect(row).toContain(".accessibilityHint(disabledReason ??");
    expect(row).toContain("UIAccessibility.post(notification: .announcement");
    expect(row).toContain("ViewThatFits(in: .horizontal)");
    expect(row).toContain(".fixedSize(horizontal: false, vertical: true)");
    expect(row).not.toMatch(/\.lineLimit\(1\)/);
  });
});
