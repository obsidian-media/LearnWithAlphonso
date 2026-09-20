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
    expect(screen.getByText("Learn English with lessons that actually stick.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/auth");
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });

  it("redirects to /learn when already signed in", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    const Landing = Route.options.component!;
    render(<Landing />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/learn", replace: true }));
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
