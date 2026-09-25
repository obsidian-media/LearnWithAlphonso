import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import { formatDuration, usePodcastPlayer } from "../../lib/podcast-player";
import {
  listEpisodes,
  listFolders,
  searchEpisodes,
  type PodcastEpisode,
} from "../../lib/podcast.functions";
import { normalizeQuery } from "../../lib/podcast-search";
import { resolveFolderPath, type PodcastFolder } from "../../lib/podcast-tree";

export const Route = createFileRoute("/_authenticated/listen")({
  component: ListenPage,
  head: () => ({
    meta: [
      { title: "Listen — Alphonso" },
      {
        name: "description",
        content: "Short audio episodes to practise listening, organised by course and level.",
      },
      { property: "og:title", content: "Listen — Alphonso" },
      { property: "og:description", content: "Short audio episodes for listening practice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/**
 * Search results, flat across every folder.
 *
 * Presentational and pure, like ListenFolderView, so the states can be
 * tested without a server.
 *
 * The three empty-ish states are deliberately distinct. "No episodes match"
 * for a one-character query would be a lie -- `buildIlikeOrFilter` returns
 * null below the minimum length, so the search never ran, and a learner told
 * "no matches" would stop typing.
 */
export function PodcastSearchResults({
  query,
  results,
  isLoading,
}: {
  query: string;
  results: PodcastEpisode[];
  isLoading: boolean;
}) {
  const play = usePodcastPlayer((state) => state.play);
  const tooShort = normalizeQuery(query) === null;

  if (tooShort) {
    return <p className="px-5 py-6 text-sm text-ink-soft/70">Keep typing to search episodes.</p>;
  }
  if (isLoading) {
    return <p className="px-5 py-6 text-sm text-ink-soft/70">Searching…</p>;
  }
  if (results.length === 0) {
    return <p className="px-5 py-6 text-sm text-ink-soft/70">No episodes match “{query}”.</p>;
  }

  return (
    <ul className="space-y-2 px-5 py-4">
      {results.map((episode) => (
        <li key={episode.id}>
          <button
            type="button"
            onClick={() => play(episode)}
            className="flex w-full items-center justify-between rounded-2xl border border-hairline bg-surface px-4 py-3 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {episode.title}
            </span>
            <span className="tnum ml-3 text-xs text-ink-soft/70">
              {formatDuration(episode.durationSeconds)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Renders one level of the folder tree: its child folders, then its
 * episodes. Presentational and pure so it can be tested without a
 * router or a server -- the route components below do the fetching.
 *
 * `segments` is the slug path of the folder being viewed; an empty array
 * is the root.
 */
export function ListenFolderView({
  folders,
  episodes,
  segments,
}: {
  folders: PodcastFolder[];
  episodes: PodcastEpisode[];
  segments: string[];
}) {
  const play = usePodcastPlayer((state) => state.play);

  const current = segments.length === 0 ? null : resolveFolderPath(folders, segments);
  if (segments.length > 0 && !current) {
    return (
      <div className="px-5 py-8">
        <h1 className="font-display text-xl font-semibold text-ink">Listen</h1>
        <p className="mt-3 text-sm text-ink-soft/80">
          We couldn&apos;t find that folder. It may have been renamed or removed.
        </p>
        <Link to="/listen" className="mt-4 inline-block text-sm font-medium text-moss">
          Back to all folders
        </Link>
      </div>
    );
  }

  const parentId = current?.id ?? null;
  const children = folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));

  const isEmpty = children.length === 0 && episodes.length === 0;

  return (
    <div className="px-5 py-6">
      <h1 className="font-display text-xl font-semibold text-ink">{current?.title ?? "Listen"}</h1>
      {current?.description ? (
        <p className="mt-1 text-sm text-ink-soft/80">{current.description}</p>
      ) : null}

      {isEmpty ? (
        <p className="mt-6 text-sm text-ink-soft/70">
          Nothing here yet. New episodes appear as they are published.
        </p>
      ) : null}

      {children.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {children.map((folder) => (
            <li key={folder.id}>
              <Link
                to="/listen/$"
                params={{ _splat: [...segments, folder.slug].join("/") }}
                className="flex items-center justify-between rounded-2xl border border-hairline bg-surface px-4 py-3"
              >
                <span className="text-sm font-semibold text-ink">{folder.title}</span>
                <span aria-hidden="true" className="text-ink-soft/50">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {episodes.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {episodes.map((episode) => (
            <li key={episode.id}>
              <button
                type="button"
                onClick={() => play(episode)}
                className="flex w-full items-center justify-between rounded-2xl border border-hairline bg-surface px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {episode.title}
                  </span>
                  {episode.positionSeconds > 0 ? (
                    <span className="text-xs text-moss">Resume</span>
                  ) : null}
                </span>
                <span className="tnum ml-3 text-xs text-ink-soft/70">
                  {formatDuration(episode.durationSeconds)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Shared by `/listen` and the `/listen/$` splat route: fetches the flat
 * folder list, resolves the path, then fetches that folder's episodes.
 */
export function ListenBrowser({ segments }: { segments: string[] }) {
  const { data: folders, isLoading } = useQuery({
    queryKey: ["podcast-folders"],
    queryFn: () => listFolders(),
  });

  const current = folders ? resolveFolderPath(folders, segments) : null;

  const { data: episodes } = useQuery({
    queryKey: ["podcast-episodes", current?.id],
    queryFn: () => listEpisodes({ data: { folderId: current!.id } }),
    enabled: Boolean(current?.id),
  });

  const [query, setQuery] = useState("");
  const searching = normalizeQuery(query) !== null;

  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ["podcast-search", normalizeQuery(query)],
    queryFn: () => searchEpisodes({ data: { query } }),
    // Keyed on the NORMALIZED query, so "coffee" and "  coffee  " share a
    // cache entry instead of issuing two identical requests.
    enabled: searching,
  });

  if (isLoading || !folders) {
    return (
      <div className="px-5 py-8">
        <p className="text-sm text-ink-soft/70">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="px-5 pt-4">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search episodes"
          aria-label="Search episodes"
          className="w-full rounded-2xl border border-hairline bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/50"
        />
      </div>
      {/* Search replaces the tree rather than filtering it: results are flat
          across every folder, because the reason to search is not knowing
          where a thing lives. Clearing the field restores the tree exactly
          as it was, since the folder state was never touched. */}
      {searching ? (
        <PodcastSearchResults query={query} results={searchResults ?? []} isLoading={isSearching} />
      ) : (
        <ListenFolderView folders={folders} episodes={episodes ?? []} segments={segments} />
      )}
    </div>
  );
}

function ListenPage() {
  return (
    <MobileFrame>
      <ListenBrowser segments={[]} />
    </MobileFrame>
  );
}
