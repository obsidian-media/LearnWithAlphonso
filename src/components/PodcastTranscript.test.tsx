// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PodcastTranscriptPanel } from "./PodcastTranscript";

// Words are tappable buttons, so a paragraph's text is split across elements and
// getByText on the whole paragraph no longer matches; compare the <p>'s text.
const paragraph = (text: string) =>
  screen.getByText((_, el) => el?.tagName === "P" && el.textContent === text);

describe("PodcastTranscriptPanel", () => {
  it("renders each paragraph separately", () => {
    render(
      <PodcastTranscriptPanel
        title="Ordering Coffee"
        transcript={"Hello there.\n\nWhat can I get you?"}
        isLoading={false}
        onClose={() => {}}
      />,
    );
    expect(paragraph("Hello there.")).toBeInTheDocument();
    expect(paragraph("What can I get you?")).toBeInTheDocument();
  });

  it("shows a loading state rather than a premature empty one", () => {
    render(
      <PodcastTranscriptPanel
        title="Ordering Coffee"
        transcript={null}
        isLoading
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/no transcript/i)).not.toBeInTheDocument();
  });

  // An episode with no transcript is inaccessible to deaf and hard-of-hearing
  // learners. That is a property of the content, so the panel says so plainly
  // rather than rendering blank and leaving them to wonder.
  it("says an episode has no transcript instead of showing nothing", () => {
    render(
      <PodcastTranscriptPanel
        title="Ordering Coffee"
        transcript={null}
        isLoading={false}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/no transcript/i)).toBeInTheDocument();
  });

  it("is labelled as a dialog naming the episode, so a screen reader announces it", () => {
    render(
      <PodcastTranscriptPanel
        title="Ordering Coffee"
        transcript="Hello."
        isLoading={false}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: /Ordering Coffee/i })).toBeInTheDocument();
  });
});

describe("PodcastTranscriptPanel saving words", () => {
  it("makes words tappable but keeps them out of the tab order", () => {
    render(
      <PodcastTranscriptPanel
        title="Ordering Coffee"
        transcript={"Hello there."}
        isLoading={false}
        onClose={() => {}}
      />,
    );
    const hello = screen.getByRole("button", { name: "Hello" });
    expect(hello).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText(/tap any word to save it/i)).toBeInTheDocument();
  });
});

describe("PodcastTranscriptPanel keyboard access to words", () => {
  const renderPanel = () =>
    render(
      <PodcastTranscriptPanel
        title="Ordering Coffee"
        transcript={"Hello there friend."}
        isLoading={false}
        onClose={() => {}}
      />,
    );

  it("has one tabbable control that moves focus into the words", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /browse words with the keyboard/i }));
    expect(screen.getByRole("button", { name: "Hello" })).toHaveFocus();
  });

  it("moves between words with the arrow keys and stops at the ends", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /browse words with the keyboard/i }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "there" })).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("button", { name: "friend" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "there" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("button", { name: "Hello" })).toHaveFocus();
  });

  it("leaves the arrow keys alone on controls that are not words", async () => {
    const user = userEvent.setup();
    renderPanel();
    const browse = screen.getByRole("button", { name: /browse words with the keyboard/i });
    browse.focus();
    await user.keyboard("{ArrowRight}");
    expect(browse).toHaveFocus();
  });

  it("opens the save dialog from the focused word with Enter", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /browse words with the keyboard/i }));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: /save this word/i })).toBeInTheDocument();
  });

  it("does not offer the control when there is no transcript", () => {
    render(
      <PodcastTranscriptPanel title="x" transcript={null} isLoading={false} onClose={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: /browse words/i })).not.toBeInTheDocument();
  });
});
