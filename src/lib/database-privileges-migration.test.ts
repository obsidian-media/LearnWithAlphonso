import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006120000_tighten_default_table_privileges.sql";

/** BACKLOG 0.0-ae, docs/database-privileges.md. The SQL with comments removed, so a comment cannot satisfy a check. */
describe("tighten default table privileges migration", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
  const code = () => sql().replace(/--[^\n]*/g, "");

  it("runs after the learning_goals migrations it follows", () => {
    expect(FILE.slice(0, 14) > "20261006110000").toBe(true);
  });

  it("takes every write privilege away from anon on every table, plus TRUNCATE, TRIGGER and REFERENCES", () => {
    expect(code()).toMatch(
      /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE,\s*TRUNCATE,\s*TRIGGER,\s*REFERENCES\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+anon\s*;/i,
    );
  });

  it("takes TRUNCATE, TRIGGER and REFERENCES away from authenticated on every table", () => {
    expect(code()).toMatch(
      /REVOKE\s+TRUNCATE,\s*TRIGGER,\s*REFERENCES\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+authenticated\s*;/i,
    );
  });

  it("makes future tables created by postgres start with nothing for anon and authenticated", () => {
    expect(code()).toMatch(
      /ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+postgres\s+IN\s+SCHEMA\s+public\s+REVOKE\s+ALL\s+ON\s+TABLES\s+FROM\s+anon\s*,\s*authenticated\s*;/i,
    );
  });

  it("never revokes SELECT (reads keep behaving exactly as before)", () => {
    for (const statement of code()
      .split(";")
      .filter((s) => /REVOKE/i.test(s))) {
      expect(statement, statement).not.toMatch(/\bSELECT\b/i);
      expect(statement, statement).not.toMatch(/\bALL\s+PRIVILEGES\b/i);
    }
  });

  it("leaves authenticated's INSERT, UPDATE and DELETE alone (deleteMyAccount deletes as the caller)", () => {
    const authRevokes = code()
      .split(";")
      .filter(
        (s) =>
          /REVOKE/i.test(s) &&
          /FROM\s+authenticated\b/i.test(s) &&
          !/DEFAULT\s+PRIVILEGES/i.test(s),
      );
    expect(authRevokes).toHaveLength(1);
    for (const s of authRevokes) expect(s).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });

  it("never touches service_role, which the server routes and Edge Functions depend on", () => {
    expect(code()).not.toMatch(/service_role/i);
  });

  it("grants nothing (it only removes), so it can never widen access", () => {
    expect(code()).not.toMatch(/\bGRANT\b/i);
  });

  it("states how to undo it", () => {
    expect(sql()).toMatch(/ROLLBACK/i);
  });
});
