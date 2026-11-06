import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_VOICES, VOICE_CATALOG } from "./voice-catalog";

const root = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const swift = read("ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/VoiceCatalog.swift");
const kotlin = read(
  "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/voice/VoiceCatalog.kt",
);

type Row = {
  id: string;
  course: string;
  name: string;
  gender: string;
  accent: string;
  descriptor: string;
};

function swiftRows(): Row[] {
  const re =
    /VoiceOption\(id: "([^"]+)", course: "([^"]+)", name: "([^"]+)", gender: \.(male|female), accent: "([^"]+)", descriptor: "([^"]+)"\)/g;
  return [...swift.matchAll(re)].map(([, id, course, name, gender, accent, descriptor]) => ({
    id: id!,
    course: course!,
    name: name!,
    gender: gender!,
    accent: accent!,
    descriptor: descriptor!,
  }));
}

function kotlinRows(): Row[] {
  const re =
    /VoiceOption\("([^"]+)", "([^"]+)", "([^"]+)", VoiceGender\.(Male|Female), "([^"]+)", "([^"]+)"\)/g;
  return [...kotlin.matchAll(re)].map(([, id, course, name, gender, accent, descriptor]) => ({
    id: id!,
    course: course!,
    name: name!,
    gender: gender!.toLowerCase(),
    accent: accent!,
    descriptor: descriptor!,
  }));
}

/** `.alphonso: ["en": "aura-2-saturn-en", ...]` (Swift) or `VoiceCharacter.Alphonso to mapOf("en" to "...")` (Kotlin). */
function defaultsFrom(source: string, character: "alphonso" | "hector", lang: "swift" | "kotlin") {
  const line =
    lang === "swift"
      ? new RegExp(`\\.${character}: \\[([^\\]]+)\\]`).exec(source)?.[1]
      : new RegExp(
          `VoiceCharacter\\.${character[0]!.toUpperCase()}${character.slice(1)} to mapOf\\(([^)]+)\\)`,
        ).exec(source)?.[1];
  const pairs = [...(line ?? "").matchAll(/"(en|fr|es)"(?::| to) "([^"]+)"/g)];
  return Object.fromEntries(pairs.map(([, course, id]) => [course, id]));
}

const web: Row[] = VOICE_CATALOG.map((v) => ({ ...v }));

describe("voice allow-list mirrors match src/lib/voice-catalog.ts", () => {
  it("iOS VoiceCatalog.swift lists exactly the same voices, metadata and order", () => {
    expect(swiftRows()).toEqual(web);
  });

  it("Android VoiceCatalog.kt lists exactly the same voices, metadata and order", () => {
    expect(kotlinRows()).toEqual(web);
  });

  it.each(["alphonso", "hector"] as const)(
    "%s's defaults are the same on all three",
    (character) => {
      expect(defaultsFrom(swift, character, "swift")).toEqual(DEFAULT_VOICES[character]);
      expect(defaultsFrom(kotlin, character, "kotlin")).toEqual(DEFAULT_VOICES[character]);
    },
  );

  it("the stored-choice key is the same everywhere", () => {
    expect(swift).toContain('public static let metadataKey = "voices"');
    expect(kotlin).toContain('const val METADATA_KEY = "voices"');
  });
});

describe("native clients send each character's own voice", () => {
  it("iOS: Hector's call sends Hector's voice; Alphonso's calls send Alphonso's", () => {
    const hector = read("ios/LearnWithAlphonso/Sources/HectorView.swift");
    expect(hector).toMatch(
      /tutorClient\.respond\([\s\S]*?voice: VoicePrefsCache\(\)\.voice\(\.hector, course: courseCode\)/,
    );
    expect(hector).not.toContain("voice(.alphonso");
    for (const file of ["ConversationView.swift", "CampaignView.swift"]) {
      const src = read(`ios/LearnWithAlphonso/Sources/${file}`);
      expect(src, file).toMatch(
        /synthesizeSpeech\(\s*text: reply, voice: VoicePrefsCache\(\)\.voice\(\.alphonso, course: courseCode\)/,
      );
      expect(src, file).not.toContain("voice(.hector");
    }
  });

  it("Android: Hector's call sends Hector's voice; Alphonso's calls send Alphonso's", () => {
    const app = "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso";
    const hector = read(`${app}/ui/hector/HectorScreen.kt`);
    expect(hector).toContain("voice = hectorVoice(course.code)");
    expect(hector).toContain(
      "hectorVoice = { c -> container.voicePrefs.voice(VoiceCharacter.Hector, c) }",
    );
    expect(hector).not.toContain("VoiceCharacter.Alphonso");
    const vms = read(`${app}/ui/practice/ConversationViewModels.kt`);
    expect(vms).toContain(
      "ai.synthesizeSpeech(reply, voice = alphonsoVoice(course.code), course = course.code)",
    );
    const screens = read(`${app}/ui/practice/PracticeScreens.kt`);
    expect(
      screens.match(
        /alphonsoVoice = \{ c -> container\.voicePrefs\.voice\(VoiceCharacter\.Alphonso, c\) \}/g,
      ),
    ).toHaveLength(2);
    expect(screens).not.toContain("VoiceCharacter.Hector");
  });

  it("previews stream the static clip and never call TTS on either app", () => {
    const ios = read("ios/LearnWithAlphonso/Sources/VoiceSettingsView.swift");
    expect(ios).toContain("VoiceCatalog.previewURL(for: id, base: AppConfig.apiBaseURL)");
    expect(ios).not.toMatch(/synthesizeSpeech|api\/tts/);
    const android = read(
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/settings/VoicesSection.kt",
    );
    expect(android).toContain("VoiceCatalog.previewUrl(id, BuildConfig.API_BASE_URL)");
    expect(android).not.toMatch(/synthesizeSpeech|api\/tts/);
  });
});
