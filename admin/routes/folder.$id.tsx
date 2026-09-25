import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  adminListEpisodes,
  adminUpdateEpisode,
  adminSetPublished,
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
          No episodes in this folder yet. Publish one with{" "}
          <code>scripts/podcast-tool.ts</code>.
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
          </li>
        ))}
      </ul>
    </main>
  );
}
