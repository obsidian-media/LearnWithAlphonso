// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BranchingStory } from "../lib/stories";
import type { FinishBranchingResult } from "../lib/stories.functions";
import { BranchingStoryReader } from "./BranchingStoryReader";

vi.mock("../lib/auth-headers", () => ({ authHeaders: async () => ({}) }));
vi.mock("../lib/voice-prefs", () => ({ voiceFor: async () => "voice" }));
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ to, children, ...rest }: { to: string; children?: import("react").ReactNode }) =>
      React.createElement("a", { href: to, ...rest }, children),
  };
});
vi.mock("../lib/use-model-speech", () => ({ useModelSpeech: () => vi.fn() }));
// Render framer-motion as plain elements so the tests exercise the reader's logic, not animation timing. The
// reduced-motion path is what these elements collapse to anyway.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const strip = (p: Record<string, unknown>) => {
    const {
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      whileTap: _w,
      whileHover: _h,
      layout: _l,
      ...rest
    } = p;
    return rest;
  };
  const motion = new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({ children, ...props }: { children?: unknown } & Record<string, unknown>) =>
          React.createElement(tag, strip(props), children as import("react").ReactNode),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: unknown }) =>
      React.createElement(React.Fragment, null, children as import("react").ReactNode),
    useReducedMotion: () => true,
  };
});

