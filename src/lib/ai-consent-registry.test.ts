import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every server path that reaches an AI vendor with learner data reads consent first. A new route or server function
 * that calls a vendor without being listed here fails. Behaviour is proven in
 * src/routes/api/ai-consent-enforcement.test.ts; this guard makes sure new call sites get registered.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");
const AI_MARKERS =
  /nvidiaChatCompletion\(|api\.deepgram\.com|gradeTranslationWithAi\(|detectAndRecordWeaknesses\(|defineWord\(|generatePracticeQuestions\(|gradeLessonAnswer\(/;

const GATED_ROUTES: Record<string, RegExp> = {
  "src/routes/api/chat.ts": /authorizeAiRequest\(request,\s*"chat",\s*\{\s*route:\s*"chat"\s*\}\)/,
  "src/routes/api/stt.ts": /authorizeAiRequest\(request,\s*"stt",\s*\{\s*route:\s*"stt"\s*\}\)/,
  "src/routes/api/tts.ts": /authorizeAiRequest\(request,\s*"tts",\s*\{\s*route:\s*"tts"\s*\}\)/,
  "src/routes/api/analyze-weaknesses.ts":
    /authorizeAiRequest\(request,\s*"chat",\s*\{\s*route:\s*"analyze-weaknesses"\s*\}\)/,
  "src/routes/api/hector-respond.ts":
    /requireAiConsent\(userId,\s*\{\s*db:\s*supabaseAdmin,\s*route:\s*"hector-respond"\s*\}\)/,
  "src/routes/api/define-word.ts":
    /requireAiConsent\(userId,\s*\{\s*db:\s*supabaseAdmin,\s*route:\s*"define-word"\s*\}\)/,
  "src/routes/api/grade-translation.ts":
    /requireAiConsent\(auth\.userId,\s*\{\s*db:\s*auth\.supabase,\s*route:\s*"grade-translation",?\s*\}\)/,
};
const EXEMPT_ROUTES: Record<string, string> = {
  "src/routes/api/generate-practice.ts": "sends only the lesson's own wording, no learner data",
};
const GATED_SERVER_FNS: Record<string, RegExp> = {
  "src/lib/sync.functions.ts": /hasAiConsent\(supabase,\s*userId\)/,
  "src/lib/review.functions.ts": /hasAiConsent\(supabase,\s*userId\)/,
};

describe("AI consent registry", () => {
  it("every API route that reaches an AI vendor is gated or explicitly exempt", () => {
    const dir = path.join(ROOT, "src/routes/api");
    const aiRoutes = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => `src/routes/api/${f}`)
      .filter((f) => AI_MARKERS.test(read(f)))
      .sort();
    expect(aiRoutes).toEqual([...Object.keys(GATED_ROUTES), ...Object.keys(EXEMPT_ROUTES)].sort());
  });

  it("each gated route calls the consent check with its own name", () => {
    for (const [file, call] of Object.entries(GATED_ROUTES)) expect(read(file), file).toMatch(call);
  });

  it("only exempt routes switch consent off", () => {
    for (const file of Object.keys(GATED_ROUTES)) {
      expect(read(file), file).not.toContain("requireConsent: false");
    }
    for (const file of Object.keys(EXEMPT_ROUTES)) {
      expect(read(file), file).toContain("requireConsent: false");
    }
  });

  it("server functions that grade or analyse with AI read consent first", () => {
    const fnFiles = fs
      .readdirSync(path.join(ROOT, "src/lib"))
      .filter((f) => f.endsWith(".functions.ts"))
      .map((f) => `src/lib/${f}`)
      .filter((f) => AI_MARKERS.test(read(f)) || /gradeTranslationWithAi/.test(read(f)))
      .sort();
    expect(fnFiles).toEqual(Object.keys(GATED_SERVER_FNS).sort());
    for (const [file, call] of Object.entries(GATED_SERVER_FNS)) {
      expect(read(file), file).toMatch(call);
    }
  });

  it("edge functions that grade with AI read consent and pass it to the grader", () => {
    for (const fn of ["complete-lesson", "grade-review"]) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, fn).toContain("hasAiConsent(admin, userId)");
      expect(src, fn).toMatch(/deriveAnswerCorrectness\([^)]*, ai\)/);
    }
  });
});
