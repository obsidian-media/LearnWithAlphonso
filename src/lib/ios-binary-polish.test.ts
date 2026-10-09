import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { localeForCourse } from "../data/courses";
import { LEAGUE_TIER_COPY } from "./league-tier-copy";
import { yamlSetting, yamlTarget } from "./ios-project-yml";

/**
 * Source guards over the iOS tree and its plists. Local Swift cannot run on every machine, so the properties that
 * make the shipped binary honest are pinned here, where lint-and-typecheck runs them on every pull request.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const projectYml = read("ios/LearnWithAlphonso/project.yml");
const appTarget = yamlTarget(projectYml, "LearnWithAlphonso");
const widgetTarget = yamlTarget(projectYml, "LearnWithAlphonsoWidget");

const MIC_PURPOSE =
  "Learn with Alphonso uses your microphone so you can practise speaking in your lessons and conversations. Recordings are sent for transcription and aren't stored.";

function swiftFilesIn(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) return swiftFilesIn(rel);
    return e.name.endsWith(".swift") ? [rel] : [];
  });
}
const APP_SOURCES = swiftFilesIn("ios/LearnWithAlphonso/Sources");
const KIT_SOURCES = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit";

/** Swift source with comments blanked (string contents kept), same length so line numbers stay true. */
function blankSwiftComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("//", i)) {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i++;
      }
    } else if (src.startsWith("/*", i)) {
      let depth = 0;
      do {
        if (src.startsWith("/*", i)) {
          depth++;
          out += "  ";
          i += 2;
        } else if (src.startsWith("*/", i)) {
          depth--;
          out += "  ";
          i += 2;
        } else {
          out += src[i] === "\n" ? "\n" : " ";
          i++;
        }
      } while (i < src.length && depth > 0);
    } else if (src[i] === '"') {
      const close = src.startsWith('"""', i) ? '"""' : '"';
      out += close;
      i += close.length;
      while (i < src.length && !src.startsWith(close, i)) {
        const step = src[i] === "\\" ? 2 : 1;
        out += src.slice(i, i + step);
        i += step;
      }
      out += close;
      i += close.length;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

const lineAt = (s: string, idx: number) => s.slice(0, idx).split("\n").length;

describe("Info.plist values the reviewer sees", () => {
  it("the target blocks were found (the guard is reading the real file)", () => {
    expect(appTarget).toContain("PRODUCT_BUNDLE_IDENTIFIER: com.obsidianmedia.learnwithalphonso\n");
    expect(widgetTarget).toContain("PRODUCT_BUNDLE_IDENTIFIER: com.obsidianmedia.learnwithalphonso.widget");
  });

  it("the microphone purpose string is exactly the reviewed text and names no single language", () => {
    expect(yamlSetting(appTarget, "INFOPLIST_KEY_NSMicrophoneUsageDescription")).toBe(MIC_PURPOSE);
    expect(MIC_PURPOSE).not.toMatch(/English/);
  });

  it("the home-screen name is Alphonso; the widget keeps its own name", () => {
    expect(yamlSetting(appTarget, "INFOPLIST_KEY_CFBundleDisplayName")).toBe("Alphonso");
    expect(yamlSetting(widgetTarget, "INFOPLIST_KEY_CFBundleDisplayName")).toBe("Streak");
  });

  it("no hand-written Info.plist overrides these keys", () => {
    const plist = read("ios/LearnWithAlphonso/Info.plist");
    expect(plist).not.toContain("NSMicrophoneUsageDescription");
    expect(plist).not.toContain("CFBundleDisplayName");
  });
});

describe("device speech locale", () => {
  const kit = read(`${KIT_SOURCES}/Course+Speech.swift`);
  const kitLocale = (c: string) => new RegExp(`case \\.${c}: return "([^"]+)"`).exec(kit.split("speechLocaleCandidates")[0])?.[1];

  it("web localeForCourse equals the Kit's Course.speechLocale for every course", () => {
    expect(localeForCourse("en")).toBe(kitLocale("english"));
    expect(localeForCourse("fr")).toBe(kitLocale("french"));
    expect(localeForCourse("es")).toBe(kitLocale("spanish"));
  });

  it("Spanish is Latin American on both platforms", () => {
    expect(localeForCourse("es")).toBe("es-MX");
    expect(kitLocale("spanish")).toBe("es-MX");
  });

  it("the app picks voices in exactly one place", () => {
    const users = APP_SOURCES.filter((f) => read(f).includes("AVSpeechSynthesisVoice(language:"));
    expect(users).toEqual(["ios/LearnWithAlphonso/Sources/SpeechVoice.swift"]);
  });

  it("no Spain-Spanish speech locale is left in the app target", () => {
    expect(APP_SOURCES.filter((f) => read(f).includes('"es-ES"'))).toEqual([]);
  });
});

/** Literals that are not copy: identifiers and keys, plus anything only printed to the console. */
const NOT_COPY = [/^sb_publishable_/];

describe("copy rule: no literal -- in user-facing strings", () => {
  it("no string literal in the app or widget contains --", () => {
    const offenders: string[] = [];
    const files = [...APP_SOURCES, ...swiftFilesIn("ios/LearnWithAlphonso/LearnWithAlphonsoWidget")];
    for (const f of files) {
      const code = blankSwiftComments(read(f));
      for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
        if (!m[1].includes("--") || NOT_COPY.some((r) => r.test(m[1]))) continue;
        const line = code.split("\n")[lineAt(code, m.index!) - 1];
        if (/\bprint\(|\bLogger\b|\bos_log\(|\.debug\(|\.error\(/.test(line)) continue;
        offenders.push(`${f}:${lineAt(code, m.index!)}: "${m[1]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** Comments blanked, string contents replaced by "x" (same length), so braces inside strings never count. */
function codeSkeleton(src: string): string {
  const kept = blankSwiftComments(src);
  return kept.replace(/"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"/g, (s) => s.replace(/[^\n"]/g, "x"));
}

function closingIndex(code: string, open: number): number {
  const want = code[open] === "{" ? "}" : ")";
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === code[open]) depth++;
    else if (code[i] === want && --depth === 0) return i;
  }
  return -1;
}

/** Icon-only Button/Menu/Link without an accessibility label, as "file:line". */
function unlabeledIconOnlyControls(file: string, raw: string): string[] {
  const code = codeSkeleton(raw);
  const found: string[] = [];
  const re = /\b(Button|Menu|Link)\s*(\(|\{)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1;
    let label: [number, number] | null = null;
    let end: number;
    if (code[open] === "(") {
      const close = closingIndex(code, open);
      const args = code.slice(open + 1, close);
      const titled = /^\s*"/.test(args) || /^\s*[A-Za-z_][\w.]*\s*(,|$)/.test(args);
      const inner = /label:\s*\{/.exec(args);
      end = close;
      if (inner) {
        const s = open + 1 + inner.index + inner[0].length - 1;
        label = [s, closingIndex(code, s)];
      } else {
        const trail = /^\s*\{/.exec(code.slice(close + 1));
        if (trail) {
          const s = close + 1 + trail[0].length - 1;
          const e = closingIndex(code, s);
          end = e;
          const lab = /^\s*label:\s*\{/.exec(code.slice(e + 1));
          if (lab) {
            const ls = e + 1 + lab[0].length - 1;
            label = [ls, closingIndex(code, ls)];
            end = label[1];
          } else if (!titled && m[1] === "Button" && /action:/.test(args)) {
            label = [s, e];
          }
        }
      }
    } else {
      const e = closingIndex(code, open);
      end = e;
      const lab = /^\s*label:\s*\{/.exec(code.slice(e + 1));
      if (lab) {
        const ls = e + 1 + lab[0].length - 1;
        label = [ls, closingIndex(code, ls)];
        end = label[1];
      }
    }
    if (!label) continue;
    const body = raw.slice(label[0], label[1] + 1);
    if (!/\bImage\(\s*(systemName:|")/.test(body) || /\b(Text|Label)\(/.test(body)) continue;
    const chain = /^(?:[ \t]*\n?[ \t]*(?:\/\/[^\n]*\n[ \t]*)*\.[^\n]*)*/.exec(raw.slice(end + 1))?.[0] ?? "";
    if (/\.accessibilityLabel\(/.test(body) || /\.accessibilityLabel\(/.test(chain)) continue;
    found.push(`${file}:${raw.slice(0, m.index).split("\n").length}`);
  }
  return found;
}

describe("accessibility: icon-only controls", () => {
  it("every icon-only Button, Menu and Link has an accessibility label", () => {
    const offenders = APP_SOURCES.flatMap((f) => unlabeledIconOnlyControls(f, read(f)));
    expect(offenders).toEqual([]);
  });

  it("the scanner recognises the shapes it must catch (self-test)", () => {
    const fixture = [
      'Button { go() } label: { Image(systemName: "gearshape.fill") }', // 1: trailing label, unlabeled
      'Button(action: go) { Image(systemName: "xmark") }', // 2: action form, unlabeled
      'Menu { Button("A") {} } label: { Image(systemName: "ellipsis.circle") }', // 3: menu, unlabeled
      'Button { go() } label: { Image(systemName: "plus") }\n    .accessibilityLabel("Add")', // labelled via chain
      'Button("Done") { go() }', // titled
      'Button { go() } label: { Label("Share", systemImage: "square.and.arrow.up") }', // has a Label
    ].join("\n");
    expect(unlabeledIconOnlyControls("fixture.swift", fixture)).toEqual(["fixture.swift:1", "fixture.swift:2", "fixture.swift:3"]);
  });

  it("every block-or-report menu names the person it acts on", () => {
    const offenders: string[] = [];
    for (const f of APP_SOURCES) {
      const code = codeSkeleton(read(f));
      for (const m of code.matchAll(/\bSocialSafetyMenu\s*\(/g)) {
        const open = m.index! + m[0].length - 1;
        const args = code.slice(open + 1, closingIndex(code, open));
        if (!/\baccessibilityName:/.test(args)) offenders.push(`${f}:${lineAt(code, m.index!)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("team kick needs confirmation", () => {
  const teams = read("ios/LearnWithAlphonso/Sources/TeamsView.swift");
  it("tapping kick only selects the member; the confirmed dialog is the only path to kick()", () => {
    const calls = [...teams.matchAll(/await kick\(/g)].length;
    expect(calls).toBe(1);
    const dialog = teams.slice(teams.indexOf("TeamKickCopy.title("));
    expect(dialog.indexOf("await kick(")).toBeGreaterThan(-1);
    expect(dialog.indexOf("await kick(")).toBeLessThan(dialog.indexOf("TeamKickCopy.message"));
    expect(teams).toContain("kickTarget = member");
  });
});

describe("touch targets", () => {
  const theme = read("ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift");
  const components = read("ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoComponents.swift");
  const styleBody = (name: string) => {
    const start = components.indexOf(`struct ${name}: ButtonStyle`);
    return start < 0 ? "" : components.slice(start, components.indexOf("\n}\n", start));
  };
  it("the minimum touch target is Apple's 44 pt", () => {
    expect(theme).toMatch(/public static let minTouchTarget: CGFloat = 44\b/);
  });
  it("primary and secondary button styles never render shorter than it", () => {
    for (const style of ["AlphonsoPrimaryButtonStyle", "AlphonsoSecondaryButtonStyle"]) {
      expect(styleBody(style), style).toMatch(/minHeight: AlphonsoSpacing\.minTouchTarget/);
    }
    expect(styleBody("AlphonsoSecondaryButtonStyle")).toMatch(/minWidth: AlphonsoSpacing\.minTouchTarget/);
  });
});

describe("live system appearance without the launch-hang loop", () => {
  const observer = read("ios/LearnWithAlphonso/Sources/SystemAppearanceObserver.swift");
  const rootView = read("ios/LearnWithAlphonso/Sources/RootView.swift");
  it("listens for live changes, reading the screen's traits through the Kit gate", () => {
    expect(observer).toMatch(/registerForTraitChanges\(\[UITraitUserInterfaceStyle\.self\]\)/);
    expect(observer).toContain("UIScreen.main.traitCollection.userInterfaceStyle");
    expect(observer).toContain("gate.offer(");
  });
  it("never reads an environment or window colour scheme that .preferredColorScheme can override", () => {
    const code = blankSwiftComments(rootView) + blankSwiftComments(observer);
    expect(code).not.toMatch(/@Environment\(\\\.colorScheme\)/);
    expect(code).not.toMatch(/window[\w?.]*\.traitCollection/);
    expect(rootView).toContain("appearanceObserver.start()");
  });
});

describe("dead-letter notice", () => {
  const view = read("ios/LearnWithAlphonso/Sources/DeadLetterNoticeView.swift");
  it("is on the Learn tab", () => {
    expect(read("ios/LearnWithAlphonso/Sources/LessonBrowserView.swift")).toContain("DeadLetterNoticeSection(syncQueueStore: syncQueueStore)");
  });
  it("dismissing never deletes the records support needs", () => {
    const code = blankSwiftComments(view);
    expect(code).not.toMatch(/\.delete\(|clearAll\(|modelContext/);
    expect(code).toContain("dismissals.dismiss(visible)");
  });
  it("respects Dynamic Type: no line limit, and the actions can stack", () => {
    expect(view).not.toMatch(/\.lineLimit\(/);
    expect(view).toContain("ViewThatFits");
  });
});

describe("league tier display names", () => {
  const swift = read(`${KIT_SOURCES}/LeagueTierCopy.swift`);
  const swiftLabels = Object.fromEntries([...swift.matchAll(/"(\w+)": "([^"]+)",/g)].map((m) => [m[1], m[2]]));
  it("iOS and web show the same name for every tier key", () => {
    expect(swiftLabels).toEqual(Object.fromEntries(Object.entries(LEAGUE_TIER_COPY).map(([k, v]) => [k, v.label])));
  });
  it("the names are Sprout, Sapling, Grove, Treetop and Summit", () => {
    expect(Object.values(swiftLabels)).toEqual(["Sprout", "Sapling", "Grove", "Treetop", "Summit"]);
  });
  it("no iOS view builds a tier name from the raw key", () => {
    const offenders = APP_SOURCES.filter((f) => /newTier[^\n]*\.capitalized|tier\.prefix\(1\)\.uppercased\(\)/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe("acknowledgements", () => {
  const kit = blankSwiftComments(read(`${KIT_SOURCES}/Acknowledgements.swift`));
  const resources = [...kit.matchAll(/licenseResource: "([^"]+)"/g)].map((m) => m[1]);
  const fonts = [...read("ios/LearnWithAlphonso/Info.plist").matchAll(/<string>([\w-]+)\.ttf<\/string>/g)].map((m) => m[1]);

  it("every bundled font is credited with its OFL text, and every licence file exists", () => {
    expect(fonts).toHaveLength(7);
    for (const font of fonts) expect(resources, font).toContain(`${font.split("-")[0]}-OFL`);
    for (const r of resources) {
      const file = r.endsWith("-OFL") ? `ios/LearnWithAlphonso/Sources/Fonts/${r}.txt` : `ios/LearnWithAlphonso/Sources/Licenses/${r}.txt`;
      expect(fs.existsSync(path.join(root, file)), file).toBe(true);
    }
  });
  it("RevenueCat's MIT notice is the real one", () => {
    const text = read("ios/LearnWithAlphonso/Sources/Licenses/RevenueCat-LICENSE.txt");
    expect(text).toMatch(/^MIT License/);
    expect(text).toMatch(/Copyright \(c\) \d{4} RevenueCat, Inc\./);
    expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });
  it("is reachable from Settings", () => {
    expect(read("ios/LearnWithAlphonso/Sources/SettingsView.swift")).toContain('NavigationLink("Acknowledgements") { AcknowledgementsView() }');
  });
});

const ICON = "ios/LearnWithAlphonso/Sources/Assets.xcassets/AppIcon.appiconset/AppIcon.png";
/** sha256 of the icon the owner approved. Change only with a new owner approval. */
const APPROVED_ICON_SHA256 = "e73df539f886074cce4da6fabab0214a4175e082bf16edf3df1d9fa9b6c59fe2";

describe("app icon", () => {
  const file = path.join(root, ICON);
  const png = fs.readFileSync(file);

  it("is a 1024 x 1024, 8-bit, truecolour PNG with no alpha channel and no palette", () => {
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1024, 1024]);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(2); // colour type 2 = RGB (6 would be RGBA, 3 a palette)
  });

  it("is full bleed and not pre-rounded: no near-white pixel in any 16 px corner patch", async () => {
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const corners: Record<string, [number, number]> = { TL: [0, 0], TR: [1008, 0], BL: [0, 1008], BR: [1008, 1008] };
    for (const [name, [cx, cy]] of Object.entries(corners)) {
      let white = 0;
      for (let dy = 0; dy < 16; dy++) {
        for (let dx = 0; dx < 16; dx++) {
          const i = ((cy + dy) * info.width + (cx + dx)) * info.channels;
          if (Math.min(data[i], data[i + 1], data[i + 2]) > 228) white++;
        }
      }
      expect(white, `corner ${name}`).toBe(0);
    }
  });

  it("is the file the owner approved", () => {
    expect(crypto.createHash("sha256").update(png).digest("hex")).toBe(APPROVED_ICON_SHA256);
  });

  it("the asset catalogue keeps its single-size icon entry and every image set the app uses", () => {
    const contents = JSON.parse(read("ios/LearnWithAlphonso/Sources/Assets.xcassets/AppIcon.appiconset/Contents.json"));
    expect(contents.images).toEqual([{ filename: "AppIcon.png", idiom: "universal", platform: "ios", size: "1024x1024" }]);
    const sets = fs
      .readdirSync(path.join(root, "ios/LearnWithAlphonso/Sources/Assets.xcassets"))
      .filter((d) => /\.(imageset|appiconset)$/.test(d))
      .sort();
    expect(sets).toEqual(["Alphonso.imageset", "AppIcon.appiconset", "GoogleG.imageset", "Hector.imageset"]);
    for (const f of ["GoogleG.png", "GoogleG@2x.png", "GoogleG@3x.png"]) {
      expect(fs.existsSync(path.join(root, "ios/LearnWithAlphonso/Sources/Assets.xcassets/GoogleG.imageset", f)), f).toBe(true);
    }
  });
});

describe("orientation keeps the upload validator happy", () => {
  it("the base key still lists all four orientations (ITMS-90474) and iPhone stays portrait", () => {
    expect(yamlSetting(appTarget, "INFOPLIST_KEY_UISupportedInterfaceOrientations")).toBe(
      "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight",
    );
    expect(yamlSetting(appTarget, "INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone")).toBe("UIInterfaceOrientationPortrait");
    expect(appTarget).not.toContain("UIRequiresFullScreen");
  });
  it("the app pins itself to portrait in code, and the iPad test asserts it", () => {
    const delegate = blankSwiftComments(read("ios/LearnWithAlphonso/Sources/AppDelegate.swift"));
    expect(delegate).toMatch(/supportedInterfaceOrientationsFor window: UIWindow\?\)\s*->\s*UIInterfaceOrientationMask\s*\{\s*\.portrait\s*\}/);
    expect(read("ios/LearnWithAlphonso/LearnWithAlphonsoUITests/IPadCompatibilityTests.swift")).toContain("private let expectPortraitLock = true");
  });
});
