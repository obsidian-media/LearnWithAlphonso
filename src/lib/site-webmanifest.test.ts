import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_COLOR_LIGHT } from "./seo";

const root = path.resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(path.join(root, "public/site.webmanifest"), "utf8")) as {
  theme_color: string;
  background_color: string;
};
const tokensCss = readFileSync(path.join(root, "src/styles/ds-tokens.generated.css"), "utf8");

describe("public/site.webmanifest", () => {
  it("uses the Royal light surface, the same colour as the theme-color meta tag", () => {
    // The first --c-surface in the generated tokens is Royal light (:root).
    const surface = /--c-surface:\s*(#[0-9a-fA-F]{6})/.exec(tokensCss)?.[1];
    expect(surface).toBeDefined();
    expect(manifest.theme_color.toLowerCase()).toBe(surface!.toLowerCase());
    expect(manifest.background_color.toLowerCase()).toBe(surface!.toLowerCase());
    expect(manifest.theme_color.toLowerCase()).toBe(THEME_COLOR_LIGHT.toLowerCase());
  });
});
