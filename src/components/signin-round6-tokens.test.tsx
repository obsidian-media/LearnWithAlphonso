// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { TextField } = await import("./TextField");
const { CookieConsent } = await import("./CookieConsent");

// The legacy surface/parchment/hairline/moss tokens resolve to the old mint-green theme.
// The sign-in screen, its inputs and the cookie banner must use the round-6 cream and navy ds-* tokens.
const LEGACY = /\b(bg-surface|bg-parchment|border-hairline|focus:border-moss)\b/;

describe("sign-in surfaces use round-6 tokens, not the mint theme", () => {
  it("TextField", () => {
    const { container } = render(<TextField placeholder="Email" />);
    const cls = container.querySelector("input")!.className;
    expect(cls).not.toMatch(LEGACY);
    expect(cls).toContain("bg-ds-card");
    expect(cls).toContain("border-ds-line");
  });

  it("cookie banner", () => {
    window.localStorage.clear();
    const { container } = render(<CookieConsent />);
    const html = container.innerHTML + document.body.innerHTML;
    expect(html).not.toMatch(LEGACY);
    expect(html).toContain("bg-ds-card");
  });

  it("the Google button and the OR divider on the auth route", () => {
    const src = fs.readFileSync(path.join(__dirname, "../routes/auth.tsx"), "utf8");
    const google = src.slice(src.indexOf("google-g.svg") - 400, src.indexOf("google-g.svg"));
    expect(google).not.toMatch(LEGACY);
    expect(google).toContain("bg-ds-card");
    const divider = src.slice(
      src.indexOf("absolute inset-x-0 top-1/2"),
      src.indexOf("absolute inset-x-0 top-1/2") + 300,
    );
    expect(divider).not.toMatch(LEGACY);
    expect(divider).toContain("bg-ds-surface");
  });
});
