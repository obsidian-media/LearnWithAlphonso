// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

const { Route: CookiesRoute } = await import("./cookies");
const { Route: TermsRoute } = await import("./terms");
const { Route: PrivacyRoute } = await import("./privacy");
const { Route: SupportRoute } = await import("./support");

describe("Cookies route", () => {
  it("renders the cookie policy with its sections", () => {
    const Cookies = CookiesRoute.options.component!;
    render(<Cookies />);
    expect(screen.getByRole("heading", { name: "Cookie Policy" })).toBeInTheDocument();
    expect(screen.getByText("Strictly necessary")).toBeInTheDocument();
  });

  it("sets a page title in head()", async () => {
    const meta = (await CookiesRoute.options.head?.({} as never))?.meta;
    expect(meta?.some((m) => m && "title" in m && m.title === "Cookie Policy — Alphonso")).toBe(
      true,
    );
  });
});

describe("Terms route", () => {
  it("renders the terms with a contact address", () => {
    const Terms = TermsRoute.options.component!;
    render(<Terms />);
    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByText(/support@alphonsoecosystem\.app/)).toBeInTheDocument();
  });

  it("names the AI processors", () => {
    const Terms = TermsRoute.options.component!;
    render(<Terms />);
    expect(screen.getByText(/NVIDIA/)).toBeInTheDocument();
    expect(screen.getByText(/Deepgram/)).toBeInTheDocument();
  });
});

describe("Privacy route", () => {
  it("renders the privacy policy with GDPR rights", () => {
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Your rights")).toBeInTheDocument();
  });

  it("names the AI processors, not just that AI is used", () => {
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    // NVIDIA (LLM) and Deepgram (speech) are the processors, named in the
    // processors list. Cloud Voice is gone as of the 2026-09-27 Hector
    // decouple -- Hector now runs on our own backend, no separate system.
    expect(screen.getAllByText(/NVIDIA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Deepgram/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Cloud Voice/)).toBeNull();
  });

  // Regression guard, updated for the 2026-09-27 decouple: Hector now runs
  // in-account, so the policy must name Hector AND say deletion covers it.
  // (The old guard asserted the opposite -- a separate, non-deletable
  // account -- which was true until the decouple; the sibling test below
  // pins that the old caveat is gone.)
  it("names Hector and states deletion covers it", () => {
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    expect(screen.getByRole("heading", { name: /Hector/ })).toBeInTheDocument();
    expect(screen.getByText(/same account and the same systems/i)).toBeInTheDocument();
    expect(screen.getByText(/deleting your account removes your Hector data/i)).toBeInTheDocument();
  });

  it("describes the in-app export and deletion path, not only the web one", () => {
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    // The full path, matching app-review-notes.md and the shipped build:
    // Profile -> Settings -> Account -> ... A policy that names a screen
    // which moved is worse than one that names none.
    expect(screen.getByText(/Settings → Account → Export My Data/)).toBeInTheDocument();
    expect(screen.getByText(/Settings → Account → Delete My Account/)).toBeInTheDocument();
  });
});

describe("Privacy route — Hector decoupled (2026-09-27)", () => {
  it("no longer claims Hector is a separate, non-deletable system", () => {
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    // After the decouple, Hector runs in-account and is deleted with it,
    // so the old "different system / not currently linked for deletion /
    // action it manually" caveat must be gone.
    expect(screen.queryByText(/not currently linked for deletion/i)).toBeNull();
    expect(screen.queryByText(/different system/i)).toBeNull();
    expect(screen.queryByText(/second, separate account/i)).toBeNull();
  });
});

describe("Support route", () => {
  it("renders the support page with its sections", () => {
    const Support = SupportRoute.options.component!;
    render(<Support />);
    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contact us" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Subscriptions" })).toBeInTheDocument();
  });

  // App Store Connect REQUIRES a Support URL, and the page it points at
  // has to actually offer a way to reach someone. A support page with no
  // contact address is the same defect as the 404 it replaced, just
  // harder to notice.
  it("gives a reachable contact address", () => {
    const Support = SupportRoute.options.component!;
    render(<Support />);
    // Appears more than once by design -- contact, data deletion and
    // reporting each name it, so someone skimming one section does not
    // have to hunt for it.
    expect(screen.getAllByText(/support@alphonsoecosystem\.app/).length).toBeGreaterThan(0);
  });

  // The address must match the one the legal pages already use. An
  // invented support@ alias would be a mailbox nobody created, on the
  // one page a reviewer is most likely to write to.
  it("uses no address the rest of the site does not", () => {
    const Support = SupportRoute.options.component!;
    const { container } = render(<Support />);
    const addresses = (container.textContent ?? "").match(/[\w.+-]+@[\w.-]+/g) ?? [];
    // Was ["privacy@...", "support@..."] before the 2026-09-28 fix below:
    // privacy@ was only here to route a manual Hector-deletion request,
    // which no longer exists now that Hector deletes with the account.
    expect([...new Set(addresses)].sort()).toEqual(["support@alphonsoecosystem.app"]);
  });
});

describe("Support route — must agree with Privacy on Hector deletion (2026-09-28)", () => {
  // A real, live contradiction found in a repo audit: privacy.tsx said
  // Hector deletes with the account (correct, post-decouple); support.tsx
  // still said Hector was "a separate account on a different system" and
  // required a manual email to delete -- directly disagreeing about the
  // same fact on two pages a reviewer can open side by side. Neither this
  // test nor any other one guarded support.tsx's own claim before this.
  it("does not claim Hector needs separate, manual deletion", () => {
    const Support = SupportRoute.options.component!;
    render(<Support />);
    expect(screen.queryByText(/not currently linked for deletion/i)).toBeNull();
    expect(screen.queryByText(/separate account on a different system/i)).toBeNull();
    expect(screen.queryByText(/action it manually/i)).toBeNull();
  });

  it("states deletion covers Hector, matching privacy.tsx", () => {
    const Support = SupportRoute.options.component!;
    render(<Support />);
    expect(
      screen.getByText(/removes your learning history, including Hector/i),
    ).toBeInTheDocument();
  });
});
