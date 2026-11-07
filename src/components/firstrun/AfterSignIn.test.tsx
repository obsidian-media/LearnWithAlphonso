// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-headers", () => ({
  authHeaders: async () => ({ Authorization: "Bearer t" }),
}));
vi.mock("../../lib/speech", () => ({ canSpeak: () => false, speak: vi.fn() }));
const updateProfile = vi.fn(async (_: unknown) => ({ ok: true }));
vi.mock("../../lib/leaderboard.functions", () => ({
  updateProfile: (a: unknown) => updateProfile(a),
}));
const saveLearnerProfile = vi.fn(async (_: unknown) => ({ showFlag: false }));
vi.mock("../../lib/learner-profile.functions", () => ({
  saveLearnerProfile: (a: unknown) => saveLearnerProfile(a),
}));

const { AfterSignIn } = await import("./AfterSignIn");

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  updateProfile.mockClear();
  saveLearnerProfile.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(start: "avatar" | "heard" | "hector", onFinish = vi.fn()) {
  render(
    <AfterSignIn
      start={start}
      name="Sam"
      course="es"
      interests={["food", "music"]}
      avatarSeed="3fa9c1d2"
      onFinish={onFinish}
    />,
  );
  return onFinish;
}

describe("Meet Hector", () => {
  it("shows the trial length the store offers, never a number of its own", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ price: null, period: "month", trialDays: 3, purchaseUrl: "https://x" }),
      ),
    );
    renderAt("hector");
    expect(screen.getByRole("heading", { name: "¡Hola, Sam! I'm Hector." })).toBeTruthy();
    expect(
      await screen.findByText("3 days free, then your plan's price. Cancel any time."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try a free call with Hector" })).toBeTruthy();
    expect(fetchSpy.mock.calls[0][0]).toMatch(/^\/api\/pro-offering\?source=/);
  });

  it("hides the trial line when the web offer is not set up (503), and promises nothing free", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "offering-unavailable" }), { status: 503 }),
    );
    renderAt("hector");
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await screen.findByRole("button", { name: "See what Hector can do" });
    expect(document.body.textContent).not.toMatch(/free|\bdays?\b/i);
  });

  it("hides the trial line for an offer without a trial", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          price: "$9.99",
          period: "month",
          trialDays: null,
          purchaseUrl: "https://x",
        }),
      ),
    );
    renderAt("hector");
    await screen.findByRole("button", { name: "See what Hector can do" });
    expect(document.body.textContent).not.toMatch(/days free/);
  });

  it("Not now goes on; the button goes to Hector", async () => {
    fetchSpy.mockResolvedValue(new Response("{}", { status: 503 }));
    const onFinish = renderAt("hector");
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(onFinish).toHaveBeenCalledWith("lesson");
    fireEvent.click(screen.getByRole("button", { name: "See what Hector can do" }));
    expect(onFinish).toHaveBeenLastCalledWith("hector");
  });
});

describe("the avatar and how-you-heard steps", () => {
  it("saves the chosen animal to the public avatar seed", async () => {
    renderAt("avatar");
    fireEvent.click(screen.getByRole("button", { name: "Fox" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ data: { avatar_seed: "animal:fox" } }),
    );
    expect(await screen.findByRole("heading", { name: /how did you hear about me/i })).toBeTruthy();
  });

  it("keeping my initial saves nothing", async () => {
    renderAt("avatar");
    fireEvent.click(screen.getByRole("button", { name: "Keep my initial" }));
    expect(await screen.findByRole("heading", { name: /how did you hear about me/i })).toBeTruthy();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("how you heard is saved once, and Skip saves nothing", async () => {
    renderAt("heard");
    fireEvent.click(screen.getByRole("button", { name: "A friend" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(saveLearnerProfile).toHaveBeenCalledWith({ data: { patch: { heardFrom: "friend" } } }),
    );
    cleanup();
    saveLearnerProfile.mockClear();
    fetchSpy.mockResolvedValue(new Response("{}", { status: 503 }));
    renderAt("heard");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByRole("heading", { name: /I'm Hector/ })).toBeTruthy();
    expect(saveLearnerProfile).not.toHaveBeenCalled();
  });
});
