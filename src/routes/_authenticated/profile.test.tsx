// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigate = vi.fn();
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
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/profile" } }),
  };
});

const getMyProfile = vi.fn();
const updateProfile = vi.fn();
vi.mock("../../lib/leaderboard.functions", () => ({ getMyProfile, updateProfile }));

const exportMyData = vi.fn();
const deleteMyAccount = vi.fn();
vi.mock("../../lib/account.functions", () => ({ exportMyData, deleteMyAccount }));

const getWeaknessTrend = vi.fn();
vi.mock("../../lib/weakness-trend.functions", () => ({ getWeaknessTrend }));

const signOut = vi.fn();
const getUser = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut, getUser } } }));

const saveLearnerProfile = vi.fn();
vi.mock("../../lib/learner-profile.functions", () => ({ saveLearnerProfile }));

const { withAiConsent } = await import("../../lib/__testutils__/ai-consent");
const { Route } = await import("./profile");
const { useProgress } = await import("../../lib/progress");
const { useTheme } = await import("../../lib/theme");
const { ACHIEVEMENTS } = await import("../../data/achievements");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ProfilePage = Route.options.component!;
  return render(
    withAiConsent(
      <QueryClientProvider client={client}>
        <ProfilePage />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  navigate.mockClear();
  getMyProfile.mockReset();
  getMyProfile.mockResolvedValue({ display_name: "Ada", country: "US", avatar_seed: "a" });
  updateProfile.mockReset();
  updateProfile.mockResolvedValue({ ok: true });
  exportMyData.mockReset();
  deleteMyAccount.mockReset();
  getWeaknessTrend.mockReset();
  getWeaknessTrend.mockResolvedValue({ categories: [] });
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } } });
  saveLearnerProfile.mockReset();
  saveLearnerProfile.mockImplementation(async ({ data }: { data: { patch: object } }) => ({
    showFlag: false,
    ...data.patch,
  }));
  useProgress.getState().reset();
  useTheme.setState({ theme: "meadow" });
  Object.defineProperty(global.URL, "createObjectURL", {
    value: vi.fn(() => "blob:mock-url"),
    configurable: true,
  });
  Object.defineProperty(global.URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("Profile page", () => {
  it("shows the profile name, stats, and achievement count", async () => {
    useProgress.setState({
      xp: 500,
      streak: 4,
      streakFreezes: 2,
      longestStreak: 10,
      unlockedAchievements: [ACHIEVEMENTS[0].id, ACHIEVEMENTS[1].id],
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByText("10-day best streak")).toBeInTheDocument();
    // The XP stat card, not the top bar's XP pill (which only carries an
    // aria-label, not visible "XP" text) -- its value sits right before
    // the visible "XP" label.
    expect(screen.getByText("XP").previousElementSibling).toHaveTextContent("500");
    expect(screen.getByText(`2 of ${ACHIEVEMENTS.length} unlocked`)).toBeInTheDocument();
  });

  it("offers the AI features switch", async () => {
    renderPage();
    expect(await screen.findByRole("switch", { name: "AI features" })).toBeInTheDocument();
  });

  it("falls back to 'Learner' when there is no display name", async () => {
    getMyProfile.mockResolvedValue({ display_name: null, country: null, avatar_seed: "a" });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Learner" })).toBeInTheDocument();
  });

  it("saves the display name (the country now comes from the learner profile and its flag switch)", async () => {
    const user = userEvent.setup();
    renderPage();
    const nameInput = await screen.findByLabelText("Display name");
    // The profile query resolves asynchronously and its effect syncs `name` from it -- wait for that sync before
    // editing, or a later resolution would clobber the edit.
    await waitFor(() => expect(nameInput).toHaveValue("Ada"));
    await user.clear(nameInput);
    await user.type(nameInput, "Grace");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ data: { display_name: "Grace" } }),
    );
    expect(screen.queryByLabelText(/Country \(ISO/)).toBeNull();
  });

  it("says a refused name in words instead of pretending it saved", async () => {
    const user = userEvent.setup();
    updateProfile.mockResolvedValueOnce({ ok: false, error: "blocked-content", part: "name" });
    renderPage();
    const nameInput = await screen.findByLabelText("Display name");
    await waitFor(() => expect(nameInput).toHaveValue("Ada"));
    await user.clear(nameInput);
    await user.type(nameInput, "Some Name");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That name isn't allowed. Try another.",
    );
    // Editing the name clears the old refusal.
    await user.type(nameInput, "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sends undefined for an empty display name", async () => {
    const user = userEvent.setup();
    renderPage();
    const nameInput = await screen.findByLabelText("Display name");
    await waitFor(() => expect(nameInput).toHaveValue("Ada"));
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ data: { display_name: undefined } }),
    );
  });

  it("changes the profile picture to one of the 16 animals (no upload)", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");
    await user.click(screen.getByRole("button", { name: "Change picture" }));
    const dialog = await screen.findByRole("dialog", { name: "Your profile picture" });
    expect(within(dialog).getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(
      16,
    );
    expect(dialog.querySelector("input[type=file]")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Owl" }));
    await user.click(within(dialog).getByRole("button", { name: "Save picture" }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ data: { avatar_seed: "animal:owl" } }),
    );
  });

  it("shows the chosen animal in the hero, and initials without one", async () => {
    getMyProfile.mockResolvedValue({
      display_name: "Ada",
      country: null,
      avatar_seed: "animal:fox",
    });
    const first = renderPage();
    await waitFor(() => expect(document.querySelector('[data-avatar="fox"]')).not.toBeNull());
    first.unmount();
    getMyProfile.mockResolvedValue({ display_name: "Ada", country: null, avatar_seed: "3fa9" });
    renderPage();
    await screen.findByRole("heading", { name: "Ada" });
    await waitFor(() => expect(document.querySelector('[data-avatar="initials"]')).not.toBeNull());
  });

  it("the leaderboard flag is off by default and turning it on saves the learner's country", async () => {
    getMyProfile.mockResolvedValue({ display_name: "Ada", country: null, avatar_seed: "a" });
    getUser.mockResolvedValue({
      data: { user: { id: "u1", user_metadata: { learner_profile: { country: "CA" } } } },
    });
    const user = userEvent.setup();
    renderPage();
    const flag = await screen.findByRole("switch", { name: "Show my flag on leaderboards" });
    await waitFor(() => expect(flag).not.toBeDisabled());
    expect(flag).toHaveAttribute("aria-checked", "false");
    await user.click(flag);
    await waitFor(() =>
      expect(saveLearnerProfile).toHaveBeenCalledWith({
        data: { patch: { showFlag: true, country: "CA" } },
      }),
    );
  });

  it("a country already on the leaderboard counts as on, and turning it off keeps the country", async () => {
    const user = userEvent.setup();
    renderPage();
    const flag = await screen.findByRole("switch", { name: "Show my flag on leaderboards" });
    await waitFor(() => expect(flag).toHaveAttribute("aria-checked", "true"));
    await user.click(flag);
    await waitFor(() =>
      expect(saveLearnerProfile).toHaveBeenCalledWith({
        data: { patch: { showFlag: false, country: "US" } },
      }),
    );
  });

  it("links to Edit your answers (Complete your profile, again)", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "Edit your answers" })).toHaveAttribute(
      "href",
      "/complete-profile",
    );
  });

  it("switches theme, persisting it through updateProfile", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("tab", { name: "Studio Ink" }));

    expect(useTheme.getState().theme).toBe("studio-ink");
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ data: { theme: "studio-ink" } }),
    );
  });

  it("offers Canopy as a theme option and can switch to it", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("tab", { name: "Canopy" }));

    expect(useTheme.getState().theme).toBe("canopy");
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ data: { theme: "canopy" } }));
  });

  it("signs out: cancels queries, clears the cache, and navigates to /auth", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith({ to: "/auth", replace: true });
  });

  it("offers a visible Help and feedback link to the support page", async () => {
    renderPage();
    await screen.findByLabelText("Display name");
    expect(screen.getByRole("link", { name: "Help and feedback" })).toHaveAttribute(
      "href",
      "/support",
    );
  });

  it("downloads a JSON export of the user's data", async () => {
    exportMyData.mockResolvedValue({
      exported_at: "2026-09-19T00:00:00.000Z",
      user_id: "u1",
      tables: JSON.stringify({ review_items: [] }),
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Download my data" }));

    await waitFor(() => expect(exportMyData).toHaveBeenCalled());
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("shows an error message when the export fails", async () => {
    exportMyData.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
  });

  it("requires typing DELETE before the delete-forever button is enabled", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    const deleteButton = screen.getByRole("button", { name: "Delete forever" });
    expect(deleteButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    expect(deleteButton).toBeEnabled();
  });

  it("warns that deleting cancels a website subscription with no refund", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");
    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(
      screen.getByText(
        "If you subscribed on this website, deleting your account cancels it: you will not be charged again, and the current period is not refunded. App Store subscriptions are managed in your iPhone's Settings.",
      ),
    ).toBeInTheDocument();
  });

  it("deletes the account, signs out, and navigates away on success", async () => {
    deleteMyAccount.mockResolvedValue({ deleted: true });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete forever" }));

    await waitFor(() =>
      expect(deleteMyAccount).toHaveBeenCalledWith({ data: { confirm: "DELETE" } }),
    );
    expect(signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: "/auth", replace: true });
  });

  it("shows an error and re-enables the button when deletion fails", async () => {
    deleteMyAccount.mockRejectedValue(new Error("still has active subscription"));
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Delete forever" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("still has active subscription");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete forever" })).toBeEnabled();
  });

  it("shows nothing for weakness trend when there are no events yet", async () => {
    renderPage();
    await screen.findByLabelText("Display name");
    expect(screen.queryByText("Weakness trend")).not.toBeInTheDocument();
  });

  it("shows still-working-on-it and mastered categories from the weakness trend", async () => {
    getWeaknessTrend.mockResolvedValue({
      categories: [
        {
          category: "past-tense",
          detectedCount: 2,
          resolvedCount: 1,
          openCount: 1,
          lastEventAt: "2026-09-10T00:00:00Z",
        },
        {
          category: "articles",
          detectedCount: 1,
          resolvedCount: 1,
          openCount: 0,
          lastEventAt: "2026-09-03T00:00:00Z",
        },
      ],
    });
    renderPage();

    expect(await screen.findByText("Weakness trend")).toBeInTheDocument();
    expect(screen.getByText("past tense")).toBeInTheDocument();
    expect(screen.getByText("Still working on it")).toBeInTheDocument();
    expect(screen.getByText("articles")).toBeInTheDocument();
    expect(screen.getByText("Mastered (1×)")).toBeInTheDocument();
  });

  it("lets the user cancel the delete confirmation", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("DELETE")).not.toBeInTheDocument();
  });

  it("shows XP, streak and freezes as big numbers with 3D icons", async () => {
    useProgress.setState({ xp: 500, streak: 4, streakFreezes: 2 });
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Ada" });
    const stats = [...container.querySelectorAll<HTMLElement>("[data-big-stat]")];
    expect(stats.map((s) => s.querySelector("img")?.getAttribute("src"))).toEqual([
      "/icons3d/high_voltage.png",
      "/icons3d/fire.png",
      "/icons3d/snowflake.png",
    ]);
    expect(stats.map((s) => s.dataset.tone)).toEqual(["sun", "coral", "sky"]);
  });

  it("the Friends link is a tile with a 3D icon", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: /Friends/ });
    expect(link.querySelector("img")?.getAttribute("src")).toBe("/icons3d/busts_in_silhouette.png");
  });
});

describe("Profile in the hall of achievements", () => {
  it("the hall scene is behind the hero, and the rest sits on a solid sheet", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(container.querySelector('[data-scene="profile"] img')?.getAttribute("src")).toBe(
      "/scenes/profile.jpg",
    );
    const sheet = container.querySelector("[data-sheet]")!;
    expect(
      within(sheet as HTMLElement).getByRole("heading", { name: "Achievements" }),
    ).toBeTruthy();
    // The big numbers stay in the hero, above the sheet.
    expect(container.querySelector("[data-big-stat]")?.closest("[data-sheet]")).toBeNull();
  });

  it("unlocked achievements come first, so the wall does not open on grey", async () => {
    useProgress.setState({ unlockedAchievements: [ACHIEVEMENTS[5].id] });
    const { container } = renderPage();
    await screen.findByRole("heading", { level: 1 });
    const first = container.querySelector("[data-achievement]");
    expect(first?.getAttribute("data-achievement")).toBe(ACHIEVEMENTS[5].id);
  });
});
