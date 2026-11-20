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
  useTheme.setState({ theme: "royal" });
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
    await user.click(screen.getByRole("button", { name: "Change profile picture" }));
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

  it("offers exactly two themes, Royal and Meadow, Royal selected by default", async () => {
    renderPage();
    await screen.findByLabelText("Display name");
    const group = screen.getByRole("tablist", { name: "Choose a theme" });
    const tabs = within(group).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Royal", "Meadow"]);
    expect(within(group).getByRole("tab", { name: "Royal" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    for (const gone of ["Studio Ink", "Manuscript", "Canopy"]) {
      expect(screen.queryByRole("tab", { name: gone })).toBeNull();
    }
  });

  it("switches theme, persisting it through updateProfile", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("tab", { name: "Meadow" }));

    expect(useTheme.getState().theme).toBe("meadow");
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ data: { theme: "meadow" } }));
  });

  it("signs out: cancels queries, clears the cache, and navigates to /auth", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith({ to: "/auth", replace: true });
  });

  it("has a Help row (the chat) in its own section, above Account, next to the support page link", async () => {
    renderPage();
    await screen.findByLabelText("Display name");
    const row = screen.getByRole("link", { name: /Ask a question or talk to a person/ });
    expect(row).toHaveAttribute("href", "/help");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("Help")).toBeGreaterThan(headings.indexOf("AI features"));
    expect(headings.indexOf("Help")).toBeLessThan(headings.indexOf("Account"));
    expect(screen.getByRole("link", { name: "Help and feedback" })).toHaveAttribute(
      "href",
      "/support",
    );
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
    // The URL is revoked a moment after the click, not in the same tick (Safari cancels the download otherwise).
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
    await waitFor(() => expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url"), {
      timeout: 3000,
    });
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

const { bigNumbers, heroLevel, hectorCard, leagueStatus, openMemoryCategories } =
  await import("../../lib/profile-overview");

/** The rendered element matching `selector`, once it exists. */
async function find(selector: string): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`no ${selector}`);
    return el;
  });
}

