/**
 * Fails when a pull request ADDS a migration whose version is not newer than every migration already on the base
 * branch.
 *
 * Supabase applies migrations in version order and records each version it applied. If main already ran
 * 20261124100000 and a PR then merges 20261122000000, `supabase db push` on main refuses ("Found local migration
 * files to be inserted before the last migration on remote database") and the deploy job goes red after the merge,
 * attributed to whichever PR landed second. This happens when two sessions write migrations in parallel and the one
 * with the older timestamp merges later. The fix is to renumber the new migration to a version after base's newest.
 *
 * Usage (CI, pull_request only): bun scripts/check-migration-order.ts <base-sha>
 * Compares the files added between <base-sha> and HEAD under supabase/migrations against the newest version that
 * exists at <base-sha>.
 */
import { execFileSync } from "node:child_process";

export const MIGRATIONS_DIR = "supabase/migrations";

/** The leading digits of a migration file name, or null for a file that is not a versioned migration. */
export function migrationVersion(filePath: string): bigint | null {
  const name = filePath.split(/[\\/]/).pop() ?? "";
  const m = /^(\d+)_.*\.sql$/.exec(name);
  return m ? BigInt(m[1]) : null;
}

export function newestVersion(files: readonly string[]): bigint | null {
  let newest: bigint | null = null;
  for (const f of files) {
    const v = migrationVersion(f);
    if (v !== null && (newest === null || v > newest)) newest = v;
  }
  return newest;
}

export type OrderViolation = { file: string; version: bigint; baseNewest: bigint };

/** Added migrations whose version is less than or equal to the newest version on base. */
export function outOfOrderMigrations(
  baseFiles: readonly string[],
  addedFiles: readonly string[],
): OrderViolation[] {
  const baseNewest = newestVersion(baseFiles);
  if (baseNewest === null) return [];
  const out: OrderViolation[] = [];
  for (const file of addedFiles) {
    const version = migrationVersion(file);
    if (version !== null && version <= baseNewest) out.push({ file, version, baseNewest });
  }
  return out;
}

function git(args: string[]): string[] {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

if (import.meta.main) {
  const base = process.argv[2];
  if (!base) {
    console.error("usage: bun scripts/check-migration-order.ts <base-sha>");
    process.exit(2);
  }
  const baseFiles = git(["ls-tree", "--name-only", base, `${MIGRATIONS_DIR}/`]);
  // --no-renames: a renamed migration counts as added under its new name, so renaming to an old version is caught.
  const added = git([
    "diff",
    "--name-only",
    "--no-renames",
    "--diff-filter=A",
    base,
    "HEAD",
    "--",
    `${MIGRATIONS_DIR}/`,
  ]);
  if (baseFiles.length === 0) {
    console.error(`::error::No migrations found at ${base}; is the base commit fetched?`);
    process.exit(2);
  }
  const bad = outOfOrderMigrations(baseFiles, added);
  console.log(
    `Base newest migration version: ${newestVersion(baseFiles)}; added in this PR: ${added.length ? added.join(", ") : "none"}`,
  );
  if (bad.length > 0) {
    for (const b of bad) {
      console.error(
        `::error file=${b.file}::Migration version ${b.version} is not after the base branch's newest (${b.baseNewest}). ` +
          "supabase db push refuses to apply a migration older than one already applied. Renumber this file to a later version.",
      );
    }
    process.exit(1);
  }
  console.log("Every added migration is newer than the base branch's newest.");
}
