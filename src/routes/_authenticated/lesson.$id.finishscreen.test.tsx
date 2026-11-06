// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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

describe("FinishScreen rewards", () => {
  it("shows Alphonso, and xp, streak and accuracy chips", async () => {
    const { useProgress } = await import("../../lib/progress");
    useProgress.setState({ streak: 12 });
    render(
      <FinishScreen
        xp={20}
        unlocked={[]}
        heartsBonus={null}
        lessonTitle="The Passive"
        correct={11}
        total={12}
        missedQs={[]}
        lessonId="l1"
        course="en"
      />,
    );
    expect(screen.getByRole("img", { name: /alphonso/i })).toBeInTheDocument();
    expect(screen.getByLabelText("XP: +20")).toBeInTheDocument();
    expect(screen.getByLabelText("Streak: 12")).toBeInTheDocument();
    expect(screen.getByLabelText("Accuracy: 92%")).toBeInTheDocument();
  });

  it("leaves out the streak chip when there is no streak", async () => {
    const { useProgress } = await import("../../lib/progress");
    useProgress.setState({ streak: 0 });
    renderFinish();
    expect(screen.getByLabelText("XP: +10")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Streak:/)).not.toBeInTheDocument();
  });

  it("Continue is the gold pressable button, back to the path", () => {
    renderFinish();
    const link = screen.getByRole("link", { name: "Continue" });
    expect(link).toHaveAttribute("href", "/learn");
    expect(link.className).toContain("bg-[linear-gradient(180deg,var(--c-action-hi)");
    expect(link.className).toContain("active:translate-y-1");
  });
});

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
    global.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            questions: [
              { prompt: "p", choices: ["same", "same", "x"], answerIndex: 1, explanation: "e" },
            ],
            source: "ai",
          }),
          { status: 200 },
        ),
    );
    renderFinish();
    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    const rows = await screen.findAllByRole("button", { name: "same" });
    await user.click(rows[0]);
    expect(rows[0]).toHaveAttribute("aria-pressed", "true");
    expect(rows[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("a practice 429 shows the server's own message, not a generic failure", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: "Daily limit reached. Try again tomorrow." }), {
          status: 429,
        }),
    );
    renderFinish();
    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    expect(await screen.findByText("Daily limit reached. Try again tomorrow.")).toBeInTheDocument();
  });

  it("a practice 429 with the real quota body shows the quota copy, never the code", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: "quota-exceeded",
            resetsAt: "2099-01-01T12:00:00.000Z",
            message: "Daily CHAT limit reached (50/day). Try again tomorrow.",
          }),
          { status: 429 },
        ),
    );
    renderFinish();
    await user.click(screen.getByRole("button", { name: "Generate more practice" }));
    expect(await screen.findByText(/You've reached today's AI practice limit/)).toBeInTheDocument();
    expect(screen.queryByText(/quota-exceeded/)).not.toBeInTheDocument();
  });
});

