import { useEffect, useMemo, useRef, useState } from "react";
import { formatDay } from "../../../lib/staff-dates";
import {
  isPublishableProvider,
  UNPUBLISHABLE_PROVIDER_MESSAGE,
} from "../../../lib/podcast-provenance";
import { ReasonDialog } from "../../staff/ReasonDialog";
import { Button } from "../../ui/Button";
import { Figure } from "../Figure";
import {
  DeleteFolderDialog,
  FolderOptions,
  MoveFolderDialog,
  NewEpisodeDialog,
  NewFolderDialog,
  RenameFolderDialog,
  ReplaceAudioDialog,
} from "./PodcastDialogs";
import { FIELD_CLASS } from "./FieldsDialog";
import type { AdminEpisode, AdminFolder, PodcastApi } from "./podcastApi";
import { flattenFolders, formatDuration, withDescendants } from "./podcastFormat";

const messageOf = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

const VOICE_LABEL: Record<string, string> = {
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
  "edge-tts": "Edge TTS",
  human: "Human recording",
};
const voiceText = (e: AdminEpisode): string => {
  const who = e.voiceProvider ? (VOICE_LABEL[e.voiceProvider] ?? null) : null;
  if (!who) return "Not recorded";
  return e.voiceModel ? `${who} · ${e.voiceModel}` : who;
};
const languageText = (e: AdminEpisode) => (e.course ? e.course.toUpperCase() : "Not set");

type Load<T> =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

type Pending =
  | { kind: "new_folder" }
  | { kind: "rename_folder" }
  | { kind: "move_folder" }
  | { kind: "delete_folder" }
  | { kind: "new_episode" }
  | { kind: "replace_audio"; file: File }
  | { kind: "publish"; published: boolean }
  | { kind: "details"; title: string; description: string | null }
  | { kind: "transcript"; text: string };

const STATUS_PILL = "rounded-full px-2 py-0.5 text-xs font-bold";

/**
 * Podcast: folders on the left, a folder's episodes on the right, an episode drawer with the real audio, its details,
 * its transcript and what can be done to it. Everything is read from the podcast tables (counts are grouped in the
 * database) and every change asks for a reason first, which the server and the database each refuse to do without.
 * Not built, because nothing real backs them: Processing, Re-generate audio, Delete episode and a script-to-audio form.
 */
