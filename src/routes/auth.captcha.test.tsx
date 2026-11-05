// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";

// With a Turnstile site key configured, every email form sends the widget's token with its request, so the auth
// server can require a captcha. The widget itself is stubbed: it hands over one token as soon as it mounts.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/lib/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  turnstileSiteKey: () => "site-key",
}));

vi.mock("@/components/TurnstileWidget", () => ({
  TurnstileWidget: ({ onToken }: { onToken: (t: string | null) => void }) => {
    useEffect(() => onToken("captcha-token"), [onToken]);
    return <div data-testid="turnstile" />;
  },
}));

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const resetPasswordForEmail = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signInWithPassword,
      signUp,
      resetPasswordForEmail,
      signInWithOAuth: vi.fn(),
      verifyOtp: vi.fn(),
      resend: vi.fn(),
    },
  },
}));

const { Route } = await import("./auth");
// @ts-expect-error -- no RouterProvider in this test
Route.useSearch = () => ({});

function renderPage() {
  const AuthPage = Route.options.component!;
  return render(<AuthPage />);
}

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ error: { message: "nope" } });
  signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
});

describe("auth forms with a captcha configured", () => {
  it("sign-in sends the captcha token", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByTestId("turnstile")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22-river");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "hunter22-river",
        options: { captchaToken: "captcha-token" },
      }),
    );
  });

  it("sign-up sends the captcha token", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Create an account/ }));
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22-river");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(signUp).toHaveBeenCalled());
    expect(signUp.mock.calls[0][0].options.captchaToken).toBe("captcha-token");
  });
});
