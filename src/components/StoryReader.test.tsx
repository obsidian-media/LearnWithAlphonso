// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const played: string[] = [];
let ended: (() => void)[] = [];
/** The manifest the stubbed bucket serves for story s1; null is "no recordings yet" (a 404). */
let manifest: unknown = null;
/** Recorded files whose playback errors out (a missing or unreadable file). */
let brokenFiles = new Set<string>();
const SUPABASE = "https://proj.supabase.co";

beforeEach(() => {
  spoken.length = 0;
  played.length = 0;
  manifest = null;
  brokenFiles = new Set();
  ended = [];
  speakWord.mockReset();
  vi.stubEnv("VITE_SUPABASE_URL", SUPABASE);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body: string }) => {
      if (String(url).endsWith("/manifest.json")) {
        return manifest
          ? new Response(JSON.stringify(manifest), { status: 200 })
          : new Response("no", { status: 404 });
      }
      spoken.push(JSON.parse(init!.body).text);
      return new Response(new Blob(["a"]), { status: 200 });
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  class FakeAudio {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    pause = vi.fn();
    constructor(public src: string) {}
    play() {
      played.push(this.src);
      if (brokenFiles.has(this.src)) {
        queueMicrotask(() => this.onerror?.());
        return Promise.resolve();
      }
      ended.push(() => this.onended?.());
      return Promise.resolve();
    }
  }
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
    coverUrl: null,
    endingsTotal: 0,
    endingsFound: 0,
  };
  const branching = {
    ...base,
    id: "b1",
    level: "A2",
    title: "The Lost Key",
    published: true,
    branching: true,
    sortOrder: 5,
    segmentCount: 0,
    endingsTotal: 4,
    endingsFound: 1,
    coverUrl: "https://x.supabase.co/storage/v1/object/public/story-art/en/lost-key/n1.jpg",
  };
  it("draws a hero, a continue line and cover cards, hides drafts", () => {
    render(
      <StoriesLibraryView
        course="en"
        stories={[
          branching,
          { ...base, id: "1", level: "A1", title: "Live one", published: true, segmentIndex: 2 },
          { ...base, id: "2", level: "A2", title: "Live two", published: true },
          { ...base, id: "3", level: "A1", title: "Secret draft", published: false },
        ]}
      />,
    );
    const hero = screen.getByTestId("stories-hero");
    expect(hero).toHaveAccessibleName(
      "The Lost Key, A2, Choose your path, 1 of 4 endings, Continue",
    );
    expect(within(hero).getByText("A2 · 4 endings · 1 found")).toBeInTheDocument();
    expect(hero.querySelector("img")).toHaveAttribute("src", branching.coverUrl);
    expect(screen.getByTestId("stories-continue")).toHaveAccessibleName(
      "Live one, Continue · Scene 3, Resume",
    );
    const cards = within(screen.getByTestId("stories-grid")).getAllByTestId("story-card");
    expect(cards).toHaveLength(1);
    expect(within(screen.getByTestId("stories-grid")).queryByText("Live one")).toBeNull();
    expect(screen.queryByText("Secret draft")).toBeNull();
  });
  it("gives a linear story a designed fallback, never a broken image", () => {
    render(
      <StoriesLibraryView
        course="en"
        stories={[{ ...base, id: "1", level: "A1", title: "Tea", published: true }]}
      />,
    );
    const card = screen.getByTestId("story-card");
    expect(card.querySelector("img[src='']")).toBeNull();
    expect(card.querySelector("[data-cover='fallback']")).not.toBeNull();
    expect(card).toHaveAccessibleName("Tea, A1, New");
  });
  it("falls back to the designed cover when the art fails to load", () => {
    render(<StoriesLibraryView course="en" stories={[branching]} />);
    const img = screen.getByTestId("stories-hero").querySelector("img")!;
    fireEvent.error(img);
    expect(
      screen.getByTestId("stories-hero").querySelector(`img[src="${branching.coverUrl}"]`),
    ).toBeNull();
    expect(
      screen.getByTestId("stories-hero").querySelector("[data-cover='fallback']"),
    ).not.toBeNull();
  });
  it("shows the endings ring on a branching card with its fraction", () => {
    render(
      <StoriesLibraryView
        course="en"
        stories={[
          branching,
          { ...branching, id: "b0", sortOrder: 1, title: "Older", endingsFound: 2 },
        ]}
      />,
    );
    const ring = within(screen.getByTestId("stories-grid")).getByTestId("endings-ring");
    expect(ring).toHaveAttribute("data-fraction", "0.5");
    expect(ring).toHaveAttribute("aria-hidden", "true");
  });
  it("shows an empty state when nothing is published", () => {
    render(<StoriesLibraryView course="en" stories={[]} />);
    expect(screen.getByText("No stories yet")).toBeInTheDocument();
  });
});

describe("StoryReader recorded narration", () => {
  const recorded = (texts: string[]) => ({
    v: 1,
    voice: "aura-2-saturn-en",
    entries: texts.map((text, i) => ({ text, file: `stories/s1/f${i}.mp3` })),
  });
  const fileUrl = (i: number) =>
    `${SUPABASE}/storage/v1/object/public/podcast-audio/stories/s1/f${i}.mp3`;

  it("plays the recorded files and never calls /api/tts", async () => {
    manifest = recorded(story.segments);
    render(<StoryReader story={story} submitCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    await waitFor(() =>
      expect(document.querySelector("[data-segment='0']")).toHaveAttribute("aria-current", "true"),
    );
    await finishCurrent();
    await finishCurrent();
    await finishCurrent();
    await waitFor(() => expect(document.querySelector("[aria-current]")).toBeNull());
    expect(played).toEqual([fileUrl(0), fileUrl(1), fileUrl(2)]);
    expect(spoken).toEqual([]);
  });

  it("finds a recording by its text, ignoring stray whitespace", async () => {
    manifest = recorded(["Mia   wakes up.", "She drinks tea.", "She goes to work."]);
    render(<StoryReader story={story} submitCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    await waitFor(() => expect(played[0]).toBe(fileUrl(0)));
    expect(spoken).toEqual([]);
  });

  it("falls back to live speech only for the sentence with no recording", async () => {
    manifest = recorded(["Mia wakes up.", "She goes to work."]);
    render(<StoryReader story={story} submitCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    await finishCurrent();
    await finishCurrent();
    await finishCurrent();
    await waitFor(() => expect(document.querySelector("[aria-current]")).toBeNull());
    expect(spoken).toEqual(["She drinks tea."]);
    expect(played[0]).toBe(fileUrl(0));
    expect(played[1]).toBe("blob:x");
    expect(played[2]).toBe(fileUrl(1));
  });

  it("a recording that will not play falls back to live speech", async () => {
    manifest = recorded(story.segments);
    brokenFiles.add(fileUrl(0));
    render(<StoryReader story={story} submitCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    await waitFor(() => expect(spoken).toEqual(["Mia wakes up."]));
    expect(played.slice(0, 2)).toEqual([fileUrl(0), "blob:x"]);
  });

  it("does not look for recordings when the project URL is unknown", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    manifest = recorded(story.segments);
    render(<StoryReader story={story} submitCheck={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    await waitFor(() => expect(spoken[0]).toBe("Mia wakes up."));
  });
});