/** Profile is three tabs now: go to one, and (on Progress) open a fold by its title. */
async function openTab(name: "Progress" | "Social") {
  await userEvent.setup().click(await screen.findByRole("tab", { name }));
}
async function openFold(title: RegExp | string) {
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: title, expanded: false }));
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
    // Canada is drawn: an image named for a screen reader (never the emoji).
    expect(within(flag).getByRole("img", { name: "Canada" }).getAttribute("src")).toBe(
      "/flags/ca.svg",
    );
    on.unmount();

    // A country with no drawing: its code in a styled pill (card fill, line border, uppercase), named for a screen reader.
    getProfileOverview.mockResolvedValue(
      richLearner({
        profile: {
          displayName: "Sam",
          avatarSeed: "animal:fox",
          country: "ZA",
          createdAt: "2026-08-02T00:00:00Z",
        },
      }),
    );
    const chipView = renderPage();
    const chip = await find("[data-profile-hero] [data-flag-chip]");
    expect(chip.getAttribute("data-flag-chip")).toBe("ZA");
    expect(chip).toHaveTextContent("ZA");
    expect(chip.getAttribute("aria-label")).toBe("South Africa");
    for (const cls of ["bg-ds-card", "border-ds-line", "uppercase", "h-[15px]"])
      expect(chip.className).toContain(cls);
    chipView.unmount();

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
    expect(within(hero).queryByRole("img", { name: "Canada" })).toBeNull();
  });

  it("the hero's four numbers are the overview's numbers, each readable as one phrase", async () => {
    const o = richLearner();
    const n = bigNumbers(o);
    renderPage();
    await find("[data-big-stat]");
    const value = (name: string) =>
      document.querySelector(`[data-big-stat="${name}"] [data-value]`)?.textContent;
    expect(value("streak")).toBe(String(n.streak));
    expect(value("xp")).toBe(n.courseXp.toLocaleString("en-US"));
    expect(value("words")).toBe(n.wordsLearned.toLocaleString("en-US"));
    expect(value("accuracy")).toBe(`${n.accuracyPct}%`);
    // One phrase for VoiceOver and TalkBack, not four loose fragments.
    expect(screen.getByRole("group", { name: `${n.streak} day streak` })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: `${n.accuracyPct} percent accuracy` }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("[data-big-stat]")).toHaveLength(4);
  });

  it("the hero's level ring and bar are the CEFR level's lesson progress, with a text equivalent", async () => {
    const o = richLearner();
    const lvl = heroLevel(o);
    renderPage();
    const ring = await find("[data-level-ring]");
    // The ring is decorative; the level is the picture button's description (a button's children are presentational).
    expect(ring.getAttribute("role")).toBeNull();
    expect(ring.getAttribute("aria-hidden")).toBe("true");
    const button = screen.getByRole("button", { name: "Change picture" });
    expect(button).toHaveAccessibleDescription(new RegExp(`^Level ${lvl.level}, .*${lvl.level}`));
    expect(document.querySelector("[data-level-badge]")).toHaveTextContent(lvl.level);
    expect(document.querySelector("[data-level-line]")?.textContent).toMatch(
      lvl.lessonsLeft > 0 ? /lessons? left in/ : /Ready for|top level/,
    );
    // The mock's "XP to Level 8" is not a number this app tracks, so it is not invented.
    expect(document.querySelector("[data-profile-hero]")).not.toHaveTextContent(/XP to Level/);
  });

  it("the hero names the league tier with the learner's real rank", async () => {
    renderPage();
    const chip = await find("[data-league-chip]");
    const o = richLearner();
    expect(chip).toHaveTextContent(/league/);
    if (o.league) expect(chip).toHaveTextContent(`Rank ${o.league.rank}`);
  });

  it("a country with a drawn flag shows the vector, never the emoji", async () => {
    getProfileOverview.mockResolvedValue(
      richLearner({
        profile: { displayName: "Sam", avatarSeed: "animal:fox", country: "GB", createdAt: null },
      }),
    );
    renderPage();
    const flag = await find("[data-profile-flag] img");
    expect(flag.getAttribute("src")).toBe("/flags/gb.svg");
    expect(flag.getAttribute("alt")).toBe("United Kingdom");
  });

  it("the picture opens the avatar editor", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Change picture" }));
    expect(await screen.findByRole("heading", { name: "Your profile picture" })).toBeVisible();
  });

  it("the Overview has the week strip, the achievements preview and the two rows", async () => {
    const o = richLearner();
    renderPage();
    const week = await find("[data-ring-measure]");
    expect(within(week).getAllByRole("listitem")).toHaveLength(7);
    const preview = await find("[data-achievements-preview]");
    expect(preview).toHaveAttribute(
      "aria-label",
      `Achievements, ${o.achievements.length} of ${ACHIEVEMENTS.length} unlocked`,
    );
    expect(preview.querySelectorAll("[data-badge-state]").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /^Edit your answers Goal/ })).toHaveAttribute(
      "href",
      "/complete-profile",
    );
    expect(screen.getByRole("button", { name: /^Settings Theme and account/ })).toBeInTheDocument();
  });

  it("the achievements preview opens the Achievements card on Progress", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await find("[data-achievements-preview]"));
    expect(
      await screen.findByRole("button", { name: /^Achievements/, expanded: true }),
    ).toBeVisible();
  });

  it("the hero stays on Progress and Social, without its level bar and numbers", async () => {
    renderPage();
    await find("[data-big-stat]");
    await openTab("Progress");
    expect(document.querySelector("[data-profile-hero]")).not.toBeNull();
    expect(document.querySelector("[data-big-stat]")).toBeNull();
    await openTab("Social");
    expect(document.querySelector("[data-league-chip]")).not.toBeNull();
    expect(document.querySelector("[data-level-ring]")).not.toBeNull();
  });

  it("the heat map draws exactly the 3-month window, one square a day", async () => {
    renderPage();
    await openTab("Progress");
    await openFold(/^Activity heat map/);
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

  it("weak spots list the most-missed first, each with Practice", async () => {
    renderPage();
    await openTab("Progress");
    await openFold(/^Weak spots/);
    await find("[data-weak-spot]");
    const rows = [...document.querySelectorAll("[data-weak-spot]")].map((e) =>
      e.getAttribute("data-weak-spot"),
    );
    expect(rows).toEqual(["ser-estar", "preterite-endings", "article-gender"]);
    expect(screen.getByRole("link", { name: "Practice Ser or estar" })).toHaveAttribute(
      "href",
      "/review",
    );
    expect(screen.getByRole("link", { name: "All 5" })).toBeInTheDocument();
  });

  it("friends this week puts me among my friends by XP", async () => {
    renderPage();
    await openTab("Social");
    await find("[data-friend-row]");
    const rows = [...document.querySelectorAll("[data-friend-row]")].map((e) =>
      e.getAttribute("data-friend-row"),
    );
    expect(rows[0]).toBe("f1");
    expect(rows).toContain("you");
  });

  it("the Social tab has League and Friends rows that open /league and /profile/friends", async () => {
    renderPage();
    await openTab("Social");
    const social = await screen.findByRole("navigation", { name: "Social" });
    const links = within(social).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/league",
      "/profile/friends",
      "/profile/invite",
    ]);
    expect(links[2]).toHaveTextContent("Invite friends");
    expect(links[0]).toHaveTextContent("League");
    expect(links[0]).toHaveTextContent("Leaderboards, teams, and the season ladder");
    expect(links[1]).toHaveTextContent("Friends");
  });

  it("the achievements count and the full wall come from the catalog and the learner's unlocks", async () => {
    const user = userEvent.setup();
    const o = richLearner();
    renderPage();
    await find("[data-big-stat]");
    await openTab("Progress");
    await openFold(/^Achievements/);
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
    expect(screen.getByRole("group", { name: "0 day streak" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "No accuracy yet" })).toBeInTheDocument();
    expect(document.querySelector("[data-minutes-spoken]")).toBeNull();
    await openTab("Progress");
    await openFold(/^Activity heat map/);
    await openFold(/^Weak spots/);
    expect(screen.getByText("Your first lesson lights up a square.")).toBeInTheDocument();
    expect(screen.getByText(/No weak spots yet/)).toBeInTheDocument();
    expect(screen.getByText("Skills start counting from your next lesson")).toBeInTheDocument();
    expect(screen.queryByText(/writing/i)).not.toBeInTheDocument();
    await openTab("Social");
    expect(screen.getByText(/Learning sticks better with a friend/)).toBeInTheDocument();
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

  it("the Settings row takes you to Settings, where every account function still lives", async () => {
    renderPage();
    await find("[data-profile-hero]");
    expect(screen.getByRole("button", { name: /^Settings Theme and account/ })).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "Get help" })).toHaveAttribute("href", "/help");
  });
});

