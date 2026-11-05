import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The 3D Alphonso preview is a TestFlight/debug-only screen. The app target only compiles in CI
// (ios-app-build), so these read the Swift, the page and project.yml.
const IOS = "ios";
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const from = (s: string, marker: string) => {
  const at = s.indexOf(marker);
  expect(at, `missing: ${marker}`).toBeGreaterThan(-1);
  return s.slice(at);
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".build" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("3D Alphonso preview: TestFlight and debug builds only", () => {
  const practice = read(`${SRC}/ConversationView.swift`);
  const channel = read(`${SRC}/BuildChannel.swift`);

  it("BuildChannel is true for a debug build or a TestFlight sandbox receipt, nothing else", () => {
    expect(channel).toContain("enum BuildChannel");
    expect(channel).toContain('receiptFileName == "sandboxReceipt"');
    expect(channel).toContain("Bundle.main.appStoreReceiptURL?.lastPathComponent");
    const prop = from(channel, "static var isTestFlightOrDebug: Bool");
    expect(prop).toMatch(/#if DEBUG\s+return true\s+#else\s+return isTestFlight\(/);
    // Never a bare `return true` outside the DEBUG branch.
    expect(prop.replace(/#if DEBUG\s+return true/, "")).not.toMatch(/return true/);
  });

  it("the Practice tab entry is gated by BuildChannel.isTestFlightOrDebug", () => {
    expect(practice).toMatch(
      /if BuildChannel\.isTestFlightOrDebug \{\s*NavigationLink \{\s*Alphonso3DPreviewView\(\)/,
    );
    expect(practice).toContain('Text("Preview")');
  });

  it("nothing else in the app opens the preview screen", () => {
    const hits = readdirSync(SRC)
      .filter((f) => f.endsWith(".swift") && f !== "Alphonso3DPreviewView.swift")
      .filter((f) => read(`${SRC}/${f}`).includes("Alphonso3DPreviewView("));
    expect(hits).toEqual(["ConversationView.swift"]);
    const dsHits = readdirSync(`${SRC}/DesignSystem`).filter((f) =>
      read(`${SRC}/DesignSystem/${f}`).includes("Alphonso3DPreviewView("),
    );
    expect(dsHits).toEqual([]);
  });
});

describe("3D Alphonso preview: the model is downloaded, never bundled", () => {
  const page = read(`${IOS}/LearnWithAlphonso/Preview3D/index.html`);

  it("loads the model from an https URL at run time", () => {
    const m = page.match(/const MODEL_URL = '([^']+)'/);
    expect(m, "MODEL_URL").not.toBeNull();
    expect(m![1]).toMatch(/^https:\/\/d8j0ntlcm91z4\.cloudfront\.net\/.+\.glb$/);
    expect(page).toContain("new GLTFLoader().load(");
    expect(page).not.toMatch(/GLTFLoader\(\)\.parse\(/);
  });

  it("no .glb or .gltf file exists anywhere under ios/", () => {
    const models = walk(IOS).filter((p) => /\.(glb|gltf)$/i.test(p));
    expect(models).toEqual([]);
  });

  it("project.yml bundles the page folder (html + voice) and no model", () => {
    const yml = read(`${IOS}/LearnWithAlphonso/project.yml`);
    expect(yml).toMatch(/- path: Preview3D\n\s+type: folder\n\s+buildPhase: resources/);
    expect(yml).not.toMatch(/\.glb|\.gltf/i);
    expect(existsSync(`${IOS}/LearnWithAlphonso/Preview3D/index.html`)).toBe(true);
    expect(existsSync(`${IOS}/LearnWithAlphonso/Preview3D/voice.mp3`)).toBe(true);
  });

  it("outbound https needs no App Transport Security exception", () => {
    const plist = read(`${IOS}/LearnWithAlphonso/Info.plist`);
    expect(plist).not.toContain("NSAllowsArbitraryLoads");
    expect(plist).not.toContain("NSExceptionDomains");
  });
});

describe("3D Alphonso preview: the web view", () => {
  const view = read(`${SRC}/Alphonso3DPreviewView.swift`);

  it("is configured for a tap-to-play voice line and a no-flash background", () => {
    expect(view).toContain("config.mediaTypesRequiringUserActionForPlayback = []");
    expect(view).toContain("config.allowsInlineMediaPlayback = true");
    expect(view).toContain("webView.isOpaque = false");
    expect(view).toContain(
      "loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())",
    );
  });

  it("shows a native loading state until the page posts ready, and Retry on a failed download", () => {
    expect(view).toContain('case "ready": onEvent(.ready)');
    expect(view).toContain('case "error": onEvent(.failed)');
    expect(view).toContain('Button("Retry")');
    expect(view).toContain("reloadToken += 1");
    const page = read(`${IOS}/LearnWithAlphonso/Preview3D/index.html`);
    expect(page).toContain("postNative({ type: 'ready' })");
    expect(page).toContain("postNative({ type: 'error', reason: 'model' })");
  });
});
