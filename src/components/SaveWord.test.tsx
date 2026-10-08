// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeConsentApi, withAiConsent } from "../lib/__testutils__/ai-consent";
import { SavedWordError, type SavedWordResult } from "../lib/saved-word-client";
import { SaveWordHint, SaveWordProvider } from "./SaveWord";
import { TappableText } from "./TappableText";

const saved: SavedWordResult = {
  alreadySaved: false,
  word: "tea",
  sentence: "I want tea.",
  explanation: "tea: a hot drink made from leaves.",
};

function setup(save = vi.fn(async () => saved), text = "I like milk. I want tea.", course = "en") {
  render(
    <SaveWordProvider save={save}>
      <p>
        <TappableText text={text} course={course} />
      </p>
    </SaveWordProvider>,
  );
  return save;
}

afterEach(cleanup);

describe("TappableText", () => {
  it("renders plain text when there is no provider (nothing to open)", () => {
    render(<TappableText text="I want tea." course="en" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("I want tea.")).toBeInTheDocument();
  });

  it("makes each word a button and leaves punctuation and spaces alone", () => {
    setup();
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["I", "like", "milk", "I", "want", "tea"]);
  });

  it("does not link anything outside the English course", () => {
    setup(
      vi.fn(async () => saved),
      "Je veux du thé.",
      "fr",
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Je veux du thé.")).toBeInTheDocument();
  });

  it("can take its words out of the tab order for long text", () => {
    render(
      <SaveWordProvider save={vi.fn(async () => saved)}>
        <TappableText text="one two" course="en" focusable={false} />
      </SaveWordProvider>,
    );
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("tabindex", "-1");
  });
});

describe("save dialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for AI consent before sending anything, and sends after Allow", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => saved);
    render(
      withAiConsent(
        <SaveWordProvider save={save}>
          <p>
            <TappableText text="I want tea." course="en" />
          </p>
        </SaveWordProvider>,
        fakeConsentApi(null),
      ),
    );
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    expect(save).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Allow" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it("does not ask for a choice that may already exist when the setting cannot be read", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => saved);
    const api = fakeConsentApi("2026-10-09T10:00:00Z");
    api.get = async () => {
      throw new Error("offline");
    };
    render(
      withAiConsent(
        <SaveWordProvider save={save}>
          <p>
            <TappableText text="I want tea." course="en" />
          </p>
        </SaveWordProvider>,
        { ...api, initial: undefined },
      ),
    );
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    // Wait for the failed read to settle, then try to save.
    await new Promise((r) => setTimeout(r, 0));
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  });

  it("sends nothing when the learner answers Not now", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => saved);
    render(
      withAiConsent(
        <SaveWordProvider save={save}>
          <p>
            <TappableText text="I want tea." course="en" />
          </p>
        </SaveWordProvider>,
        fakeConsentApi(null),
      ),
    );
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(save).not.toHaveBeenCalled();
  });

  it("opens on a tapped word showing the word and the sentence it was tapped in", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(/save/i);
    expect(dialog).toHaveTextContent("tea");
    expect(dialog).toHaveTextContent("I want tea.");
    // The disclosure is shown BEFORE anything is sent.
    expect(dialog).toHaveTextContent(/AI service/i);
  });

  it("sends nothing until the learner confirms", async () => {
    const user = userEvent.setup();
    const save = setup();
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ word: "tea", sentence: "I want tea.", course: "en" });
  });

  it("shows the stored meaning once saved", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    expect(await screen.findByText(/a hot drink made from leaves/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent(/saved/i);
  });

  it("says so when the word was already saved", async () => {
    const user = userEvent.setup();
    setup(vi.fn(async () => ({ ...saved, alreadySaved: true })));
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    expect(await screen.findByText(/already saved/i)).toBeInTheDocument();
  });

  it("sends one request even if Save is pressed twice quickly", async () => {
    const user = userEvent.setup();
    let release: (r: SavedWordResult) => void = () => {};
    const save = vi.fn(
      () =>
        new Promise<SavedWordResult>((resolve) => {
          release = resolve;
        }),
    );
    setup(save);
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    const button = screen.getByRole("button", { name: /^save word$/i });
    await user.click(button);
    const saving = screen.getByRole("button", { name: /saving/i });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(save).toHaveBeenCalledTimes(1);
    release(saved);
    expect(await screen.findByText(/a hot drink/i)).toBeInTheDocument();
  });

  it("shows the failure and offers a retry when the lookup is merely unavailable", async () => {
    const user = userEvent.setup();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new SavedWordError("unavailable"))
      .mockResolvedValueOnce(saved);
    setup(save);
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't look that word up/i);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText(/a hot drink/i)).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("offers no retry when retrying cannot help (the 500-word limit)", async () => {
    const user = userEvent.setup();
    setup(vi.fn().mockRejectedValue(new SavedWordError("limitReached")));
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/500/);
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("treats an unexpected thrown error as unavailable, not a crash", async () => {
    const user = userEvent.setup();
    setup(vi.fn().mockRejectedValue(new Error("boom")));
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't look that word up/i);
  });

  it("closes on Escape and on Cancel, and returns focus to the tapped word", async () => {
    const user = userEvent.setup();
    setup();
    const word = screen.getAllByRole("button", { name: "tea" })[0];
    await user.click(word);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(word).toHaveFocus();

    await user.click(word);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Tab inside the dialog and locks page scroll while it is open", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    const save = screen.getByRole("button", { name: /^save word$/i });
    const cancel = screen.getByRole("button", { name: /cancel/i });
    expect(save).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(save).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(cancel);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("starts fresh for the next word instead of showing the previous result", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole("button", { name: "tea" })[0]);
    await user.click(screen.getByRole("button", { name: /^save word$/i }));
    await screen.findByText(/a hot drink/i);
    // The words under the overlay are still in the DOM; a new tap while a result is
    // showing must replace it, not leave the previous word's result on screen.
    await user.click(screen.getByRole("button", { name: "milk" }));
    expect(screen.queryByText(/a hot drink/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save word$/i })).toBeInTheDocument();
  });
});

describe("SaveWordHint", () => {
  beforeEach(() => window.localStorage.clear());
  const withProvider = (node: ReactNode) => <SaveWordProvider>{node}</SaveWordProvider>;

  it("always shows when asked to", () => {
    render(<SaveWordHint always />);
    expect(screen.getByText(/tap any word to save it/i)).toBeInTheDocument();
  });

  it("shows on the first three mounts, then stops", () => {
    for (let i = 0; i < 3; i += 1) {
      const { unmount } = render(withProvider(<SaveWordHint />));
      expect(screen.getByText(/tap a word to save it/i)).toBeInTheDocument();
      unmount();
    }
    render(withProvider(<SaveWordHint />));
    expect(screen.queryByText(/tap a word to save it/i)).not.toBeInTheDocument();
  });

  it("says nothing where there is nothing to tap (no provider)", () => {
    render(<SaveWordHint />);
    expect(screen.queryByText(/tap a word to save it/i)).not.toBeInTheDocument();
  });

  it("still shows when storage is unavailable rather than throwing", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(withProvider(<SaveWordHint />));
    expect(screen.getByText(/tap a word to save it/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});
