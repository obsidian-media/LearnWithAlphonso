import { denylistHits } from "./guards";
import type { Candidate } from "./manifest";
import type { VocabImageSource } from "./types";
import { isSourcePageUrl } from "./url-policy";

/** A provider search hit. `downloadUrl` may be temporary (Pixabay /get/): used once, never stored. */
export type ProviderPhoto = {
  source: VocabImageSource;
  sourceId: string;
  sourcePageUrl: string;
  credit: string;
  providerAlt: string;
  downloadUrl: string;
  width: number;
  height: number;
};

export const MIN_LONG_EDGE = 700;

export function pexelsSearchUrl(query: string): string {
  return `https://api.pexels.com/v1/search?${new URLSearchParams({ query, per_page: "15", orientation: "landscape" })}`;
}

export function pixabaySearchUrl(query: string, apiKey: string): string {
  return `https://pixabay.com/api/?${new URLSearchParams({
    key: apiKey,
    q: query,
    lang: "en",
    image_type: "photo",
    orientation: "horizontal",
    safesearch: "true",
    per_page: "20",
  })}`;
}

type PexelsPhoto = {
  id: number;
  url: string;
  photographer: string;
  alt: string | null;
  width: number;
  height: number;
  src: { large2x: string };
};
type PixabayHit = {
  id: number;
  pageURL: string;
  tags: string;
  user: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
};

export function parsePexels(json: unknown): ProviderPhoto[] {
  const photos = (json as { photos?: unknown[] } | null)?.photos ?? [];
  return photos
    .filter((p): p is PexelsPhoto => {
      const x = p as Partial<PexelsPhoto> | null;
      return (
        !!x &&
        typeof x.id === "number" &&
        typeof x.url === "string" &&
        typeof x.src?.large2x === "string"
      );
    })
    .map((p): ProviderPhoto => ({
      source: "pexels",
      sourceId: `pexels:${p.id}`,
      sourcePageUrl: p.url,
      credit: (p.photographer ?? "").trim(),
      providerAlt: (p.alt ?? "").trim(),
      downloadUrl: p.src.large2x,
      width: p.width,
      height: p.height,
    }));
}

export function parsePixabay(json: unknown): ProviderPhoto[] {
  const hits = (json as { hits?: unknown[] } | null)?.hits ?? [];
  return hits
    .filter((h): h is PixabayHit => {
      const x = h as Partial<PixabayHit> | null;
      return (
        !!x &&
        typeof x.id === "number" &&
        typeof x.pageURL === "string" &&
        typeof x.largeImageURL === "string"
      );
    })
    .map((h): ProviderPhoto => ({
      source: "pixabay",
      sourceId: `pixabay:${h.id}`,
      sourcePageUrl: h.pageURL,
      credit: (h.user ?? "").trim(),
      providerAlt: (h.tags ?? "").trim(),
      downloadUrl: h.largeImageURL,
      width: h.imageWidth,
      height: h.imageHeight,
    }));
}

/** First photo that is not excluded, big enough, has a real photo page, and whose provider text is clean. */
export function pickPhoto(
  photos: ProviderPhoto[],
  excluded: ReadonlySet<string>,
): ProviderPhoto | null {
  return (
    photos.find(
      (p) =>
        !excluded.has(p.sourceId) &&
        Math.max(p.width, p.height) >= MIN_LONG_EDGE &&
        isSourcePageUrl(p.source, p.sourcePageUrl) &&
        denylistHits(`${p.providerAlt} ${p.credit}`).length === 0,
    ) ?? null
  );
}

export function candidateFrom(
  photo: ProviderPhoto,
  stagingPath: string,
  sha8: string,
  width: number,
  height: number,
): Candidate {
  return {
    source: photo.source,
    sourceId: photo.sourceId,
    sourcePageUrl: photo.sourcePageUrl,
    credit: photo.credit,
    providerAlt: photo.providerAlt,
    stagingPath,
    sha8,
    width,
    height,
  };
}
