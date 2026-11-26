// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixtures from "../../lib/learning-path.fixtures.json";
import type { LearningPath } from "../../lib/path-plan";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      params,
      ...rest
    }: {
      to: string;
      children: React.ReactNode;
      params?: { id?: string };
    }) => (
      <a href={params?.id ? to.replace("$id", params.id) : to} {...rest}>
        {children}
      </a>
    ),
  };
});
const saveGoal = vi.fn();
vi.mock("../../lib/learning-goal-client", () => ({ saveGoal }));
const usePathMock = vi.fn();
vi.mock("../../lib/learning-path-client", () => ({ usePath: usePathMock }));

const { PathCards } = await import("./PathCards");

const fx = fixtures as unknown as Record<string, LearningPath>;
const ready = (path: LearningPath, reload = vi.fn()) =>
  usePathMock.mockReturnValue({ state: { kind: "ready", path }, reload });

beforeEach(() => {
  saveGoal.mockReset().mockResolvedValue(undefined);
  usePathMock.mockReset();
});

describe("Learn's path cards", () => {
  it("shows nothing until the path is known", () => {
    usePathMock.mockReturnValue({ state: { kind: "loading" }, reload: vi.fn() });
    const { container } = render(<PathCards course="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a suggested goal gets 'Your path is ready' with the target, the sentence and both buttons", () => {
    ready(fx.noGoal);
    render(<PathCards course="en" />);
    const card = screen.getByRole("region", { name: "Your path is ready" });
    expect(card).toHaveTextContent(fx.noGoal.goalLabel);
    expect(card).toHaveTextContent("Built from your answers: travel, 10 min a day, placed at A1");
    expect(screen.getByRole("link", { name: "Change target" })).toHaveAttribute(
      "href",
      "/path/build",
    );
  });

  it("'Looks good' saves the suggested goal through the goal endpoint, then reloads", async () => {
    const reload = vi.fn();
    ready(fx.noGoal, reload);
    render(<PathCards course="en" />);
    await userEvent.click(screen.getByRole("button", { name: "Looks good" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(saveGoal).toHaveBeenCalledWith(
      "en",
      fx.noGoal.progress.targetLevel,
      fx.noGoal.progress.targetDate,
    );
  });

  it("a saved goal has no 'Your path is ready' card", () => {
    ready(fx.behind);
    render(<PathCards course="en" />);
    expect(screen.queryByRole("region", { name: "Your path is ready" })).toBeNull();
  });

  it("Today lists the normal plan, and the weak-spot items are not in it", () => {
    ready(fx.weakSpots);
    render(<PathCards course="en" />);
    const today = screen.getByRole("region", { name: "Today" });
    expect(today).toHaveTextContent("Free Time");
    expect(today).not.toHaveTextContent("items due in Review");
    // The header sums the rows shown, not the daily target.
    const minutes = fx.weakSpots.today.items.reduce((sum, i) => sum + i.minutes, 0);
    expect(today).toHaveTextContent(`0 of ${fx.weakSpots.today.items.length} · ${minutes} min`);
  });

  it("the Fix card gathers both items under one 'Fix them now' that opens the first (Review)", () => {
    ready(fx.weakSpots);
    render(<PathCards course="en" />);
    const card = screen.getByRole("region", { name: "Fix before it sticks" });
    expect(card).toHaveTextContent("Fix before it sticks · 7 min");
    expect(card).toHaveTextContent("Two weak spots to tidy up");
    expect(card).toHaveTextContent("Refresher: Plurals (A1)");
    expect(screen.getByRole("link", { name: "Fix them now" })).toHaveAttribute("href", "/review");
  });

  it("the Fix card is hidden when there is nothing to fix", () => {
    ready(fx.behind);
    render(<PathCards course="en" />);
    expect(screen.queryByRole("region", { name: "Fix before it sticks" })).toBeNull();
  });

  it("says one weak spot when only one item is there", () => {
    const one = {
      ...fx.weakSpots,
      fix: {
        ...fx.weakSpots.fix!,
        title: "One weak spot to tidy up",
        items: fx.weakSpots.fix!.items.slice(0, 1),
      },
    } as LearningPath;
    ready(one);
    render(<PathCards course="en" />);
    expect(screen.getByRole("region", { name: "Fix before it sticks" })).toHaveTextContent(
      "One weak spot to tidy up",
    );
  });
});
