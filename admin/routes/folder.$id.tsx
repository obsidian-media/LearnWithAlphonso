import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  adminListFolders,
  adminWhoAmI,
  adminListEpisodes,
  adminUpdateEpisode,
  adminSetPublished,
  adminCreateAudioUploadUrl,
  adminVerifyUploadedAudio,
  adminCreateEpisodeUploadUrl,
  adminCreateEpisode,
  adminGetTranscript,
  adminSaveTranscript,
  type AdminEpisode,
} from "@/lib/admin.functions";
// Type-only: LEVELS' own module only imports a type from curriculum.ts,
// so this pulls in zero curriculum content, unlike @/data/courses (see
// admin.functions.ts's COURSE_IDS comment) -- the 3 course options
// below are inlined instead, for the same reason.
import { LEVELS } from "@/data/levels";
import { forbiddenOrSignIn } from "@/lib/staff-forbidden";
import { ConsoleCard } from "@/components/staff/ConsoleCard";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { EmptyCard, ErrorLine, FIELD, SmallButton } from "@/components/staff/console-ui";

/**
 * One folder's episodes.
 *
 * The plan called this route `/episode/$id` while passing a FOLDER id.
 * Renamed: a route parameter that means something other than its name is
 * a trap for whoever reads it next, and episodes are maintained as a
 * folder's list rather than one at a time -- an episode is never edited
 * without looking at its neighbours.
 */
export const Route = createFileRoute("/folder/$id")({
  loader: async ({ params }) => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("podcasts.manage")) return { forbidden: true as const };
      const [episodes, folders] = await Promise.all([
        adminListEpisodes({ data: { folderId: params.id } }),
        adminListFolders(),
      ]);
      // The page title names the folder; one extra read finds it.
      const folderTitle = folders.find((f) => f.id === params.id)?.title ?? null;
      return { forbidden: false as const, episodes, folderTitle };
    } catch (e) {
      // A signed-in person without the scope is told why; a signed-out person goes to sign in.
      return forbiddenOrSignIn(e, "podcasts.manage");
    }
  },
  component: FolderEpisodes,
});

