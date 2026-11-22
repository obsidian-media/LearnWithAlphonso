// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInScreen } from "./SignInScreen";
import { supabaseAuthApi, type AuthApi, type NextStep, type SupabaseAuthLike } from "./authApi";

afterEach(() => cleanup());

function makeApi(over: Partial<AuthApi> = {}): AuthApi {
  return {
    signInWithPassword: vi.fn(async () => ({ failed: false })),
    signInWithGoogle: vi.fn(async () => ({ failed: false })),
    resetPassword: vi.fn(async () => ({ failed: false })),
    nextStep: vi.fn(async (): Promise<NextStep> => ({ kind: "verify", factorId: "f1" })),
    verifyCode: vi.fn(async () => ({ failed: false })),
    onSession: vi.fn(() => () => {}),
    ...over,
  };
}
function show(api: AuthApi, mfaRequired = false, onDone = vi.fn()) {
  render(<SignInScreen api={api} mfaRequired={mfaRequired} onDone={onDone} />);
  return { onDone, user: userEvent.setup() };
}
const boxes = () => screen.getAllByLabelText(/^Digit \d$/) as HTMLInputElement[];
const typed = () =>
  boxes()
    .map((b) => b.value)
    .join("");
async function signInWithPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Work email"), "someone@example.com");
  await user.type(screen.getByLabelText("Password"), "a-password");
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

