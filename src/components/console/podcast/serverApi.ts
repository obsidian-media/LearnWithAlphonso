import {
  adminCreateAudioUploadUrl,
  adminCreateEpisode,
  adminCreateEpisodeUploadUrl,
  adminCreateFolder,
  adminDeleteFolder,
  adminGetTranscript,
  adminListEpisodes,
  adminListFolders,
  adminMoveFolder,
  adminRenameFolder,
  adminSaveTranscript,
  adminSetPublished,
  adminUpdateEpisode,
  adminVerifyUploadedAudio,
} from "@/lib/admin.functions";
import { createPodcastAudioFlows, type PodcastApi } from "./podcastApi";

/**
 * The Podcast screens' calls: the existing server functions, each checking podcasts.manage itself and asking for the
 * reason the person typed. Used by both routes (/folders and /folder/$id). The audio flows put the bytes straight into
 * storage through a signed URL (a server function body is capped near 4.5 MB), then the server proves it is audio.
 */
export const podcastApi: PodcastApi = {
  folders: () => adminListFolders(),
  episodes: (folderId) => adminListEpisodes({ data: { folderId } }),
  transcript: (episodeId) => adminGetTranscript({ data: { episodeId } }),
  createFolder: (input, reason) =>
    adminCreateFolder({
      data: { ...input, description: null, sortOrder: 0, reason },
    }),
  renameFolder: (id, title, description, reason) =>
    adminRenameFolder({ data: { id, title, description, reason } }),
  moveFolder: (id, parentId, reason) => adminMoveFolder({ data: { id, parentId, reason } }),
  deleteFolder: (id, reason) => adminDeleteFolder({ data: { id, reason } }),
  updateEpisode: (id, title, description, reason) =>
    adminUpdateEpisode({ data: { id, title, description, reason } }),
  setPublished: (id, published, reason) => adminSetPublished({ data: { id, published, reason } }),
  saveTranscript: (episodeId, text, reason) =>
    adminSaveTranscript({ data: { episodeId, text, reason } }),
  ...createPodcastAudioFlows(
    {
      createAudioUploadUrl: adminCreateAudioUploadUrl,
      verifyUploadedAudio: adminVerifyUploadedAudio,
      createEpisodeUploadUrl: adminCreateEpisodeUploadUrl,
      createEpisode: adminCreateEpisode,
    },
    (input, init) => fetch(input, init),
  ),
};
