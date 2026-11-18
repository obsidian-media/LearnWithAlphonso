// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BranchingStory } from "../lib/stories";
import type { FinishBranchingResult } from "../lib/stories.functions";
import { BranchingStoryReader } from "./BranchingStoryReader";

vi.mock("../lib/auth-headers", () => ({ authHeaders: async () => ({}) }));
vi.mock("../lib/voice-prefs", () => ({ voiceFor: async () => "voice" }));
vi.mock("../lib/use-model-speech", () => ({ useModelSpeech: () => vi.fn() }));
// Render framer-motion as plain elements so the tests exercise the reader's logic, not animation timing. The
// reduced-motion path is what these elements collapse to anyway.
vi.mock("framer-motion", () => {
  const React = require("react");
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
          React.createElement(tag, strip(props), children),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: unknown }) =>
      React.createElement(React.Fragment, null, children),
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
        ending: { id: "kind", title: "Kind and on time", wrap: "You did the kind thing.", quality: "good" },
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
    const finish = vi.fn(
      async (): Promise<FinishBranchingResult> => ({
        endingId: "kind",
        quality: "good",
        endingsFound: ["kind"],
        endingsTotal: 3,
        credited: true,
      }),
    );
    render(<BranchingStoryReader story={story} finish={finish} />);

    // The passage text is split into tappable words, so it is asserted on the segment element, like v1.
    expect(document.querySelector("[data-segment='0']")).toHaveTextContent("Sam wakes up late.");
    expect(screen.getByText("What does Sam do?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run to the bus" }));
    await waitFor(() => expect(screen.getByText("What now?")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Return it" }));

    await waitFor(() => expect(finish).toHaveBeenCalledWith([0, 0]));
    expect(await screen.findByText("Kind and on time")).toBeInTheDocument();
    expect(screen.getByText(/counts toward your reading practice/i)).toBeInTheDocument();
    expect(screen.getByText(/Endings found: 1 of 3/)).toBeInTheDocument();
  });

  it("reaches a lesser ending when a clue is skipped, with no credit (soft)", async () => {
    const finish = vi.fn(
      async (): Promise<FinishBranchingResult> => ({
        endingId: "late",
        quality: "lesser",
        endingsFound: ["late"],
        endingsTotal: 3,
        credited: false,
      }),
    );
    render(<BranchingStoryReader story={story} finish={finish} />);
    await userEvent.click(screen.getByRole("button", { name: "Make breakfast" }));
    await waitFor(() => expect(finish).toHaveBeenCalledWith([1]));
    expect(await screen.findByText("Late, but calm")).toBeInTheDocument();
    expect(screen.queryByText(/counts toward your reading practice/i)).toBeNull();
  });

  it("shows a themed placeholder when a node has no illustration", () => {
    render(<BranchingStoryReader story={story} finish={vi.fn()} />);
    expect(document.querySelector("[data-scene-placeholder]")).toBeInTheDocument();
  });

  it("offers another path from the ending screen and returns to the start", async () => {
    const finish = vi.fn(
      async (): Promise<FinishBranchingResult> => ({
        endingId: "late",
        quality: "lesser",
        endingsFound: ["late"],
        endingsTotal: 3,
        credited: false,
      }),
    );
    render(<BranchingStoryReader story={story} finish={finish} />);
    await userEvent.click(screen.getByRole("button", { name: "Make breakfast" }));
    await userEvent.click(await screen.findByRole("button", { name: "Try another path" }));
    expect(await screen.findByText("What does Sam do?")).toBeInTheDocument();
    expect(document.querySelector("[data-segment='0']")).toHaveTextContent("Sam wakes up late.");
  });
});