describe("FinishScreen Practise with Hector", () => {
  function serveStatus(pro: boolean) {
    const urls: string[] = [];
    global.fetch = vi.fn(async (input: string) => {
      urls.push(String(input));
      if (String(input).startsWith("/api/pro-status")) {
        return Response.json({
          pro,
          store: pro ? "web" : null,
          trialEligible: !pro,
          manageUrl: null,
        });
      }
      if (String(input).startsWith("/api/pro-offering")) {
        return Response.json({
          price: "$9.99",
          period: "month",
          trialDays: 7,
          purchaseUrl: "https://pay.rev.cat/t/u",
        });
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    return urls;
  }

  it("lesson complete shows Practise with Hector, which opens /hector for Pro and the paywall with source lesson_complete otherwise", async () => {
    serveStatus(true);
    const { unmount } = renderFinish();
    expect(await screen.findByRole("link", { name: "Practise with Hector" })).toHaveAttribute(
      "href",
      "/hector",
    );
    unmount();

    const urls = serveStatus(false);
    renderFinish();
    await userEvent.click(await screen.findByRole("button", { name: "Practise with Hector" }));
    expect(await screen.findByText("$9.99 / month")).toBeInTheDocument();
    expect(urls).toContain("/api/pro-offering?source=lesson_complete");
  });
});

describe("FinishScreen celebration", () => {
  function setReducedMotion(reduce: boolean) {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: reduce && q.includes("prefers-reduced-motion"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }
  afterEach(() => vi.useRealTimers());

  function renderInRoom() {
    return render(
      <FinishScreen
        xp={10}
        unlocked={[]}
        heartsBonus={null}
        lessonTitle="Test lesson"
        correct={4}
        total={5}
        missedQs={[]}
        lessonId="l1"
        course="en"
        roomSrc="/avatar/scenes/garden.webp"
      />,
    );
  }

  it("happens in the unit's room, in code: no painted clip, confetti on a canvas, Alphonso amazed", () => {
    setReducedMotion(false);
    const { container } = renderInRoom();
    expect(container.querySelector("[data-room]")?.getAttribute("data-room")).toBe(
      "/avatar/scenes/garden.webp",
    );
    expect(container.querySelector("video")).toBeNull();
    expect(container.innerHTML).not.toContain("/clips/complete");
    expect(container.querySelector("canvas[data-confetti]")?.getAttribute("data-confetti")).toBe(
      "falling",
    );
    expect(screen.getByRole("img", { name: "Alphonso, amazed" })).toHaveAttribute(
      "src",
      "/alphonso/lesson/wow.webp",
    );
    expect(screen.getByText("Lesson complete")).toBeInTheDocument();
    expect(screen.getByText("Nice work! You got 4 of 5.")).toBeInTheDocument();
  });

  it("Alphonso goes from wow to a smile 1.4 s in", async () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    renderInRoom();
    expect(screen.getByRole("img", { name: "Alphonso, amazed" })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    expect(screen.queryByRole("img", { name: "Alphonso, smiling" })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("img", { name: "Alphonso, smiling" })).toHaveAttribute(
      "src",
      "/alphonso/lesson/happy.webp",
    );
  });

  it("the XP counts up from zero", async () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    renderFinish();
    const xp = screen.getByRole("group", { name: "XP: +10" });
    expect(within(xp).getByText("+0")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(within(xp).getByText("+10")).toBeInTheDocument();
  });

  it("under Reduce Motion: a still scatter, Alphonso already smiling, and the final numbers at once", () => {
    setReducedMotion(true);
    const { container } = renderInRoom();
    expect(container.querySelector("canvas[data-confetti]")?.getAttribute("data-confetti")).toBe(
      "still",
    );
    expect(screen.getByRole("img", { name: "Alphonso, smiling" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Alphonso, amazed" })).toBeNull();
    const xp = screen.getByRole("group", { name: "XP: +10" });
    expect(within(xp).getByText("+10")).toBeInTheDocument();
  });

  it("Continue is pinned to the bottom of the screen, so the way on never scrolls out of view", () => {
    setReducedMotion(false);
    renderFinish();
    const footer = screen.getByRole("link", { name: "Continue" }).closest("[data-finish-footer]")!;
    expect(footer.className).toContain("sticky");
    expect(footer.className).toContain("bottom-0");
  });

  it("a new achievement slides in as a toast under the tiles", () => {
    setReducedMotion(false);
    const { container } = render(
      <FinishScreen
        xp={10}
        unlocked={["streak_3"]}
        heartsBonus="perfect"
        lessonTitle="Test lesson"
        correct={5}
        total={5}
        missedQs={[]}
        lessonId="l1"
        course="en"
      />,
    );
    expect(container.querySelectorAll("[data-achievement-toast]")).toHaveLength(1);
    expect(screen.getByText("Achievement unlocked")).toBeInTheDocument();
    expect(screen.getByText("Perfect lesson: +1 heart")).toBeInTheDocument();
  });
});
