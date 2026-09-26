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
    expect(screen.getByText(/NVIDIA/)).toBeInTheDocument();
    expect(screen.getByText(/Deepgram/)).toBeInTheDocument();
  });

  // Regression guard: Hector is a second account in a separate Supabase
  // project (AppConfig.swift's cloudVoice*), and deleting the main account
  // does not delete it -- SettingsView's confirmation copy says so, but
  // this policy used to say nothing about Hector existing at all. Fails if
  // that disclosure quietly disappears again, the same way this file's
  // contact-address assertion used to quietly pin a wrong email instead of
  // catching one.
  it("discloses Hector as a separate account that account deletion does not remove", () => {
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    expect(screen.getByRole("heading", { name: /Hector/ })).toBeInTheDocument();
    expect(screen.getByText(/second, separate account/)).toBeInTheDocument();
    expect(screen.getByText(/delete a Hector account or its data/)).toBeInTheDocument();
  });

  it("describes the in-app export and deletion path, not only the web one", () => {
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    expect(screen.getByText(/Settings → Export My Data/)).toBeInTheDocument();
    expect(screen.getByText(/Settings → Delete My Account/)).toBeInTheDocument();
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
    // Both are real mailboxes. Deletion deliberately routes to privacy@,
    // matching what the privacy policy itself names -- the page must not
    // introduce a THIRD address beyond these two.
    expect([...new Set(addresses)].sort()).toEqual([
      "privacy@alphonsoecosystem.app",
      "support@alphonsoecosystem.app",
    ]);
  });
});