export function PodcastScreen({
  api,
  folderId,
  onSelectFolder,
}: {
  api: PodcastApi;
  folderId: string | null;
  onSelectFolder: (id: string | null) => void;
}) {
  const [folders, setFolders] = useState<Load<AdminFolder[]>>({ status: "loading" });
  const [episodes, setEpisodes] = useState<Load<AdminEpisode[]>>({ status: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The folder just created, selected once the lists have reloaded. */
  const createdId = useRef<string | null>(null);
  const foldersSeq = useRef(0);
  const episodesSeq = useRef(0);

  async function loadFolders(keep = false) {
    const mine = ++foldersSeq.current;
    if (!keep) setFolders({ status: "loading" });
    try {
      const data = await api.folders();
      if (mine === foldersSeq.current) setFolders({ status: "ready", data });
    } catch (e) {
      if (mine === foldersSeq.current)
        setFolders({ status: "error", message: messageOf(e, "Could not read the folders.") });
    }
  }
  async function loadEpisodes(id: string, keep = false) {
    const mine = ++episodesSeq.current;
    if (!keep) setEpisodes({ status: "loading" });
    try {
      const data = await api.episodes(id);
      if (mine === episodesSeq.current) setEpisodes({ status: "ready", data });
    } catch (e) {
      if (mine === episodesSeq.current)
        setEpisodes({ status: "error", message: messageOf(e, "Could not read the episodes.") });
    }
  }
  useEffect(() => {
    void loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);
  useEffect(() => {
    setOpenId(null);
    setPending(null);
    setError(null);
    if (folderId) void loadEpisodes(folderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the folder changes
  }, [folderId]);

  const list = useMemo(() => (folders.status === "ready" ? folders.data : []), [folders]);
  const flat = useMemo(() => flattenFolders(list), [list]);
  const folder = list.find((f) => f.id === folderId) ?? null;
  const rows = episodes.status === "ready" ? episodes.data : [];
  const open = rows.find((r) => r.id === openId) ?? null;

  // The total is real only when every folder's count could be read.
  const total =
    folders.status === "ready" && list.every((f) => f.episodeCount !== null)
      ? list.reduce((sum, f) => sum + (f.episodeCount ?? 0), 0)
      : null;

  /** Runs one change: busy while it is in flight, a notice on success, the server's own words on failure. */
  async function run(work: () => Promise<string>, then?: () => Promise<void> | void) {
    setBusy(true);
    setError(null);
    try {
      const done = await work();
      setNotice(done);
      setPending(null);
      await Promise.all([loadFolders(true), folderId ? loadEpisodes(folderId, true) : null]);
      await then?.();
    } catch (e) {
      setError(messageOf(e, "That did not work. Nothing was changed."));
    } finally {
      setBusy(false);
    }
  }

  const cancel = () => {
    setPending(null);
    setError(null);
  };
  const common = { busy, error, onCancel: cancel };

  useEffect(() => {
    if (!open || pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  return (
    <main className="mx-auto max-w-[84rem] p-4 sm:p-6">
      <p className="text-xs font-extrabold uppercase tracking-wider text-ds-ink-soft">
        Content ·{" "}
        <Figure
          value={total}
          reason={folders.status === "loading" ? "Loading" : "Could not read"}
        />{" "}
        episodes
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ds-ink">Podcast</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="!px-4 !py-2 text-sm"
            disabled={folders.status !== "ready"}
            onClick={() => setPending({ kind: "new_folder" })}
          >
            New folder
          </Button>
          <Button
            className="!px-4 !py-2 text-sm"
            disabled={!folder}
            onClick={() => setPending({ kind: "new_episode" })}
          >
            New episode
          </Button>
        </div>
      </div>

      {notice ? (
        <p role="status" className="mt-3 text-sm font-semibold text-ds-ink">
          {notice}
        </p>
      ) : null}

      {folders.status === "loading" ? (
        <p role="status" className="mt-6 text-sm font-semibold text-ds-ink-faint">
          Loading folders…
        </p>
      ) : null}
      {folders.status === "error" ? (
        <div className="mt-6 grid gap-2">
          <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
            {folders.message}
          </p>
          <div>
            <Button
              variant="secondary"
              className="!px-4 !py-2 text-sm"
              onClick={() => void loadFolders()}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {folders.status === "ready" ? (
        <div className="mt-5 grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)] md:items-start">
          <label className="block md:hidden">
            <span className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
              Folder
            </span>
            <select
              aria-label="Folder"
              value={folderId ?? ""}
              onChange={(e) => onSelectFolder(e.target.value || null)}
              className={`${FIELD_CLASS} mt-1`}
            >
              <option value="">Choose a folder</option>
              <FolderOptions folders={flat} />
            </select>
          </label>
          <nav aria-label="Folders" className="hidden gap-2 md:grid">
            {flat.length === 0 ? (
              <p className="rounded-2xl border border-ds-line bg-ds-card p-4 text-sm font-semibold text-ds-ink-soft">
                No folders yet. Create the first one.
              </p>
            ) : null}
            {flat.map(({ folder: f, depth }) => {
              const drafts =
                f.episodeCount !== null && f.publishedCount !== null
                  ? f.episodeCount - f.publishedCount
                  : null;
              return (
                <button
                  key={f.id}
                  type="button"
                  data-folder=""
                  aria-current={f.id === folderId ? "true" : undefined}
                  onClick={() => onSelectFolder(f.id)}
                  style={{ marginLeft: `${depth}rem` }}
                  className={`min-h-11 rounded-xl border bg-ds-card px-3 py-2 text-left ${
                    f.id === folderId ? "border-ds-choice" : "border-ds-line"
                  }`}
                >
                  <span className="block font-bold text-ds-ink">{f.title}</span>
                  <span className="block text-xs font-semibold text-ds-ink-faint">
                    <Figure value={f.episodeCount} reason="Could not read" /> episodes
                    {f.publishedCount !== null ? (
                      <>
                        {" "}
                        · <Figure value={f.publishedCount} reason="" /> live
                      </>
                    ) : null}
                    {drafts !== null && drafts > 0 ? (
                      <>
                        {" "}
                        · <Figure value={drafts} reason="" /> draft
                      </>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </nav>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-ds-line bg-ds-card">
            {!folderId ? (
              <p className="p-6 text-sm font-semibold text-ds-ink-soft">
                Choose a folder to see its episodes.
              </p>
            ) : !folder ? (
              <p role="alert" className="p-6 text-sm font-semibold text-ds-wrong-ink">
                That folder no longer exists.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-line p-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold text-ds-ink">{folder.title}</h2>
                    <p className="text-xs font-semibold text-ds-ink-faint">
                      <Figure value={folder.episodeCount} reason="Could not read" /> episodes
                      {folder.publishedCount !== null ? (
                        <>
                          {" "}
                          · <Figure value={folder.publishedCount} reason="" /> published
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="!px-3 !py-1.5 text-sm"
                      onClick={() => setPending({ kind: "rename_folder" })}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="secondary"
                      className="!px-3 !py-1.5 text-sm"
                      onClick={() => setPending({ kind: "move_folder" })}
                    >
                      Move
                    </Button>
                    <Button
                      variant="danger"
                      className="!px-3 !py-1.5 text-sm"
                      onClick={() => setPending({ kind: "delete_folder" })}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {episodes.status === "loading" ? (
                  <p role="status" className="p-6 text-sm font-semibold text-ds-ink-faint">
                    Loading episodes…
                  </p>
                ) : null}
                {episodes.status === "error" ? (
                  <div className="grid gap-2 p-6">
                    <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
                      {episodes.message}
                    </p>
                    <div>
                      <Button
                        variant="secondary"
                        className="!px-4 !py-2 text-sm"
                        onClick={() => void loadEpisodes(folderId)}
                      >
                        Try again
                      </Button>
                    </div>
                  </div>
                ) : null}
                {episodes.status === "ready" && rows.length === 0 ? (
                  <p className="p-6 text-sm font-semibold text-ds-ink-soft">
                    No episodes in this folder yet.
                  </p>
                ) : null}
                {episodes.status === "ready" && rows.length > 0 ? (
                  <ul aria-label="Episodes" className="divide-y divide-ds-line">
                    {rows.map((r) => (
                      <li key={r.id} data-episode-row="">
                        <button
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            setOpenId(r.id);
                          }}
                          aria-label={`Open the episode ${r.title}`}
                          className="grid min-h-11 w-full gap-1 p-4 text-left md:grid-cols-[minmax(0,1fr)_5rem_5rem_7rem] md:items-center md:gap-4"
                        >
                          <span className="min-w-0">
                            <span className="block font-bold text-ds-ink">{r.title}</span>
                            <span className="block text-xs font-semibold text-ds-ink-faint">
                              {r.published && r.publishedAt
                                ? `Published ${formatDay(r.publishedAt)}`
                                : r.published
                                  ? "Published"
                                  : "Not published"}
                            </span>
                          </span>
                          <span className="text-sm font-semibold text-ds-ink-soft md:text-right">
                            <Figure
                              value={formatDuration(r.durationSeconds)}
                              reason="No duration"
                            />
                          </span>
                          <span className="text-sm font-semibold text-ds-ink-faint md:text-right">
                            {languageText(r)}
                          </span>
                          <span className="md:text-right">
                            <span
                              className={`${STATUS_PILL} ${
                                r.published
                                  ? "bg-ds-right-tint text-ds-right-ink"
                                  : "bg-ds-sunk text-ds-ink-soft"
                              }`}
                            >
                              {r.published ? "Published" : "Not published"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}

      {open ? (
        <EpisodeDrawer
          key={open.id}
          episode={open}
          api={api}
          busy={busy}
          pending={pending !== null}
          onClose={() => setOpenId(null)}
          onPublish={(published) => setPending({ kind: "publish", published })}
          onDetails={(title, description) => setPending({ kind: "details", title, description })}
          onTranscript={(text) => setPending({ kind: "transcript", text })}
          onAudioFile={(file) => setPending({ kind: "replace_audio", file })}
        />
      ) : null}

      {pending?.kind === "new_folder" ? (
        <NewFolderDialog
          folders={flat}
          defaultParent={folderId}
          {...common}
          onSubmit={(input, reason) =>
            void run(
              async () => {
                const created = await api.createFolder(input, reason);
                createdId.current = created.id;
                return `Folder “${input.title}” created.`;
              },
              () => {
                if (createdId.current) onSelectFolder(createdId.current);
              },
            )
          }
        />
      ) : null}
      {pending?.kind === "rename_folder" && folder ? (
        <RenameFolderDialog
          folder={folder}
          {...common}
          onSubmit={(title, description, reason) =>
            void run(async () => {
              await api.renameFolder(folder.id, title, description, reason);
              return "Folder renamed.";
            })
          }
        />
      ) : null}
      {pending?.kind === "move_folder" && folder ? (
        <MoveFolderDialog
          folder={folder}
          folders={flat}
          blocked={withDescendants(list, folder.id)}
          {...common}
          onSubmit={(parentId, reason) =>
            void run(async () => {
              await api.moveFolder(folder.id, parentId, reason);
              return "Folder moved.";
            })
          }
        />
      ) : null}
      {pending?.kind === "delete_folder" && folder ? (
        <DeleteFolderDialog
          folder={folder}
          {...common}
          onSubmit={(reason) =>
            void run(
              async () => {
                await api.deleteFolder(folder.id, reason);
                return "Folder deleted.";
              },
              () => onSelectFolder(null),
            )
          }
        />
      ) : null}
      {pending?.kind === "new_episode" && folder ? (
        <NewEpisodeDialog
          folder={folder}
          {...common}
          onSubmit={(input, file, reason) =>
            void run(async () => {
              const { durationSeconds } = await api.createEpisode(input, file, reason);
              const length = formatDuration(durationSeconds);
              return `Episode created${length ? ` (${length})` : ""}. Not published yet.`;
            })
          }
        />
      ) : null}
      {pending?.kind === "replace_audio" && open ? (
        <ReplaceAudioDialog
          episodeTitle={open.title}
          file={pending.file}
          {...common}
          onSubmit={(reason) =>
            void run(async () => {
              const { durationSeconds } = await api.replaceAudio(open.id, pending.file, reason);
              const length = formatDuration(durationSeconds);
              return `Audio replaced${length ? ` (${length})` : ""}.`;
            })
          }
        />
      ) : null}
      {pending?.kind === "publish" && open ? (
        <ReasonDialog
          title={pending.published ? "Reason for publishing" : "Reason for unlisting"}
          description={
            pending.published
              ? `“${open.title}” becomes visible in the app.`
              : `“${open.title}” is hidden from the app. Its audio file stays reachable by anyone who has the link.`
          }
          confirmLabel={pending.published ? "Publish" : "Unlist"}
          busy={busy}
          error={error}
          onCancel={cancel}
          onSubmit={(reason) =>
            void run(async () => {
              await api.setPublished(open.id, pending.published, reason);
              return pending.published ? "Published." : "Unlisted.";
            })
          }
        />
      ) : null}
      {pending?.kind === "details" && open ? (
        <ReasonDialog
          title="Reason for the change"
          description="Saves the new title and description."
          confirmLabel="Save details"
          busy={busy}
          error={error}
          onCancel={cancel}
          onSubmit={(reason) =>
            void run(async () => {
              await api.updateEpisode(open.id, pending.title, pending.description, reason);
              return "Details saved.";
            })
          }
        />
      ) : null}
      {pending?.kind === "transcript" && open ? (
        <ReasonDialog
          title="Reason for the change"
          description={
            pending.text.trim() === ""
              ? "The transcript will be removed."
              : "Saves the transcript. Markup is rejected, not stripped."
          }
          confirmLabel={pending.text.trim() === "" ? "Remove transcript" : "Save transcript"}
          busy={busy}
          error={error}
          onCancel={cancel}
          onSubmit={(reason) =>
            void run(async () => {
              await api.saveTranscript(open.id, pending.text, reason);
              return pending.text.trim() === "" ? "Transcript removed." : "Transcript saved.";
            })
          }
        />
      ) : null}
    </main>
  );
}

function EpisodeDrawer({
  episode,
  api,
  busy,
  pending,
  onClose,
  onPublish,
  onDetails,
  onTranscript,
  onAudioFile,
}: {
  episode: AdminEpisode;
  api: PodcastApi;
  busy: boolean;
  /** A reason dialog is open over the drawer. */
  pending: boolean;
  onClose: () => void;
  onPublish: (published: boolean) => void;
  onDetails: (title: string, description: string | null) => void;
  onTranscript: (text: string) => void;
  onAudioFile: (file: File) => void;
}) {
  const [title, setTitle] = useState(episode.title);
  const [description, setDescription] = useState(episode.description ?? "");
  const [transcript, setTranscript] = useState<Load<string>>({ status: "loading" });
  const [text, setText] = useState("");

  useEffect(() => {
    let live = true;
    api
      .transcript(episode.id)
      .then(({ text: existing }) => {
        if (!live) return;
        setText(existing ?? "");
        setTranscript({ status: "ready", data: existing ?? "" });
      })
      .catch((e: unknown) => {
        if (live)
          setTranscript({
            status: "error",
            message: messageOf(e, "Could not load the transcript."),
          });
      });
    return () => {
      live = false;
    };
  }, [api, episode.id]);

  const publishable = isPublishableProvider(episode.voiceProvider);
  const detailsChanged =
    title.trim() !== episode.title || (description.trim() || null) !== episode.description;
  const transcriptChanged = transcript.status === "ready" && text !== transcript.data;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Episode"
      aria-hidden={pending ? true : undefined}
      inert={pending}
      className="fixed inset-0 z-40 flex justify-end bg-ds-ink/40"
    >
      <section className="flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-ds-line bg-ds-card p-5 sm:max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
              {episode.published && episode.publishedAt
                ? `Published ${formatDay(episode.publishedAt)}`
                : episode.published
                  ? "Published"
                  : "Not published"}
            </p>
            <h2 className="ds-type-title break-words text-ds-ink">{episode.title}</h2>
          </div>
          <Button
            variant="secondary"
            className="!px-3 !py-1.5 text-sm"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </Button>
        </div>

        {episode.audioUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- the episode has no caption track; its transcript is shown below
          <audio
            controls
            preload="none"
            src={episode.audioUrl}
            aria-label={`Audio of ${episode.title}`}
            className="w-full"
          />
        ) : (
          <p className="text-sm font-semibold text-ds-ink-faint">The audio link is unavailable.</p>
        )}

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="font-semibold text-ds-ink-faint">Status</dt>
          <dd className="font-semibold text-ds-ink">
            {episode.published ? "Published" : "Not published"}
          </dd>
          <dt className="font-semibold text-ds-ink-faint">Duration</dt>
          <dd className="font-semibold text-ds-ink">
            <Figure value={formatDuration(episode.durationSeconds)} reason="No duration" />
          </dd>
          <dt className="font-semibold text-ds-ink-faint">Language</dt>
          <dd className="font-semibold text-ds-ink">{languageText(episode)}</dd>
          <dt className="font-semibold text-ds-ink-faint">Voice</dt>
          <dd className="font-semibold text-ds-ink">{voiceText(episode)}</dd>
          <dt className="font-semibold text-ds-ink-faint">Slug</dt>
          <dd className="break-all font-semibold text-ds-ink">/{episode.slug}</dd>
        </dl>
        {!episode.published ? (
          <p className="text-xs font-semibold text-ds-ink-soft">
            Not listed in the app. The audio file is still reachable by anyone who has its link.
          </p>
        ) : null}

        <div className="grid gap-2 border-t border-ds-line pt-4">
          <label className="block text-sm">
            <span className="font-semibold text-ds-ink">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className={`${FIELD_CLASS} mt-1`}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-ds-ink">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              rows={3}
              className={`${FIELD_CLASS} mt-1`}
            />
          </label>
          <div>
            <Button
              variant="secondary"
              className="!px-3 !py-1.5 text-sm"
              disabled={busy || !detailsChanged || title.trim().length === 0}
              onClick={() => onDetails(title.trim(), description.trim() || null)}
            >
              Save details
            </Button>
          </div>
        </div>

        <div className="grid gap-2 border-t border-ds-line pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">Transcript</p>
          {transcript.status === "loading" ? (
            <p role="status" className="text-sm font-semibold text-ds-ink-faint">
              Loading the transcript…
            </p>
          ) : null}
          {transcript.status === "error" ? (
            <p role="alert" className="text-sm font-semibold text-ds-wrong-ink">
              {transcript.message}
            </p>
          ) : null}
          {transcript.status === "ready" ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                aria-label="Transcript"
                placeholder="No transcript yet."
                className="min-h-11 w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 font-mono text-sm text-ds-ink"
              />
              <p className="text-xs text-ds-ink-soft">
                The spoken words only, not the TTS script. Markup is rejected, not stripped.
                Clearing this box removes the transcript.
              </p>
              <div>
                <Button
                  variant="secondary"
                  className="!px-3 !py-1.5 text-sm"
                  disabled={busy || !transcriptChanged}
                  onClick={() => onTranscript(text)}
                >
                  Save transcript
                </Button>
              </div>
            </>
          ) : null}
        </div>

        <div className="grid gap-2 border-t border-ds-line pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ds-ink-soft">
            Replace audio
          </p>
          <input
            type="file"
            accept="audio/mpeg,audio/mp4"
            aria-label="Choose a replacement audio file"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so choosing the same file again after a failure still fires onChange.
              e.target.value = "";
              if (file) onAudioFile(file);
            }}
            className="min-h-11 w-full text-sm text-ds-ink"
          />
        </div>

        <div className="grid gap-2 border-t border-ds-line pt-4">
          {!episode.published && !publishable ? (
            <p role="note" className="text-sm font-semibold text-ds-wrong-ink">
              {UNPUBLISHABLE_PROVIDER_MESSAGE}
            </p>
          ) : null}
          <div>
            <Button
              variant={episode.published ? "secondary" : "primary"}
              className="!px-4 !py-2 text-sm"
              disabled={busy || (!episode.published && !publishable)}
              onClick={() => onPublish(!episode.published)}
            >
              {episode.published ? "Unlist" : "Publish"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
