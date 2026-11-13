// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WatchShelf } from "./WatchShelf";
import type { LibraryVideo } from "../lib/video-library";

afterEach(cleanup);

const video = (over: Partial<LibraryVideo> = {}): LibraryVideo => ({
  id: "v1",
  slug: "en-a",
  course: "en",
  title: "I'd like vs I want",
  description: null,
  level: "A1",
  durationSeconds: 49,
  videoUrl: "https://x.test/a.mp4",
  posterUrl: "https://x.test/a.jpg",
  captionsUrl: "https://x.test/a.vtt",
  tags: [],
  practice: null,
  sortOrder: 0,
  progressSeconds: 0,
  completedAt: null,
  ...over,
});

describe("WatchShelf", () => {
  it("draws nothing at all when the course has no videos (no empty box)", () => {
    const { container } = render(
      <WatchShelf videos={[video({ course: "fr" })]} course="en" onOpen={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    const none = render(<WatchShelf videos={[]} course="en" onOpen={() => {}} />);
    expect(none.container).toBeEmptyDOMElement();
  });

  it("lists the course's videos with title and length from the data, and opens one on tap", async () => {
    const onOpen = vi.fn();
    render(<WatchShelf videos={[video()]} course="en" onOpen={onOpen} />);
    expect(screen.getByRole("heading", { name: "Watch" })).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "I'd like vs I want, 0:49, new" });
    expect(within(button).getByText("0:49", { exact: false })).toBeInTheDocument();
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" }));
  });

  it("shows a progress bar for a video in progress and a tick for a finished one", () => {
    render(
      <WatchShelf
        videos={[
          video({ id: "a", title: "Half", progressSeconds: 25 }),
          video({ id: "b", title: "Done", completedAt: "2026-11-14T00:00:00Z", sortOrder: 1 }),
        ]}
        course="en"
        onOpen={() => {}}
      />,
    );
    expect(screen.getByRole("progressbar", { name: "Half progress" })).toHaveAttribute(
      "aria-valuenow",
      "51",
    );
    expect(screen.getByRole("button", { name: "Done, 0:49, watched" })).toHaveTextContent("✓");
    expect(screen.queryByRole("progressbar", { name: "Done progress" })).toBeNull();
  });
});
