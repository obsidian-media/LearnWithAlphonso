// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { CookieConsent, getConsent } = await import("./CookieConsent");
const { useTheme } = await import("../lib/theme");

const KEY = "lingua.cookie-consent.v1";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  useTheme.setState({ theme: "meadow" });
});

describe("getConsent", () => {
  it("returns null when nothing is stored", () => {
    expect(getConsent()).toBeNull();
  });

  it("returns the stored value when valid", () => {
    window.localStorage.setItem(KEY, "all");
    expect(getConsent()).toBe("all");
  });

  it("treats an invalid stored value as no consent", () => {
    window.localStorage.setItem(KEY, "garbage");
    expect(getConsent()).toBeNull();
  });
});

describe("CookieConsent", () => {
  it("shows the banner when no consent is stored yet", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("dialog", { name: "Cookie choices" })).toBeInTheDocument();
  });

  it("does not render when consent was already given", () => {
    window.localStorage.setItem(KEY, "essential");
    render(<CookieConsent />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes and persists 'essential only' on click", async () => {
    render(<CookieConsent />);
    await userEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(window.localStorage.getItem(KEY)).toBe("essential");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes and persists 'accept all' on click", async () => {
    render(<CookieConsent />);
    await userEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(window.localStorage.getItem(KEY)).toBe("all");
  });

  it("renders the Studio Ink variant without the rounded-card shadow", () => {
    useTheme.setState({ theme: "studio-ink" });
    render(<CookieConsent />);
    const panel = screen.getByRole("dialog").firstElementChild;
    expect(panel).toHaveClass("border-t");
  });
});
