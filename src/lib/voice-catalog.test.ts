import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICES,
  VOICE_CATALOG,
  chosenVoice,
  isAllowedVoice,
  parseVoicePrefs,
  resolveServerVoice,
  resolveTtsVoice,
  voicePreviewPath,
  voicesForCourse,
  withVoiceChoice,
} from "./voice-catalog";

describe("voice allow-list", () => {
  it("holds exactly the owner's 32 English, 15 Spanish and 2 French voices", () => {
    expect(voicesForCourse("en")).toHaveLength(32);
    expect(voicesForCourse("es")).toHaveLength(15);
    expect(voicesForCourse("fr").map((v) => v.id)).toEqual([
      "aura-2-agathe-fr",
      "aura-2-hector-fr",
    ]);
  });

  it("every id is an Aura-2 model of its own course, and ids are unique", () => {
    for (const v of VOICE_CATALOG) {
      expect(v.id).toBe(`aura-2-${v.name.toLowerCase()}-${v.course}`);
      expect(["male", "female"]).toContain(v.gender);
      expect(v.accent.length).toBeGreaterThan(0);
      expect(v.descriptor.length).toBeGreaterThan(0);
    }
    expect(new Set(VOICE_CATALOG.map((v) => v.id)).size).toBe(VOICE_CATALOG.length);
  });

  it("leaves out valentina (Deepgram returns 400) and voices never approved", () => {
    expect(isAllowedVoice("es", "aura-2-valentina-es")).toBe(false);
    expect(isAllowedVoice("en", "aura-2-zeus-en")).toBe(false);
  });

  it("checks the course, not just the id", () => {
    expect(isAllowedVoice("fr", "aura-2-hector-fr")).toBe(true);
    expect(isAllowedVoice("es", "aura-2-hector-fr")).toBe(false);
    expect(isAllowedVoice("en", undefined)).toBe(false);
  });
});

describe("defaults (owner, 2026-11-06)", () => {
  it("pins each character's default per course", () => {
    expect(DEFAULT_VOICES).toEqual({
      alphonso: { en: "aura-2-saturn-en", es: "aura-2-javier-es", fr: "aura-2-hector-fr" },
      hector: { en: "aura-2-hermes-en", es: "aura-2-alvaro-es", fr: "aura-2-hector-fr" },
    });
  });

  it("every default is on its course's allow-list", () => {
    for (const perCourse of Object.values(DEFAULT_VOICES)) {
      for (const [course, id] of Object.entries(perCourse)) {
        expect(isAllowedVoice(course as "en", id)).toBe(true);
      }
    }
  });
});

describe("preview clips are static files", () => {
  const dir = path.resolve(import.meta.dirname, "../../public/voices");

  it("ships one clip per allowed voice and nothing else", () => {
    const files = fs.readdirSync(dir).sort();
    expect(files).toEqual(VOICE_CATALOG.map((v) => `${v.id}.mp3`).sort());
    for (const v of VOICE_CATALOG) {
      expect(voicePreviewPath(v.id)).toBe(`/voices/${v.id}.mp3`);
      expect(fs.statSync(path.join(dir, `${v.id}.mp3`)).size).toBeGreaterThan(5_000);
    }
  });
});

describe("learner choices", () => {
  it("parses only allow-listed voices for the right course out of untrusted metadata", () => {
    expect(
      parseVoicePrefs({
        alphonso: { en: "aura-2-luna-en", es: "aura-2-luna-en", de: "aura-2-luna-en" },
        hector: { fr: "aura-2-agathe-fr", en: "premium" },
        other: { en: "aura-2-luna-en" },
      }),
    ).toEqual({ alphonso: { en: "aura-2-luna-en" }, hector: { fr: "aura-2-agathe-fr" } });
    expect(parseVoicePrefs(null)).toEqual({});
    expect(parseVoicePrefs("aura-2-luna-en")).toEqual({});
  });

  it("keeps Alphonso's and Hector's choices independent", () => {
    let prefs = withVoiceChoice({}, "alphonso", "en", "aura-2-luna-en");
    prefs = withVoiceChoice(prefs, "hector", "en", "aura-2-orpheus-en");
    expect(chosenVoice(prefs, "alphonso", "en")).toBe("aura-2-luna-en");
    expect(chosenVoice(prefs, "hector", "en")).toBe("aura-2-orpheus-en");
    expect(chosenVoice(prefs, "hector", "es")).toBe("aura-2-alvaro-es");
  });

  it("choosing the default clears the entry; a voice off the list is ignored", () => {
    const prefs = withVoiceChoice({}, "hector", "es", "aura-2-celeste-es");
    expect(withVoiceChoice(prefs, "hector", "es", "aura-2-alvaro-es").hector).toEqual({});
    expect(withVoiceChoice(prefs, "hector", "es", "aura-2-valentina-es")).toBe(prefs);
  });
});

describe("server resolution", () => {
  it("requested allowed voice, then stored choice, then default", () => {
    const stored = { hector: { en: "aura-2-orpheus-en" } };
    expect(
      resolveServerVoice({
        character: "hector",
        course: "en",
        requested: "aura-2-luna-en",
        stored,
      }),
    ).toBe("aura-2-luna-en");
    expect(
      resolveServerVoice({
        character: "hector",
        course: "en",
        requested: "aura-2-zeus-en",
        stored,
      }),
    ).toBe("aura-2-orpheus-en");
    expect(resolveServerVoice({ character: "hector", course: "en" })).toBe("aura-2-hermes-en");
    expect(resolveServerVoice({ character: "alphonso", course: "en" })).toBe("aura-2-saturn-en");
  });

  it("/api/tts derives the course from a voice-only request and checks it", () => {
    expect(resolveTtsVoice({ voice: "aura-2-diana-es" })).toBe("aura-2-diana-es");
    expect(resolveTtsVoice({ voice: "aura-2-valentina-es" })).toBe("aura-2-javier-es");
    expect(resolveTtsVoice({})).toBe("aura-2-saturn-en");
    expect(resolveTtsVoice({ course: "fr", character: "hector" })).toBe("aura-2-hector-fr");
    expect(resolveTtsVoice({ course: "es", character: "villain" })).toBe("aura-2-javier-es");
  });
});
