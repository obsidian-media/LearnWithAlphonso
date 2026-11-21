import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "20261127120000_seed_mona_new_city_fr_es_stories.sql";
const sql = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");

type Ending = { id: string; title: string; quality: string; wrap: string };
type Node = {
  art?: string;
  segments: string[];
  next?: string;
  choice?: { options?: { goto: string }[] } | { goto: string }[];
  ending?: Ending;
};
interface Row {
  course: string;
  slug: string;
  title: string;
  sortOrder: number;
  level: string;
  conflictClause: boolean;
  nodes: { start: string; map: Record<string, Node> };
}

const rows: Row[] = [...sql.matchAll(/INSERT INTO public\.stories[\s\S]*?ON CONFLICT[^;]*;/g)].map(
  (m) => {
    const block = m[0];
    const head = /SELECT '(fr|es)', l\.id, '([^']+)', '((?:[^']|'')+)'/.exec(block)!;
    const nodes = JSON.parse(/\$nodes\$\n([\s\S]*?)\n\$nodes\$/.exec(block)![1]);
    const sort = /\$nodes\$::jsonb, (\d+), false, false, NULL/.exec(block)!;
    return {
      course: head[1],
      slug: head[2],
      title: head[3].replace(/''/g, "'"),
      sortOrder: Number(sort[1]),
      level: /l\.id = '([^']+)'/.exec(block)![1],
      conflictClause: /ON CONFLICT \(course, slug\) DO NOTHING;$/.test(block),
      nodes,
    };
  },
);

function gotos(node: Node): string[] {
  const out: string[] = [];
  if (node.next) out.push(node.next);
  const c = node.choice as unknown;
  const opts = Array.isArray(c) ? c : ((c as { options?: unknown[] } | undefined)?.options ?? []);
  for (const o of opts as { goto: string }[]) out.push(o.goto);
  return out;
}

describe("Mona's New City FR/ES seed", () => {
  it("seeds 12 fr and 12 es stories, hidden, sort_order 101-112, with unique (course, slug)", () => {
    expect(rows).toHaveLength(24);
    for (const course of ["fr", "es"]) {
      const mine = rows.filter((r) => r.course === course);
      expect(mine.map((r) => r.sortOrder)).toEqual([...Array(12).keys()].map((i) => 101 + i));
    }
    expect(new Set(rows.map((r) => `${r.course}/${r.slug}`)).size).toBe(24);
    // Hidden: every INSERT hard-codes published=false/NULL, and nothing in real SQL publishes.
    const code = sql.replace(/--[^\n]*/g, "");
    expect(code).not.toMatch(/published\s*=\s*true/i);
    expect((code.match(/false, false, NULL/g) ?? []).length).toBe(24);
  });

  it("is idempotent per INSERT and joins each story to its level (A1 01-03, A2 04-06, B1 07-09, B2 10-12)", () => {
    const levels = ["A1", "A2", "B1", "B2"];
    for (const r of rows) {
      expect(r.conflictClause, `${r.course}/${r.slug} ON CONFLICT (course, slug) DO NOTHING`).toBe(
        true,
      );
      expect(r.level, `${r.course}/${r.slug} level`).toBe(
        levels[Math.floor((r.sortOrder - 101) / 3)],
      );
    }
    expect((sql.match(/ON CONFLICT \(course, slug\) DO NOTHING;/g) ?? []).length).toBe(24);
  });

  it("every goto resolves, every node is reachable, and the start exists", () => {
    for (const r of rows) {
      const map = r.nodes.map;
      expect(map[r.nodes.start], `${r.course}/${r.slug} start`).toBeDefined();
      const seen = new Set<string>();
      const stack = [r.nodes.start];
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const g of gotos(map[id])) {
          expect(map[g], `${r.course}/${r.slug}: ${id} -> ${g}`).toBeDefined();
          stack.push(g);
        }
      }
      expect([...seen].sort(), `${r.course}/${r.slug} unreachable nodes`).toEqual(
        Object.keys(map).sort(),
      );
    }
  });

  it("has good, ok and lesser endings in every story", () => {
    for (const r of rows) {
      const q = new Set(
        Object.values(r.nodes.map)
          .filter((n) => n.ending)
          .map((n) => n.ending!.quality),
      );
      expect([...q].sort(), `${r.course}/${r.slug}`).toEqual(["good", "lesser", "ok"]);
    }
  });

  it("keeps the English art keys (no copies) and never says Maya", () => {
    for (const r of rows) {
      for (const n of Object.values(r.nodes.map)) {
        if (n.art) expect(n.art).toMatch(new RegExp(`^en/${r.slug}/[a-z0-9-]+.jpg$`));
      }
    }
    expect(sql).not.toMatch(/Maya/);
    expect(sql).not.toContain("——");
  });

  it("uses the approved dog names", () => {
    const text = (course: string) =>
      JSON.stringify(rows.filter((r) => r.course === course).map((r) => r.nodes));
    expect(text("fr")).toContain("Biscuit");
    expect(text("fr")).not.toContain("Galleta");
    expect(text("es")).toContain("Galleta");
    expect(text("es")).not.toContain("Biscuit");
  });

  it("keeps titles within the longest existing story title", () => {
    expect(Math.max(...rows.map((r) => r.title.length))).toBeLessThanOrEqual(28);
  });
});
