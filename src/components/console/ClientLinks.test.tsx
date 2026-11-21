// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClientLinks } from "./ClientLinks";
import { ConsolePending } from "./ConsolePending";
import { ConsoleFrame } from "./ConsoleFrame";
import { DEFAULT_SCOPES } from "../../lib/staff-scopes";

afterEach(() => cleanup());

function frame(navigate = vi.fn()) {
  render(
    <ClientLinks navigate={navigate}>
      <a href="/support">Support</a>
      <a href="/support?t=1">With search</a>
      <a href="https://example.com/x">External</a>
      <a href="//evil.example/x">Protocol relative</a>
      <a href="/users" target="_blank">
        New tab
      </a>
      <a href="/file.csv" download>
        Download
      </a>
      <a href="#top">Anchor</a>
      <a href="/health">
        <span>Inner</span>
      </a>
    </ClientLinks>,
  );
  return navigate;
}

describe("in-app links navigate on the client, never with a full page load", () => {
  it("a plain click on an in-app link goes through the router and the browser does not load a page", () => {
    const navigate = frame();
    const link = screen.getByRole("link", { name: "Support" });
    // fireEvent returns false when preventDefault was called (the browser would NOT follow the link)
    expect(fireEvent.click(link)).toBe(false);
    expect(navigate).toHaveBeenCalledWith("/support");
    expect(fireEvent.click(screen.getByRole("link", { name: "With search" }))).toBe(false);
    expect(navigate).toHaveBeenLastCalledWith("/support?t=1");
    // a click on something INSIDE the link counts
    expect(fireEvent.click(screen.getByText("Inner"))).toBe(false);
    expect(navigate).toHaveBeenLastCalledWith("/health");
  });

  it("leaves to the browser what the browser should handle", () => {
    const navigate = frame();
    for (const name of ["External", "Protocol relative", "New tab", "Download", "Anchor"]) {
      expect(fireEvent.click(screen.getByRole("link", { name })), name).toBe(true);
    }
    const link = screen.getByRole("link", { name: "Support" });
    for (const mod of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      expect(fireEvent.click(link, mod), JSON.stringify(mod)).toBe(true);
    }
    expect(fireEvent.click(link, { button: 1 })).toBe(true); // middle click
    expect(navigate).not.toHaveBeenCalled();
  });

  it("the shell's rail items are links inside it, so they navigate on the client too", async () => {
    const navigate = vi.fn();
    render(
      <ClientLinks navigate={navigate}>
        <ConsoleFrame
          pathname="/"
          loadIdentity={async () => ({
            me: { displayName: "Sam", role: "support", scopes: [...DEFAULT_SCOPES.support] },
            counts: {},
          })}
          subscribeAuth={() => () => {}}
          onSignOut={() => {}}
        >
          <a href="/support">In-page link</a>
        </ConsoleFrame>
      </ClientLinks>,
    );
    const rail = await screen.findByRole("navigation", { name: "Console" });
    const item = rail.querySelector<HTMLAnchorElement>("a[href='/users']")!;
    expect(fireEvent.click(item)).toBe(false);
    expect(navigate).toHaveBeenCalledWith("/users");
    expect(fireEvent.click(screen.getByRole("link", { name: "In-page link" }))).toBe(false);
    expect(navigate).toHaveBeenLastCalledWith("/support");
  });
});

describe("a page whose identity is still loading shows a neutral state, never the sign-in form", () => {
  it("the pending state is a plain loading line", () => {
    render(<ConsolePending />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/sign in/i)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it("every identity-gated route skips the server render (so no loader decides 'signed out' without a session)", () => {
    const gated = readdirSync("admin/routes").filter(
      (f) => f.endsWith(".tsx") && !["__root.tsx", "signin.tsx", "support_.$id.tsx"].includes(f),
    );
    expect(gated.length).toBeGreaterThan(8);
    for (const f of gated) {
      expect(readFileSync(`admin/routes/${f}`, "utf8"), f).toMatch(/\bssr:\s*false\b/);
    }
  });

  it("the router renders the neutral pending state, and the root wraps every page in the client-link handler", () => {
    expect(readFileSync("admin/router.tsx", "utf8")).toContain(
      "defaultPendingComponent: ConsolePending",
    );
    expect(readFileSync("admin/routes/__root.tsx", "utf8")).toMatch(
      /<ClientLinks[\s\S]*<ConsoleFrame[\s\S]*<\/ConsoleFrame>[\s\S]*<\/ClientLinks>/,
    );
  });

  it("a resolved signed-out identity still sends the person to /signin (from the loader, in the browser)", () => {
    for (const f of [
      "index",
      "support",
      "users",
      "reports",
      "numbers",
      "staff",
      "audit",
      "health",
    ]) {
      const src = readFileSync(`admin/routes/${f}.tsx`, "utf8");
      expect(src, f).toMatch(/redirect\(\{\s*to:\s*"\/signin"|forbiddenOrSignIn\(/);
    }
  });
});
