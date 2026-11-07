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

const getProfileOverview = vi.fn();
vi.mock("../../lib/profile.functions", () => ({ getProfileOverview }));
const fetchProgress = vi.fn();
vi.mock("../../lib/sync.functions", () => ({ fetchProgress }));
const proState = { state: "free" as "free" | "pro" | "loading" | "error" };
vi.mock("../../lib/use-pro-status", () => ({
  useProStatus: () => ({
    ...proState,
    store: null,
    trialEligible: false,
    manageUrl: null,
    justPaid: false,
    retry: vi.fn(),
  }),
}));

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
const { richLearner, newLearner } = await import("../../lib/__testutils__/profile-fixtures");

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
  getProfileOverview.mockReset();
  getProfileOverview.mockResolvedValue(richLearner());
  fetchProgress.mockReset();
  fetchProgress.mockResolvedValue({});
  proState.state = "free";
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
  it("offers the AI features switch", async () => {
    renderPage();
    expect(await screen.findByRole("switch", { name: "AI features" })).toBeInTheDocument();
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

  it("lets the user cancel the delete confirmation", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("DELETE")).not.toBeInTheDocument();
  });
});

const { bigNumbers, hectorCard, openMemoryCategories } = await import("../../lib/profile-overview");

/** The rendered element matching `selector`, once it exists. */
async function find(selector: string): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`no ${selector}`);
    return el;
  });
}

