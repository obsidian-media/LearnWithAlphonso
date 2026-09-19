// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
const getSession = vi.fn();
const updateUser = vi.fn();
const onAuthStateChange = vi.fn();

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
  supabase: { auth: { getSession, updateUser, onAuthStateChange } },
}));

const { Route } = await import("./reset-password");

beforeEach(() => {
  navigate.mockClear();
  getSession.mockReset().mockResolvedValue({ data: { session: null } });
  updateUser.mockReset();
  onAuthStateChange.mockReset().mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

describe("Reset password route", () => {
  it("shows the 'open from your email' hint until a recovery session is ready", async () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(
      screen.getByText(/Open this page from the link in your reset email/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update password" })).toBeDisabled();
  });

  it("enables the form once an existing session is detected", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    const Page = Route.options.component!;
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled(),
    );
  });

  it("rejects mismatched passwords without calling Supabase", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    const user = userEvent.setup();
    const Page = Route.options.component!;
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled(),
    );

    await user.type(screen.getByPlaceholderText("New password"), "secret1");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "secret2");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByText("Both passwords must match.")).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password and redirects to /learn on success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    updateUser.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    const Page = Route.options.component!;
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled(),
    );

    await user.type(screen.getByPlaceholderText("New password"), "secret1");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "secret1");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "secret1" }));
    expect(await screen.findByText(/Password updated/)).toBeInTheDocument();

    vi.advanceTimersByTime(1200);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/learn", replace: true }));
    vi.useRealTimers();
  });

  it("shows the Supabase error message when the update fails", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    updateUser.mockResolvedValue({ error: new Error("Password too weak") });
    const user = userEvent.setup();
    const Page = Route.options.component!;
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update password" })).toBeEnabled(),
    );

    await user.type(screen.getByPlaceholderText("New password"), "secret1");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "secret1");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Password too weak")).toBeInTheDocument();
  });
});
