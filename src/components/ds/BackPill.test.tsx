// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackPill } from "./Blocks";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

/*
 * QA round 5: at 320px the League header (Back + Teams / Season / Recap) was 338px wide and the page scrolled sideways.
 * jsdom has no layout, so this pins the classes that let the row wrap instead: the row must allow wrapping, and the
 * trailing group must be able to wrap inside itself.
 */
describe("BackPill row at narrow widths", () => {
  it("lets the trailing group drop to its own line instead of overflowing", () => {
    render(
      <BackPill to="/profile" label="Back to profile" trailing={<span>trailing</span>}>
        Profile
      </BackPill>,
    );
    const row = screen.getByRole("link", { name: "Back to profile" }).parentElement!;
    expect(row.className).toMatch(/\bflex-wrap\b/);
  });

  it("the League header's own button group wraps and never exceeds its row", () => {
    const league = readFileSync(
      path.resolve(import.meta.dirname, "../../routes/_authenticated/league.tsx"),
      "utf8",
    );
    const group = /trailing=\{\s*<span className="([^"]+)">/.exec(league)?.[1] ?? "";
    expect(group).toMatch(/\bflex-wrap\b/);
    expect(group).toMatch(/\bmax-w-full\b/);
  });
});
