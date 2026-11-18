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
const { Route: AccessibilityRoute } = await import("./accessibility");

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
    expect(screen.getByRole("heading", { name: "Terms of Use" })).toBeInTheDocument();
    expect(screen.getAllByText(/support@alphonsoecosystem\.app/).length).toBeGreaterThan(0);
  });

  it("names the AI processors", () => {
    const Terms = TermsRoute.options.component!;
    render(<Terms />);
    expect(screen.getByText(/Anthropic/)).toBeInTheDocument();
    expect(screen.getByText(/OpenRouter/)).toBeInTheDocument();
    expect(screen.getByText(/Deepgram/)).toBeInTheDocument();
    expect(screen.queryByText(/NVIDIA/)).toBeNull();
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
    // OpenRouter (routing) with Anthropic (LLM), and Deepgram (speech), are the
    // processors, named in the processors list. NVIDIA was the LLM until
    // 2026-11-02 (its trial API forbids production use). Cloud Voice is gone
    // as of the 2026-09-27 Hector decouple.
    expect(screen.getAllByText(/OpenRouter/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Anthropic/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/deletes it within 30 days/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/NVIDIA/)).toHaveLength(0);
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

  // 20261105101100 keeps reports up to 90 days after an account is deleted; the policy must say so and must no
  // longer promise that deleting an account deletes the reports it made.
  it("says reports are kept up to 90 days after an account is deleted, without profile data", () => {
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    expect(
      screen.getByText(
        /Reports about content are kept for up to 90 days after an account is deleted, for safety, without any personal profile data/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/deletes the reports you made/)).toBeNull();
    // The "Reports and blocking" section must not still promise the old, shorter lifetime.
    expect(screen.queryByText(/kept for as long as the accounts involved\s+exist/)).toBeNull();
    expect(
      screen.getByText(
        /kept while the accounts involved exist, and\s+for up to 90 days after one of them is deleted/,
      ),
    ).toBeInTheDocument();
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
    // The domain part must end in a label, so a sentence-ending "." after the
    // address is not read as part of it.
    const addresses = (container.textContent ?? "").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
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

describe("AI text hosts", () => {
  // OpenRouter only routes learner text to the hosts in LLM_PROVIDERS (provider.only), whichever model in the
  // fallback list answers. Each default host must be named as a processor in the privacy policy, by the exact
  // phrase of its processor entry (a bare company name could match something else, such as "Google Sign-In").
  // A host without an entry here fails until its disclosure is written.
  const PROCESSOR_ENTRY: Record<string, string> = {
    anthropic: "Anthropic (Claude), reached through OpenRouter:",
  };
  it("every default AI text host is named as a processor in the privacy policy", async () => {
    const { LLM_PROVIDERS_DEFAULT } = await import("@/lib/llm-chat-model.server");
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    expect(LLM_PROVIDERS_DEFAULT.length).toBeGreaterThan(0);
    for (const host of LLM_PROVIDERS_DEFAULT) {
      const phrase = PROCESSOR_ENTRY[host];
      expect(phrase, `no privacy processor entry mapped for host ${host}`).toBeDefined();
      expect(
        screen.getByText((t) => t.includes(phrase!)),
        host,
      ).toBeInTheDocument();
    }
  });
});

describe("Privacy route: the processors list", () => {
  // Every third party that receives learner data must have its own entry in "Who processes it". Cloudflare was
  // missing while Turnstile (src/lib/turnstile.ts, challenges.cloudflare.com in the CSP frame-src) ran on email
  // sign-in on the web and, through /native-captcha, in the iOS and Android apps.
  const PROCESSORS = [
    "Supabase:",
    "Vercel:",
    "Resend:",
    "Deepgram:",
    "OpenRouter:",
    "Anthropic (Claude), reached through OpenRouter:",
    "RevenueCat:",
    "Stripe:",
    "Sentry:",
    "PostHog (United States data region):",
    "Cloudflare (Turnstile):",
    "Apple:",
    "Google:",
    "Neon:",
    "Vercel Web Analytics:",
  ];
  it.each(PROCESSORS.map((p) => [p]))("lists %s as a processor entry", (entry) => {
    const Privacy = PrivacyRoute.options.component!;
    const { container } = render(<Privacy />);
    const items = [...container.querySelectorAll("li")].map((li) => li.textContent ?? "");
    expect(items.some((t) => t.startsWith(entry))).toBe(true);
  });

  it("the cookie policy names the Cloudflare bot check as strictly necessary", () => {
    const Cookies = CookiesRoute.options.component!;
    const { container } = render(<Cookies />);
    const strict = [...container.querySelectorAll("section")].find((s) =>
      s.textContent?.startsWith("Strictly necessary"),
    );
    expect(strict?.textContent).toMatch(/Cloudflare Turnstile/);
  });
});

describe("Terms route: Alphonso Pro", () => {
  it("sells monthly and yearly and lists every Pro benefit, with no 'everything else is free'", () => {
    const Terms = TermsRoute.options.component!;
    const { container } = render(<Terms />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/paid monthly or, where offered,\s+yearly/);
    expect(text).toMatch(/plans offered, their price and their billing period are shown/);
    expect(text).toMatch(/a year on the yearly plan/);
    expect(text).toMatch(/Hector, the AI voice tutor/);
    expect(text).toMatch(/unlimited hearts/);
    expect(text).toMatch(/What Alphonso remembers/);
    expect(text).toMatch(/larger monthly allowance/);
    expect(text).not.toMatch(/Everything else in the app is free/);
    expect(text).not.toMatch(/one free trial per person/);
  });

  it("keeps the EU and UK right to withdraw, with a proportionate refund and how to use it", () => {
    const Terms = TermsRoute.options.component!;
    const { container } = render(<Terms />);
    expect(screen.getByRole("heading", { name: /right to withdraw/ })).toBeInTheDocument();
    expect(screen.getByText(/tick a box to ask for Pro to start/)).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).toMatch(/Alphonso Pro is a service/);
    expect(text).toMatch(/within 14 days of\s+subscribing/);
    expect(text).toMatch(
      /minus a proportionate amount for the time Pro was available before you told us/,
    );
    expect(text).toMatch(/support@alphonsoecosystem\.app or use the Help chat/);
    expect(text).not.toMatch(/lose your\s+right to withdraw/);
  });

  it("says AI replies can be reported on every platform", () => {
    const Terms = TermsRoute.options.component!;
    render(<Terms />);
    expect(screen.getByText(/iOS or Android app and choose Report/)).toBeInTheDocument();
    expect(screen.getByText(/the Report button next to it on the website/)).toBeInTheDocument();
  });
});

describe("Accessibility route", () => {
  it("covers the website, iPhone and Android, and states WCAG 2.2 AA as a goal, not a certification", () => {
    const Accessibility = AccessibilityRoute.options.component!;
    const { container } = render(<Accessibility />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/website/);
    expect(text).toMatch(/iPhone/);
    expect(text).toMatch(/Android/);
    expect(text).toMatch(/WCAG\) 2\.2 at level AA/);
    expect(text).toMatch(/not a claim that we meet\s+it today/);
    expect(text).toMatch(/support@alphonsoecosystem\.app/);
    expect(text).not.toMatch(/26 September 2026/);
  });
});
