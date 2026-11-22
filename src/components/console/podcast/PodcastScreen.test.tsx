// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PodcastScreen } from "./PodcastScreen";
import { flattenFolders, formatDuration } from "./podcastFormat";
import type { AdminEpisode, AdminFolder, PodcastApi } from "./podcastApi";
import { UNPUBLISHABLE_PROVIDER_MESSAGE } from "../../../lib/podcast-provenance";

afterEach(() => cleanup());

const F1 = "60000000-0000-4000-8000-0000000000f1";
const F2 = "60000000-0000-4000-8000-0000000000f2";
const F3 = "60000000-0000-4000-8000-0000000000f3";
const folder = (over: Partial<AdminFolder> & Pick<AdminFolder, "id" | "title">): AdminFolder => ({
  parentId: null,
  slug: over.title.toLowerCase(),
  description: null,
  sortOrder: 0,
  episodeCount: 0,
  publishedCount: 0,
  ...over,
});
const FOLDERS: AdminFolder[] = [
  folder({ id: F1, title: "Everyday", episodeCount: 7, publishedCount: 7 }),
  folder({ id: F2, title: "Tired", parentId: F1, episodeCount: 5, publishedCount: 3 }),
  folder({ id: F3, title: "Empty", episodeCount: 0, publishedCount: 0 }),
];

const episode = (
  over: Partial<AdminEpisode> & Pick<AdminEpisode, "id" | "title">,
): AdminEpisode => ({
  folderId: F2,
  slug: over.title.toLowerCase().replace(/\s+/g, "-"),
  description: null,
  durationSeconds: 492,
  published: true,
  audioPath: `tired/${over.title}.mp3`,
  publishedAt: "2026-11-06T10:00:00Z",
  course: "en",
  voiceProvider: "deepgram",
  voiceModel: "aura-2-saturn-en",
  audioUrl: `https://files.test/podcast-audio/tired/${over.title}.mp3`,
  ...over,
});
const E1 = "60000000-0000-4000-8000-0000000000e1";
const E2 = "60000000-0000-4000-8000-0000000000e2";
const E3 = "60000000-0000-4000-8000-0000000000e3";
const EPISODES: AdminEpisode[] = [
  episode({ id: E1, title: "Alpha", description: "About alpha" }),
  episode({ id: E2, title: "Beta", published: false, publishedAt: null, durationSeconds: 543 }),
  episode({
    id: E3,
    title: "Gamma",
    published: false,
    publishedAt: null,
    voiceProvider: "unknown",
    voiceModel: null,
    course: null,
  }),
];

const ok = () => vi.fn(async () => ({ ok: true }));
function makeApi(over: Partial<PodcastApi> = {}): PodcastApi {
  return {
    folders: vi.fn(async () => FOLDERS),
    episodes: vi.fn(async () => EPISODES),
    transcript: vi.fn(async () => ({ text: "Hello there" })),
    createFolder: vi.fn(async () => ({ id: F3 })),
    renameFolder: ok(),
    moveFolder: ok(),
    deleteFolder: ok(),
    updateEpisode: ok(),
    setPublished: ok(),
    saveTranscript: ok(),
    replaceAudio: vi.fn(async () => ({ durationSeconds: 61 })),
    createEpisode: vi.fn(async () => ({ durationSeconds: 75 })),
    ...over,
  };
}