describe("Profile: skills radar, goal rings, mastered words, league standing", () => {
  const day = "2026-11-05";
  const answers = (skill: string, right: number, total: number) => ({ day, skill, right, total });

  it("too little data shows the designed empty state and no shape", async () => {
    getProfileOverview.mockResolvedValue(richLearner({ skills: [answers("listening", 3, 4)] }));
    renderPage();
    await openTab("Progress");
    const card = await find("[data-skills-chart]");
    expect(card.getAttribute("data-skills-chart")).toBe("empty");
    expect(card.querySelector("[data-radar-shape]")).toBeNull();
    expect(card).toHaveTextContent(/Your listening, speaking, vocabulary, grammar and reading/);
    expect(card).toHaveTextContent(/Speaking: \d+ more answers to score/);
  });

  it("with no answers at all the card says Skills start counting from your next lesson", async () => {
    getProfileOverview.mockResolvedValue(richLearner({ skills: [] }));
    renderPage();
    await openTab("Progress");
    const card = await find('[data-skills-chart="empty"]');
    expect(card.querySelector("[data-skills-intro]")).toHaveTextContent(
      "Skills start counting from your next lesson",
    );
  });

  it("draws one vertex per scored skill, from the rows, and calls out the lowest", async () => {
    getProfileOverview.mockResolvedValue(
      richLearner({
        skills: [
          answers("listening", 9, 10),
          answers("vocabulary", 6, 10),
          answers("grammar", 4, 10),
          answers("reading", 8, 10),
        ],
      }),
    );
    renderPage();
    await openTab("Progress");
    const card = await find('[data-skills-chart="radar"]');
    expect(card.querySelector('[data-skill="listening"]')?.getAttribute("data-score")).toBe("90");
    expect(card.querySelector('[data-skill="grammar"]')?.getAttribute("data-score")).toBe("40");
    // Speaking was never answered: no score, no dot.
    const speaking = card.querySelector('[data-skill="speaking"]')!;
    expect(speaking.getAttribute("data-score")).toBe("");
    expect(speaking.querySelector("circle")).toBeNull();
    expect(
      card.querySelector("[data-radar-shape]")?.getAttribute("points")?.split(" "),
    ).toHaveLength(4);
    expect(card.querySelector("[data-skills-lowest]")).toHaveTextContent("Lowest: Grammar · 40");
  });

  it("the week rings measure the daily goal in learning minutes", async () => {
    getProfileOverview.mockResolvedValue(
      richLearner({
        dailyGoalMinutes: 10,
        learning: [
          { day: "2026-11-02", lessonSeconds: 420, practiceSeconds: 240 },
          { day: "2026-11-03", lessonSeconds: 300, practiceSeconds: 0 },
        ],
      }),
    );
    renderPage();
    const week = await find("[data-ring-measure]");
    expect(week.getAttribute("data-ring-measure")).toBe("minutes");
    // Monday: 11 minutes reaches the 10-minute goal; Tuesday: 5 does not, whatever the XP was.
    const rings = [...week.querySelectorAll("[data-ring]")].map((e) => e.getAttribute("data-ring"));
    expect(rings.slice(0, 2)).toEqual(["done", "missed"]);
    expect(week).toHaveTextContent("Goal: 10 learning minutes a day");
  });

  it("without a chosen daily time the rings keep the XP rule and say how to set one", async () => {
    getProfileOverview.mockResolvedValue(richLearner({ dailyGoalMinutes: null }));
    renderPage();
    const week = await find("[data-ring-measure]");
    expect(week.getAttribute("data-ring-measure")).toBe("xp");
    expect(week).toHaveTextContent(/Pick a daily time in Edit your answers/);
  });

  it("Words learned counts the words of the completed lessons, not the retired saved words", async () => {
    const o = richLearner({ masteredWords: 17 });
    getProfileOverview.mockResolvedValue(o);
    renderPage();
    const tile = await find('[data-big-stat="words"]');
    const learned = bigNumbers(o).wordsLearned;
    expect(learned).toBeGreaterThan(0);
    expect(learned).not.toBe(17);
    expect(tile.querySelector("[data-value]")).toHaveTextContent(learned.toLocaleString("en-US"));
    expect(tile).toHaveTextContent("words learned");
    expect(tile).not.toHaveTextContent("mastered");
  });

  it("the league card shows rank and when the week ends, in the learner's zone", async () => {
    getProfileOverview.mockResolvedValue(
      richLearner({
        league: {
          leagueTier: "silver",
          rank: 4,
          size: 12,
          weekStart: "2026-11-02",
          weekEnd: "2026-11-08",
          weekXp: 80,
        },
        timeZone: "Pacific/Auckland",
      }),
    );
    renderPage();
    await openTab("Social");
    const standing = await find("[data-league-standing]");
    // Sunday ends at 23:59 UTC, which is already Monday the 9th in Auckland: shown as the learner lives it.
    expect(standing).toHaveTextContent("Rank 4 of 12 · ends Mon, Nov 9");
  });
  it("the Social league card is navy, with the tier, a progress bar to the next tier and the standing", async () => {
    const o = richLearner();
    const cp = o.courses.find((c) => c.course === o.course)!;
    const s = leagueStatus(cp.leagueTier, cp.xp);
    renderPage();
    await openTab("Social");
    const card = await find("[data-league]");
    expect(card.getAttribute("data-league")).toBe(cp.leagueTier);
    expect(within(card).getByText("Your league")).toBeInTheDocument();
    const bar = within(card).getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe(String(s.pct));
    // The bar's text equivalent is the line under it.
    expect(bar.getAttribute("aria-label")).toBe(card.querySelector("p")!.textContent);
    // The old "Leaderboard" link and Friends "See all" are gone: the League and Friends rows cover them.
    expect(screen.queryByRole("link", { name: "Leaderboard" })).toBeNull();
    expect(screen.queryByRole("link", { name: "See all" })).toBeNull();
  });
});
