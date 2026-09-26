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
