import type { AdminEpisode, AdminFolder } from "../../../lib/admin.functions";

export type { AdminEpisode, AdminFolder };

export type NewEpisodeInput = {
  folderId: string;
  slug: string;
  title: string;
  description: string | null;
  course: "en" | "fr" | "es" | null;
  levelId: string | null;
};

/**
 * Everything the Podcast screens call, as one object the routes fill with the real server functions. Every call is gated
 * on the server (podcasts.manage) and every write carries the reason the person typed, which the server and the database
 * each refuse to do without. The two audio flows (replace, create) put the bytes straight into storage through a signed
 * URL, so they live in createPodcastApi below, where the order of their steps can be tested.
 */
export type PodcastApi = {
  folders: () => Promise<AdminFolder[]>;
  episodes: (folderId: string) => Promise<AdminEpisode[]>;
  transcript: (episodeId: string) => Promise<{ text: string | null }>;
  createFolder: (
    input: { parentId: string | null; slug: string; title: string },
    reason: string,
  ) => Promise<{ id: string }>;
  renameFolder: (
    id: string,
    title: string,
    description: string | null,
    reason: string,
  ) => Promise<unknown>;
  moveFolder: (id: string, parentId: string | null, reason: string) => Promise<unknown>;
  deleteFolder: (id: string, reason: string) => Promise<unknown>;
  updateEpisode: (
    id: string,
    title: string,
    description: string | null,
    reason: string,
  ) => Promise<unknown>;
  setPublished: (id: string, published: boolean, reason: string) => Promise<unknown>;
  saveTranscript: (episodeId: string, text: string, reason: string) => Promise<unknown>;
  /** Replaces an episode's audio: signed URL, direct upload, then the server proves it is audio. Resolves to its duration. */
  replaceAudio: (
    episodeId: string,
    file: File,
    reason: string,
  ) => Promise<{ durationSeconds: number }>;
  /** Creates an episode with its first audio, unpublished. Resolves to the audio's duration. */
  createEpisode: (
    input: NewEpisodeInput,
    file: File,
    reason: string,
  ) => Promise<{ durationSeconds: number }>;
};

/** The server functions the two audio flows call (the real ones in admin.functions.ts, or stand-ins in a test). */
export type AudioServer = {
  createAudioUploadUrl: (args: {
    data: { episodeId: string; declaredBytes: number };
  }) => Promise<{ signedUrl: string }>;
  verifyUploadedAudio: (args: {
    data: { episodeId: string; reason: string };
  }) => Promise<{ durationSeconds: number }>;
  createEpisodeUploadUrl: (args: {
    data: NewEpisodeInput & { declaredBytes: number };
  }) => Promise<{ signedUrl: string }>;
  createEpisode: (args: {
    data: NewEpisodeInput & { reason: string };
  }) => Promise<{ durationSeconds: number }>;
};

const UPLOAD_FAILED = "The upload did not complete.";

/** Sends the file to the signed storage URL. The content type is the browser's own; the server sniffs the bytes anyway. */
async function putFile(put: typeof fetch, signedUrl: string, file: File): Promise<void> {
  const res = await put(signedUrl, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(UPLOAD_FAILED);
}

export function createPodcastAudioFlows(
  server: AudioServer,
  put: typeof fetch,
): Pick<PodcastApi, "replaceAudio" | "createEpisode"> {
  return {
    // The server resolves the storage path from the episode id (never sent from here), the bytes go to a STAGING key so
    // the live object is untouched until they are proven to be audio, and only the verify step (the write) takes the reason.
    async replaceAudio(episodeId, file, reason) {
      const { signedUrl } = await server.createAudioUploadUrl({
        data: { episodeId, declaredBytes: file.size },
      });
      await putFile(put, signedUrl, file);
      const { durationSeconds } = await server.verifyUploadedAudio({ data: { episodeId, reason } });
      return { durationSeconds };
    },
    // Same two steps for a brand-new episode: the row is inserted (with the reason) only once the audio is verified.
    async createEpisode(input, file, reason) {
      const { signedUrl } = await server.createEpisodeUploadUrl({
        data: { ...input, declaredBytes: file.size },
      });
      await putFile(put, signedUrl, file);
      const { durationSeconds } = await server.createEpisode({ data: { ...input, reason } });
      return { durationSeconds };
    },
  };
}
