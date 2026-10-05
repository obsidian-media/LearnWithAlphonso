import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261005120000_saved_word_review_items.sql";

describe("saved_word review_items migration", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");

  it("is newer than every migration it depends on", () => {
    // Version it AFTER what it depends on; the CI guard catches duplicate
    // versions, not wrong order.
    expect(FILE.slice(0, 14) > "20260930170000").toBe(true);
  });

  it("allows saved_word as a source and adds the two columns", () => {
    expect(sql()).toContain("source IN ('lesson', 'weakness', 'saved_word')");
    expect(sql()).toContain("ADD COLUMN saved_word text");
    expect(sql()).toContain("ADD COLUMN saved_context text");
  });

  it("keeps the lesson and weakness shapes and requires the saved_word fields", () => {
    const s = sql();
    expect(s).toContain("(source = 'lesson')");
    expect(s).toContain("source = 'weakness' AND weakness_label IS NOT NULL");
    expect(s).toContain("source = 'saved_word' AND saved_word IS NOT NULL");
    expect(s).toContain("saved_context IS NOT NULL");
    expect(s).toContain("explanation IS NOT NULL");
  });

  it("teaches BOTH quota functions the define kind with the agreed limits", () => {
    const s = sql();
    expect(s).toContain("WHEN 'define' THEN 40");
    expect(s).toContain("WHEN 'define' THEN 10");
  });

  // CREATE OR REPLACE replaces the WHOLE function, so every existing limit
  // must be restated exactly as it is live. Basing this migration on an older
  // definition (the translate migration still says stt = 60) would silently
  // revert the later STT raise to 300 (20260930050000_raise_stt_daily_limit.sql).
  it("restates every existing daily limit exactly as it is live", () => {
    const s = sql();
    for (const line of [
      "WHEN 'chat' THEN 60",
      "WHEN 'stt' THEN 300",
      "WHEN 'tts' THEN 80",
      "WHEN 'translate' THEN 60",
    ]) {
      expect(s).toContain(line);
    }
    expect(s).not.toContain("WHEN 'stt' THEN 60");
  });

  it("restates every existing per-minute limit exactly as it is live", () => {
    const s = sql();
    for (const line of [
      "WHEN 'chat' THEN 10",
      "WHEN 'stt' THEN 10",
      "WHEN 'tts' THEN 15",
      "WHEN 'translate' THEN 10",
    ]) {
      expect(s).toContain(line);
    }
  });

  it("re-grants execute exactly as the previous definitions did", () => {
    const s = sql();
    expect(s).toContain("REVOKE ALL ON FUNCTION public.consume_ai_quota(text) FROM public, anon;");
    expect(s).toContain(
      "REVOKE ALL ON FUNCTION public.consume_ai_rate_limit(text) FROM public, anon;",
    );
    expect(s).toContain(
      "GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text) TO authenticated, service_role;",
    );
    expect(s).toContain(
      "GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(text) TO authenticated, service_role;",
    );
  });
});
