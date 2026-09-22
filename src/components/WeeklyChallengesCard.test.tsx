// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getWeeklyChallenges = vi.fn();
vi.mock("../lib/challenges.functions", () => ({ getWeeklyChallenges }));

// Dynamic import, after the mock is registered -- a static top-level
// import of a component that transitively imports challenges.functions
// races vi.mock's hoisting (the module graph resolves before the
// hoisted factory can see this file's own `const` declarations).
const { WeeklyChallengesCard } = await import("./WeeklyChallengesCard");

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WeeklyChallengesCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getWeeklyChallenges.mockReset();
});

describe("WeeklyChallengesCard", () => {
  it("renders each challenge's title and progress", async () => {
    getWeeklyChallenges.mockResolvedValue([
      {
        templateId: "lessons_5",
        title: "On a roll",
        description: "",
        progress: 3,
        threshold: 5,
        completed: false,
      },
    ]);
    renderCard();
    expect(await screen.findByText("On a roll")).toBeInTheDocument();
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("shows a completed challenge with a strikethrough style", async () => {
    getWeeklyChallenges.mockResolvedValue([
      {
        templateId: "lessons_5",
        title: "On a roll",
        description: "",
        progress: 5,
        threshold: 5,
        completed: true,
      },
    ]);
    renderCard();
    const title = await screen.findByText("On a roll");
    expect(title.className).toContain("line-through");
  });

  it("renders nothing while loading or when there are no challenges", () => {
    getWeeklyChallenges.mockReturnValue(new Promise(() => {}));
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });
});
