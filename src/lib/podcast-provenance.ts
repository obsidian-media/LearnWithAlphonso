/**
 * Who made an episode's audio. Mirrors the CHECK on podcast_episodes.voice_provider
 * (supabase/migrations/20261012500100_podcast_episode_voice_provenance.sql), pinned by
 * src/lib/podcast-migrations.test.ts.
 */
export const VOICE_PROVIDERS = ["deepgram", "elevenlabs", "edge-tts", "human", "unknown"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

/**
 * Audio the app may publish. Deepgram is licensed through the app's paid account; a
 * human recording is the owner's own. ElevenLabs free-tier and Edge TTS output are not
 * licensed for commercial distribution. A paid-plan provider value can be added here,
 * with the CHECK, if that ever changes.
 */
export const LICENSED_PROVIDERS: readonly VoiceProvider[] = ["deepgram", "human"];

export function isPublishableProvider(provider: string | null | undefined): boolean {
  return (LICENSED_PROVIDERS as readonly string[]).includes(provider ?? "");
}
