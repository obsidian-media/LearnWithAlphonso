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
});

describe("Privacy route", () => {
  it("renders the privacy policy with GDPR rights", () => {
    const Privacy = PrivacyRoute.options.component!;
    render(<Privacy />);
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Your rights")).toBeInTheDocument();
  });
});
