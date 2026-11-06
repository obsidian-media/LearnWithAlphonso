import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { countRawValues, findViolations, loadBaseline, scanPlatform } from "./raw-design-values";

/**
 * Web: screens use design tokens, never raw values (the spec's "No raw values"). Scans src/routes and
 * src/components for hex colours, rgb()/hsl()/oklch(), and raw font sizes (Tailwind arbitrary text-[15px],
 * fontSize/font-size numbers). Today's code has some: design/baselines/web.json holds the count per file, and a
 * count may only go down. Files built on the new system (src/components/ds/, or anything using the --c-* tokens,
 * DsIcon or @/design) must have none.
 */
const root = path.resolve(import.meta.dirname, "../..");

describe("web: no raw design values", () => {
  it("no file has more raw colours or font sizes than its baseline, and new-system files have none", () => {
    expect(findViolations(root, "web", loadBaseline(root, "web"))).toEqual([]);
  });

  it("the baseline itself only goes down: never above the 219 raw values it started with (2026-11-06)", () => {
    const total = Object.values(loadBaseline(root, "web")).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(219);
  });

  it("counts what the spec bans", () => {
    expect(countRawValues("web", 'style={{ color: "#1D2B64" }}')).toBe(1);
    expect(countRawValues("web", 'className="bg-[#fff] text-[15px]"')).toBe(2);
    expect(countRawValues("web", "background: rgba(0, 0, 0, .3); color: oklch(50% 0.1 20)")).toBe(
      2,
    );
    expect(countRawValues("web", "style={{ fontSize: 14 }}")).toBe(1);
    expect(countRawValues("web", 'className="bg-ds-surface text-ds-ink"')).toBe(0);
  });
});

describe("web guard proves it can fail", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ds-guard-web-"));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const plant = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), text);
  };

  it("a planted #123456 in a screen with no baseline goes red", () => {
    plant(
      "src/components/Planted.tsx",
      'export const X = () => <div style={{ color: "#123456" }} />;',
    );
    expect(scanPlatform(tmp, "web")).toEqual({ "src/components/Planted.tsx": 1 });
    expect(findViolations(tmp, "web", {})).toEqual([
      "src/components/Planted.tsx: 1 raw value(s), baseline allows 0",
    ]);
  });

  it("a count above its baseline goes red, at or under it stays green", () => {
    expect(findViolations(tmp, "web", { "src/components/Planted.tsx": 0 })).toHaveLength(1);
    expect(findViolations(tmp, "web", { "src/components/Planted.tsx": 1 })).toEqual([]);
  });

  it("a file on the new system goes red even when a baseline lists it", () => {
    plant("src/components/ds/Card.tsx", 'export const C = () => <div className="text-[13px]" />;');
    expect(
      findViolations(tmp, "web", {
        "src/components/Planted.tsx": 1,
        "src/components/ds/Card.tsx": 5,
      }),
    ).toEqual([
      "src/components/ds/Card.tsx: 1 raw value(s) in a design-system file, which must have none",
    ]);
  });
});
