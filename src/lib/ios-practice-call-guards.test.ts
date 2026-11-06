import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/data/scenarios";
import { yamlTarget } from "./ios-project-yml";

/**
 * Source guards for the full-screen Practice call on iOS. The Swift cannot be built on every machine, so what must
 * not regress is pinned here: a room for every scenario, the scenes being bundled, and the accessibility contract.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\/.*$/gm, "");

const APP = "ios/LearnWithAlphonso";
const SCENES = `${APP}/AlphonsoScenes`;
const VIEW = `${APP}/Sources/PracticeCallView.swift`;

describe("the rooms", () => {
  it("has a picture for every scenario in src/data/scenarios.ts, so a new scenario cannot ship without one", () => {
    const files = new Set(fs.readdirSync(path.join(root, SCENES)));
    for (const s of SCENARIOS) expect(files.has(`${s.id}.webp`), s.id).toBe(true);
    expect(files.has("room-light.webp")).toBe(true);
    expect(files.has("room-dark.webp")).toBe(true);
  });

  it("lists every scenario in the Kit's lookup", () => {
    const kit = code("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AvatarCall.swift");
    for (const s of SCENARIOS) expect(kit, s.id).toContain(`"${s.id}"`);
  });

  it("bundles the scenes folder as resources", () => {
    const app = yamlTarget(read(`${APP}/project.yml`), "LearnWithAlphonso");
    expect(app).toMatch(/- path: AlphonsoScenes\n\s+type: folder\n\s+buildPhase: resources/);
  });

  it("dims a scenario picture with navy multiply at half strength in dark mode", () => {
    const view = code(VIEW);
    expect(view).toContain("blendMode(.multiply)");
    expect(view).toContain("CallScenes.eveningOverlayOpacity");
  });
});

describe("accessibility", () => {
  const view = code(VIEW);
  it("hides Alphonso, the room and the You tile from VoiceOver", () => {
    expect((view.match(/\.accessibilityHidden\(true\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(view).toMatch(/AlphonsoAvatarView\([\s\S]*?\.accessibilityHidden\(true\)/);
  });
  it("labels the three call buttons", () => {
    for (const label of ["Hold to talk", "Show the conversation", "End the call"])
      expect(view).toContain(`"${label}"`);
    expect(view).toContain('"Back to call"');
  });
  it("announces the caption as it changes", () => {
    expect(view).toContain("UIAccessibility.post(notification: .announcement");
  });
  it("keeps the hold-to-talk button on screen: the avatar square is held to 72% of the height", () => {
    expect(view).toContain("min(1.28 * width, 0.72 * height)");
  });
});

describe("campaign conversations", () => {
  const campaign = code(`${APP}/Sources/CampaignView.swift`);
  it("use the call too, in the default study room, and keep the classic screen when the setting is off", () => {
    expect(campaign).toContain("@AppStorage(AvatarPreference.key)");
    expect(campaign).toMatch(/if showAlphonso \{ callScreen \} else \{ classicScreen \}/);
    expect(campaign).toContain("scenarioID: campaign.id");
    const classic = campaign.slice(
      campaign.indexOf("private var classicScreen"),
      campaign.indexOf("private var callScreen"),
    );
    expect(classic).toContain("micButton");
    expect(classic).toContain('Button("Restart scene"');
    expect(classic).not.toContain("PracticeCallView");
  });
  it("keeps Continue, Restart scene and the transcript reachable in the call", () => {
    const call = campaign.slice(campaign.indexOf("private var callScreen"));
    expect(call).toContain("continueToNextScene()");
    expect(call).toContain('Button("Restart scene")');
    expect(call).toContain("transcript");
  });
  it("sends the reply's verdict to the avatar", () => {
    expect(campaign).toContain("client.chatReply(");
    expect(campaign).toMatch(/verdict: chatReply\.verdict/);
  });
  it("no campaign id has a picture of its own, so a campaign gets the default room", async () => {
    const { CAMPAIGNS } = await import("@/data/campaigns");
    const kit = code("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AvatarCall.swift");
    for (const c of CAMPAIGNS) expect(kit, c.id).not.toContain(`"${c.id}"`);
  });
});