describe("Profile, round 6", () => {
  it("the hero shows the learner's name and picture from their profile, and Learner without a name", async () => {
    const first = renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Sam" })).toBeInTheDocument();
    expect(document.querySelector('[data-profile-hero] [data-avatar="fox"]')).not.toBeNull();
    first.unmount();
    getProfileOverview.mockResolvedValue(
      richLearner({
        profile: { displayName: null, avatarSeed: "3fa9", country: null, createdAt: null },
      }),
    );
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Learner" })).toBeInTheDocument();
  });

  it("shows the flag only while the learner has it on (profiles.country is set only then)", async () => {
    const on = renderPage();
    const flag = await find("[data-profile-hero] [data-profile-flag]");
    expect(flag.getAttribute("data-profile-flag")).toBe("CA");
    expect(flag).toHaveTextContent("Canada");
    on.unmount();

    getProfileOverview.mockResolvedValue(
      richLearner({
        profile: {
          displayName: "Sam",
          avatarSeed: "animal:fox",
          country: null,
          createdAt: "2026-08-02T00:00:00Z",
        },
      }),
    );
    renderPage();
    const hero = await find("[data-profile-hero]");
    expect(hero.querySelector("[data-profile-flag]")).toBeNull();
    expect(within(hero).queryByText(/Canada/)).toBeNull();
  });

  it("the four big numbers are the overview's numbers, each in its own tile", async () => {
    const o = richLearner();
    const n = bigNumbers(o);
    renderPage();
    await find("[data-big-stat]");
    const value = (name: string) =>
      document.querySelector(`[data-big-stat="${name}"] [data-value]`)?.textContent;
    expect(value("streak")).toBe(String(o.progress.streak));
    expect(value("xp")).toBe(o.courses.find((c) => c.course === "es")!.xp.toLocaleString("en-US"));
    expect(value("words")).toBe(n.wordsLearned.toLocaleString("en-US"));
    expect(value("lessons")).toBe(String(o.completions.length));
    expect(document.querySelector('[data-big-stat="streak"]')).toHaveTextContent(
      `Longest: ${o.progress.longestStreak}`,
    );
    expect(document.querySelector('[data-big-stat="words"]')).toHaveTextContent(
      `${o.savedWords} saved to review`,
    );
    // This week's XP is account-wide (activity_days), so with several courses it says so next to a course total.
    expect(document.querySelector('[data-big-stat="xp"]')).toHaveTextContent(
      `+${n.xpThisWeek.toLocaleString("en-US")} this week, all courses`,
    );
  });

  it("the heat map draws exactly the 3-month window, one square a day", async () => {
    renderPage();
    const grid = await find("[data-heat-start]");
    expect(grid.getAttribute("data-heat-start")).toBe("2026-08-07");
    expect(grid.getAttribute("data-heat-end")).toBe("2026-11-06");
    const days = [...grid.querySelectorAll("[data-day]")].map((e) => e.getAttribute("data-day"));
    expect(days[0]).toBe("2026-08-07");
    expect(days.at(-1)).toBe("2026-11-06");
    expect(new Set(days).size).toBe(days.length);
    expect(days).toHaveLength(92);
  });

  it("a FREE learner sees a teaser naming only their own weak spots, never Hector's memory, linking to the Hector paywall", async () => {
    const o = richLearner();
    // The memory holds a category the learner has no weak-spot item for: it must not leak into the teaser.
    expect(openMemoryCategories(o.weaknessEvents)).toContain("reflexive-verbs");
    expect(
      hectorCard({ pro: false, weakItems: o.weakItems, weaknessEvents: o.weaknessEvents })?.kind,
    ).toBe("teaser");
    renderPage();
    const card = await find('[data-hector-card="teaser"]');
    expect(card).toHaveTextContent("Hector can help you with Ser or estar and Past tense endings.");
    expect(card.textContent).not.toMatch(/reflexive|noticed/i);
    expect(within(card).getByRole("link", { name: "Try Alphonso Pro" })).toHaveAttribute(
      "href",
      "/hector",
    );
    expect(document.querySelector('[data-hector-card="pro"]')).toBeNull();
  });

  it("a free learner with no weak spots gets no Hector card at all", async () => {
    getProfileOverview.mockResolvedValue(richLearner({ weakItems: [] }));
    renderPage();
    await find("[data-big-stat]");
    expect(document.querySelector("[data-hector-card]")).toBeNull();
  });

  it("a PRO learner sees what Hector is primed with", async () => {
    proState.state = "pro";
    renderPage();
    const card = await find('[data-hector-card="pro"]');
    expect(card).toHaveTextContent("Hector noticed");
    expect(card).toHaveTextContent("ser estar and reflexive verbs");
  });

  it("weak spots list the most-missed first, each with Practise", async () => {
    renderPage();
    await find("[data-weak-spot]");
    const rows = [...document.querySelectorAll("[data-weak-spot]")].map((e) =>
      e.getAttribute("data-weak-spot"),
    );
    expect(rows).toEqual(["ser-estar", "preterite-endings", "article-gender"]);
    expect(screen.getByRole("link", { name: "Practise Ser or estar" })).toHaveAttribute(
      "href",
      "/review",
    );
    expect(screen.getByRole("link", { name: "All 5" })).toBeInTheDocument();
  });

  it("friends this week puts me among my friends by XP", async () => {
    renderPage();
    await find("[data-friend-row]");
    const rows = [...document.querySelectorAll("[data-friend-row]")].map((e) =>
      e.getAttribute("data-friend-row"),
    );
    expect(rows[0]).toBe("f1");
    expect(rows).toContain("you");
  });

  it("the achievements count and the full wall come from the catalog and the learner's unlocks", async () => {
    const user = userEvent.setup();
    const o = richLearner();
    renderPage();
    await find("[data-big-stat]");
    await user.click(
      screen.getByRole("button", { name: `${o.achievements.length} of ${ACHIEVEMENTS.length}` }),
    );
    const wall = [...document.querySelectorAll("#all-badges [data-achievement]")];
    expect(wall).toHaveLength(ACHIEVEMENTS.length);
    // Unlocked first.
    expect(o.achievements.map((a) => a.id)).toContain(wall[0]!.getAttribute("data-achievement"));
  });

  it("a brand-new learner gets designed empty states, not blanks", async () => {
    getProfileOverview.mockResolvedValue(newLearner());
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Alex" });
    expect(screen.getByText("Finish a lesson to start one")).toBeInTheDocument();
    expect(screen.getByText("Your first one is waiting")).toBeInTheDocument();
    expect(screen.getByText("Your first lesson lights up a square.")).toBeInTheDocument();
    expect(screen.getByText(/No weak spots yet/)).toBeInTheDocument();
    expect(screen.getByText(/Learning sticks better with a friend/)).toBeInTheDocument();
    expect(screen.getByText(/Talk in Practice or with Hector/)).toBeInTheDocument();
    expect(document.querySelector("[data-league]")).toHaveTextContent("300 XP to Sapling");
    expect(document.querySelector("[data-hector-card]")).toBeNull();
  });

  it("switching course loads that course's numbers through the shared course switch", async () => {
    const user = userEvent.setup();
    renderPage();
    await find("[data-course-switcher]");
    getProfileOverview.mockResolvedValue(richLearner({ course: "fr" }));
    await user.click(screen.getByRole("button", { name: /French/ }));
    await waitFor(() => expect(fetchProgress).toHaveBeenCalledWith({ data: { course: "fr" } }));
    await waitFor(() =>
      expect(getProfileOverview).toHaveBeenCalledWith({ data: { course: "fr" } }),
    );
    expect(useProgress.getState().course).toBe("fr");
  });

  it("the gear takes you to Settings, where every account function still lives", async () => {
    renderPage();
    await find("[data-profile-hero]");
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    for (const name of ["Sign out", "Download my data", "Delete my account"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Edit your answers" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Sound effects" })).toBeInTheDocument();
  });

  it("an overview that fails to load says so and offers a retry, instead of showing zeros", async () => {
    getProfileOverview.mockRejectedValue(new Error("getProfileOverview: request-failed"));
    renderPage();
    expect(await screen.findByText("Your profile didn't load.")).toBeInTheDocument();
    expect(document.querySelector("[data-big-stat]")).toBeNull();
  });
});
