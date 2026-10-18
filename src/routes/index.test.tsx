// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const navigate = vi.fn();
const getSession = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => navigate,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession } },
}));

const { Route } = await import("./index");

beforeEach(() => {
  navigate.mockClear();
  getSession.mockReset();
});

describe("Landing route", () => {
  it("renders the pitch and a get-started link", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const Landing = Route.options.component!;
    render(<Landing />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/auth");
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("names all three courses rather than claiming to be English-only", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const Landing = Route.options.component!;
    const { container } = render(<Landing />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/English/);
    expect(text).toMatch(/French/);
    expect(text).toMatch(/Spanish/);
  });

  it("redirects to /learn when already signed in", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    const Landing = Route.options.component!;
    render(<Landing />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/learn", replace: true }));
  });

  it("states the real promise: free account, short level test, first lesson", () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const Landing = Route.options.component!;
    const { container } = render(<Landing />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Learn English, French or Spanish in 5 minutes a day",
    );
    const text = container.textContent ?? "";
    expect(text).toMatch(/free account/i);
    expect(text).toMatch(/short level test/i);
    expect(text).not.toMatch(/actually stick|quietly built/i);
  });

  it("explains streak freezes and leagues the way progress-math.ts implements them", () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const Landing = Route.options.component!;
    const { container } = render(<Landing />);
    const text = container.textContent ?? "";
    // computeStreakUpdate: one missed day is bridged by spending a freeze; every 10th streak day earns one.
    expect(text).toMatch(
      /A freeze saves it if you miss a day, and you earn one every 10th streak day/,
    );
    // LEAGUES / LEAGUE_TIER_COPY: five tiers, Sprout to Summit; leaderboard scopes global / friends / country.
    expect(text).toMatch(/five league tiers, from Sprout to Summit/);
    expect(text).toMatch(/everyone, your friends or your country/);
  });

  it("uses the real app icon, not a placeholder letter tile", () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const Landing = Route.options.component!;
    const { container } = render(<Landing />);
    expect(container.querySelector('img[src="/icon-192.png"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/^A\s*Alphonso/);
  });

  it("describes itself for link previews with the current title and a share image", async () => {
    const head = await Route.options.head!({} as never);
    const meta = head.meta as Array<Record<string, string>>;
    const byKey = (k: string) => meta.find((m) => m.property === k || m.name === k)?.content;
    expect(meta.find((m) => m.title)?.title).toBe(
      "Learn With Alphonso: Learn English, French and Spanish",
    );
    expect(byKey("og:image")).toBe("https://learn.alphonsoecosystem.app/og-image.png");
    expect(byKey("og:image:width")).toBe("1200");
    expect(byKey("twitter:card")).toBe("summary_large_image");
    expect(byKey("twitter:image")).toBe("https://learn.alphonsoecosystem.app/og-image.png");
    expect(byKey("description")).not.toMatch(/\$|Pro\b|Duolingo/);
  });

  it("links to the legal pages", () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const Landing = Route.options.component!;
    render(<Landing />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/cookies");
  });
});
