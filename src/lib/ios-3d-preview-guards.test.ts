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
    // Pin both bodies whole: an extra `|| true`, `|| receiptFileName == nil` or a dropped #if must go red.
    expect(channel).toMatch(
      /static func isTestFlight\(receiptFileName: String\?\) -> Bool \{\s*receiptFileName == "sandboxReceipt"\s*\}/,
    );
    expect(channel).toMatch(
      /static var isTestFlightOrDebug: Bool \{\s*#if DEBUG\s*return true\s*#else\s*return isTestFlight\(receiptFileName: Bundle\.main\.appStoreReceiptURL\?\.lastPathComponent\)\s*#endif\s*\}/,
    );
    expect(channel.match(/return true/g)).toHaveLength(1);
  });

  it("the Practice tab entry is gated by BuildChannel.isTestFlightOrDebug", () => {
    expect(practice).toMatch(
      /if BuildChannel\.isTestFlightOrDebug \{\s*NavigationLink \{\s*Alphonso3DPreviewView\(\)/,
    );
    expect(practice).toContain('Text("Preview")');
  });

  it("nothing else in the app opens the preview screen", () => {
    const hits = walk(IOS)
      .filter((p) => p.endsWith(".swift") && !p.endsWith("Alphonso3DPreviewView.swift"))
      .filter((p) => read(p).includes("Alphonso3DPreviewView"))
      .map((p) => p.split("\\").join("/"));
    expect(hits).toEqual([`${SRC}/ConversationView.swift`]);
    // Exactly one use in the Practice tab, and it is the gated one.
    expect(practice.match(/Alphonso3DPreviewView/g)).toHaveLength(1);
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

  it("never navigates away from the bundled page", () => {
    expect(view).toContain("decidePolicyFor navigationAction: WKNavigationAction");
    expect(view).toMatch(/url\?\.isFileURL == true\s*&& url\?\.lastPathComponent == "index\.html"/);
    expect(view).toContain("decisionHandler(allowed ? .allow : .cancel)");
  });

  it("a hung download ends in the error state, and closing the screen tears the page down", () => {
    expect(view).toContain("static let stallTimeout: TimeInterval = 45");
    expect(view).toMatch(/func load\(_ token: Int\) \{[^}]*armTimeout\(\)/);
    expect(view).toMatch(/static func dismantleUIView[^}]*window\.__teardown/);
    const page = read(`${IOS}/LearnWithAlphonso/Preview3D/index.html`);
    expect(page).toContain("window.__teardown = function");
    expect(page).toContain("renderer.forceContextLoss()");
    expect(page).toContain("ac.close()");
    expect(page).toContain("cancelAnimationFrame(rafId)");
  });

  it("shows a native loading state until the page posts ready, and Retry on a failed download", () => {
    expect(view).toContain('case "ready": finish(.ready)');
    expect(view).toContain('case "error": finish(.failed)');
    expect(view).toContain('Button("Retry")');
    expect(view).toContain("reloadToken += 1");
    const page = read(`${IOS}/LearnWithAlphonso/Preview3D/index.html`);
    expect(page).toContain("postNative({ type: 'ready' })");
    expect(page).toContain("postNative({ type: 'error', reason: 'model' })");
  });
});