const story: BranchingStory = {
  id: "s1",
  course: "en",
  level: "A2",
  title: "A Day",
  branching: true,
  endingsFound: [],
  readingCredited: false,
  graph: {
    start: "n1",
    map: {
      n1: {
        segments: ["Sam wakes up late."],
        artUrl: null,
        choice: {
          prompt: "What does Sam do?",
          options: [
            { label: "Run to the bus", goto: "n2", clue: true },
            { label: "Make breakfast", goto: "n3", clue: false },
          ],
        },
      },
      n2: {
        segments: ["He finds a wallet: Flat 12."],
        artUrl: null,
        choice: {
          prompt: "What now?",
          options: [
            { label: "Return it", goto: "good", clue: true },
            { label: "Board the bus", goto: "lesser", clue: false },
          ],
        },
      },
      n3: {
        segments: ["He eats slowly."],
        artUrl: null,
        ending: { id: "late", title: "Late, but calm", wrap: "A quiet start.", quality: "lesser" },
      },
      good: {
        segments: ["Mrs Patel gives him a ride."],
        artUrl: null,
        ending: {
          id: "kind",
          title: "Kind and on time",
          wrap: "You did the kind thing.",
          quality: "good",
        },
      },
      lesser: {
        segments: ["He feels uneasy."],
        artUrl: null,
        ending: { id: "uneasy", title: "Uneasy", wrap: "Still looking.", quality: "lesser" },
      },
    },
  },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Blob(["a"]), { status: 200 })),
  );
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BranchingStoryReader", () => {
  it("walks the attentive path, submits only the choices, and shows the good ending + credit", async () => {
    const finish = vi.fn(async (): Promise<FinishBranchingResult> => ({
      endingId: "kind",
      quality: "good",
      endingsFound: ["kind"],
      endingsTotal: 3,
      credited: true,
    }));
    render(<BranchingStoryReader story={story} finish={finish} />);

    // The passage text is split into tappable words, so it is asserted on the segment element, like v1.
    expect(document.querySelector("[data-segment='0']")).toHaveTextContent("Sam wakes up late.");
    expect(screen.getByText("What does Sam do?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run to the bus" }));
    await waitFor(() => expect(screen.getByText("What now?")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Return it" }));

    await waitFor(() => expect(finish).toHaveBeenCalledWith([0, 0]));
    await userEvent.click(await screen.findByRole("button", { name: "See your ending" }));
    expect(await screen.findByRole("heading", { name: "Kind and on time" })).toBeInTheDocument();
    expect(screen.getByText(/counts toward your reading practice/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Endings found: 1 of 3")).toHaveTextContent("1 / 3");
  });

  it("reaches a lesser ending when a clue is skipped, with no credit (soft)", async () => {
    const finish = vi.fn(async (): Promise<FinishBranchingResult> => ({
      endingId: "late",
      quality: "lesser",
      endingsFound: ["late"],
      endingsTotal: 3,
      credited: false,
    }));
    render(<BranchingStoryReader story={story} finish={finish} />);
    await userEvent.click(screen.getByRole("button", { name: "Make breakfast" }));
    await waitFor(() => expect(finish).toHaveBeenCalledWith([1]));
    await userEvent.click(await screen.findByRole("button", { name: "See your ending" }));
    expect(await screen.findByRole("heading", { name: "Late, but calm" })).toBeInTheDocument();
    expect(screen.queryByText(/counts toward your reading practice/i)).toBeNull();
  });

  it("renders the passage, the beat line and full-label option buttons with no tutor image", () => {
    render(<BranchingStoryReader story={story} finish={vi.fn()} />);
    expect(document.querySelector("[data-segment='0']")).toHaveTextContent("Sam wakes up late.");
    expect(screen.getByText("What does Sam do?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run to the bus" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make breakfast" })).toBeInTheDocument();
    expect(screen.getByText("Scene 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to stories" })).toHaveAttribute(
      "href",
      "/stories",
    );
    expect(screen.getByRole("heading", { name: "A Day" })).toBeInTheDocument();
    expect(document.querySelector("img[src*='avatar']")).toBeNull();
  });

  it("counts every node visited as a scene", async () => {
    render(<BranchingStoryReader story={story} finish={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Run to the bus" }));
    expect(await screen.findByText("Scene 2")).toBeInTheDocument();
  });

  it("shows the gradient fallback, never an image, when a node has no art", () => {
    render(<BranchingStoryReader story={story} finish={vi.fn()} />);
    expect(document.querySelector("[data-scene-placeholder]")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("swaps a failed image for the gradient fallback", () => {
    const withArt: BranchingStory = {
      ...story,
      graph: {
        ...story.graph,
        map: { ...story.graph.map, n1: { ...story.graph.map.n1, artUrl: "https://x.test/a.jpg" } },
      },
    };
    render(<BranchingStoryReader story={withArt} finish={vi.fn()} />);
    const img = document.querySelector("img") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    fireEvent.error(img);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("[data-scene-placeholder]")).toBeInTheDocument();
  });

  it("shows an ending node as a scene first, submits on entering, then celebrates on tap", async () => {
    const finish = vi.fn(async (): Promise<FinishBranchingResult> => ({
      endingId: "late",
      quality: "lesser",
      endingsFound: ["late"],
      endingsTotal: 3,
      credited: false,
    }));
    render(<BranchingStoryReader story={story} finish={finish} />);
    await userEvent.click(screen.getByRole("button", { name: "Make breakfast" }));
    // The closing passage is shown like any scene, with the button, and the path is already submitted.
    expect(document.querySelector("[data-segment='0']")).toHaveTextContent("He eats slowly.");
    expect(screen.getByText("Scene 2")).toBeInTheDocument();
    expect(screen.queryByText("Your ending")).toBeNull();
    await waitFor(() => expect(finish).toHaveBeenCalledWith([1]));
    await userEvent.click(screen.getByRole("button", { name: "See your ending" }));
    expect(await screen.findByText("Your ending")).toBeInTheDocument();
    expect(document.querySelector("[data-branch-map]")).toBeInTheDocument();
  });

  it("shows the ending, the branch map text alternative, pill and both buttons", async () => {
    const finish = vi.fn(async (): Promise<FinishBranchingResult> => ({
      endingId: "kind",
      quality: "good",
      endingsFound: ["kind", "late"],
      endingsTotal: 3,
      credited: true,
    }));
    render(<BranchingStoryReader story={story} finish={finish} />);
    await userEvent.click(screen.getByRole("button", { name: "Run to the bus" }));
    await userEvent.click(await screen.findByRole("button", { name: "Return it" }));
    await userEvent.click(await screen.findByRole("button", { name: "See your ending" }));
    expect(await screen.findByText("Your ending")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kind and on time" })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("group", {
          name: "You found 2 of 3 endings: Kind and on time, Late, but calm. 1 ending is still hidden.",
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Endings found: 2 of 3")).toHaveTextContent("2 / 3");
    expect(screen.getByText(/try the greyed branches for 1 more ending/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try another path" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read it again" })).toBeInTheDocument();
    // Reduce Motion (mocked on): the stars render settled, with no entrance animation props.
    expect(document.querySelectorAll("[data-star='earned']").length).toBeGreaterThan(0);
  });

  it("offers another path from the ending screen and returns to the start", async () => {
    const finish = vi.fn(async (): Promise<FinishBranchingResult> => ({
      endingId: "late",
      quality: "lesser",
      endingsFound: ["late"],
      endingsTotal: 3,
      credited: false,
    }));
    render(<BranchingStoryReader story={story} finish={finish} />);
    await userEvent.click(screen.getByRole("button", { name: "Make breakfast" }));
    await userEvent.click(await screen.findByRole("button", { name: "See your ending" }));
    await userEvent.click(await screen.findByRole("button", { name: "Try another path" }));
    expect(await screen.findByText("What does Sam do?")).toBeInTheDocument();
    expect(document.querySelector("[data-segment='0']")).toHaveTextContent("Sam wakes up late.");
  });

  const lateResult = (): Promise<FinishBranchingResult> =>
    Promise.resolve({
      endingId: "late",
      quality: "lesser",
      endingsFound: ["late"],
      endingsTotal: 3,
      credited: false,
    });

  it("submits the path exactly once per ending reached, and again after Read it again", async () => {
    const finish = vi.fn(lateResult);
    render(<BranchingStoryReader story={story} finish={finish} />);
    await userEvent.click(screen.getByRole("button", { name: "Make breakfast" }));
    await waitFor(() => expect(finish).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "See your ending" }));
    expect(await screen.findByText("Your ending")).toBeInTheDocument();
    // Opening the celebration is not a second submission.
    expect(finish).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Read it again" }));
    await userEvent.click(await screen.findByRole("button", { name: "Make breakfast" }));
    await waitFor(() => expect(finish).toHaveBeenCalledTimes(2));
    expect(finish).toHaveBeenLastCalledWith([1]);
  });

  it("shows a failed save on the ending scene with Retry, which sends the path again", async () => {
    const finish = vi
      .fn<(path: number[]) => Promise<FinishBranchingResult>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(lateResult);
    render(<BranchingStoryReader story={story} finish={finish} />);
    await userEvent.click(screen.getByRole("button", { name: "Make breakfast" }));
    // Surfaced on the scene itself, before the learner ever opens the celebration.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn.t save your path/);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(finish).toHaveBeenCalledTimes(2));
    expect(finish).toHaveBeenLastCalledWith([1]);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "See your ending" }));
    expect(await screen.findByLabelText("Endings found: 1 of 3")).toBeInTheDocument();
  });

  it("shows a saving state, not guessed stars or counts, until the server answers", async () => {
    let answer: (r: FinishBranchingResult) => void = () => undefined;
    const finish = vi.fn(
      () =>
        new Promise<FinishBranchingResult>((resolve) => {
          answer = resolve;
        }),
    );
    render(<BranchingStoryReader story={story} finish={finish} />);
    await userEvent.click(screen.getByRole("button", { name: "Make breakfast" }));
    await userEvent.click(screen.getByRole("button", { name: "See your ending" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saving your ending…");
    expect(document.querySelector("[data-star]")).toBeNull();
    expect(document.querySelector("[data-branch-map]")).toBeNull();
    answer(await lateResult());
    expect(await screen.findByLabelText("Endings found: 1 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("moves focus to the new scene's heading after a choice", async () => {
    render(<BranchingStoryReader story={story} finish={vi.fn(lateResult)} />);
    await userEvent.click(screen.getByRole("button", { name: "Run to the bus" }));
    const heading = await screen.findByRole("heading", { name: "Scene 2" });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});