function FolderEpisodes() {
  const data = Route.useLoaderData();
  const { id: folderId } = Route.useParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (data.forbidden) return <ForbiddenCard title="Episodes" scope="podcasts.manage" />;
  const { episodes, folderTitle } = data;

  async function togglePublished(id: string, published: boolean) {
    setError(null);
    try {
      await adminSetPublished({ data: { id, published } });
      router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    }
  }

  async function rename(episode: AdminEpisode, title: string) {
    if (title === episode.title) return;
    setError(null);
    try {
      await adminUpdateEpisode({ data: { id: episode.id, title, description: null } });
      router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link to="/folders" className="text-sm font-bold text-ds-choice underline">
        ← Folders
      </Link>
      <h1 className="font-display mt-2 text-2xl font-semibold text-ds-ink">
        {folderTitle ? `Episodes in \u201c${folderTitle}\u201d` : "Episodes"}
      </h1>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {episodes.length === 0 ? <EmptyCard title="No episodes in this folder yet." /> : null}
      <ul className="mt-4 grid max-w-3xl gap-3">
        {episodes.map((episode) => (
          <li key={episode.id}>
            <ConsoleCard>
              <input
                defaultValue={episode.title}
                aria-label="Episode title"
                onBlur={(e) => rename(episode, e.target.value)}
                className={`${FIELD} font-bold`}
              />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <code className="text-xs font-medium text-ds-ink-soft">/{episode.slug}</code>
                <SmallButton onClick={() => togglePublished(episode.id, !episode.published)}>
                  {episode.published ? "Unlist" : "Publish"}
                </SmallButton>
                {/* "Not listed", never "private": the bucket is public-read,
                    so an unpublished episode audio is still fetchable by
                    anyone with the URL. Calling it private here would be a
                    claim the storage layer cannot back up. */}
                <span
                  className={`rounded-lg px-2 py-0.5 text-xs font-extrabold ${
                    episode.published
                      ? "bg-ds-right-tint text-ds-right-ink"
                      : "border border-ds-line bg-ds-sunk text-ds-ink-soft"
                  }`}
                >
                  {episode.published ? "Listed" : "Not listed \u2014 audio still public by URL"}
                </span>
              </div>
              <ReplaceAudio episode={episode} onDone={() => router.invalidate()} />
              <TranscriptEditor episodeId={episode.id} />
            </ConsoleCard>
          </li>
        ))}
      </ul>
      <NewEpisodeForm folderId={folderId} onDone={() => router.invalidate()} />
    </main>
  );
}

/**
 * Replaces an episode's audio.
 *
 * The bytes go straight to Supabase Storage through a signed URL, never
 * through a server function: a serverless body is capped near 4.5 MB and
 * base64 would inflate an ordinary 3 MB episode past it. The server then
 * reads the object back and proves it is audio, deleting it if not.
 */
function ReplaceAudio({ episode, onDone }: { episode: AdminEpisode; onDone: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setStatus("Uploading…");
    try {
      // The server resolves the storage path from the episode id. It is
      // deliberately not sent from here: an id and a path arriving as
      // two unrelated fields let a stale tab write one episode's
      // duration onto another's row.
      const { signedUrl } = await adminCreateAudioUploadUrl({
        data: { episodeId: episode.id, declaredBytes: file.size },
      });
      // Goes to a STAGING key, so the live object is untouched until the
      // bytes have been proven to be audio.
      const put = await fetch(signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("The upload did not complete.");
      setStatus("Checking…");
      const { durationSeconds } = await adminVerifyUploadedAudio({
        data: { episodeId: episode.id },
      });
      setStatus(
        `Replaced — ${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}`,
      );
      onDone();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="text-sm text-ds-ink-soft">
        Replace audio:{" "}
        <input
          type="file"
          accept="audio/mpeg,audio/mp4"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // The input is reset so choosing the same file twice after a
            // failure still fires onChange -- otherwise a retry of the
            // identical file silently does nothing.
            event.target.value = "";
            if (file) void upload(file);
          }}
          className="text-sm"
        />
      </label>
      {status ? <p className="mt-1 text-sm text-ds-ink-soft">{status}</p> : null}
    </div>
  );
}

/**
 * Creates a brand-new episode: metadata + its first audio file, in one
 * form. Previously the only way to do this was `scripts/podcast-tool.ts
 * add` from a terminal -- this reuses the exact same validation
 * (validateEpisodeDraft) and storage path logic (storagePathFor) the
 * CLI does, via adminCreateEpisodeUploadUrl/adminCreateEpisode, so the
 * two ways of creating an episode cannot disagree about what's valid or
 * where the audio ends up.
 *
 * Same two-step upload as ReplaceAudio above (signed URL, direct PUT,
 * then a server call that verifies and finalizes) and for the same
 * reason: a serverless function body is capped near 4.5 MB, well under
 * an ordinary episode's size.
 */
function NewEpisodeForm({ folderId, onDone }: { folderId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [course, setCourse] = useState("");
  const [levelId, setLevelId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setTitle("");
    setSlug("");
    setDescription("");
    setCourse("");
    setLevelId("");
    setFile(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose an MP3 file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Uploading…");
    const shared = {
      folderId,
      slug,
      title,
      description: description.trim() || null,
      course: course || null,
      levelId: levelId || null,
    };
    try {
      const { signedUrl } = await adminCreateEpisodeUploadUrl({
        data: { ...shared, declaredBytes: file.size },
      });
      const put = await fetch(signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("The upload did not complete.");
      setStatus("Checking…");
      const { durationSeconds } = await adminCreateEpisode({ data: shared });
      setStatus(
        `Created — ${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}. Not published yet.`,
      );
      reset();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the episode.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConsoleCard title="New episode" className="mt-4 max-w-3xl">
      <form onSubmit={submit} className="space-y-3">
        {error ? <ErrorLine>{error}</ErrorLine> : null}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
          disabled={busy}
          className={FIELD}
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug-in-kebab-case"
          required
          disabled={busy}
          className={FIELD}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          disabled={busy}
          rows={2}
          className={FIELD}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            disabled={busy}
            className={FIELD}
          >
            <option value="">Course (optional)</option>
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
          </select>
          <select
            value={levelId}
            onChange={(e) => setLevelId(e.target.value)}
            disabled={busy}
            className={FIELD}
          >
            <option value="">Level (optional)</option>
            {LEVELS.map((level) => (
              <option key={level.id} value={level.id}>
                {level.id} — {level.name}
              </option>
            ))}
          </select>
        </div>
        <label className="block text-sm text-ds-ink-soft">
          Audio file:{" "}
          <input
            type="file"
            accept="audio/mpeg,audio/mp4"
            required
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </label>
        <SmallButton type="submit" variant="primary" disabled={busy} className="!min-h-10 !px-5">
          {busy ? "Creating…" : "Create episode"}
        </SmallButton>
        {status ? <p className="text-sm text-ds-ink-soft">{status}</p> : null}
      </form>
    </ConsoleCard>
  );
}

/**
 * Transcript editing.
 *
 * Loaded on demand rather than with the folder: a transcript is
 * kilobytes nobody needs until they open one episode, which is the same
 * reason it is a separate table rather than a column.
 */
function TranscriptEditor({ episodeId }: { episodeId: string }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    setStatus(null);
    try {
      const { text: existing } = await adminGetTranscript({ data: { episodeId } });
      setText(existing ?? "");
      setLoaded(true);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not load the transcript.");
    }
  }

  async function save() {
    setStatus(null);
    try {
      await adminSaveTranscript({ data: { episodeId, text } });
      setStatus(text.trim() === "" ? "Transcript removed." : "Saved.");
    } catch (e) {
      // The server's markup refusal is a paragraph written for a person
      // -- it names the tag it found and says why it is rejected rather
      // than stripped. Shown verbatim.
      setStatus(e instanceof Error ? e.message : "Save failed.");
    }
  }

  if (!loaded) {
    return (
      <div>
        <button onClick={load} className="text-sm font-bold text-ds-choice underline">
          Edit transcript
        </button>
        {status ? <p className="mt-1 text-sm text-ds-wrong-ink">{status}</p> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        aria-label="Transcript"
        className="w-full rounded-xl border border-ds-line bg-ds-sunk px-3 py-2 font-mono text-sm"
      />
      {/* Said in the UI as well as enforced on the server, because the
          server's refusal arrives after the paste and the warning should
          arrive before it. */}
      <p className="text-xs text-ds-ink-soft">
        The spoken words only — not the TTS script. Markup is rejected, not stripped. Clearing this
        box removes the transcript.
      </p>
      <div>
        <SmallButton variant="primary" onClick={save}>
          Save transcript
        </SmallButton>
      </div>
      {status ? <p className="text-sm text-ds-ink-soft">{status}</p> : null}
    </div>
  );
}
