import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards migration ORDERING, which is a different failure from the duplicate
 * -version check in ci.yml's deno-tests job and is not caught by it.
 *
 * Found live 2026-09-24. A migration versioned 20260924223031 revoked a grant
 * on `podcast_play_events`, a table created by 20260926030000 -- two days
 * LATER in sort order. Migrations run in version order, so:
 *
 *   - On a fresh database (`supabase db reset`, a new environment, any future
 *     CI job that provisions one) it runs first and fails on a table that does
 *     not exist yet.
 *   - On the live database the failure is quieter and worse. The later
 *     migration was already applied, so an earlier-versioned one is out of
 *     order and Supabase may simply skip it. That particular migration was a
 *     security fix revoking a direct INSERT grant -- it would have merged
 *     green, CI would have stayed green, and the grant would still be open.
 *
 * Neither PR-level CI nor the duplicate-version guard can see this: the
 * versions are unique and every test passes. It only surfaces on a fresh
 * database, or silently never.
 *
 * Why this is a test rather than a ci.yml step, unlike the duplicate-version
 * guard: it runs locally in `bun run test`, so a session catches it before
 * pushing rather than after. (A ci.yml edit also silently stops running the
 * job if the YAML breaks -- which happened while adding that other guard.)
 */

const MIGRATIONS_DIR = "supabase/migrations";

type Migration = { version: string; file: string; sql: string };

function loadMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      version: file.split("_")[0]!,
      file,
      sql: readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
    }));
}

/** Strips comments and string literals so they cannot produce phantom matches. */
function stripNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

/** `public.foo` or bare `foo`, normalised to `foo`. */
function bare(name: string): string {
  return name.replace(/^public\./i, "").toLowerCase();
}

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:public\.)?[a-z_][a-z0-9_]*)/gi;

/**
 * Statements that require the table to already exist. ALTER/REVOKE/GRANT are
 * the ones that have actually bitten; CREATE POLICY and CREATE INDEX are the
 * same class and cost nothing to include.
 */
const REFERENCES_TABLE = [
  /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?((?:public\.)?[a-z_][a-z0-9_]*)/gi,
  /revoke\s+[\s\S]{0,120}?\s+on\s+(?:table\s+)?((?:public\.)?[a-z_][a-z0-9_]*)/gi,
  /grant\s+[\s\S]{0,120}?\s+on\s+(?:table\s+)?((?:public\.)?[a-z_][a-z0-9_]*)/gi,
  /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[a-z0-9_]+\s+on\s+((?:public\.)?[a-z_][a-z0-9_]*)/gi,
  /create\s+policy\s+[\s\S]{0,120}?\s+on\s+((?:public\.)?[a-z_][a-z0-9_]*)/gi,
];

describe("migration ordering", () => {
  const migrations = loadMigrations();

  it("finds the migrations (guards against a silently-empty scan)", () => {
    expect(migrations.length).toBeGreaterThan(30);
  });

  it("never references a table before the migration that creates it", () => {
    // version at which each table first exists
    const createdAt = new Map<string, string>();
    for (const m of migrations) {
      const sql = stripNoise(m.sql);
      for (const match of sql.matchAll(CREATE_TABLE)) {
        const table = bare(match[1]!);
        if (!createdAt.has(table)) createdAt.set(table, m.version);
      }
    }

    const violations: string[] = [];
    for (const m of migrations) {
      const sql = stripNoise(m.sql);
      for (const pattern of REFERENCES_TABLE) {
        for (const match of sql.matchAll(pattern)) {
          const table = bare(match[1]!);
          const created = createdAt.get(table);
          // Unknown tables are ignored on purpose: auth.users, extensions,
          // and anything created outside this directory are all legitimate.
          if (created && m.version < created) {
            violations.push(
              `${m.file} references "${table}", created later in ${createdAt.get(table)}_*`,
            );
          }
        }
      }
    }

    expect([...new Set(violations)]).toEqual([]);
  });

  it("has no duplicate versions", () => {
    // Also covered by ci.yml's deno-tests step; duplicated here so the failure
    // is visible in a local `bun run test` too, and because a duplicate makes
    // the ordering check above ambiguous rather than merely wrong.
    const seen = new Map<string, string[]>();
    for (const m of migrations) {
      seen.set(m.version, [...(seen.get(m.version) ?? []), m.file]);
    }
    const dupes = [...seen.entries()].filter(([, files]) => files.length > 1);
    expect(dupes).toEqual([]);
  });
});