describe("step 1", () => {
  it("starts with empty inputs (the mock's prefill was sample text)", () => {
    show(makeApi());
    expect((screen.getByLabelText("Work email") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
  });

  it("offers Google and Forgot password, and does not offer the cut 'Contact the owner'", () => {
    show(makeApi());
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forgot your password?" })).toBeTruthy();
    expect(screen.queryByText(/contact the owner/i)).toBeNull();
  });

  it("says it is not indexed", () => {
    show(makeApi());
    expect(screen.getByText(/not indexed/i)).toBeTruthy();
  });

  it("password, then the code step; verifying goes home", async () => {
    const api = makeApi();
    const { user, onDone } = show(api);
    await signInWithPassword(user);
    expect(api.signInWithPassword).toHaveBeenCalledWith("someone@example.com", "a-password");
    await screen.findByText(/Enter the 6-digit code/);
    expect(screen.queryByLabelText("Work email")).toBeNull();
    await user.click(boxes()[0]!);
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(api.verifyCode).toHaveBeenCalledWith("f1", "123456");
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("goes straight home when no second step is asked", async () => {
    const api = makeApi({ nextStep: vi.fn(async (): Promise<NextStep> => ({ kind: "home" })) });
    const { user, onDone } = show(api);
    await signInWithPassword(user);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("every failed sign-in says the same thing, never whether the account exists", async () => {
    const api = makeApi({ signInWithPassword: vi.fn(async () => ({ failed: true })) });
    const { user, onDone } = show(api);
    await signInWithPassword(user);
    expect(await screen.findByText("Sign-in failed.")).toBeTruthy();
    expect(api.nextStep).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("Google starts the flow; a failure to start is named", async () => {
    const api = makeApi({ signInWithGoogle: vi.fn(async () => ({ failed: true })) });
    const { user } = show(api);
    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));
    expect(api.signInWithGoogle).toHaveBeenCalled();
    expect(await screen.findByText(/Couldn't start Google sign-in/)).toBeTruthy();
  });

  it("Forgot password needs an email first, then sends the reset", async () => {
    const api = makeApi();
    const { user } = show(api);
    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    expect(await screen.findByText(/Enter your email first/)).toBeTruthy();
    expect(api.resetPassword).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Work email"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    expect(api.resetPassword).toHaveBeenCalledWith("someone@example.com");
    expect(
      await screen.findByText("If an account exists for that email, we’ve sent a reset link."),
    ).toBeTruthy();
  });

  it("picks up a session that arrives by itself (the Google redirect lands here)", async () => {
    let fire = () => {};
    const api = makeApi({
      onSession: vi.fn((cb) => {
        fire = cb;
        return () => {};
      }),
    });
    show(api);
    fire();
    await screen.findByText(/Enter the 6-digit code/);
  });
});

describe("enrolment (?mfa=required)", () => {
  it("asks for the next step ONCE even when the SIGNED_IN event and the submit both fire (one enrol, not two)", async () => {
    let fire = () => {};
    let release: (n: NextStep) => void = () => {};
    const nextStep = vi.fn(() => new Promise<NextStep>((r) => (release = r)));
    const api = makeApi({
      nextStep,
      onSession: vi.fn((cb) => {
        fire = cb;
        return () => {};
      }),
      signInWithPassword: vi.fn(async () => {
        fire(); // the SIGNED_IN event arrives during sign-in
        return { failed: false };
      }),
    });
    const { user } = show(api, true);
    await signInWithPassword(user);
    release({ kind: "verify", factorId: "f1" });
    await screen.findByText(/Enter the 6-digit code/);
    expect(nextStep).toHaveBeenCalledTimes(1);
  });

  it("a QR that is not an inline image is not shown; the key still is", async () => {
    const api = makeApi({
      nextStep: vi.fn(
        async () =>
          ({ kind: "enroll", factorId: "f", secret: "KEY123", uri: "u", qr: null }) as NextStep,
      ),
    });
    const { user } = show(api, true);
    await signInWithPassword(user);
    await screen.findByText("KEY123");
    expect(screen.queryByAltText("Authenticator setup QR code")).toBeNull();
  });

  const enroll: NextStep = {
    kind: "enroll",
    factorId: "f2",
    secret: "JBSWY3DPEHPK3PXP",
    uri: "otpauth://totp/x",
    qr: "data:image/svg+xml;utf8,<svg/>",
  };

  it("shows the QR and the key, then verifies the first code against the new factor", async () => {
    const api = makeApi({ nextStep: vi.fn(async () => enroll) });
    const { user, onDone } = show(api, true);
    await signInWithPassword(user);
    expect(api.nextStep).toHaveBeenCalledWith(true);
    expect(await screen.findByAltText("Authenticator setup QR code")).toBeTruthy();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeTruthy();
    await user.click(boxes()[0]!);
    await user.keyboard("654321");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(api.verifyCode).toHaveBeenCalledWith("f2", "654321");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("a setup that could not start says so and stays on step 1", async () => {
    const api = makeApi({ nextStep: vi.fn(async (): Promise<NextStep> => ({ kind: "error" })) });
    const { user } = show(api, true);
    await signInWithPassword(user);
    expect(await screen.findByText("Could not start authenticator setup.")).toBeTruthy();
    expect(screen.getByLabelText("Work email")).toBeTruthy();
  });
});

describe("the code step", () => {
  async function toCodeStep(api = makeApi()) {
    const r = show(api);
    await signInWithPassword(r.user);
    await screen.findByText(/Enter the 6-digit code/);
    return { ...r, api };
  }

  it("has six labelled boxes that accept a one-time code for autofill", async () => {
    await toCodeStep();
    expect(boxes()).toHaveLength(6);
    for (const [i, b] of boxes().entries()) {
      expect(b.getAttribute("aria-label")).toBe(`Digit ${i + 1}`);
      expect(b.getAttribute("inputmode")).toBe("numeric");
      expect(b.getAttribute("autocomplete")).toBe("one-time-code");
    }
  });

  it("auto-advances: typing a digit moves to the next box", async () => {
    const { user } = await toCodeStep();
    await user.click(boxes()[0]!);
    await user.keyboard("12");
    expect(typed()).toBe("12");
    expect(document.activeElement).toBe(boxes()[2]);
  });

  it("paste fills every box and leaves the last one focused", async () => {
    const { user } = await toCodeStep();
    await user.click(boxes()[3]!);
    await user.paste("482 913");
    expect(typed()).toBe("482913");
    expect(document.activeElement).toBe(boxes()[5]);
  });

  it("an OS autofill that drops the whole code into one box spreads across the boxes", async () => {
    await toCodeStep();
    fireEvent.change(boxes()[0]!, { target: { value: "135790" } });
    expect(typed()).toBe("135790");
  });

  it("a full autofill dropped into a non-first box restarts at box 1, like paste", async () => {
    await toCodeStep();
    fireEvent.change(boxes()[3]!, { target: { value: "135790" } });
    expect(typed()).toBe("135790");
  });

  it("a failed code clears the boxes and puts the cursor back in box 1", async () => {
    const api = makeApi({ verifyCode: vi.fn(async () => ({ failed: true })) });
    const { user } = await toCodeStep(api);
    await user.click(boxes()[0]!);
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await screen.findByText("That code did not work. Try the current one.");
    expect(typed()).toBe("");
    expect(document.activeElement).toBe(boxes()[0]);
  });

  it("the code group is labelled by the visible instruction", async () => {
    await toCodeStep();
    const group = screen.getByRole("group");
    expect(document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent).toMatch(
      /6-digit code/,
    );
  });

  it("letters are ignored", async () => {
    const { user } = await toCodeStep();
    await user.click(boxes()[0]!);
    await user.keyboard("a1b2");
    expect(typed()).toBe("12");
  });

  it("Backspace on an empty box moves back and clears the previous digit", async () => {
    const { user } = await toCodeStep();
    await user.click(boxes()[0]!);
    await user.keyboard("12");
    expect(document.activeElement).toBe(boxes()[2]);
    await user.keyboard("{Backspace}");
    expect(typed()).toBe("1");
    expect(document.activeElement).toBe(boxes()[1]);
  });

  it("will not send an incomplete code", async () => {
    const { user, api } = await toCodeStep();
    await user.click(boxes()[0]!);
    await user.keyboard("123");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByText("Enter all 6 digits.")).toBeTruthy();
    expect(api.verifyCode).not.toHaveBeenCalled();
  });

  it("a wrong code gets the generic message and stays", async () => {
    const api = makeApi({ verifyCode: vi.fn(async () => ({ failed: true })) });
    const { user, onDone } = await toCodeStep(api);
    await user.click(boxes()[0]!);
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByText("That code did not work. Try the current one.")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("Back returns to step 1 with the password cleared and no code kept", async () => {
    const { user } = await toCodeStep();
    await user.click(boxes()[0]!);
    await user.keyboard("123");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Enter the 6-digit code/);
    expect(typed()).toBe("");
  });
});

describe("the layout holds at phone width (no 375 px e2e exists for the admin app yet)", () => {
  it("is one centred column that can shrink to 375 px: no fixed widths, every control 44 px or taller, boxes flex", async () => {
    const { user } = show(makeApi());
    const main = document.querySelector("main")!;
    expect(main.className).toContain("min-h-dvh");
    expect(main.className).toMatch(/\bpx-4\b/); // a 16 px gutter at 375 px
    expect(main.innerHTML).not.toMatch(/(^|[\s"])w-\[\d|min-w-\[\d|(^|[\s"])w-(96|80|72)\b/);
    for (const el of Array.from(main.querySelectorAll("input, button"))) {
      expect((el as HTMLElement).className, el.outerHTML.slice(0, 70)).toMatch(/min-h-11/);
    }
    await signInWithPassword(user);
    await screen.findByText(/Enter the 6-digit code/);
    // six boxes plus five 8 px gaps must fit the 343 px inside the gutter and the 20 px card padding (303 px):
    // each box flexes (flex-1, min-w-0) and is never given a fixed width that could overflow.
    const group = boxes()[0]!.parentElement!;
    expect(group.className).toContain("gap-2");
    for (const b of boxes()) {
      expect(b.className).toContain("flex-1");
      expect(b.className).toContain("min-w-0");
      expect(b.className).toMatch(/min-h-11/);
    }
    // Each box takes an equal share of the 303 px row (flex-1) and never a fixed width, so it is ~44 px wide here.
    const share = (375 - 2 * 16 - 2 * 20 - 5 * 8) / 6;
    expect(share).toBeGreaterThanOrEqual(40);
    for (const b of boxes()) expect(b.className).not.toMatch(/(^|\s)w-\d/);
  });

  it("uses theme tokens only, so Royal Night follows: no raw colours in the sign-in sources (the QR's white plate is the one deliberate exception: a code must be dark on light to scan, in Night too)", () => {
    for (const f of ["SignInScreen.tsx", "CodeBoxes.tsx"]) {
      const src = readFileSync(`src/components/console/auth/${f}`, "utf8");
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|\bbg-black\b/);
    }
  });
});

describe("the Supabase adapter keeps every existing path", () => {
  function fake(over: Partial<SupabaseAuthLike["mfa"]> = {}) {
    const calls: string[] = [];
    const auth: SupabaseAuthLike = {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1" } }),
        listFactors: async () => ({ data: { totp: [] } }),
        enroll: vi.fn(async () => ({
          data: { id: "e1", totp: { secret: "S", uri: "U", qr_code: "data:image/svg+xml;utf8,Q" } },
          error: null,
        })),
        challengeAndVerify: vi.fn(async () => ({ error: null })),
        ...over,
      },
    };
    return { auth, calls, api: supabaseAuthApi(auth, () => "https://admin.example") };
  }

  it("already aal2 goes home; a verified factor asks for its code; none and no ?mfa=required goes home", async () => {
    expect(
      await fake({
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2" } }),
      }).api.nextStep(false),
    ).toEqual({ kind: "home" });
    expect(
      await fake({
        listFactors: async () => ({ data: { totp: [{ id: "f9", status: "verified" }] } }),
      }).api.nextStep(false),
    ).toEqual({ kind: "verify", factorId: "f9" });
    // an unverified factor is not a second factor
    expect(
      await fake({
        listFactors: async () => ({ data: { totp: [{ id: "f8", status: "unverified" }] } }),
      }).api.nextStep(false),
    ).toEqual({ kind: "home" });
  });

  it("only an inline data:image QR is passed on", async () => {
    const { api } = fake({
      enroll: async () => ({
        data: { id: "e1", totp: { secret: "S", uri: "U", qr_code: "https://evil.example/q.png" } },
        error: null,
      }),
    });
    expect(await api.nextStep(true)).toMatchObject({ kind: "enroll", qr: null });
  });

  it("the admin CSP lets a data: image through, so the QR displays", async () => {
    const { contentSecurityPolicy } = await import("../../../lib/security-policy");
    const img = contentSecurityPolicy("n")
      .split("; ")
      .find((d) => d.startsWith("img-src "))!;
    expect(img).toContain("data:");
  });

  it("?mfa=required with no verified factor enrols one and returns the QR and key", async () => {
    const { api, auth } = fake();
    expect(await api.nextStep(true)).toEqual({
      kind: "enroll",
      factorId: "e1",
      secret: "S",
      uri: "U",
      qr: "data:image/svg+xml;utf8,Q",
    });
    expect(auth.mfa.enroll).toHaveBeenCalledWith({ factorType: "totp" });
  });

  it("verifies through challengeAndVerify; Google returns to /signin on this origin; reset goes to the learner app", async () => {
    const { api, auth } = fake();
    expect(await api.verifyCode("f1", "123456")).toEqual({ failed: false });
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
    await api.signInWithGoogle();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://admin.example/signin" },
    });
    await api.resetPassword("a@b.c");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.c", {
      redirectTo: "https://learnwithalphonso.com/reset-password",
    });
  });
});
