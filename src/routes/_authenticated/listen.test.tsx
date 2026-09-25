// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListenFolderView, PodcastSearchResults } from "./listen";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => () => ({}),
}));

const folders = [
  { id: "a", parentId: null, slug: "en", title: "English", description: null, sortOrder: 0 },
  { id: "b", parentId: "a", slug: "a1", title: "A1 Beginner", description: null, sortOrder: 0 },
];

const episode = {
  id: "e1",
  folderId: "b",
  slug: "ordering-coffee",
  title: "Ordering Coffee",
  description: null,
  audioUrl: "https://example.test/x.mp3",
  durationSeconds: 305,
  positionSeconds: 0,
};

describe("ListenFolderView", () => {
  it("lists the child folders of the current level", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en"]} />);
    expect(screen.getByText("A1 Beginner")).toBeInTheDocument();
  });

  it("lists episodes with their duration", () => {
    render(<ListenFolderView folders={folders} episodes={[episode]} segments={["en", "a1"]} />);
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
    expect(screen.getByText("5:05")).toBeInTheDocument();
  });

  it("shows an empty state for a folder with no children or episodes", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en", "a1"]} />);
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it("shows a not-found state for a path that does not resolve", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en", "nope"]} />);
    expect(screen.getByText(/couldn't find that folder/i)).toBeInTheDocument();
  });

  it("lists the root folders at the top level", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={[]} />);
    expect(screen.getByText("English")).toBeInTheDocument();
  });
});

describe("PodcastSearchResults", () => {
  const results = [episode];

  it("lists matching episodes", () => {
    render(<PodcastSearchResults query="coffee" results={results} isLoading={false} />);
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
  });

  it("says nothing matched rather than showing an empty list", () => {
    render(<PodcastSearchResults query="zzzz" results={[]} isLoading={false} />);
    expect(screen.getByText(/no episodes match/i)).toBeInTheDocument();
  });

  // A one-character query matches nearly everything, so the query builder
  // returns null and the handler returns []. Reporting "no episodes match"
  // for that would be a lie: the search never ran.
  it("asks for more characters instead of claiming nothing matched", () => {
    render(<PodcastSearchResults query="c" results={[]} isLoading={false} />);
    expect(screen.getByText(/keep typing/i)).toBeInTheDocument();
    expect(screen.queryByText(/no episodes match/i)).not.toBeInTheDocument();
  });

  it("shows a searching state rather than a premature empty state", () => {
    render(<PodcastSearchResults query="coffee" results={[]} isLoading />);
    expect(screen.getByText(/searching/i)).toBeInTheDocument();
    expect(screen.queryByText(/no episodes match/i)).not.toBeInTheDocument();
  });
});
