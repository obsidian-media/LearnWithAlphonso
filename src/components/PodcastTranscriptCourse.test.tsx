// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeConsentApi, withAiConsent } from "../lib/__testutils__/ai-consent";
import { usePodcastPlayer } from "../lib/podcast-player";
import { useProgress } from "../lib/progress";
import type { PodcastFolder } from "../lib/podcast-tree";
import { PodcastPlayer } from "./PodcastPlayer";
import { PodcastTranscriptPanel } from "./PodcastTranscript";

const { saveWord, listFolders, fetchTranscript } = vi.hoisted(() => ({
  saveWord: vi.fn(),
  listFolders: vi.fn(),
  fetchTranscript: vi.fn(),
}));

vi.mock("../lib/saved-word-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/saved-word-client")>()),
  saveWord,
}));
vi.mock("../lib/podcast.functions", () => ({ listFolders, fetchTranscript }));

const folder = (over: Partial<PodcastFolder> & { id: string }): PodcastFolder => ({
  parentId: null,
  slug: over.id,
  title: over.id,
  description: null,
  sortOrder: 0,
  course: null,
  ...over,
});

const episode = {
  id: "11111111-1111-1111-1111-111111111111",
  folderId: "series",
  slug: "au-cafe",
  title: "Au cafe",
  description: null,
  audioUrl: "https://example.test/fr/a1/au-cafe.mp3",
  durationSeconds: 300,
  positionSeconds: 0,
  aiNarrated: false,
};

async function tapAndSave(word: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: word }));
  await user.click(screen.getByRole("button", { name: /^save word$/i }));
  await waitFor(() => expect(saveWord).toHaveBeenCalledTimes(1));
  return saveWord.mock.calls[0][0] as { word: string; course: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  saveWord.mockResolvedValue({
    alreadySaved: false,
    word: "bonjour",
    sentence: "Bonjour tout le monde.",
    explanation: "bonjour: hello.",
  });
  usePodcastPlayer.setState({ episode: null, isPlaying: false, elapsedSeconds: 0, failed: false });
  useProgress.setState({ course: "en" });
});
afterEach(cleanup);

describe("a transcript word is saved under the episode's course", () => {
  it("panel: a French transcript word is tappable and saves as fr", async () => {
    render(
      withAiConsent(
        <PodcastTranscriptPanel
          title="Au cafe"
          transcript="Bonjour tout le monde."
          course="fr"
          isLoading={false}
          onClose={() => {}}
        />,
        fakeConsentApi(),
      ),
    );
    expect((await tapAndSave("Bonjour")).course).toBe("fr");
  });

  it("panel: a Spanish transcript word saves as es", async () => {
    render(
      withAiConsent(
        <PodcastTranscriptPanel
          title="En el cafe"
          transcript="Hola a todos."
          course="es"
          isLoading={false}
          onClose={() => {}}
        />,
        fakeConsentApi(),
      ),
    );
    expect((await tapAndSave("Hola")).course).toBe("es");
  });

  async function openTranscript(own: "en" | "fr" | "es" | null = null) {
    usePodcastPlayer.getState().play({ ...episode, course: own });
    render(withAiConsent(<PodcastPlayer />, fakeConsentApi()));
    await userEvent.click(screen.getByRole("button", { name: "Show transcript" }));
  }

  it("player: a French episode, read from its root folder, saves as fr while the active course is en", async () => {
    listFolders.mockResolvedValue([
      folder({ id: "root", course: "fr" }),
      folder({ id: "level", parentId: "root" }),
      folder({ id: "series", parentId: "level" }),
    ]);
    fetchTranscript.mockResolvedValue("Bonjour tout le monde.");
    await openTranscript();
    expect((await tapAndSave("Bonjour")).course).toBe("fr");
  });

  it("player: an episode whose root has no course falls back to the active course", async () => {
    useProgress.setState({ course: "es" });
    listFolders.mockResolvedValue([folder({ id: "series", course: null })]);
    fetchTranscript.mockResolvedValue("Hola a todos.");
    await openTranscript();
    expect((await tapAndSave("Hola")).course).toBe("es");
  });

  it("player: the episode's own course wins over its folder's and survives a failed folder read", async () => {
    listFolders.mockRejectedValue(new Error("offline"));
    fetchTranscript.mockResolvedValue("Bonjour tout le monde.");
    await openTranscript("fr");
    expect((await tapAndSave("Bonjour")).course).toBe("fr");
    expect(listFolders).not.toHaveBeenCalled();
  });
});
