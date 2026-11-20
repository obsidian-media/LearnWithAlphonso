import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const WEB_CARD = "src/components/hector/CorrectionCard.tsx";
const IOS_PARTS = "ios/LearnWithAlphonso/Sources/HectorParts.swift";
const ANDROID_CARD =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/hector/HectorCorrectionCard.kt";

describe("Hector correction card guards", () => {
  it('"Hear it" is on-device speech on every platform: no request, no server, no quota', () => {
    const web = read(WEB_CARD);
    expect(web).toContain('from "@/lib/speech"');
    expect(web).not.toMatch(/fetch\(|\/api\/tts|fetchModelSpeech|authHeaders/);
    const ios = read(IOS_PARTS);
    const iosSpeaker = ios.slice(ios.indexOf("final class HectorFixSpeaker"));
    expect(iosSpeaker).toContain("AVSpeechUtterance");
    expect(iosSpeaker).not.toMatch(/URLSession|\/api\/tts|TutorConversationClient/);
    const android = read(ANDROID_CARD);
    expect(android).not.toMatch(/http|\/api\/tts|synthesizeSpeech/i);
    expect(
      read(
        "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/hector/HectorScreen.kt",
      ),
    ).toContain("Speech.get(context).speak(correction.fix");
  });

  it("the server takes the block out BEFORE the length check, the output filter and the speech", () => {
    const route = read("src/routes/api/hector-respond.ts");
    const extract = route.indexOf("extractCorrection(llm.reply)");
    expect(extract).toBeGreaterThan(0);
    expect(extract).toBeLessThan(route.indexOf("reply.length > 2_000"));
    expect(extract).toBeLessThan(route.indexOf("filterModelOutputs("));
    expect(extract).toBeLessThan(route.indexOf("api.deepgram.com"));
  });

  it("all three platforms replay the one shared fixture file", () => {
    expect(read("src/lib/hector-correction.test.ts")).toContain("shared/hector-corrections.json");
    expect(
      read("ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/HectorCorrectionTests.swift"),
    ).toContain("shared/hector-corrections.json");
    expect(
      read(
        "android/LearnWithAlphonso/core/src/test/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/HectorCorrectionTest.kt",
      ),
    ).toContain("shared/hector-corrections.json");
  });

  it("only the assistant's reply is parsed, never the learner's words", () => {
    const web = read("src/routes/_authenticated/hector.tsx");
    expect(web).toContain("extractCorrection(data.reply");
    expect(web).not.toMatch(/extractCorrection\((trimmed|text|m\.content)/);
    const ios = read("ios/LearnWithAlphonso/Sources/HectorView.swift");
    expect(ios).toContain("HectorCorrections.extract(reply.reply)");
    const android = read(
      "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/hector/HectorScreen.kt",
    );
    expect(android).toContain("HectorCorrections.extract(reply.reply)");
  });
});