async function show(
  api: PodcastApi = makeApi(),
  folderId: string | null = F2,
  onSelect = vi.fn(),
  expectList = true,
) {
  const user = userEvent.setup();
  render(<PodcastScreen api={api} folderId={folderId} onSelectFolder={onSelect} />);
  await screen.findByRole("navigation", { name: "Folders" });
  if (folderId && expectList) await screen.findByRole("list", { name: "Episodes" });
  return user;
}
const openEpisode = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.click(screen.getByRole("button", { name: `Open the episode ${title}` }));
  return screen.getByRole("dialog", { name: "Episode" });
};
const reasonBox = () => screen.getByLabelText(/^Reason \(/);
const dialog = (name: string) => screen.getByRole("dialog", { name });
/** Types a reason in the open dialog and confirms with its button. */
async function confirmWith(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  button: string,
  reason = "  tidying the library  ",
) {
  const d = dialog(name);
  await user.type(within(d).getByLabelText(/^Reason \(/), reason);
  await user.click(within(d).getByRole("button", { name: button }));
}

describe("what the Podcast screen shows", () => {
  it("the folder tree, with each folder's real counts as Figures and the total in the eyebrow", async () => {
    await show();
    const rail = screen.getByRole("navigation", { name: "Folders" });
    const rows = within(rail).getAllByRole("button");
    expect(rows.map((r) => r.querySelector("span")?.textContent)).toEqual([
      "Empty",
      "Everyday",
      "Tired",
    ]);
    // nested folder is shown inside its parent
    expect(flattenFolders(FOLDERS).map((f) => f.depth)).toEqual([0, 0, 1]);
    expect(rows[2]!.textContent).toContain("5 episodes · 3 live · 2 draft");
    expect(rows[1]!.textContent).toContain("7 episodes · 7 live");
    expect(rows[1]!.textContent).not.toContain("draft");
    expect(document.querySelector("main p")?.textContent).toBe("Content · 12 episodes");
    expect(document.querySelector("main p [data-figure]")?.textContent).toBe("12");
  });

  it("unread counts say so, never a 0 and never a digit", async () => {
    await show(
      makeApi({
        folders: vi.fn(async () =>
          FOLDERS.map((f) => ({ ...f, episodeCount: null, publishedCount: null })),
        ),
      }),
    );
    const rail = screen.getByRole("navigation", { name: "Folders" });
    expect(within(rail).getAllByText("Could not read").length).toBe(3);
    expect(rail.textContent).not.toMatch(/\d/);
    expect(document.querySelector("main p")?.textContent).toBe("Content · Could not read episodes");
    expect(document.querySelector("main p [data-figure]")).toBeNull();
    expect(rail.querySelector("[data-figure]")).toBeNull();
  });

  it("an unreadable folder list shows the reason and a retry, with no digits", async () => {
    const folders = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(FOLDERS);
    const user = userEvent.setup();
    render(<PodcastScreen api={makeApi({ folders })} folderId={null} onSelectFolder={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe("db down");
    expect(document.querySelectorAll("[data-figure]").length).toBe(0);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("navigation", { name: "Folders" })).toBeTruthy();
  });

  it("an unreadable episode list says so; the folders stay usable", async () => {
    const episodes = vi.fn(async () => Promise.reject(new Error("no episodes for you")));
    render(<PodcastScreen api={makeApi({ episodes })} folderId={F2} onSelectFolder={vi.fn()} />);
    expect(await screen.findByText("no episodes for you")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Folders" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Episodes" })).toBeNull();
  });

  it("the episode rows show the real title, publish state, date, duration and language", async () => {
    await show();
    const rows = within(screen.getByRole("list", { name: "Episodes" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain("Alpha");
    expect(rows[0]!.textContent).toContain("Published 6 Nov 2026");
    expect(rows[0]!.textContent).toContain("8:12");
    expect(rows[0]!.textContent).toContain("EN");
    expect(rows[1]!.textContent).toContain("Not published");
    expect(rows[1]!.textContent).toContain("9:03");
    expect(rows[2]!.textContent).toContain("Not set"); // a missing language is not guessed
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });

  it("an empty folder and no folder say so", async () => {
    await show(makeApi({ episodes: vi.fn(async () => []) }), F2, vi.fn(), false);
    expect(await screen.findByText("No episodes in this folder yet.")).toBeTruthy();
    cleanup();
    await show(makeApi(), null);
    expect(screen.getByText("Choose a folder to see its episodes.")).toBeTruthy();
  });

  it("choosing a folder asks the route to go there", async () => {
    const onSelect = vi.fn();
    const user = await show(makeApi(), F2, onSelect);
    await user.click(
      within(screen.getByRole("navigation", { name: "Folders" })).getByRole("button", {
        name: /Empty/,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(F3);
  });

  it("the drawer plays the real audio URL from the list and shows the real details", async () => {
    const user = await show();
    const drawer = await openEpisode(user, "Alpha");
    const audio = drawer.querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe("https://files.test/podcast-audio/tired/Alpha.mp3");
    expect(drawer.textContent).toContain("Deepgram · aura-2-saturn-en");
    expect(drawer.textContent).toContain("8:12");
    expect(drawer.querySelector("[data-figure]")?.textContent).toBe("8:12");
    expect(await within(drawer).findByDisplayValue("Hello there")).toBeTruthy();
    expect(within(drawer).getByDisplayValue("About alpha")).toBeTruthy();
    expect(drawer.querySelector("svg")).toBeNull(); // no decorative waveform
  });

  it("an episode with no audio link says so instead of a dead player", async () => {
    const user = await show(
      makeApi({
        episodes: vi.fn(async () => [episode({ id: E1, title: "Alpha", audioUrl: null })]),
      }),
    );
    const drawer = await openEpisode(user, "Alpha");
    expect(drawer.querySelector("audio")).toBeNull();
    expect(within(drawer).getByText("The audio link is unavailable.")).toBeTruthy();
  });

  it("a transcript that cannot be read says so, and nothing can overwrite it blindly", async () => {
    const user = await show(
      makeApi({ transcript: vi.fn(async () => Promise.reject(new Error("no transcript read"))) }),
    );
    const drawer = await openEpisode(user, "Alpha");
    expect(await within(drawer).findByText("no transcript read")).toBeTruthy();
    expect(within(drawer).queryByRole("button", { name: "Save transcript" })).toBeNull();
  });
});

describe("what is NOT on the screen (nothing real backs it)", () => {
  it("no Processing status, no Re-generate audio, no Delete episode, no script-to-audio form, no waveform", async () => {
    const user = await show();
    expect(screen.queryByText(/processing/i)).toBeNull();
    const drawer = await openEpisode(user, "Alpha");
    expect(drawer.textContent).not.toMatch(/processing|re-?generate|generating/i);
    const names = within(drawer)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    expect(names.some((n) => /delete/i.test(n))).toBe(false);
    expect(names.some((n) => /regenerate|re-generate/i.test(n))).toBe(false);
    await user.click(within(drawer).getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "New episode" }));
    const d = dialog("New episode");
    expect(within(d).queryByLabelText(/\bscript\b/i)).toBeNull();
    expect(d.textContent).not.toMatch(/audio generates/i);
    expect(within(d).getByLabelText(/Audio file/)).toBeTruthy(); // the real flow: upload a file
  });
});

describe("every existing podcast action is reachable and asks for a reason first", () => {
  it("publish: a reason dialog, then setPublished(id, true, trimmed reason); the confirm stays off until the reason is long enough", async () => {
    const api = makeApi();
    const user = await show(api);
    const drawer = await openEpisode(user, "Beta");
    await user.click(within(drawer).getByRole("button", { name: "Publish" }));
    const d = dialog("Reason for publishing");
    const confirm = within(d).getByRole("button", { name: "Publish" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(reasonBox(), "ab");
    expect(confirm.disabled).toBe(true);
    await user.type(reasonBox(), "c ready  ");
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(api.setPublished).toHaveBeenCalledWith(E2, true, "abc ready"));
    expect(await screen.findByText("Published.")).toBeTruthy();
  });

  it("unlist (a published episode): reason, then setPublished(id, false, reason); cancel changes nothing", async () => {
    const api = makeApi();
    const user = await show(api);
    const drawer = await openEpisode(user, "Alpha");
    expect(within(drawer).queryByRole("button", { name: "Publish" })).toBeNull();
    await user.click(within(drawer).getByRole("button", { name: "Unlist" }));
    await user.click(
      within(dialog("Reason for unlisting")).getByRole("button", { name: "Cancel" }),
    );
    expect(api.setPublished).not.toHaveBeenCalled();
    await user.click(within(drawer).getByRole("button", { name: "Unlist" }));
    await confirmWith(user, "Reason for unlisting", "Unlist");
    await waitFor(() =>
      expect(api.setPublished).toHaveBeenCalledWith(E1, false, "tidying the library"),
    );
  });

  it("audio the app may not distribute shows the existing message and cannot be published from here", async () => {
    const user = await show();
    const drawer = await openEpisode(user, "Gamma");
    expect(within(drawer).getByRole("note").textContent).toBe(UNPUBLISHABLE_PROVIDER_MESSAGE);
    expect(
      (within(drawer).getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(drawer.textContent).toContain("Not recorded"); // an unknown voice is not guessed
  });

  it("the server's refusal is shown verbatim and nothing is reported as done", async () => {
    const api = makeApi({
      setPublished: vi.fn(async () => Promise.reject(new Error("the server said no"))),
    });
    const user = await show(api);
    await user.click(
      within(await openEpisode(user, "Beta")).getByRole("button", { name: "Publish" }),
    );
    await confirmWith(user, "Reason for publishing", "Publish");
    expect((await screen.findByRole("alert")).textContent).toBe("the server said no");
    expect(screen.queryByText("Published.")).toBeNull();
  });

  it("edit title and description: updateEpisode(id, title, description, reason)", async () => {
    const api = makeApi();
    const user = await show(api);
    const drawer = await openEpisode(user, "Alpha");
    const save = within(drawer).getByRole("button", { name: "Save details" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // nothing changed yet
    const title = within(drawer).getByDisplayValue("Alpha");
    await user.clear(title);
    await user.type(title, "Alpha two");
    await user.click(save);
    await confirmWith(user, "Reason for the change", "Save details");
    await waitFor(() =>
      expect(api.updateEpisode).toHaveBeenCalledWith(
        E1,
        "Alpha two",
        "About alpha",
        "tidying the library",
      ),
    );
  });

  it("edit transcript: saveTranscript(id, text, reason); clearing the box asks to remove it", async () => {
    const api = makeApi();
    const user = await show(api);
    const drawer = await openEpisode(user, "Alpha");
    const box = await within(drawer).findByLabelText("Transcript");
    await user.clear(box);
    await user.click(within(drawer).getByRole("button", { name: "Save transcript" }));
    expect(dialog("Reason for the change").textContent).toContain(
      "The transcript will be removed.",
    );
    await confirmWith(user, "Reason for the change", "Remove transcript");
    await waitFor(() =>
      expect(api.saveTranscript).toHaveBeenCalledWith(E1, "", "tidying the library"),
    );
    expect(await screen.findByText("Transcript removed.")).toBeTruthy();
  });

  it("replace audio: choose a file, give a reason, then replaceAudio(id, file, reason)", async () => {
    const api = makeApi();
    const user = await show(api);
    const drawer = await openEpisode(user, "Alpha");
    const file = new File(["bytes"], "new.mp3", { type: "audio/mpeg" });
    await user.upload(within(drawer).getByLabelText("Choose a replacement audio file"), file);
    expect(dialog("Replace audio").textContent).toContain("new.mp3");
    expect(api.replaceAudio).not.toHaveBeenCalled(); // nothing is uploaded before the reason
    await confirmWith(user, "Replace audio", "Upload and replace");
    await waitFor(() =>
      expect(api.replaceAudio).toHaveBeenCalledWith(E1, file, "tidying the library"),
    );
    expect(await screen.findByText("Audio replaced (1:01).")).toBeTruthy();
  });

  it("new episode: title, slug (suggested from the title), file and a reason, then createEpisode", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.click(screen.getByRole("button", { name: "New episode" }));
    const d = dialog("New episode");
    await user.type(within(d).getByLabelText("Title"), "A New Day");
    expect((within(d).getByLabelText(/^Slug/) as HTMLInputElement).value).toBe("a-new-day");
    await user.selectOptions(within(d).getByLabelText(/Language/), "fr");
    const file = new File(["bytes"], "day.mp3", { type: "audio/mpeg" });
    await user.upload(within(d).getByLabelText(/Audio file/), file);
    await confirmWith(user, "New episode", "Create episode");
    await waitFor(() =>
      expect(api.createEpisode).toHaveBeenCalledWith(
        {
          folderId: F2,
          slug: "a-new-day",
          title: "A New Day",
          description: null,
          course: "fr",
          levelId: null,
        },
        file,
        "tidying the library",
      ),
    );
    expect(await screen.findByText("Episode created (1:15). Not published yet.")).toBeTruthy();
  });

  it("new episode cannot be submitted without a file", async () => {
    const user = await show();
    await user.click(screen.getByRole("button", { name: "New episode" }));
    const d = dialog("New episode");
    await user.type(within(d).getByLabelText("Title"), "A New Day");
    await user.type(reasonBox(), "because");
    expect(
      (within(d).getByRole("button", { name: "Create episode" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("new folder: parent, name and slug, then createFolder(input, reason) and the new folder is chosen", async () => {
    const api = makeApi();
    const onSelect = vi.fn();
    const user = await show(api, F2, onSelect);
    await user.click(screen.getByRole("button", { name: "New folder" }));
    const d = dialog("New folder");
    await user.type(within(d).getByLabelText("Folder name"), "Morning Spanish");
    expect((within(d).getByLabelText(/^Slug/) as HTMLInputElement).value).toBe("morning-spanish");
    await user.selectOptions(within(d).getByLabelText("Inside"), F1);
    await confirmWith(user, "New folder", "Create folder");
    await waitFor(() =>
      expect(api.createFolder).toHaveBeenCalledWith(
        { parentId: F1, slug: "morning-spanish", title: "Morning Spanish" },
        "tidying the library",
      ),
    );
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(F3));
  });

  it("rename folder: renameFolder(id, title, description, reason)", async () => {
    const api = makeApi();
    const user = await show(api);
    await user.click(screen.getByRole("button", { name: "Rename" }));
    const d = dialog("Rename folder");
    const name = within(d).getByLabelText("Folder name");
    await user.clear(name);
    await user.type(name, "Very tired");
    await confirmWith(user, "Rename folder", "Save");
    await waitFor(() =>
      expect(api.renameFolder).toHaveBeenCalledWith(F2, "Very tired", null, "tidying the library"),
    );
  });

  it("move folder: the folder and what is under it are not offered; moveFolder(id, parent, reason)", async () => {
    const api = makeApi();
    const user = await show(api, F1);
    await user.click(screen.getByRole("button", { name: "Move" }));
    const d = dialog("Move “Everyday”");
    const options = within(d)
      .getAllByRole("option")
      .map((o) => o.textContent?.trim());
    expect(options).toEqual(["(top level)", "Empty"]); // not itself (Everyday), not its child (Tired)
    expect((within(d).getByRole("button", { name: "Move" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.selectOptions(within(d).getByLabelText("Move inside"), F3);
    await confirmWith(user, "Move “Everyday”", "Move");
    await waitFor(() => expect(api.moveFolder).toHaveBeenCalledWith(F1, F3, "tidying the library"));
  });

  it("delete folder: the folder name must be typed, then a reason; deleteFolder(id, reason) and the screen leaves the folder", async () => {
    const api = makeApi();
    const onSelect = vi.fn();
    const user = await show(api, F3, onSelect);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const d = dialog("Delete “Empty”");
    await user.type(reasonBox(), "no longer needed");
    const confirm = within(d).getByRole("button", { name: "Delete folder" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); // reason alone is not enough
    await user.type(within(d).getByLabelText("Type the folder name to confirm"), "Empty");
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(api.deleteFolder).toHaveBeenCalledWith(F3, "no longer needed"));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null));
  });

  it("a folder that still has things in it: the server's sentence is shown and the dialog stays open", async () => {
    const api = makeApi({
      deleteFolder: vi.fn(async () =>
        Promise.reject(new Error("Delete this folder's episodes first.")),
      ),
    });
    const user = await show(api, F3);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.type(
      within(dialog("Delete “Empty”")).getByLabelText("Type the folder name to confirm"),
      "Empty",
    );
    await confirmWith(user, "Delete “Empty”", "Delete folder");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Delete this folder's episodes first.",
    );
    expect(dialog("Delete “Empty”")).toBeTruthy();
  });

  it("every write sends the reason the person typed, and none is sent before it", async () => {
    const api = makeApi();
    const user = await show(api);
    // open every dialog and cancel: not one write is made without a reason
    for (const name of ["Rename", "Move", "Delete"]) {
      await user.click(screen.getByRole("button", { name }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    }
    for (const fn of [
      api.createFolder,
      api.renameFolder,
      api.moveFolder,
      api.deleteFolder,
      api.updateEpisode,
      api.setPublished,
      api.saveTranscript,
      api.replaceAudio,
      api.createEpisode,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("the layout holds at phone width (no 375 px e2e exists for the admin app yet)", () => {
  it("the folder rail becomes a select, rows are stacked cards that only become columns from md, and nothing scrolls sideways", async () => {
    const user = await show();
    expect(document.querySelector("table")).toBeNull();
    // the select is what a phone sees; the rail is hidden below md
    const select = screen.getByLabelText("Folder") as HTMLSelectElement;
    expect(select.closest("label")!.className).toContain("md:hidden");
    expect(select.value).toBe(F2);
    expect(screen.getByRole("navigation", { name: "Folders" }).className).toMatch(
      /\bhidden\b.*\bmd:grid\b/,
    );
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent?.trim()),
    ).toEqual(["Choose a folder", "Empty", "Everyday", "Tired"]);
    const row = screen.getAllByRole("listitem")[0]!.querySelector("button")!;
    expect(row.className).toContain("md:grid-cols-");
    expect(row.className).not.toMatch(/(^|\s)grid-cols-/);
    const grid = document.querySelector("main > div.grid")!;
    expect(grid.className).toContain("md:grid-cols-");
    expect(document.querySelector("main")!.innerHTML).not.toMatch(/min-w-\[(?!12rem)/);
    // the drawer is a full-width sheet that only becomes a side panel from sm
    const drawer = await openEpisode(user, "Alpha");
    expect(drawer.firstElementChild!.className).toMatch(/\bw-full\b.*\bsm:max-w-md\b/);
    // every control is at least 44 px tall (min-h-11) so a thumb can hit it
    for (const el of Array.from(
      document.querySelectorAll("select, input, textarea, button:not([data-folder])"),
    )) {
      if (el.closest("nav")) continue;
      expect((el as HTMLElement).className, el.outerHTML.slice(0, 80)).toMatch(/min-h-11/);
    }
  });

  it("the reason dialog is a bottom sheet on a phone with 44 px controls", async () => {
    const user = await show();
    await user.click(screen.getByRole("button", { name: "New folder" }));
    const d = dialog("New folder");
    expect(d.className).toMatch(/\bitems-end\b.*\bsm:items-center\b/);
    expect(d.className).toContain("overflow-y-auto"); // a tall form scrolls instead of running off the screen
    for (const el of Array.from(d.querySelectorAll("select, input, textarea, button"))) {
      expect((el as HTMLElement).className, el.outerHTML.slice(0, 80)).toMatch(/min-h-11/);
    }
  });
});
