import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261103100100_drop_profiles_active_language.sql"),
  "utf8",
);

describe("profiles.active_language is dropped", () => {
  it("the migration removes the column and keeps the others (real Postgres)", async () => {
    const db = new PGlite();
    await db.exec(
      "CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text, active_language text NOT NULL DEFAULT 'en');",
    );
    await db.exec(migration);
    const cols = (
      await db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'",
      )
    ).rows.map((r) => r.column_name);
    expect(cols).toContain("display_name");
    expect(cols).not.toContain("active_language");
  });

  it("the generated types no longer advertise it, so nothing can start reading it again", () => {
    const types = readFileSync(path.join(root, "src/integrations/supabase/types.ts"), "utf8");
    expect(types).not.toMatch(/active_language/);
  });
});
