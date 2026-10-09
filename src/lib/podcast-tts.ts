/**
 * Splits a long episode script into Deepgram-sized pieces.
 *
 * src/routes/api/tts.ts caps each request at 2000 characters; a 6-8
 * minute episode is roughly 7000, so a podcast script must be chunked
 * and the resulting audio joined. Splitting on sentence boundaries keeps
 * prosody intact -- a mid-word split is audible.
 */
const DEEPGRAM_CHARACTER_LIMIT = 2000;

/**
 * Last resort for a "sentence" with no `.!?` boundary inside the limit.
 * Prefers the nearest earlier whitespace so a chunk never ends mid-word --
 * a fixed-offset cut is audible -- falling back to a hard character cut only
 * when no whitespace exists in range at all (e.g. one very long token).
 */
function hardSplit(sentence: string, limit: number): string[] {
  const pieces: string[] = [];
  let rest = sentence;
  while (rest.length > limit) {
    const spaceAt = rest.lastIndexOf(" ", limit);
    const cut = spaceAt > 0 ? spaceAt : limit;
    pieces.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

export function chunkScript(text: string, limit = DEEPGRAM_CHARACTER_LIMIT): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences =
    trimmed
      .match(/[^.!?]+[.!?]*\s*/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [];

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    // A single sentence over the limit has no boundary to split on.
    // Hard-split it rather than emit an oversized chunk: Deepgram
    // truncates silently, so the audio would just go missing with no
    // error anywhere to notice.
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...hardSplit(sentence, limit));
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

type CourseId = "en" | "fr" | "es";

/** The app's native voice per course (the voice engine's map). */
export const DEFAULT_VOICE_FOR_COURSE = {
  en: "aura-2-thalia-en",
  fr: "aura-2-agathe-fr",
  es: "aura-2-selena-es",
} as const;

/**
 * The one way scripts/podcast-tool.ts builds a Deepgram TTS URL. `mip_opt_out=true` keeps
 * Deepgram from retaining or training on our audio; building it here, with a test and the
 * call-site scan in ai-call-sites.test.ts, is what keeps a later edit from dropping it.
 */
export function deepgramSpeakUrl(voice: string): string {
  const params = new URLSearchParams({ model: voice, encoding: "mp3" });
  return `https://api.deepgram.com/v1/speak?mip_opt_out=true&${params.toString()}`;
}

const AURA_2_VOICE = /^aura-2-[a-z]+-(en|fr|es)$/;

export function voiceLanguage(voice: string): CourseId | null {
  const match = AURA_2_VOICE.exec(voice);
  return match ? (match[1] as CourseId) : null;
}

/** An English voice reading a French script is fluent-sounding nonsense; refuse it. */
export function voiceMatchesCourse(voice: string, course: CourseId): boolean {
  return voiceLanguage(voice) === course;
}

/**
 * `add --file --provider deepgram` claims the MP3 is Deepgram audio, which makes it
 * publishable. That claim needs the same voice/course check `--script` gets, so a mislabelled
 * file cannot become a publishable row. Returns a message, or null when the combination is fine.
 */
export function fileProviderProblem(input: {
  provider: string;
  voice: string | undefined;
  course: CourseId | null;
}): string | null {
  if (input.provider !== "deepgram") return null;
  if (!input.voice) {
    return "--voice is required with --file --provider deepgram: name the voice the audio was made with.";
  }
  if (!input.course) {
    return "--course is required with --file --provider deepgram, so the voice can be checked against it.";
  }
  if (!voiceMatchesCourse(input.voice, input.course)) {
    return `voice "${input.voice}" does not speak course "${input.course}". Use ${DEFAULT_VOICE_FOR_COURSE[input.course]}.`;
  }
  return null;
}
