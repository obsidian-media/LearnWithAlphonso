// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut } } }));

const { Route } = await import("./profile");
const { useProgress } = await import("../../lib/progress");
const { useTheme } = await import("../../lib/theme");
const { ACHIEVEMENTS } = await import("../../data/achievements");

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ProfilePage = Route.options.component!;
  return render(
    <QueryClientProvider client={client}>
      <ProfilePage />
    </QueryClientProvider>,
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

  it("falls back to 'Learner' when there is no display name", async () => {
    getMyProfile.mockResolvedValue({ display_name: null, country: null, avatar_seed: "a" });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Learner" })).toBeInTheDocument();
  });

  it("saves the display name and a normalized country code", async () => {
    const user = userEvent.setup();
    renderPage();
    const nameInput = await screen.findByLabelText("Display name");
    // The profile query resolves asynchronously and its effect syncs
    // `name`/`country` state from it -- wait for that sync before editing,
    // or a later resolution would clobber the edit.
    await waitFor(() => expect(nameInput).toHaveValue("Ada"));

    await user.clear(nameInput);
    await user.type(nameInput, "Grace");
    const countryInput = screen.getByLabelText(/Country/);
    await user.clear(countryInput);
    await user.type(countryInput, "gbr");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        data: { display_name: "Grace", country: "GB" },
      }),
    );
  });

  it("sends undefined for an empty display name and null for an empty country", async () => {
    getMyProfile.mockResolvedValue({ display_name: "Ada", country: "US", avatar_seed: "a" });
    const user = userEvent.setup();
    renderPage();
    const nameInput = await screen.findByLabelText("Display name");
    await waitFor(() => expect(nameInput).toHaveValue("Ada"));
    await user.clear(nameInput);
    const countryInput = screen.getByLabelText(/Country/);
    await user.clear(countryInput);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        data: { display_name: undefined, country: null },
      }),
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

  it("signs out: cancels queries, clears the cache, and navigates to /auth", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Display name");

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith({ to: "/auth", replace: true });
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
});
