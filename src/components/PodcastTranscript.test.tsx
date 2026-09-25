// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PodcastTranscriptPanel } from "./PodcastTranscript";

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
    expect(screen.getByText("Hello there.")).toBeInTheDocument();
    expect(screen.getByText("What can I get you?")).toBeInTheDocument();
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
