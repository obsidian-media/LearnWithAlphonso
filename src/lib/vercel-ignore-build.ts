/**
 * Which Vercel builds are worth running. Both Vercel projects (web, admin) build from this repo's root and used to
 * build every push to every branch; nobody opens the previews (PR checks run in GitHub Actions, production is
 * promoted by scripts/promote-vercel.ts), so that was pure Build CPU cost.
 *
 * scripts/vercel-ignore-build.sh is the script Vercel runs (vercel.json `ignoreCommand`). It is plain sh and carries
 * the same list as SKIP_PREFIXES below; vercel-ignore-build.test.ts keeps the two equal and runs the script itself.
 *
 * Why each entry is safe to skip: neither vite.config.ts nor vite.admin.config.ts, nor any file the web or admin
 * bundle imports, reads these paths. They are consumed by Xcode, Gradle, GitHub Actions, the Supabase CLI or people.
 * (Some unit tests import supabase/functions/_shared, but tests run in GitHub Actions, never in the Vercel build.)
 * NOT listed on purpose: src/, admin/, shared/, public/, e2e/, scripts/, design/, assets/, package.json, bun.lock,
 * vite and tsconfig files, vercel.json and the rest of supabase/ (config.toml and so on).
 */
export const SKIP_PREFIXES: readonly string[] = [
  "ios/",
  "android/",
  "docs/",
  ".github/",
  ".claude/",
  "supabase/migrations/",
  "supabase/functions/",
];

export type BuildDecision = { build: boolean; reason: string };

/** A root-level markdown file (README.md, CHANGELOG.md ...). Nothing in the build imports them. */
function isRootMarkdown(file: string): boolean {
  return !file.includes("/") && file.endsWith(".md");
}

export function isSkippablePath(file: string): boolean {
  return isRootMarkdown(file) || SKIP_PREFIXES.some((p) => file.startsWith(p));
}

/**
 * `env` is VERCEL_ENV. `changedFiles` is the file list changed since the last built commit, or null/empty when it is
 * unknown (no previous commit, git diff failed). Unknown always builds.
 */
export function shouldBuild(input: {
  env: string | undefined;
  changedFiles: readonly string[] | null | undefined;
}): BuildDecision {
  const { env, changedFiles } = input;
  if (env !== "production") {
    return { build: false, reason: `VERCEL_ENV=${env ?? "unset"} is not production` };
  }
  if (!changedFiles || changedFiles.length === 0) {
    return { build: true, reason: "the changed files are unknown, so production builds" };
  }
  const used = changedFiles.find((f) => !isSkippablePath(f));
  if (used !== undefined) {
    return { build: true, reason: `${used} is used by the web or admin build` };
  }
  return { build: false, reason: "only native, docs, CI and database files changed" };
}
