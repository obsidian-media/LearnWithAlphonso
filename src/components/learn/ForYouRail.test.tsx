// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

const getTeamMission = vi.fn();
const getMyTeam = vi.fn();
vi.mock("../../lib/teams.functions", () => ({ getTeamMission, getMyTeam }));
const getWeeklyChallenges = vi.fn();
vi.mock("../../lib/challenges.functions", () => ({ getWeeklyChallenges }));
const usePathMock = vi.fn();
vi.mock("../../lib/learning-path-client", () => ({ usePath: usePathMock }));

const { ForYouRail } = await import("./ForYouRail");

function renderRail(dueCount = 0) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ForYouRail course="en" dueCount={dueCount} />
    </QueryClientProvider>,
  );
}

const challenge = (id: string, completed: boolean) => ({
  templateId: id,
  title: `Challenge ${id}`,
  description: "",
  progress: completed ? 5 : 1,
  threshold: 5,
  completed,
});

beforeEach(() => {
  getTeamMission.mockReset().mockResolvedValue(null);
  getMyTeam.mockReset().mockResolvedValue(null);
  getWeeklyChallenges.mockReset().mockResolvedValue([]);
  usePathMock.mockReset().mockReturnValue({ state: { kind: "none" }, reload: vi.fn() });
});

describe("ForYouRail", () => {
  it("Review is a link to /review that names the due count", () => {
    renderRail(3);
    const review = screen.getByRole("link", { name: "Review missed items, 3 items due" });
    expect(review).toHaveAttribute("href", "/review");
    expect(review).toHaveTextContent("3 due");
  });

  it("with no goal the path card opens the planner; nothing hides the card", () => {
    renderRail();
    expect(screen.getByRole("link", { name: /^Build my path: Set a goal/ })).toHaveAttribute(
      "href",
      "/path/build",
    );
  });

  it("hides team mission and weekly cards when there is nothing to show", async () => {
    renderRail();
    await waitFor(() => expect(getWeeklyChallenges).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /^Team mission/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Weekly challenges/ })).toBeNull();
  });

  it("weekly challenges opens the full card in place and closes again", async () => {
    getWeeklyChallenges.mockResolvedValue([challenge("a", true), challenge("b", false)]);
    const user = userEvent.setup();
    renderRail();
    const card = await screen.findByRole("button", { name: "Weekly challenges: 1 of 2 done" });
    expect(card).toHaveAttribute("aria-expanded", "false");
    await user.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Challenge b")).toBeInTheDocument();
    await user.click(card);
    expect(screen.queryByText("Challenge b")).toBeNull();
  });

  it("a failed team mission read still shows its card, and opening it offers Try again", async () => {
    getTeamMission.mockRejectedValue(new Error("x"));
    getMyTeam.mockResolvedValue({ teamId: "t1" });
    const user = userEvent.setup();
    renderRail();
    const card = await screen.findByRole("button", { name: "Team mission: Couldn't load" });
    await user.click(card);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("while the path loads there is no planner link; a failed load offers Try again", async () => {
    const reload = vi.fn();
    usePathMock.mockReturnValue({ state: { kind: "loading" }, reload });
    const { unmount } = renderRail();
    expect(screen.getByRole("group", { name: "My path: loading" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /path/i })).toBeNull();
    unmount();
    usePathMock.mockReturnValue({ state: { kind: "error", offline: false }, reload });
    renderRail();
    await userEvent.click(screen.getByRole("button", { name: /couldn't load. Try again/ }));
    expect(reload).toHaveBeenCalled();
  });

  it("marks the Weekly card when a full bar is waiting to be claimed", async () => {
    getWeeklyChallenges.mockResolvedValue([{ ...challenge("a", false), progress: 5 }]);
    renderRail();
    expect(
      await screen.findByRole("button", { name: /Weekly challenges: 0 of 1 done, reward ready/ }),
    ).toBeInTheDocument();
  });

  it("a failed first load recovers when the rail is mounted again", async () => {
    getWeeklyChallenges
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValue([challenge("a", true)]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    const ui = (
      <QueryClientProvider client={client}>
        <ForYouRail course="en" dueCount={0} />
      </QueryClientProvider>
    );
    const first = render(ui);
    await screen.findByRole("button", { name: "Weekly challenges: Couldn't load" });
    first.unmount();
    render(ui);
    expect(
      await screen.findByRole("button", { name: "Weekly challenges: 1 of 1 done" }),
    ).toBeInTheDocument();
  });
});
