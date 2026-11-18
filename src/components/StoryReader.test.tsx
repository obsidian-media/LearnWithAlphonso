// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Story } from "../lib/stories";
import { StoriesLibraryView } from "./StoriesLibrary";
import { StoryReader } from "./StoryReader";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    params: _p,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    params?: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../lib/auth-headers", () => ({ authHeaders: async () => ({}) }));
vi.mock("../lib/voice-prefs", () => ({ voiceFor: async () => "voice" }));
const speakWord = vi.hoisted(() => vi.fn());
vi.mock("../lib/use-model-speech", () => ({ useModelSpeech: () => speakWord }));

const story: Story = {
  id: "s1",
  course: "en",
  level: "A1",
  title: "Mia's Morning",
  segments: ["Mia wakes up.", "She drinks tea.", "She goes to work."],
  segmentIndex: 0,
  questions: [
    { id: "q1", prompt: "What does Mia drink?", choices: ["Coffee", "Tea"], answerIndex: 1 },
    { id: "q2", prompt: "Where does she go?", choices: ["Work", "Home"], answerIndex: 0 },
  ],
};

const spoken: string[] = [];
let ended: (() => void)[] = [];

beforeEach(() => {
  spoken.length = 0;
  ended = [];
  speakWord.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      spoken.push(JSON.parse(init.body).text);
      return new Response(new Blob(["a"]), { status: 200 });
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  class FakeAudio {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    pause = vi.fn();
    play() {
      ended.push(() => this.onended?.());
      return Promise.resolve();
    }
  }
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const finishCurrent = async () => {
  await waitFor(() => expect(ended.length).toBeGreaterThan(0));
  const fn = ended.shift()!;
  await act(async () => fn());
};

describe("StoryReader narration", () => {
  it("narrates segment by segment through /api/tts and moves the highlight along", async () => {
    render(<StoryReader story={story} submitCheck={vi.fn()} />);
    expect(document.querySelector("[aria-current]")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    await waitFor(() =>
      expect(document.querySelector("[data-segment='0']")).toHaveAttribute("aria-current", "true"),
    );
    await finishCurrent();
    await waitFor(() =>
      expect(document.querySelector("[data-segment='1']")).toHaveAttribute("aria-current", "true"),
    );
    expect(document.querySelector("[data-segment='0']")).not.toHaveAttribute("aria-current");
    await finishCurrent();
    await finishCurrent();
    await waitFor(() => expect(document.querySelector("[aria-current]")).toBeNull());
    expect(spoken).toEqual(["Mia wakes up.", "She drinks tea.", "She goes to work."]);
  });

  it("reports progress as each segment starts", async () => {
    const onProgress = vi.fn();
    render(<StoryReader story={story} submitCheck={vi.fn()} onProgress={onProgress} />);
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    await waitFor(() => expect(onProgress).toHaveBeenCalledWith(0));
    await finishCurrent();
    await waitFor(() => expect(onProgress).toHaveBeenCalledWith(1));
  });

  it("says so, and keeps the text, when narration cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    render(<StoryReader story={story} submitCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/narration isn.t available/i);
    expect(document.querySelector("[data-segment='0']")).toHaveTextContent("Mia wakes up.");
  });

  it("resumes from the saved segment", async () => {
    render(<StoryReader story={{ ...story, segmentIndex: 2 }} submitCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue listening" }));
    await waitFor(() => expect(spoken[0]).toBe("She goes to work."));
  });
});

describe("StoryReader tap a word", () => {
  it("speaks the word and opens the define dialog", async () => {
    render(<StoryReader story={story} submitCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "tea" }));
    expect(speakWord).toHaveBeenCalledWith("tea");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("StoryCheck", () => {
  const answerAll = async (picks: string[]) => {
    for (const [i, pick] of picks.entries()) {
      await userEvent.click(screen.getByRole("radio", { name: new RegExp(`^${pick}`) }));
      await userEvent.click(screen.getByRole("button", { name: "Check" }));
      await userEvent.click(
        screen.getByRole("button", { name: i === picks.length - 1 ? "Finish" : "Next" }),
      );
    }
  };

  it("sends only the choices and shows the server's score", async () => {
    const submit = vi.fn(async () => ({
      status: "applied" as const,
      correct: 1,
      total: 2,
      xpGain: 0,
      streak: 0,
      bestCorrect: 1,
      bestXp: 0,
      missedQuestionIds: ["q2"],
    }));
    render(<StoryReader story={story} submitCheck={submit} />);
    await answerAll(["Tea", "Home"]);
    expect(submit).toHaveBeenCalledWith([
      { questionId: "q1", choiceIndex: 1 },
      { questionId: "q2", choiceIndex: 1 },
    ]);
    expect(await screen.findByText("1 of 2 correct")).toBeInTheDocument();
    expect(screen.getByText("Answer: Work")).toBeInTheDocument();
  });

  it("marks the right and the wrong answer in words after Check", async () => {
    render(<StoryReader story={story} submitCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: /^Coffee/ }));
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText(/Your answer, not correct/)).toBeInTheDocument();
    expect(screen.getByText(/Correct answer/)).toBeInTheDocument();
  });

  it("offers a retry when saving fails for a reason that can pass", async () => {
    const submit = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({
      status: "applied",
      correct: 2,
      total: 2,
      xpGain: 0,
      streak: 0,
      bestCorrect: 2,
      bestXp: 0,
      missedQuestionIds: [],
    });
    render(<StoryReader story={story} submitCheck={submit} />);
    await answerAll(["Tea", "Work"]);
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("2 of 2 correct")).toBeInTheDocument();
  });
});

describe("StoriesLibraryView", () => {
  const base = {
    course: "en" as const,
    slug: "x",
    sortOrder: 0,
    branching: false,
    segmentIndex: 0,
    segmentCount: 3,
    bestCorrect: null,
    checkTotal: null,
    completed: false,
  };
  it("groups published stories by level and hides drafts", () => {
    render(
      <StoriesLibraryView
        course="en"
        stories={[
          { ...base, id: "1", level: "A1", title: "Live one", published: true },
          { ...base, id: "2", level: "A2", title: "Live two", published: true },
          { ...base, id: "3", level: "A1", title: "Secret draft", published: false },
        ]}
      />,
    );
    expect(screen.getByText("Live one")).toBeInTheDocument();
    expect(screen.getByText("Live two")).toBeInTheDocument();
    expect(screen.queryByText("Secret draft")).toBeNull();
    expect(screen.getByText(/A1 · Beginner/)).toBeInTheDocument();
  });
  it("shows an empty state when nothing is published", () => {
    render(<StoriesLibraryView course="en" stories={[]} />);
    expect(screen.getByText("No stories yet")).toBeInTheDocument();
  });
});
