// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
let searchParams: { next?: string } = {};
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

const getSession = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const resetPasswordForEmail = vi.fn();
const signInWithOAuth = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession, signInWithPassword, signUp, resetPasswordForEmail, signInWithOAuth },
  },
}));

const { Route } = await import("./auth");
// Route.useSearch needs a <RouterProvider> in the real implementation;
// this test doesn't set one up, so it's overridden directly like the
// other route tests that stub Route.useLoaderData.
// @ts-expect-error -- see above
Route.useSearch = () => searchParams;

function renderPage() {
  const AuthPage = Route.options.component!;
  return render(<AuthPage />);
}

beforeEach(() => {
  navigate.mockClear();
  searchParams = {};
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  signInWithPassword.mockReset();
  signUp.mockReset();
  resetPasswordForEmail.mockReset();
  signInWithOAuth.mockReset();
  Object.defineProperty(window, "location", {
    value: { ...window.location, href: "" },
    writable: true,
    configurable: true,
  });
});

describe("validateSearch", () => {
  const validate = Route.options.validateSearch! as (s: Record<string, unknown>) => {
    next?: string;
  };

  it("accepts a relative path", () => {
    expect(validate({ next: "/profile" })).toEqual({ next: "/profile" });
  });

  it("drops a protocol-relative URL (open-redirect guard)", () => {
    expect(validate({ next: "//evil.com" })).toEqual({});
  });

  it("drops a non-string value", () => {
    expect(validate({ next: 123 })).toEqual({});
  });

  it("drops a missing next", () => {
    expect(validate({})).toEqual({});
  });

  it("drops an absolute URL that doesn't start with /", () => {
    expect(validate({ next: "https://evil.com" })).toEqual({});
  });
});

describe("Auth page", () => {
  it("redirects to /learn immediately if already signed in", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    renderPage();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/learn", replace: true }));
  });

  it("redirects to the 'next' path via a full navigation if already signed in", async () => {
    searchParams = { next: "/profile" };
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    renderPage();
    await waitFor(() => expect(window.location.href).toBe("/profile"));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs in and redirects to /learn on success", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "hunter22",
      }),
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/learn", replace: true });
  });

  it("shows the error message when sign-in fails", async () => {
    signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs up, defaulting the display name to the email's local part", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Create an account/ }));
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "hunter22",
        options: {
          emailRedirectTo: `${window.location.origin}/learn`,
          data: { display_name: "ada" },
        },
      }),
    );
    expect(await screen.findByText(/check your email/)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs up and redirects immediately when a session is returned right away", async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: "tok" } }, error: null });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Create an account/ }));
    await user.type(screen.getByLabelText("Display name"), "Grace");
    await user.type(screen.getByLabelText("Email"), "grace@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ data: { display_name: "Grace" } }),
        }),
      ),
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/learn", replace: true });
  });

  it("requests a password reset link and shows a notice", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() =>
      expect(resetPasswordForEmail).toHaveBeenCalledWith("ada@example.com", {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
    expect(await screen.findByText(/we've sent a link/)).toBeInTheDocument();
  });

  it("shows an error when Google sign-in fails", async () => {
    signInWithOAuth.mockResolvedValue({ error: new Error("OAuth unavailable") });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByText("OAuth unavailable")).toBeInTheDocument();
  });

  it("passes the 'next' param through to the Google redirect URL", async () => {
    searchParams = { next: "/profile" };
    signInWithOAuth.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth?next=%2Fprofile`,
        },
      }),
    );
  });

  it("clears error/notice and switches back to sign-in from forgot-password mode", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
});
