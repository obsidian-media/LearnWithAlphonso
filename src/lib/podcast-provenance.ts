/**
 * Who made an episode's audio. Mirrors the CHECK on podcast_episodes.voice_provider
 * (supabase/migrations/20261012500100_podcast_episode_voice_provenance.sql), pinned by
 * src/lib/podcast-migrations.test.ts.
 */
export const VOICE_PROVIDERS = ["deepgram", "elevenlabs", "edge-tts", "human", "unknown"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

/**
 * Audio the app may publish. Only providers whose output the app holds distribution
 * rights to may be published: Deepgram through the app's paid account, and a human
 * recording the owner made. Rows that predate provenance tracking default to 'unknown'
 * and are not publishable until re-voiced. A further provider value can be added here,
 * with both CHECKs in the migrations, if that ever changes.
 */
export const LICENSED_PROVIDERS: readonly VoiceProvider[] = ["deepgram", "human"];

export function isPublishableProvider(provider: string | null | undefined): boolean {
  return (LICENSED_PROVIDERS as readonly string[]).includes(provider ?? "");
}

/** Shown to an admin who tries to publish an episode whose audio the app may not distribute. */
export const UNPUBLISHABLE_PROVIDER_MESSAGE =
  "This episode cannot be published: its audio provider is not one the app may distribute " +
  `(${LICENSED_PROVIDERS.join(" or ")}). Re-voice it, or record it, then publish.`;
