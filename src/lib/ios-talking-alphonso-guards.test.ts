import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { yamlTarget } from "./ios-project-yml";

/**
 * Source guards for the talking 2D Alphonso in the iOS Practice speaking screen. The Swift cannot run on every
 * machine, so the properties that matter are pinned here: the setting, Reduce Motion, the art really being bundled,
 * no web view, and the one-voice-chooser rule.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
/** Swift source without // comments (doc comments included), so a sentence in a comment never satisfies a guard. */
const code = (p: string) => read(p).replace(/\/\/.*$/gm, "");

const APP = "ios/LearnWithAlphonso";
const KIT = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit";
const ART = `${APP}/AlphonsoAvatar`;
const VIEW = `${APP}/Sources/AlphonsoAvatarView.swift`;
const AVATAR_KIT_FILES = fs
  .readdirSync(path.join(root, KIT))
  .filter((f) => /^Avatar.*\.swift$/.test(f));
const AVATAR_FILES = [VIEW, ...AVATAR_KIT_FILES.map((f) => `${KIT}/${f}`)];

const manifest = JSON.parse(read(`${ART}/manifest.json`)) as {
  layers: Record<string, { x: number; y: number; w: number; h: number }>;
};

describe("the setting", () => {
  it("is 'Show Alphonso while practising', stored under one key that defaults to on", () => {
    const layers = code(`${KIT}/AvatarLayers.swift`);
    expect(layers).toMatch(
      /enum AvatarPreference\s*\{[^}]*static let key = "showAlphonsoWhilePractising"/s,
    );
    expect(layers).toMatch(/enum AvatarPreference\s*\{[^}]*static let defaultValue = true/s);
  });

  it("has a toggle in Settings bound to that key with the default", () => {
    const settings = code(`${APP}/Sources/SettingsView.swift`);
    expect(settings).toContain(
      "@AppStorage(AvatarPreference.key) private var showAlphonso = AvatarPreference.defaultValue",
    );
    expect(settings).toContain("Toggle(isOn: $showAlphonso)");
    expect(settings).toContain("Show Alphonso while practising");
  });

  it("gates the stage on the Practice speaking screen, so off leaves the screen as it was", () => {
    const conversation = code(`${APP}/Sources/ConversationView.swift`);
    expect(conversation).toContain(
      "@AppStorage(AvatarPreference.key) private var showAlphonso = AvatarPreference.defaultValue",
    );
    expect(conversation).toMatch(
      /\.safeAreaInset\(edge: \.top, spacing: 0\) \{\s*if showAlphonso \{\s*AlphonsoAvatarStage\(/,
    );
  });
});

describe("Reduce Motion", () => {
  const view = code(VIEW);

  it("is read from the environment", () => {
    expect(view).toContain("@Environment(\\.accessibilityReduceMotion)");
  });

  it("returns before any breathing, sway, ear twitch or glint, but after the mouth and brows are set", () => {
    const poseAt = view.indexOf("frame.pose = machine.pose(");
    const guardAt = view.indexOf("guard !reduceMotion else { return frame }");
    expect(poseAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(poseAt);
    for (const motion of [
      "idle.advance(",
      "idle.twitchingEar",
      "idle.glintProgress",
      "AvatarIdleMotion.swayDegrees(",
      "AvatarIdleMotion.breathScale(",
    ]) {
      const at = view.indexOf(motion);
      expect(at, motion).toBeGreaterThan(guardAt);
    }
  });

  it("moves the whole figure only on the idle clock, never from the voice (the owner rejected the shaking)", () => {
    // Every transform in the view, listed: the breath scale and sway rotation (each a function of the clock alone),
    // the glint band's fixed angle and sweep, and the manifest placement of each layer. A head bob or tilt driven by
    // the speech, the plan or a level would have to add or change one of these lines.
    const transforms = view
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /\.(offset|rotationEffect|scaleEffect)\(/.test(l));
    expect(transforms.sort()).toEqual(
      [
        ".scaleEffect(x: frame.breath.x, y: frame.breath.y, anchor: .bottom)",
        ".rotationEffect(.degrees(frame.swayDegrees), anchor: .bottom)",
        ".rotationEffect(.degrees(20))",
        ".offset(x: (progress - 0.5) * width * 1.6)",
        ".offset(x: canvas * rect.x, y: canvas * rect.y)",
        ".offset(x: canvas * rect.x, y: canvas * rect.y)",
      ].sort(),
    );
    expect(view.match(/frame\.swayDegrees = /g)).toHaveLength(1);
    expect(view).toContain("frame.swayDegrees = AvatarIdleMotion.swayDegrees(at: now)");
    expect(view.match(/frame\.breath = /g)).toHaveLength(1);
    expect(view).toContain("frame.breath = AvatarIdleMotion.breathScale(at: now)");
    const idle = code(`${KIT}/AvatarIdle.swift`);
    expect(idle).toContain("static func swayDegrees(at time: TimeInterval) -> Double");
    expect(idle).toContain("static func breathScale(at time: TimeInterval) -> (x: Double, y: Double)");
  });

  it("keeps the idle motion out of the Kit state machine, which has no Reduce Motion input", () => {
    expect(code(`${KIT}/AvatarMachine.swift`)).not.toMatch(/reduceMotion/i);
  });
});

describe("the art", () => {
  const files = fs.readdirSync(path.join(root, ART));
  const expectedWebp = Object.keys(manifest.layers).map((n) => `${n}.webp`);

  it("ships every layer in the manifest, plus the manifest, and nothing else", () => {
    expect(expectedWebp).toHaveLength(15);
    expect([...files].sort()).toEqual([...expectedWebp, "manifest.json"].sort());
    for (const f of expectedWebp)
      expect(fs.statSync(path.join(root, ART, f)).size, f).toBeGreaterThan(100);
  });

  it("is a folder reference in the app target's resources", () => {
    const app = yamlTarget(read(`${APP}/project.yml`), "LearnWithAlphonso");
    expect(app).toMatch(/- path: AlphonsoAvatar\n\s+type: folder\n\s+buildPhase: resources/);
  });

  it("is named in Swift exactly as it is on disk", () => {
    const layers = code(`${KIT}/AvatarLayers.swift`);
    expect(layers).toContain('"mouth-\\(viseme.rawValue).webp"');
    expect(layers).toContain('"brows-\\(brows.rawValue).webp"');
    expect(layers).toContain(
      '"ear-\\(side == .left ? "left" : "right")-\\(twitching ? "twitch" : "neutral").webp"',
    );
    expect(layers).toContain('baseFile = "base.webp"');
    expect(layers).toContain('glintMaskFile = "glint-mask.webp"');
    for (const mouth of ["half", "talk", "ah", "oh", "ee", "fv"])
      expect(manifest.layers[`mouth-${mouth}`], mouth).toBeDefined();
    expect(code(`${KIT}/AvatarVisemes.swift`)).toMatch(
      /enum AvatarViseme[^{]*\{\s*case closed, half, talk, ah, oh, ee, fv\s*\}/,
    );
  });

  it("is placed with the manifest's own rectangles", () => {
    const layers = code(`${KIT}/AvatarLayers.swift`);
    const rect = (name: string, id: string) => {
      const r = manifest.layers[name];
      const pattern = new RegExp(
        `${id} = AvatarRect\\(\\s*x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h}\\)`,
      );
      expect(layers, name).toMatch(pattern);
    };
    rect("mouth-ah", "mouthRect");
    rect("brows-neutral", "browsRect");
    rect("ear-left-neutral", "earLeftRect");
    rect("ear-right-neutral", "earRightRect");
    rect("glint-mask", "glintRect");
  });
});

describe("what he is built from", () => {
  it("has no web view, scene kit or sprite kit, and no new dependency", () => {
    for (const f of AVATAR_FILES) {
      const src = code(f);
      expect(src, f).not.toMatch(
        /WKWebView|import WebKit|SFSafariViewController|import SpriteKit|import SceneKit|import RealityKit/,
      );
    }
  });

  it("is decorative and never takes a touch", () => {
    const view = code(VIEW);
    expect(view).toContain(".accessibilityHidden(true)");
    expect(view).toContain(".allowsHitTesting(false)");
  });

  it("is drawn from the reply audio's own clock, not a second voice", () => {
    const view = code(VIEW);
    expect(view).toContain("voice.replyPlayback");
    for (const f of AVATAR_FILES)
      expect(code(f), f).not.toMatch(
        /AVSpeechSynthesizer|AVSpeechUtterance|AVSpeechSynthesisVoice/,
      );
  });

  it("keeps SpeechVoice as the only place that chooses an on-device voice", () => {
    const swift = (dir: string): string[] =>
      fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = path.posix.join(dir, e.name);
        if (e.isDirectory()) return swift(rel);
        return e.name.endsWith(".swift") ? [rel] : [];
      });
    const users = swift(`${APP}/Sources`).filter((f) =>
      code(f).includes("AVSpeechSynthesisVoice(language:"),
    );
    expect(users).toEqual([`${APP}/Sources/SpeechVoice.swift`]);
  });

  it("commits no local path", () => {
    const own = [...AVATAR_FILES, `${ART}/manifest.json`];
    for (const f of own)
      expect(read(f), f).not.toMatch(/[A-Za-z]:[\\/](?:Users|Agent|Temp)|\/Users\/|AgentDev/);
  });
});
