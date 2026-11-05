import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The TestFlight-only 3D preview was removed before any App Store submission: App Review installs carry a sandbox
// receipt like TestFlight, so a receipt-gated screen would have been shown to review, and the page loaded third-party
// script and a remote model into a web view. Nothing of it may come back into the app target. The app target only
// compiles in CI (ios-app-build), so this reads the sources and project.yml.
const APP = "ios/LearnWithAlphonso";
const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".build" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("no preview-only 3D screen in the iOS app", () => {
  it("the page, its folder and the screen are gone", () => {
    expect(existsSync(`${APP}/Preview3D`)).toBe(false);
    expect(existsSync(`${APP}/Sources/Alphonso3DPreviewView.swift`)).toBe(false);
    expect(existsSync(`${APP}/Sources/BuildChannel.swift`)).toBe(false);
  });

  it("project.yml bundles no preview folder", () => {
    expect(read(`${APP}/project.yml`)).not.toMatch(/Preview3D/);
  });

  it("no Swift source gates anything on the install's receipt or opens the preview", () => {
    const swift = walk("ios").filter((p) => p.endsWith(".swift"));
    const hits = swift.filter((p) =>
      /Alphonso3DPreviewView|BuildChannel|sandboxReceipt|practice3DPreviewRow/.test(read(p)),
    );
    expect(hits).toEqual([]);
  });

  it("no bundled web page loads script from a CDN, and no 3D model is in the repo", () => {
    const files = walk("ios");
    expect(files.filter((p) => /\.(glb|gltf)$/i.test(p))).toEqual([]);
    const pages = files.filter((p) => /\.html?$/i.test(p));
    expect(pages.filter((p) => /cdn\.jsdelivr|unpkg\.com|cloudfront\.net/.test(read(p)))).toEqual([]);
  });
});
