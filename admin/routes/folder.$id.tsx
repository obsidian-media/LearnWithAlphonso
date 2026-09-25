import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  adminListEpisodes,
  adminUpdateEpisode,
  adminSetPublished,
  adminCreateAudioUploadUrl,
  adminVerifyUploadedAudio,
  adminGetTranscript,
  adminSaveTranscript,
  type AdminEpisode,
} from "@/lib/admin.functions";

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
      return { episodes: await adminListEpisodes({ data: { folderId: params.id } }) };
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: FolderEpisodes,
});

function FolderEpisodes() {
  const { episodes } = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

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
    <main className="mx-auto max-w-3xl p-6">
      <Link to="/folders" className="text-sm text-moss underline">
        ← Folders
      </Link>
      <h1 className="font-display mt-2 text-2xl font-semibold">Episodes</h1>
      {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      {episodes.length === 0 ? (
        <p className="mt-6 text-ink-soft">
          No episodes in this folder yet. Publish one with <code>scripts/podcast-tool.ts</code>.
        </p>
      ) : null}
      <ul className="mt-6 space-y-4">
        {episodes.map((episode) => (
          <li key={episode.id} className="border-b border-hairline pb-4">
            <input
              defaultValue={episode.title}
              onBlur={(e) => rename(episode, e.target.value)}
              className="w-full rounded border border-hairline px-3 py-2"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <code className="text-ink-soft">/{episode.slug}</code>
              <button
                onClick={() => togglePublished(episode.id, !episode.published)}
                className="text-moss"
              >
                {episode.published ? "Unlist" : "Publish"}
              </button>
              {/* "Not listed", never "private": the bucket is public-read,
                  so an unpublished episode's audio is still fetchable by
                  anyone with the URL. Calling it private here would be a
                  claim the storage layer cannot back up. */}
              <span className="text-ink-soft">
                {episode.published ? "Listed" : "Not listed — audio still public by URL"}
              </span>
            </div>
            <ReplaceAudio episode={episode} onDone={() => router.invalidate()} />
            <TranscriptEditor episodeId={episode.id} />
          </li>
        ))}
      </ul>
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
    <div className="mt-2">
      <label className="text-sm text-ink-soft">
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
      {status ? <p className="mt-1 text-sm text-ink-soft">{status}</p> : null}
    </div>
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
      <div className="mt-2">
        <button onClick={load} className="text-sm text-moss">
          Edit transcript
        </button>
        {status ? <p className="mt-1 text-sm text-ember">{status}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="w-full rounded border border-hairline px-3 py-2 font-mono text-sm"
      />
      {/* Said in the UI as well as enforced on the server, because the
          server's refusal arrives after the paste and the warning should
          arrive before it. */}
      <p className="mt-1 text-xs text-ink-soft">
        The spoken words only — not the TTS script. Markup is rejected, not stripped. Clearing this
        box removes the transcript.
      </p>
      <button onClick={save} className="mt-2 rounded bg-moss px-3 py-2 text-sm text-surface">
        Save transcript
      </button>
      {status ? <p className="mt-1 text-sm text-ink-soft">{status}</p> : null}
    </div>
  );
}
