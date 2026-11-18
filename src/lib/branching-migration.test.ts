import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkNewFunctionGrants, checkNewTableGrants } from "./migration-grants";

const FILE = "20261122100000_branching_stories.sql";
const sql = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");
// Comments stripped, so a guard asserted below must live in real SQL, not in a comment.
const code = sql.replace(/--[^\n]*/g, "");

describe("branching stories migration", () => {
  it("adds no new table, so the new-table grants guard has nothing to flag", () => {
    expect(checkNewTableGrants(sql)).toEqual([]);
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
  });

  it("keeps the grader service-role only (clients never call it directly)", () => {
    expect(checkNewFunctionGrants(sql)).toEqual([]);
    expect(code).toContain(
      "REVOKE ALL ON FUNCTION public.finish_branching_story(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;",
    );
    expect(code).toContain(
      "GRANT EXECUTE ON FUNCTION public.finish_branching_story(uuid, uuid, jsonb) TO service_role;",
    );
  });

  it("the grader is SECURITY DEFINER with an empty search_path, like v1", () => {
    expect(code).toMatch(/finish_branching_story[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  });

  it("grades only a published, branching story (the published-only gate)", () => {
    // Break this clause and a draft or a plain story could be finished: the right axis for the published guard.
    expect(code).toMatch(
      /FROM public\.stories s\s+WHERE s\.id = _story_id AND s\.published AND s\.branching/,
    );
  });

  it("credits reading once, only on the first good ending (farm-proof)", () => {
    // The credit is gated on quality AND the one-way reading_credited flag; removing either lets replay farm it.
    expect(code).toMatch(/IF _quality = 'good' AND NOT _already THEN\s*_credited := true;/);
    expect(code).toContain("reading_credited boolean NOT NULL DEFAULT false");
    expect(code).toMatch(/pg_advisory_xact_lock/);
    // The reading skill is only added inside the _credited branch.
    expect(code).toMatch(/IF _credited THEN\s*PERFORM public\.add_skill_results/);
  });

  it("keeps branching and nodes consistent, and lets a branching story have empty segments", () => {
    expect(code).toContain("CHECK (branching = (nodes IS NOT NULL))");
    expect(code).toMatch(/branching OR jsonb_array_length\(segments\) BETWEEN 1 AND 60/);
  });

  it("seeds exactly one proof story, unpublished and needing review, with a good ending", () => {
    const seed = code.split("INSERT INTO public.stories")[1] ?? "";
    expect(seed).toContain("a-day-that-could-go-a-few-ways");
    expect(seed).not.toMatch(/published\s*=\s*true|published_at/i);
    expect(seed).toContain('"quality": "good"');
    // Four distinct endings in the seeded graph.
    const endings = [...seed.matchAll(/"id":\s*"([a-z-]+)",\s*\n\s*"title"/g)].map((m) => m[1]);
    expect(new Set(endings).size).toBe(4);
    expect(seed).not.toContain("—");
  });
});
