// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderList } from "./FolderList";

const folders = [
  {
    id: "f1",
    parentId: null,
    slug: "mind-fools-you",
    title: "Mind Fools You",
    description: null,
    sortOrder: 0,
  },
  {
    id: "f2",
    parentId: "f1",
    slug: "season-1",
    title: "Season 1",
    description: null,
    sortOrder: 1,
  },
];

function setup() {
  const onDelete = vi.fn();
  render(<FolderList folders={folders} onMove={() => {}} onDelete={onDelete} />);
  return { onDelete };
}

describe("FolderList delete confirm", () => {
  it("Delete asks first and deletes nothing yet", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]!);
    expect(screen.getByRole("dialog", { name: "Delete the folder “Season 1”?" })).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("Cancel leaves the folder alone", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("confirming deletes exactly the folder that was asked about", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]!);
    await userEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith("f2");
  });
});
