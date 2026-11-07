import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import { SceneBackdrop } from "../../components/SceneBackdrop";
import { AI_NARRATED_LABEL } from "../../lib/podcast-label";
import { formatDuration, usePodcastPlayer } from "../../lib/podcast-player";
import {
  listLibrary,
  searchEpisodes,
  type PodcastEpisode,
} from "../../lib/podcast.functions";
import { normalizeQuery } from "../../lib/podcast-search";
import { resolveFolderPath, type PodcastFolder } from "../../lib/podcast-tree";
import { buildShelves } from "../../lib/listen-library";
import { ListenLibraryView, ListenShelfView } from "../../components/ListenLibrary";
import { Icon3D } from "../../components/Icon3D";
import { PodcastQuizLauncher } from "../../components/PodcastQuizLauncher";
import { fetchQuizEpisodeIds } from "../../lib/podcast-quiz.functions";
import { MascotImage } from "../../components/MascotImage";
import { tileTone, type TileTone, TILE_TONE_CLASSES } from "../../lib/tile-tones";

export const Route = createFileRoute("/_authenticated/listen")({
  component: ListenPage,
  head: () => ({
    meta: [
      { title: "Listen — Alphonso" },
      {
        name: "description",
        content: "Short audio episodes to practice listening, organised by course and level.",
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

  const note = (text: string) => (
    <>
      <SceneBackdrop scene="listen" />
      <p
        data-surface
        className="relative z-10 mx-5 my-6 rounded-2xl bg-ds-card/90 px-4 py-3 text-sm text-ds-ink-soft backdrop-blur-md"
      >
        {text}
      </p>
    </>
  );
  if (tooShort) return note("Keep typing to search episodes.");
  if (isLoading) return note("Searching…");
  if (results.length === 0) return note(`No episodes match “${query}”.`);

  return (
    <>
      <SceneBackdrop scene="listen" />
      <ul className="relative z-10 space-y-2 px-5 py-4">
        {results.map((episode) => (
          <li key={episode.id}>
            <button
              type="button"
              onClick={() => play(episode)}
              className="flex w-full items-center justify-between rounded-2xl border border-ds-line bg-ds-card px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ds-ink">
                  {episode.title}
                </span>
                {episode.aiNarrated ? (
                  <span className="text-xs text-ds-ink-soft/70">{AI_NARRATED_LABEL}</span>
                ) : null}
              </span>
              <span className="tnum ml-3 text-xs text-ds-ink-soft/70">
                {formatDuration(episode.durationSeconds)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
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
  quizEpisodeIds,
}: {
  folders: PodcastFolder[];
  episodes: PodcastEpisode[];
  segments: string[];
  /** Episodes that have a quiz; each gets a "Take the quiz" button under its row. */
  quizEpisodeIds?: ReadonlySet<string>;
}) {
  const play = usePodcastPlayer((state) => state.play);

  const current = segments.length === 0 ? null : resolveFolderPath(folders, segments);
  if (segments.length > 0 && !current) {
    return (
      <div className="px-5 py-8">
        <SceneBackdrop scene="listen" />
        <div data-surface className="relative z-10 rounded-3xl bg-ds-card/90 p-5 backdrop-blur-md">
          <h1 className="font-display text-3xl font-bold text-ds-ink">Listen</h1>
          <p className="mt-3 text-sm text-ds-ink-soft/80">
            We couldn&apos;t find that folder. It may have been renamed or removed.
          </p>
          <Link to="/listen" className="mt-4 inline-block text-sm font-medium text-ds-brand">
            Back to all folders
          </Link>
        </div>
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
      <SceneBackdrop scene="listen" />
      <div className="relative z-10">
        <h1 className="font-display text-3xl font-bold text-ds-ink">
          {current?.title ?? "Listen"}
        </h1>
        {current?.description ? (
          <p className="mt-1 text-sm text-ds-ink-soft">{current.description}</p>
        ) : null}

        {isEmpty ? (
          <div
            data-surface
            className="mt-6 flex flex-col items-center gap-3 rounded-3xl bg-ds-card/90 p-5 text-center backdrop-blur-md"
          >
            <MascotImage
              moment="emptyState"
              size={120}
              tone="mint"
              alt="Alphonso"
              className="card-lift"
            />
            <p className="text-sm text-ds-ink-soft/70">
              Nothing here yet. New episodes appear as they are published.
            </p>
          </div>
        ) : null}

        {children.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {children.map((folder) => (
              <li key={folder.id}>
                <Link
                  to="/listen/$"
                  params={{ _splat: [...segments, folder.slug].join("/") }}
                  className="card-lift flex items-center justify-between gap-3 rounded-3xl bg-ds-card/95 px-4 py-4 backdrop-blur-md"
                >
                  <span className="flex items-center gap-4">
                    <span
                      className={`grid size-14 place-items-center rounded-2xl ${TILE_TONE_CLASSES[tileTone(children.indexOf(folder))]}`}
                    >
                      <Icon3D emoji="📁" size={36} />
                    </span>
                    <span className="font-display text-lg font-bold text-ds-ink">
                      {folder.title}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-ds-ink-soft/50">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {episodes.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {episodes.map((episode, i) => (
              <li key={episode.id}>
                <button
                  type="button"
                  onClick={() => play(episode)}
                  className="card-lift flex w-full items-center justify-between gap-3 rounded-3xl bg-ds-card px-3 py-3 text-left"
                >
                  <span
                    data-tone={tileTone(i)}
                    className={`grid size-12 shrink-0 place-items-center rounded-2xl ${TILE_TONE_CLASSES[tileTone(i)]}`}
                  >
                    <Icon3D emoji="🎧" size={30} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base font-bold text-ds-ink">
                      {episode.title}
                    </span>
                    <span className="flex gap-2 text-xs">
                      {episode.positionSeconds > 0 ? (
                        <span className="text-ds-brand">Resume</span>
                      ) : null}
                      {episode.aiNarrated ? (
                        <span className="text-ds-ink-soft/70">{AI_NARRATED_LABEL}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="tnum ml-3 text-xs text-ds-ink-soft/70">
                    {formatDuration(episode.durationSeconds)}
                  </span>
                </button>
                {quizEpisodeIds?.has(episode.id) ? (
                  <div className="px-3 pb-1 pt-2">
                    <PodcastQuizLauncher episode={episode} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Shared by `/listen` and the `/listen/$` splat route: fetches the flat
 * folder list, resolves the path, then fetches that folder's episodes.
 */
export function ListenBrowser({ segments }: { segments: string[] }) {
  // One read for the whole shelf: folders, every episode, this user's progress and the month total.
  const { data: library, isLoading } = useQuery({
    queryKey: ["podcast-library"],
    queryFn: () => listLibrary(),
  });
  const folders = library?.folders;

  const current = folders ? resolveFolderPath(folders, segments) : null;
  const episodes = library && current ? library.episodes.filter((e) => e.folderId === current.id) : [];

  // Which of these episodes have a quiz. A failed read just means no buttons.
  const episodeIds = episodes.map((episode) => episode.id);
  const { data: quizIds } = useQuery({
    queryKey: ["podcast-quiz-ids", episodeIds.join(",")],
    queryFn: () => fetchQuizEpisodeIds({ data: { episodeIds } }),
    enabled: episodeIds.length > 0,
    retry: false,
  });
  const quizEpisodeIds = new Set(quizIds ?? []);

  const shelf =
    library && current
      ? ((["en", "fr", "es"] as const)
          .flatMap((c) => buildShelves(library.folders, library.episodes, library.progress, c))
          .find((x) => x.folder.id === current.id) ?? null)
      : null;

  const [query, setQuery] = useState("");
  const searching = normalizeQuery(query) !== null;

  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ["podcast-search", normalizeQuery(query)],
    queryFn: () => searchEpisodes({ data: { query } }),
    // Keyed on the NORMALIZED query, so "coffee" and "  coffee  " share a
    // cache entry instead of issuing two identical requests.
    enabled: searching,
  });

  if (isLoading || !library || !folders) {
    return (
      <div className="px-5 py-8">
        <SceneBackdrop scene="listen" />
        <p
          data-surface
          className="relative z-10 rounded-2xl bg-ds-card/90 px-4 py-3 text-sm text-ds-ink-soft backdrop-blur-md"
        >
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative z-10 px-5 pt-4">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search episodes"
          aria-label="Search episodes"
          className="w-full rounded-2xl border border-ds-line bg-ds-card/90 px-4 py-2.5 text-sm text-ds-ink backdrop-blur-md placeholder:text-ds-ink-soft/60"
        />
      </div>
      {/* Search replaces the tree rather than filtering it: results are flat
          across every folder, because the reason to search is not knowing
          where a thing lives. Clearing the field restores the tree exactly
          as it was, since the folder state was never touched. */}
      {searching ? (
        <PodcastSearchResults query={query} results={searchResults ?? []} isLoading={isSearching} />
      ) : segments.length === 0 ? (
        <ListenLibraryView library={library} />
      ) : shelf ? (
        <ListenShelfView library={library} shelf={shelf} quizEpisodeIds={quizEpisodeIds} />
      ) : (
        <ListenFolderView
          folders={folders}
          episodes={episodes}
          segments={segments}
          quizEpisodeIds={quizEpisodeIds}
        />
      )}
    </div>
  );
}

/**
 * `/listen` is the parent of the `/listen/$` folder route, so a folder URL such as
 * `/listen/en` must render the child. Without the Outlet the parent kept showing
 * the root folder list and no folder could be opened.
 */
export function ListenPage() {
  const hasChild = useChildMatches().length > 0;
  if (hasChild) return <Outlet />;
  return (
    <MobileFrame>
      <ListenBrowser segments={[]} />
    </MobileFrame>
  );
}
