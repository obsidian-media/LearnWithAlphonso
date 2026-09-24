// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListenFolderView } from "./listen";

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
