import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// "Open reports" on the Numbers screen is count(*) of content_reports with no filter. That is only right while a
// handled report is always deleted and the table has no handled state. This pins that assumption: if a status column
// or an UPDATE-based resolution is ever added, this fails and the count must filter it.
const root = join(__dirname, "..", "..");
const migrations = readdirSync(join(root, "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(root, "supabase", "migrations", f), "utf8"));
const adminFns = readFileSync(join(root, "src", "lib", "admin.functions.ts"), "utf8");

describe("open reports counts every row because handled reports are deleted", () => {
  it("content_reports never gets a status or resolved column", () => {
    for (const sql of migrations) {
      const alters = sql.match(/ALTER TABLE (?:ONLY )?public\.content_reports[^;]*;/gi) ?? [];
      for (const a of alters)
        expect(a).not.toMatch(/ADD COLUMN[^,;]*\b(status|resolved\w*|handled\w*|closed\w*)\b/i);
    }
  });
  it("no staff action updates a report; the only write is the delete in resolveReport and staff_dismiss_report", () => {
    expect(adminFns).not.toMatch(/from\("content_reports"\)\s*\.update\(/);
    expect(adminFns).toMatch(/from\("content_reports"\)\.delete\(/);
    const staff = migrations.join("\n");
    expect(staff).not.toMatch(/UPDATE public\.content_reports\s+SET\s+(status|resolved)/i);
    expect(staff).toMatch(/DELETE FROM public\.content_reports WHERE id = p_report/);
  });
  it("the Numbers count is unfiltered, as that assumption requires", () => {
    const growth = readFileSync(
      join(root, "supabase", "migrations", "20261127130000_admin_numbers_growth.sql"),
      "utf8",
    );
    expect(growth).toMatch(/'openReports', \(SELECT count\(\*\) FROM public\.content_reports\)/);
  });
});
