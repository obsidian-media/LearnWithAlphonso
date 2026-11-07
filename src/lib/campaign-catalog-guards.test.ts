import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAMPAIGNS, campaignsFor } from "@/data/campaigns";

/**
 * The campaign catalogue is data, not UI: every platform must render whatever the
 * bundle holds. These guards fail if a platform's bundled JSON drifts from
 * src/data/campaigns*.ts, if a list screen stops showing every campaign, or if a
 * campaign or scene id is hard-coded into UI code. The iOS app target only compiles in
 * CI, so its guards read the Swift source text (like the ios-*.test.ts guards).
 */
const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const ANDROID_APP =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/practice";
const BUNDLES: { label: string; file: (course: "en" | "fr" | "es") => string }[] = [
  {
    label: "iOS app",
    file: (c) => `ios/LearnWithAlphonso/Resources/campaigns${c === "en" ? "" : `-${c}`}.json`,
  },
  {
    label: "iOS Kit",
    file: (c) =>
      `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/campaigns${c === "en" ? "" : `-${c}`}.json`,
  },
  {
    label: "Android",
    file: (c) =>
      `android/LearnWithAlphonso/app/src/main/assets/content/campaigns${c === "en" ? "" : `-${c}`}.json`,
  },
];

/** Every campaign and scene id: none of these may appear as a literal in UI code. */
const ALL_IDS = CAMPAIGNS.flatMap((c) => [c.id, ...c.scenes.map((s) => s.id)]);

/** Returns the catalogue ids found as string literals in a UI source text. */
export function hardCodedCampaignIds(source: string): string[] {
  return ALL_IDS.filter((id) => source.includes(`"${id}"`));
}

const UI_SOURCES = [
  "src/routes/_authenticated/converse.tsx",
  "src/components/practice/PracticeHub.tsx",
  "src/routes/_authenticated/campaign_.$campaignId.tsx",
  "ios/LearnWithAlphonso/Sources/CampaignView.swift",
  "ios/LearnWithAlphonso/Sources/ConversationView.swift",
  `${ANDROID_APP}/PracticeScreens.kt`,
  `${ANDROID_APP}/ConversationViewModels.kt`,
];

describe("bundled campaign JSON matches the catalogue on every platform", () => {
  for (const { label, file } of BUNDLES) {
    for (const course of ["en", "fr", "es"] as const) {
      it(`${label} ${course}: same campaigns, scenes and text as src/data`, () => {
        const bundled = JSON.parse(read(file(course)));
        // Native bundles add a per-scene `persona` (the pre-call sheet's speaker line); it is not in the web catalogue shape.
        const withoutPersona = bundled.map((c: { scenes: Record<string, unknown>[] }) => ({
          ...c,
          scenes: c.scenes.map(({ persona: _persona, ...scene }) => scene),
        }));
        expect(withoutPersona).toEqual(campaignsFor(course));
        expect(bundled.map((c: { id: string }) => c.id)).toEqual(CAMPAIGNS.map((c) => c.id));
      });
    }
  }
});

describe("the campaign list screens show every campaign", () => {
  // The Practice hub (round 6) draws the list; it looks a campaign up by id with find() for "Continue" and the
  // pre-call sheet, so only slice and filter are ruled out here.
  it("web: the Practice hub maps over every campaign for the course, with no slice or filter", () => {
    const src = read("src/components/practice/PracticeHub.tsx");
    expect(src).toMatch(/campaigns\.map\(\(c, i\) =>/);
    expect(src).toContain("CAMPAIGNS.map((c) => localizeCampaign(c, course))");
    expect(src).not.toMatch(/campaigns\.(slice|filter)\(/);
  });

  it("iOS: CampaignPickerSection iterates the whole campaigns array", () => {
    const src = read("ios/LearnWithAlphonso/Sources/PracticeHubView.swift");
    expect(src).toMatch(/ForEach\(campaigns\) \{ c in/);
    expect(src).not.toMatch(/campaigns\.(prefix|filter|dropFirst)\b/);
    expect(src).toContain("contentStore.campaigns(for: course)");
  });

  it("Android: PracticeScreen lists every campaign of the course", () => {
    const src = read(`${ANDROID_APP}/PracticeHubScreen.kt`);
    expect(src).toContain("container.content.campaigns(course)");
    expect(src).toMatch(/items\(campaigns, key = \{ "c-\$\{it\.id\}" \}\)/);
    expect(src).not.toMatch(/campaigns\.(take|first|filter)\b/);
  });

  it("opens a campaign by the id it was listed with, not by a fixed one", () => {
    expect(read("src/components/practice/PracticeHub.tsx")).toContain(
      "onClick={() => openScene(c.id, nextSceneIndex(c.id, rows))}",
    );
    expect(read("src/routes/_authenticated/converse.tsx")).toContain(
      "params: { campaignId: t.campaignId }",
    );
    expect(read(`${ANDROID_APP}/PracticeHubScreen.kt`)).toContain("onOpenCampaign(t.campaign!!.id");
  });
});

describe("no UI code hard-codes a campaign or scene id", () => {
  for (const rel of UI_SOURCES) {
    it(rel, () => {
      expect(hardCodedCampaignIds(read(rel))).toEqual([]);
    });
  }

  it("the id check can fail: it sees a catalogue id used as a literal", () => {
    expect(hardCodedCampaignIds('let id = "city-day"')).toEqual(["city-day"]);
    expect(hardCodedCampaignIds('if (c.id == "new-flat") {}')).toEqual(["new-flat"]);
    expect(hardCodedCampaignIds('route("train-buy-ticket")')).toEqual(["train-buy-ticket"]);
    expect(hardCodedCampaignIds("let id = campaign.id")).toEqual([]);
  });
});
