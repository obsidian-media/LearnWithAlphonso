import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A plpgsql function declared `RETURNS TABLE(team_id uuid, ...)` has a variable called team_id. An unqualified
 * `WHERE team_id = x` inside its body then fails at RUN time with 42702 "column reference is ambiguous" (the default
 * plpgsql.variable_conflict is error), and nothing fails at migration time. That is how `_join_team_impl` and
 * `get_my_team` shipped broken: no team could be created or joined and a member could not see their team, on web, iOS
 * and Android, until a live probe in 2026-10 found it. There is no local Postgres to run migrations against, so this
 * reads the SQL: in the LATEST definition of every such function, an output column must never appear unqualified in a
 * condition (after WHERE, AND, OR, ON or WHEN) unless the function opts in with `#variable_conflict`.
 *
 * Calibrated on the deployed set: this pattern flagged exactly those two functions and nothing else.
 */
const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");

type FunctionDefinition = { name: string; file: string; columns: string[]; body: string };

/** The text after `from` up to the parenthesis that closes the one opened at `from - 1`, plus the end offset. */
function balanced(src: string, from: number): { inner: string; end: number } | null {
  let depth = 1;
  for (let i = from; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return { inner: src.slice(from, i), end: i + 1 };
  }
  return null;
}

export function columnsOfReturnsTable(tableSpec: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of tableSpec) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim().split(/\s+/)[0].replace(/"/g, "").toLowerCase()).filter(Boolean);
}

export function latestDefinitions(files: { file: string; sql: string }[]): FunctionDefinition[] {
  const latest = new Map<string, FunctionDefinition>();
  for (const { file, sql } of files) {
    const code = sql.replace(/--[^\n]*/g, "");
    const header = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi;
    for (let m = header.exec(code); m; m = header.exec(code)) {
      const args = balanced(code, header.lastIndex);
      if (!args) continue;
      const rest = code.slice(args.end);
      const returns = /^\s*RETURNS\s+TABLE\s*\(/i.exec(rest);
      const tag = /\$([a-z_0-9]*)\$/i.exec(rest);
      if (!tag) continue;
      const bodyStart = (tag.index ?? 0) + tag[0].length;
      const bodyEnd = rest.indexOf(tag[0], bodyStart);
      if (bodyEnd < 0) continue;
      const table = returns ? balanced(rest, returns[0].length) : null;
      const key = `${m[1].toLowerCase()}(${args.inner.replace(/\s+/g, " ").trim().toLowerCase()})`;
      latest.set(key, {
        name: m[1],
        file,
        columns: table ? columnsOfReturnsTable(table.inner) : [],
        body: rest.slice(bodyStart, bodyEnd),
      });
    }
  }
  return [...latest.values()];
}

export function clashes(def: FunctionDefinition): string[] {
  if (/#variable_conflict/i.test(def.body)) return [];
  return def.columns.filter((col) =>
    new RegExp(
      `(^|\\s)(where|and|or|on|when)\\s+(not\\s+)?${col}\\s*(=|<>|!=|<=|>=|<|>|in[\\s(]|is\\s|like\\s)`,
      "i",
    ).test(def.body),
  );
}

const files = () =>
  fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(MIGRATIONS, file), "utf8") }));

describe("the checker itself", () => {
  const def = (columns: string[], body: string): FunctionDefinition => ({
    name: "f",
    file: "x",
    columns,
    body,
  });

  it("flags an output column used unqualified in a condition", () => {
    expect(clashes(def(["team_id", "ok"], "SELECT 1 FROM t WHERE team_id = _team_id"))).toEqual([
      "team_id",
    ]);
    expect(clashes(def(["team_id"], "SELECT 1 FROM t WHERE a = 1 AND team_id = _x"))).toEqual([
      "team_id",
    ]);
    expect(clashes(def(["team_id"], "SELECT 1 FROM t JOIN u ON team_id = u.id"))).toEqual([
      "team_id",
    ]);
    expect(clashes(def(["team_id"], "SELECT 1 FROM t WHERE NOT team_id IS NULL"))).toEqual([
      "team_id",
    ]);
    expect(clashes(def(["team_id"], "SELECT 1 FROM t WHERE team_id IN (1, 2)"))).toEqual([
      "team_id",
    ]);
  });

  it("accepts qualified references, column lists and a function that opts in", () => {
    expect(
      clashes(def(["team_id"], "SELECT 1 FROM t WHERE t.team_id = _team_id AND tm.team_id = 2")),
    ).toEqual([]);
    expect(
      clashes(def(["team_id"], "INSERT INTO t (team_id, user_id) VALUES (_team_id, _me)")),
    ).toEqual([]);
    expect(
      clashes(
        def(["team_id"], "#variable_conflict use_column\nSELECT 1 FROM t WHERE team_id = _x"),
      ),
    ).toEqual([]);
    expect(clashes(def(["team_id"], "SELECT 1 FROM t WHERE other_team_id = 1"))).toEqual([]);
    expect(clashes(def([], "SELECT 1 FROM t WHERE team_id = 1"))).toEqual([]);
  });

  it("reads RETURNS TABLE column names, types with parentheses included", () => {
    expect(
      columnsOfReturnsTable("team_id uuid, name text, price numeric(10, 2), at timestamptz"),
    ).toEqual(["team_id", "name", "price", "at"]);
  });

  it("keeps only the latest definition of a function", () => {
    const old =
      "CREATE FUNCTION public.f() RETURNS TABLE(a int) LANGUAGE plpgsql AS $$ BEGIN WHERE a = 1; END; $$;";
    const next =
      "CREATE OR REPLACE FUNCTION public.f() RETURNS TABLE(a int) LANGUAGE plpgsql AS $$ BEGIN WHERE t.a = 1; END; $$;";
    const defs = latestDefinitions([
      { file: "1.sql", sql: old },
      { file: "2.sql", sql: next },
    ]);
    expect(defs).toHaveLength(1);
    expect(defs[0].file).toBe("2.sql");
    expect(clashes(defs[0])).toEqual([]);
  });
});

describe("the migrations", () => {
  const defs = latestDefinitions(files());

  it("finds the functions it is meant to check (not vacuous)", () => {
    const tableFunctions = defs.filter((d) => d.columns.length > 0);
    expect(tableFunctions.length).toBeGreaterThan(20);
    const names = tableFunctions.map((d) => d.name);
    for (const expected of [
      "get_my_team",
      "_join_team_impl",
      "get_weekly_challenges",
      "get_team_mission",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("no function in its latest definition uses one of its own output columns unqualified in a condition", () => {
    const problems = defs.flatMap((d) =>
      clashes(d).map((col) => `${d.name} (${d.file}): unqualified ${col}`),
    );
    expect(problems).toEqual([]);
  });
});
