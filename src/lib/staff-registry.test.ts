import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONSOLE_FUNCTIONS, STAFF_READ_FUNCTIONS } from "./console-registry";
import { REPORT_WRITE_FUNCTIONS, STAFF_WRITE_FUNCTIONS } from "./staff-audit.server";

/**
 * The one thing standing between this console and an endpoint that forgot its gate or its record. It reads the source
 * (TanStack does not expose a function's middleware chain at runtime) with comments stripped, so prose that
 * mentions requireStaff cannot satisfy it.
 */
const LIB = "src/lib";
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (file: string) => strip(readFileSync(path.join(LIB, file), "utf8"));
const declared = (src: string) =>
  [...src.matchAll(/export const (\w+) = createServerFn\(/g)].map((m) => m[1]!);
const staffFiles = readdirSync(LIB).filter((f) => /^staff-.*\.functions\.ts$/.test(f));
const consoleFiles = [...new Set([...Object.keys(CONSOLE_FUNCTIONS), ...staffFiles])];

describe("the registry of console server functions", () => {
  it("lists every staff-*.functions.ts file (a new file must be registered)", () => {
    expect(staffFiles.length).toBeGreaterThan(0); // guards the guard
    expect(staffFiles.filter((f) => !(f in CONSOLE_FUNCTIONS))).toEqual([]);
    for (const f of Object.keys(CONSOLE_FUNCTIONS)) expect(readdirSync(LIB)).toContain(f);
  });

  it("lists exactly the server functions each file declares, in both directions", () => {
    for (const file of consoleFiles) {
      const names = declared(read(file)).sort();
      expect(names.length, `${file} declares at least one`).toBeGreaterThan(0);
      expect([...(CONSOLE_FUNCTIONS[file] ?? [])].sort(), file).toEqual(names);
    }
  });

  it("gates every server function with requireStaff(...)", () => {
    for (const file of consoleFiles) {
      const src = read(file);
      const gated = src.match(/\.middleware\(\[requireStaff\(/g)?.length ?? 0;
      expect(gated, `${file}: one requireStaff per createServerFn`).toBe(declared(src).length);
      expect(src, `${file} must not gate with the old or bare middleware`).not.toMatch(
        /requireAdmin|\.middleware\(\[requireSupabaseAuth\]\)/,
      );
    }
  });

  it("every staff function is either a read or a recorded write, never both, never neither", () => {
    const all = staffFiles.flatMap((f) => declared(read(f))).sort();
    const reads = [...STAFF_READ_FUNCTIONS] as string[];
    const writes = [...STAFF_WRITE_FUNCTIONS] as string[];
    expect(reads.filter((n) => writes.includes(n))).toEqual([]);
    expect([...reads, ...writes].sort()).toEqual(all);
  });

  it("every write function records its action (recordStaffAction or a staff_* SQL function)", () => {
    const sources = staffFiles.map((f) => read(f)).join("\n");
    for (const name of STAFF_WRITE_FUNCTIONS) {
      const start = sources.indexOf(`export const ${name} =`);
      expect(start, `${name} exists`).toBeGreaterThan(-1);
      const next = sources.indexOf("\nexport const ", start + 1);
      const body = sources.slice(start, next === -1 ? undefined : next);
      expect(body, `${name} must record what it did`).toMatch(
        /recordStaffAction|rpc\(\s*"staff_|applyRestriction/,
      );
    }
    // applyRestriction (block, unblock, ban, unban) is the helper that reaches the SQL functions that record.
    const helper = sources.slice(sources.indexOf("async function applyRestriction"));
    expect(helper).toContain("staff_set_restriction");
    expect(helper).toContain("staff_lift_restriction");
  });

  it("every report action (admin.functions.ts) records itself through a staff_* SQL function", () => {
    const src = read("admin.functions.ts");
    expect(REPORT_WRITE_FUNCTIONS.length).toBe(4);
    for (const name of REPORT_WRITE_FUNCTIONS) {
      const start = src.indexOf(`export const ${name} =`);
      expect(start, `${name} exists`).toBeGreaterThan(-1);
      const next = src.indexOf("\nexport const ", start + 1);
      const body = src.slice(start, next === -1 ? undefined : next);
      expect(body, `${name} must record what it did`).toMatch(/rpc\(\s*"staff_/);
      expect(body, `${name} must not change data outside the recording function`).not.toMatch(
        /\.from\("teams"\)|\.delete\(|admin_(reset_display_name|rename_team)/,
      );
      expect(body, `${name} passes its actor and role`).toMatch(/p_actor: context\.userId/);
      expect(body).toMatch(/p_role: context\.staffRole/);
    }
    // The registry must name every moderation action admin.functions.ts declares with reports.manage.
    const gated = src
      .split(/\r?\n(?=export const )/)
      .filter((block) => /^export const \w+ = createServerFn/.test(block))
      .filter((block) => block.includes('requireStaff("reports.manage")'))
      .map((block) => /^export const (\w+)/.exec(block)![1]!)
      .filter((n) => n !== "adminListReports")
      .sort();
    expect([...REPORT_WRITE_FUNCTIONS].sort()).toEqual(gated);
  });

  it("every staff_* SQL function the console calls exists in a migration", () => {
    const sql = readdirSync("supabase/migrations")
      .map((f) => readFileSync(path.join("supabase/migrations", f), "utf8"))
      .join("\n");
    const defined = new Set(
      [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(staff_\w+)/g)].map((m) => m[1]!),
    );
    const source = [...staffFiles, "admin.functions.ts"].map((f) => read(f)).join("\n");
    const called = new Set(
      [...source.matchAll(/["'](staff_[a-z_]+)["']/g)]
        .map((m) => m[1]!)
        .filter((n) => !n.startsWith("staff_audit_log")),
    );
    // staff_roles, staff_notes and the like are tables, not functions.
    const missing = [...called].filter(
      (n) => !defined.has(n) && !/^staff_(roles|notes|audit_log)$/.test(n),
    );
    expect(missing).toEqual([]);
  });
});
