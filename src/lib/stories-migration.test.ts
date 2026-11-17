import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkNewTableGrants } from "./migration-grants";

const FILE = "20261121100000_graded_stories.sql";
const sql = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("graded stories migration", () => {
  it("passes the new-table grants guard", () => {
    expect(checkNewTableGrants(sql)).toEqual([]);
  });

  it("gives clients SELECT only on all three tables (writes go through functions)", () => {
    for (const t of ["stories", "story_quiz_questions", "story_progress"]) {
      expect(code).toContain(`GRANT SELECT ON public.${t} TO authenticated;`);
      expect(code).not.toMatch(
        new RegExp(`GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*ON public\\.${t} TO authenticated`),
      );
    }
  });

  it("hides drafts: stories and their questions are readable only while published", () => {
    expect(code).toMatch(/stories_select_published[\s\S]*?USING \(published = true\)/);
    expect(code).toMatch(/story_quiz_questions_select_published[\s\S]*?s\.published/);
  });

  it("keeps progress own-row and the grader service-role only", () => {
    expect(code).toMatch(/story_progress_select_own[\s\S]*?auth\.uid\(\)\) = user_id/);
    expect(code).toContain(
      "REVOKE ALL ON FUNCTION public.submit_story_check(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;",
    );
    expect(code).toContain(
      "GRANT EXECUTE ON FUNCTION public.submit_story_check(uuid, uuid, jsonb) TO service_role;",
    );
  });

  it("cannot publish a story that still needs review", () => {
    expect(code).toContain("CHECK (NOT published OR NOT needs_review)");
  });

  it("seeds six stories (two per course) as drafts needing review", () => {
    const inserts = code
      .split("INSERT INTO public.stories")[1]
      .split("INSERT INTO public.story_quiz_questions")[0];
    expect(inserts).not.toMatch(/published\s*=\s*true|published_at/i);
    const rows = [...inserts.matchAll(/\('(en|fr|es)', '(A1|A2)', '/g)].map(
      (m) => `${m[1]}-${m[2]}`,
    );
    expect(rows.sort()).toEqual(["en-A1", "en-A2", "es-A1", "es-A2", "fr-A1", "fr-A2"]);
    expect(inserts).not.toContain("—");
  });
});
