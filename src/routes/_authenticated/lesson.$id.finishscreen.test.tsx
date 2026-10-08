// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

vi.mock("../../lib/auth-headers", () => ({ authHeaders: vi.fn().mockResolvedValue({}) }));

const { FinishScreen } = await import("./lesson.$id");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

function renderFinish() {
  return render(
    <FinishScreen
      xp={10}
      unlocked={[]}
      heartsBonus={null}
      lessonTitle="Test lesson"
      correct={5}
      total={5}
      missedQs={[]}
      lessonId="l1"
      course="en"
    />,
  );
}

describe("FinishScreen", () => {
  it("shows Alphonso celebrating", () => {
    render(
      <FinishScreen
        xp={10}
        unlocked={[]}
        heartsBonus={null}
        lessonTitle="Test lesson"
        correct={5}
        total={5}
        missedQs={[]}
        lessonId="l1"
        course="en"
      />,
    );
    expect(screen.getByRole("img", { name: /alphonso/i })).toBeInTheDocument();
  });

  it("practice choices are keyed by position, so duplicate texts do not both light up", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          questions: [{ prompt: "p", choices: ["same", "same", "x"], answerIndex: 1, explanation: "e" }],
          source: "ai",
        }),
        { status: 200 },
      ),
    );
    renderFinish();
    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    const rows = await screen.findAllByRole("button", { name: "same" });
    await user.click(rows[0]);
    expect(rows[0].className).toContain("bg-parchment");
    expect(rows[1].className).not.toContain("bg-parchment");
  });

  it("a practice 429 shows the server's own message, not a generic failure", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Daily limit reached. Try again tomorrow." }), { status: 429 }),
    );
    renderFinish();
    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    expect(await screen.findByText("Daily limit reached. Try again tomorrow.")).toBeInTheDocument();
  });
});
