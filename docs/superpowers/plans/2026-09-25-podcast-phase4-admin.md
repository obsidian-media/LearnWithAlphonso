# Podcast Phase 4 — Admin Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The account owner publishes and maintains the podcast library from a browser, in a separately-deployed admin app whose write access is gated by a server-only allowlist.

**Architecture:** A second TanStack Start build from the same repo (`tanstackStart({ router: { routesDirectory, generatedRouteTree } })` — verified against the installed `@tanstack/start-plugin-core` schema, both keys exist) pointed at `admin/routes/` instead of `src/routes/`, so no admin route can reach the learner bundle. Authorization is an `admin_users` table with RLS enabled and **zero client policies**, readable only by the service role, checked by a `requireAdmin` middleware that every admin server function carries. All validation reuses the tested pure functions in `src/lib/` that `scripts/podcast-tool.ts` already uses, so the CLI and the UI cannot drift.

**Tech Stack:** TanStack Start (SSR) + React 19 + Vite + Nitro, TanStack Router file-based routing, Supabase (PostgREST, RLS, Storage), Zod, Vitest, Bun as runner and TS script executor (`tsx` is NOT installed).

**Spec:** `docs/superpowers/specs/2026-09-25-podcast-phase4-admin-design.md`

## Correction to the spec, carried into this plan

The spec says the admin app gets "its own cookie name". **This repo does not use cookies for API auth.** `src/integrations/supabase/auth-middleware.ts` reads a `Bearer` token from the `Authorization` header, and the client holds the Supabase session in browser storage. A separate origin therefore has separate storage and a separate session **by construction** — there is no cookie to name, and nothing to configure. Task 3 relies on that fact rather than implementing session separation.

## What the self-critique changed

Seven defects, all found by checking the plan's claims against the code rather than re-reading the plan. Recorded because five of them are mistakes the next plan against this codebase would make again.

1. **Every theme class name was invented.** The plan used `bg-canopy-surface`, `text-canopy-ink`, `border-canopy-line`. `src/styles.css` defines `--color-surface`, `--color-ink`, `--color-ink-soft`, `--color-moss`, `--color-ember`, `--color-hairline`, which Tailwind v4 exposes **with no prefix**: `bg-surface`, `text-ink`, `border-hairline`. "Use Canopy tokens" was in the constraints and the plan still got them wrong, because knowing a rule is not knowing the names.
2. **`@/index.css` does not exist.** It is `src/styles.css`, imported `?url` and registered in `head.links` — the learner root does it that way.
3. **`Route.useRouter()` is not an API.** `useRouter()` is a hook from `@tanstack/react-router`. It appeared in three tasks.
4. **The delete-refusal rationale was false.** The plan said the schema cascades episodes from folders. Both `podcast_folders.parent_id` and `podcast_episodes.folder_id` are `ON DELETE RESTRICT` (verified in `20260926030000`). The refusal is still worth having as a message, but a comment that invents a reason is worse than one that gives none, because it will be believed.
5. **The upload path could not have worked.** Base64 in a server-function body inflates by a third against a serverless cap of roughly 4.5 MB — an ordinary 3 MB episode would have failed at the platform. Rewritten to a signed URL straight to Storage with server-side verification afterwards, which also forced the honest question of what to do about an object that is already written when it fails: delete it.
6. **The spec's central security claim had no test.** The spec named "`admin_users` is unreadable with an authenticated client" as the one test proving the design and the one most likely to be written as a test that cannot fail — and the plan had no task for it. Added as Task 2 Step 13, with the skip made loud rather than silent.
7. **Task 3 contained a workaround instead of an instruction.** A step said "if the typed `Link` errors, do one of two things" — that is a plan admitting it does not know, which is a placeholder wearing prose. Replaced with the plain anchor and its conversion pinned to Task 4 Step 5.

## Global Constraints

- **Canopy theme tokens, never fixed colours.** The real class names, verified in `src/styles.css`: `bg-surface`, `text-ink`, `text-ink-soft`, `bg-moss`, `text-moss`, `text-ember`, `border-hairline`. There is **no** `canopy-` prefix. No hex literals in new components.
- **Migration version must sort above `20260927230000`** (transcripts), which is itself above the two Phase 1a migrations. Wall-clock "now" does not sort correctly: the library migration was renumbered forward out of a collision, so the file series runs ahead of the calendar. Use `20260928010000`.
- **Secrets:** any secret resolves at runtime via `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with `asm-exec`. Never call `secretsmanager get-secret-value`, never hit the Secrets Manager Agent daemon.
- **`SUPABASE_SERVICE_ROLE_KEY` is set on the admin Vercel project only.** The learner project already has it for its own server functions; do not add it anywhere new.
- **Validation logic lives in `src/lib/`, tested, and is called by both the CLI and the admin app.** A rule that exists only in a form handler is a rule the CLI does not enforce.
- **Nothing in `admin/` may be imported from `src/routes/`,** and nothing in `src/routes/` may import from `admin/`.
- **The bucket is public-read.** Unpublished means "not listed", never "private". No admin copy may call it private.
- **Measure the suite baseline before starting** (`bunx vitest run` and record files/tests; it was 137 files / 1,189 tests as of #116, and other sessions are adding tests). Run chunked and reconcile against the collected file count — a starved run on this machine reports green while silently dropping files (see `docs` note on `maxWorkers`).

## Review Focus

Five failure modes the spec implies but no task's own happy-path tests would exercise. Each has its test pinned to the task that owns the code.

1. **An authenticated learner calls an admin server function directly.** They have a valid Bearer token; only the allowlist stands between them and writing the library. Expect: rejected, with a response that does not reveal whether the function exists. *(Task 2)*
2. **An admin server function is added later without the middleware.** The failure mode of this whole design is one endpoint that forgot. Expect: a test that enumerates admin server functions fails until the new one is gated. *(Task 2)*
3. **A file whose extension says `.mp3` but whose bytes are not audio.** Extension-trusting upload is how a bucket serves an HTML file from your domain. Expect: rejected on sniffed content, regardless of name. *(Task 6)*
4. **Re-parenting a folder under its own descendant.** The UI makes this two clicks; the CLI made it a typo. Expect: refused, naming the cycle. *(Task 4)*
5. **A transcript pasted from the TTS script, carrying SSML.** Both boxes are on one admin screen, which is where this mistake is easiest to make. Expect: rejected, not stripped — the same rule `--transcript` enforces. *(Task 7)*

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260928010000_admin_users.sql` | The allowlist table: RLS on, zero client policies, service-role grant only |
| `src/lib/admin-auth.ts` | `isAdminUser(client, userId)` — the one authorization decision, pure enough to test with an injected client |
| `src/lib/admin-auth.test.ts` | Its tests, including the mutation-tested refusals |
| `src/lib/admin-middleware.ts` | `requireAdmin` — `createMiddleware` wrapping `requireSupabaseAuth` + `isAdminUser` |
| `src/lib/admin-upload.ts` | `sniffAudioType(bytes)`, `validateUpload(...)` — content-based MIME detection and the size cap |
| `src/lib/admin-upload.test.ts` | Its tests |
| `src/lib/admin.functions.ts` | Every admin server function. One file so the enumeration test in Task 2 has one thing to enumerate |
| `src/lib/admin.functions.test.ts` | The enumeration test and the handler tests |
| `admin/routes/__root.tsx` | Admin shell |
| `admin/routes/index.tsx` | Library overview |
| `admin/routes/signin.tsx` | Admin sign-in |
| `admin/routes/folders.tsx` | Folder management |
| `admin/routes/episode.$id.tsx` | One episode: metadata, audio, transcript |
| `vite.admin.config.ts` | The second build |
| `src/lib/admin-route-isolation.test.ts` | Asserts no admin route reaches the learner route tree |

**Modified:** `package.json` (scripts), `.github/workflows/ci.yml` (admin build job), `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`.

---

### Task 1: The second build target

**Files:**
- Create: `vite.admin.config.ts`, `admin/routes/__root.tsx`, `admin/routes/index.tsx`, `src/lib/admin-route-isolation.test.ts`
- Modify: `package.json` (scripts), `.gitignore` (generated admin route tree)

**Interfaces:**
- Consumes: nothing.
- Produces: an admin app that builds and serves at `/`, with `admin/routeTree.gen.ts` generated. Later tasks add routes under `admin/routes/`.

- [ ] **Step 1: Write the failing isolation test**

```ts
// src/lib/admin-route-isolation.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

// The failure mode this guards is a build misconfiguration, not a typo:
// if vite.admin.config.ts loses its routesDirectory override, the admin
// app silently becomes a second copy of the learner app, and -- worse --
// an admin route added under src/routes/ by mistake ships to every
// learner. Both directions are checked because both have happened in
// other codebases and neither is visible in review.
describe("admin routes are isolated from the learner bundle", () => {
  it("the learner route tree contains no admin route", () => {
    const tree = readFileSync("src/routeTree.gen.ts", "utf8");
    expect(tree).not.toMatch(/\badmin\b/i);
  });

  it("the admin app has its own routes directory", () => {
    expect(existsSync("admin/routes/__root.tsx")).toBe(true);
  });

  it("the admin vite config overrides routesDirectory and generatedRouteTree", () => {
    const config = readFileSync("vite.admin.config.ts", "utf8");
    expect(config).toContain("routesDirectory");
    expect(config).toContain("generatedRouteTree");
    expect(config).toContain("admin/routes");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/lib/admin-route-isolation.test.ts`
Expected: FAIL — `ENOENT` on `vite.admin.config.ts` (the third case), and the second case false.

- [ ] **Step 3: Create the admin config**

```ts
// vite.admin.config.ts
// The admin app: same repo, same src/lib, entirely separate routes and
// build output. Option names verified against the installed
// @tanstack/start-plugin-core schema -- `router.routesDirectory` and
// `router.generatedRouteTree` are both real, typed keys, not a guess.
import { defineConfig, mergeConfig, type UserConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(async ({ command }) => {
  const isBuild = command === "build";
  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      router: {
        routesDirectory: "admin/routes",
        generatedRouteTree: "admin/routeTree.gen.ts",
      },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ];
  if (isBuild) {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({}));
  }
  const config: UserConfig = {
    css: { transformer: "lightningcss" },
    resolve: { alias: { "@": `${process.cwd()}/src` } },
    server: { host: "::", port: 8081 },
    build: { outDir: "dist-admin" },
    plugins,
  };
  return mergeConfig(config, {});
});
```

- [ ] **Step 4: Create the admin shell**

```tsx
// admin/routes/__root.tsx
import { createRootRoute, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
// The learner root imports the stylesheet the same way -- as a URL
// registered in head.links, not as a side-effect import. There is no
// src/index.css in this repo.
import appCss from "@/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: "stylesheet", href: appCss }],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Alphonso Admin" },
      // Keeps the admin app out of search results. Not a security
      // control -- the allowlist is -- but an admin login page in a
      // search index invites traffic that has no business here.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <html lang="en">
      <head><HeadContent /></head>
      <body className="bg-surface text-ink">
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
```

```tsx
// admin/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Alphonso Admin</h1>
      <p className="mt-2 text-ink-soft">Podcast library management.</p>
    </main>
  ),
});
```

- [ ] **Step 5: Add the scripts and ignore the generated tree**

```jsonc
// package.json "scripts" — add these three, leave the rest untouched
"dev:admin": "vite dev --config vite.admin.config.ts",
"build:admin": "vite build --config vite.admin.config.ts",
"preview:admin": "vite preview --config vite.admin.config.ts"
```

Append to `.gitignore`:

```
admin/routeTree.gen.ts
dist-admin/
```

- [ ] **Step 6: Run the build to prove the config is real**

Run: `bun run build:admin`
Expected: a successful build writing `dist-admin/`, and `admin/routeTree.gen.ts` created containing the `/` route and **not** any route from `src/routes/`.

If the build fails on an unknown option, the schema keys have moved: read `node_modules/@tanstack/start-plugin-core/dist/esm/schema.d.ts` and use the keys it actually declares. Do not guess a second time.

- [ ] **Step 7: Run the isolation test to verify it passes**

Run: `bunx vitest run src/lib/admin-route-isolation.test.ts`
Expected: PASS 3/3.

- [ ] **Step 8: Add the CI job**

In `.github/workflows/ci.yml`, after the `lint-and-typecheck` job, add:

```yaml
  admin-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.10"
      - name: Install dependencies
        run: bun install --frozen-lockfile
      # The admin app is a second build from the same repo. Nothing else
      # in CI compiles it, so without this job a broken admin route is
      # invisible until deploy.
      - name: Build admin app
        run: bun run build:admin
```

- [ ] **Step 9: Commit**

```bash
git add vite.admin.config.ts admin/ package.json .gitignore .github/workflows/ci.yml src/lib/admin-route-isolation.test.ts
git commit -m "feat(admin): second build target for the admin app

Separate routesDirectory and generatedRouteTree, so no admin route can
reach the learner bundle. A test checks both directions, because a lost
routesDirectory override silently turns the admin app into a copy of the
learner app and is invisible in review."
```

---

### Task 2: The allowlist and `requireAdmin`

**Files:**
- Create: `supabase/migrations/20260928010000_admin_users.sql`, `src/lib/admin-auth.ts`, `src/lib/admin-auth.test.ts`, `src/lib/admin-middleware.ts`, `src/lib/admin.functions.ts`, `src/lib/admin.functions.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `isAdminUser(client: SupabaseClient, userId: string): Promise<boolean>`
  - `requireAdmin` — a TanStack middleware providing `{ supabase, supabaseAdmin, userId }` in context
  - `ADMIN_FUNCTION_NAMES: readonly string[]` exported from `admin.functions.ts`, the list the enumeration test checks

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260928010000_admin_users.sql
-- The podcast admin allowlist (Phase 4, see
-- docs/superpowers/specs/2026-09-25-podcast-phase4-admin-design.md).
--
-- RLS is enabled with ZERO policies, deliberately. A table with RLS on
-- and no policy is readable by nobody except service_role, which bypasses
-- RLS. That is the point: an allowlist the guarded application can read
-- is an allowlist an attacker can enumerate, and one it can write is not
-- an allowlist at all.
--
-- The first row is inserted BY HAND in the Supabase SQL editor. There is
-- deliberately no bootstrap endpoint, no seed, and no environment
-- variable naming an email: every self-bootstrapping admin mechanism is
-- an authentication bypass waiting for a misconfiguration.
CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES auth.users(id),
  note text
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_users FROM anon, authenticated;
GRANT ALL ON public.admin_users TO service_role;
```

- [ ] **Step 2: Write the failing tests for `isAdminUser`**

```ts
// src/lib/admin-auth.test.ts
import { describe, expect, it, vi } from "vitest";
import { isAdminUser } from "./admin-auth";

/** Minimal PostgREST-shaped stub: .from().select().eq().maybeSingle() */
function clientReturning(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return { from: vi.fn(() => chain), chain } as never;
}

describe("isAdminUser", () => {
  it("is true for a user present in admin_users", async () => {
    const client = clientReturning({ data: { user_id: "u1" }, error: null });
    expect(await isAdminUser(client, "u1")).toBe(true);
  });

  it("is false for a user absent from admin_users", async () => {
    // The ordinary case: every learner in the product hits this branch.
    const client = clientReturning({ data: null, error: null });
    expect(await isAdminUser(client, "u2")).toBe(false);
  });

  it("is false when the query errors", async () => {
    // Fail closed. An unreachable database must not mean "everyone is an
    // admin"; a transient PostgREST error is exactly when an attacker
    // would like the opposite.
    const client = clientReturning({ data: null, error: { message: "boom" } });
    expect(await isAdminUser(client, "u1")).toBe(false);
  });

  it("is false for an empty user id without querying at all", async () => {
    // An empty subject claim must never match a row, and must not reach
    // the database where a permissive filter could return the first row.
    const client = clientReturning({ data: { user_id: "anyone" }, error: null });
    expect(await isAdminUser(client, "")).toBe(false);
    expect((client as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bunx vitest run src/lib/admin-auth.test.ts`
Expected: FAIL — `Failed to resolve import "./admin-auth"`.

- [ ] **Step 4: Implement `isAdminUser`**

```ts
// src/lib/admin-auth.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one authorization decision in the admin subsystem.
 *
 * MUST be called with a service-role client: `admin_users` has RLS
 * enabled and no policies, so a user's own token reads nothing from it
 * and this would return false for a real admin.
 *
 * Fails closed on every uncertainty -- absent row, query error, empty
 * subject. An admin check that says "yes" when it does not know is not a
 * check.
 */
export async function isAdminUser(client: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await client
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return data != null;
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `bunx vitest run src/lib/admin-auth.test.ts`
Expected: PASS 4/4.

- [ ] **Step 6: Mutation-test the guard on the right axis**

Temporarily change `if (error) return false;` to `if (error) return true;`.
Run: `bunx vitest run src/lib/admin-auth.test.ts`
Expected: FAIL on "is false when the query errors".

Then temporarily change `if (!userId) return false;` to `if (!userId) return true;`.
Expected: FAIL on "is false for an empty user id".

**Revert both.** If either mutation stays green, the test is checking something other than the property it claims, and the test is the defect.

- [ ] **Step 7: Write the middleware**

```ts
// src/lib/admin-middleware.ts
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminUser } from "./admin-auth";

/**
 * Gate for every admin server function.
 *
 * Chains onto requireSupabaseAuth (which validates the Bearer token and
 * yields userId) and then checks the allowlist with the SERVICE-ROLE
 * client, because admin_users is unreadable with the caller's own token
 * by design.
 *
 * The thrown message is deliberately identical to an ordinary auth
 * failure and names nothing: a distinct "you are not an admin" tells an
 * attacker that the endpoint exists and that their token was otherwise
 * valid.
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!(await isAdminUser(supabaseAdmin, context.userId))) {
      throw new Error("Unauthorized");
    }
    return next({ context: { ...context, supabaseAdmin } });
  });
```

- [ ] **Step 8: Write the failing enumeration test**

```ts
// src/lib/admin.functions.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as adminFunctions from "./admin.functions";

// Review Focus #2. The failure mode of this entire design is ONE admin
// server function added later without the gate. A reviewer will not
// notice a missing `.middleware([requireAdmin])` line in a file of
// similar-looking exports; this test will.
//
// It reads the source rather than introspecting the objects because
// TanStack's server-function wrapper does not expose its middleware
// chain at runtime -- and a test that cannot observe the thing it claims
// to check is worse than no test.
describe("every admin server function is gated", () => {
  const source = readFileSync("src/lib/admin.functions.ts", "utf8");

  it("exports at least one admin function", () => {
    // Guards the guard: if the export list is empty, every assertion
    // below passes vacuously and this file becomes a test that cannot
    // fail.
    expect(adminFunctions.ADMIN_FUNCTION_NAMES.length).toBeGreaterThan(0);
  });

  it("declares createServerFn exactly as many times as it lists names", () => {
    const declared = source.match(/createServerFn\(/g)?.length ?? 0;
    expect(declared).toBe(adminFunctions.ADMIN_FUNCTION_NAMES.length);
  });

  it("carries requireAdmin on every createServerFn", () => {
    const gated = source.match(/\.middleware\(\[requireAdmin\]\)/g)?.length ?? 0;
    expect(gated).toBe(adminFunctions.ADMIN_FUNCTION_NAMES.length);
  });

  it("never uses requireSupabaseAuth alone in this file", () => {
    // requireAdmin already chains it. Importing it here would be the
    // shape of an endpoint gated at the wrong level.
    expect(source).not.toContain("requireSupabaseAuth");
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: FAIL — `Failed to resolve import "./admin.functions"`.

- [ ] **Step 10: Create `admin.functions.ts` with its first real function**

```ts
// src/lib/admin.functions.ts
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "./admin-middleware";
import type { PodcastFolder } from "./podcast-tree";

/**
 * Every admin server function lives in this one file so
 * admin.functions.test.ts has exactly one thing to enumerate. Adding a
 * function elsewhere defeats that test; add it here.
 *
 * KEEP IN SYNC: every createServerFn below must appear in
 * ADMIN_FUNCTION_NAMES, and the test fails if the counts disagree.
 */
export const ADMIN_FUNCTION_NAMES = ["adminListFolders"] as const;

function untyped(client: unknown): SupabaseClient {
  return client as SupabaseClient;
}

/** The whole folder tree, including unpublished branches. */
export const adminListFolders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<PodcastFolder[]> => {
    const { data, error } = await untyped(context.supabaseAdmin)
      .from("podcast_folders")
      .select("id,parent_id,slug,title,description,sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      parentId: (row.parent_id as string | null) ?? null,
      slug: row.slug as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      sortOrder: row.sort_order as number,
    }));
  });
```

- [ ] **Step 11: Run it to verify it passes**

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: PASS 4/4.

- [ ] **Step 12: Mutation-test the enumeration guard**

Temporarily delete `.middleware([requireAdmin])` from `adminListFolders`.
Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: FAIL on "carries requireAdmin on every createServerFn".

**Revert.** A guard that stays green through this is the "guards that cannot run" defect this repo keeps producing.

- [ ] **Step 13: Prove the allowlist is unreadable with a user token**

This is the one test that proves the central claim of the whole design,
and the spec flags it as the one most likely to be written as a test
that cannot fail. It must assert on a real PostgREST refusal, not on a
mock that happens to return empty — an empty result and a refusal look
identical from a stub, and only one of them means the table is safe.

```ts
// append to src/lib/admin-auth.test.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;

// Skipped rather than failed without credentials: a red suite on every
// machine without env vars gets muted, and a muted test is worse than a
// skipped one. CI has them, so CI runs it.
describe.skipIf(!url || !anonKey)("admin_users is unreadable by clients", () => {
  it("returns no rows and no data to an anon client", async () => {
    const client = createClient(url!, anonKey!);
    const { data, error } = await client.from("admin_users").select("user_id");
    // RLS enabled with zero policies yields an empty set, not an error,
    // for a SELECT the role has been granted. We REVOKEd the grant, so
    // PostgREST refuses outright. Either outcome is safe; a row is not.
    expect(data ?? []).toHaveLength(0);
    if (error) expect(error.message).toMatch(/permission denied|does not exist/i);
  });
});
```

Run: `bunx vitest run src/lib/admin-auth.test.ts`
Expected: PASS — 4 unit cases, plus this one either passing or reported skipped when the env vars are absent. **If it reports skipped locally, say so in the task's ledger line.** A skipped security test that nobody mentions is how it stays skipped.

- [ ] **Step 14: Verify migration ordering**

Run: `bunx vitest run src/lib/migration-order.test.ts`
Expected: PASS. `20260928010000` sorts above `20260927230000`, and `admin_users` references only `auth.users`, which exists before every migration in this repo.

- [ ] **Step 15: Commit**

```bash
git add supabase/migrations/20260928010000_admin_users.sql src/lib/admin-auth.ts src/lib/admin-auth.test.ts src/lib/admin-middleware.ts src/lib/admin.functions.ts src/lib/admin.functions.test.ts
git commit -m "feat(admin): allowlist table and the requireAdmin gate

admin_users has RLS enabled and zero policies, so only the service role
reads it -- an allowlist the guarded app can read is one an attacker can
enumerate. isAdminUser fails closed on absent row, query error and empty
subject, each mutation-tested. The enumeration test reads the source
because TanStack does not expose the middleware chain at runtime."
```

---

### Task 3: Admin sign-in and the route gate

**Files:**
- Create: `admin/routes/signin.tsx`
- Modify: `admin/routes/index.tsx`, `src/lib/admin.functions.ts`, `src/lib/admin.functions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `ADMIN_FUNCTION_NAMES` (Task 2).
- Produces: `adminWhoAmI` server function returning `{ userId: string }`; the admin app redirects to `/signin` when it is absent.

The admin app runs on its own origin, so its Supabase session lives in its own browser storage and is separate from the learner app's **by construction** — there is no cookie or session name to configure. See the correction note at the top of this plan.

- [ ] **Step 1: Add the failing test for the new function's gating**

Update the names list expectation by adding `adminWhoAmI` to `ADMIN_FUNCTION_NAMES` in `src/lib/admin.functions.ts` **without** adding the function.

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: FAIL — "declares createServerFn exactly as many times as it lists names": 1 vs 2.

- [ ] **Step 2: Add the function**

```ts
// append to src/lib/admin.functions.ts
/**
 * Confirms the caller is an admin. Returns only their own id -- there is
 * nothing else an admin session needs to know, and echoing the allowlist
 * back would undo the point of making the table unreadable.
 */
export const adminWhoAmI = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<{ userId: string }> => {
    return { userId: context.userId };
  });
```

- [ ] **Step 3: Run to verify it passes**

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: PASS 4/4.

- [ ] **Step 4: Write the sign-in route**

```tsx
// admin/routes/signin.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signin")({ component: SignIn });

function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    // Signing in only proves the account exists. Whether it is on the
    // allowlist is decided server-side on the next call, and the index
    // route sends a non-admin straight back here.
    if (signInError) setError("Sign-in failed.");
    else navigate({ to: "/" });
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Alphonso Admin</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Email" required autoComplete="username"
          className="w-full rounded border border-hairline px-3 py-2"
        />
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password" required autoComplete="current-password"
          className="w-full rounded border border-hairline px-3 py-2"
        />
        <button type="submit" disabled={busy} className="w-full rounded bg-moss px-3 py-2 text-white">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error ? <p className="text-sm text-ember">{error}</p> : null}
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Gate the index route**

```tsx
// admin/routes/index.tsx — replace the file
import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({
  // The gate is the server function, not this loader. A loader runs on
  // the client too and is trivially skipped; adminWhoAmI throws for
  // anyone not on the allowlist, and every other admin call is gated the
  // same way independently. This redirect is a courtesy, not a control.
  loader: async () => {
    try {
      return await adminWhoAmI();
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Alphonso Admin</h1>
      <nav className="mt-6 flex flex-col gap-2">
        <a href="/folders" className="text-moss underline">Folders</a>
      </nav>
    </main>
  );
}
```

- [ ] **Step 6: Verify the admin app still builds**

Run: `bun run build:admin`
Expected: success.

`/folders` does not exist until Task 4, and TanStack's `Link` is typed against the generated route tree, so linking to it now will not compile. Use a plain anchor in this task and convert it in Task 4 Step 5:

```tsx
<a href="/folders" className="text-moss underline">Folders</a>
```

Do not disable route typing to make the `Link` work. The typed route tree is what catches a link to a route that was renamed or deleted, and turning it off to save one conversion costs that guard permanently.

- [ ] **Step 7: Commit**

```bash
git add admin/routes/signin.tsx admin/routes/index.tsx src/lib/admin.functions.ts
git commit -m "feat(admin): sign-in and the route gate

The admin app is its own origin, so its Supabase session is separate by
construction -- no cookie to name. The loader redirect is a courtesy;
the real gate is requireAdmin on every server function independently."
```

---

### Task 4: Folder management

**Files:**
- Create: `admin/routes/folders.tsx`
- Modify: `src/lib/admin.functions.ts`, `src/lib/admin.functions.test.ts`

**Interfaces:**
- Consumes: `adminListFolders` (Task 2), `findCycle`, `isValidSlug` from `src/lib/podcast-tree.ts`.
- Produces: `adminCreateFolder`, `adminRenameFolder`, `adminMoveFolder`, `adminDeleteFolder`.

- [ ] **Step 1: Write the failing cycle test**

```ts
// append to src/lib/admin.functions.test.ts
import { findCycle } from "./podcast-tree";
import { wouldCreateCycle } from "./admin.functions";

// Review Focus #4. In the CLI this needed a typo; in a drag-and-drop
// folder tree it is two clicks. A cycle makes the branch unreachable
// from the root and invisible in both apps, which reads as data loss.
describe("wouldCreateCycle", () => {
  const folders = [
    { id: "a", parentId: null, slug: "a", title: "A", description: null, sortOrder: 0 },
    { id: "b", parentId: "a", slug: "b", title: "B", description: null, sortOrder: 0 },
    { id: "c", parentId: "b", slug: "c", title: "C", description: null, sortOrder: 0 },
  ];

  it("refuses moving a folder under its own child", () => {
    expect(wouldCreateCycle(folders, "a", "b")).toBe(true);
  });

  it("refuses moving a folder under its own grandchild", () => {
    // The one-level check that only compares against direct children
    // passes this case wrongly, which is why the real reachability walk
    // is used rather than a parent comparison.
    expect(wouldCreateCycle(folders, "a", "c")).toBe(true);
  });

  it("refuses moving a folder under itself", () => {
    expect(wouldCreateCycle(folders, "b", "b")).toBe(true);
  });

  it("allows moving a folder to the root", () => {
    expect(wouldCreateCycle(folders, "c", null)).toBe(false);
  });

  it("allows a move that does not close a loop", () => {
    expect(wouldCreateCycle(folders, "c", "a")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: FAIL — `wouldCreateCycle is not exported`.

- [ ] **Step 3: Implement and add the four functions**

```ts
// append to src/lib/admin.functions.ts
import { findCycle, isValidSlug } from "./podcast-tree";

/**
 * Whether re-parenting `folderId` under `newParentId` closes a loop.
 *
 * Applies the move to a copy and asks findCycle -- the tested function
 * the CLI already uses -- rather than reimplementing reachability here.
 * A second implementation of a rule this subtle is a second thing to get
 * wrong, and only one of them would have tests.
 */
export function wouldCreateCycle(
  folders: PodcastFolder[],
  folderId: string,
  newParentId: string | null,
): boolean {
  if (folderId === newParentId) return true;
  const moved = folders.map((f) => (f.id === folderId ? { ...f, parentId: newParentId } : f));
  return findCycle(moved) !== null;
}
```

Then update `ADMIN_FUNCTION_NAMES` to:

```ts
export const ADMIN_FUNCTION_NAMES = [
  "adminListFolders",
  "adminWhoAmI",
  "adminCreateFolder",
  "adminRenameFolder",
  "adminMoveFolder",
  "adminDeleteFolder",
] as const;
```

and append:

```ts
import { z } from "zod";

const slugSchema = z.string().min(1).max(80).refine(isValidSlug, "use lowercase kebab-case");

export const adminCreateFolder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({
      parentId: z.string().uuid().nullable(),
      slug: slugSchema,
      title: z.string().min(1).max(200),
      description: z.string().max(2000).nullable().default(null),
      sortOrder: z.number().int().min(0).default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await untyped(context.supabaseAdmin)
      .from("podcast_folders")
      .insert({
        parent_id: data.parentId,
        slug: data.slug,
        title: data.title,
        description: data.description,
        sort_order: data.sortOrder,
      })
      .select("id")
      .single();
    // The partial unique indexes (one for parent_id IS NOT NULL, one for
    // root slugs, because Postgres treats NULL parents as mutually
    // distinct) surface here as 23505. Translate it, because "duplicate
    // key value violates unique constraint" is not a sentence anyone
    // should read in a form.
    if (error) {
      throw new Error(
        error.code === "23505"
          ? `A folder with slug "${data.slug}" already exists here.`
          : error.message,
      );
    }
    return { id: row.id as string };
  });

export const adminRenameFolder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).nullable().default(null),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await untyped(context.supabaseAdmin)
      .from("podcast_folders")
      .update({ title: data.title, description: data.description })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminMoveFolder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), parentId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const client = untyped(context.supabaseAdmin);
    const { data: rows, error: readError } = await client
      .from("podcast_folders")
      .select("id,parent_id,slug,title,description,sort_order");
    if (readError) throw new Error(readError.message);
    const folders: PodcastFolder[] = (rows ?? []).map((row) => ({
      id: row.id as string,
      parentId: (row.parent_id as string | null) ?? null,
      slug: row.slug as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      sortOrder: row.sort_order as number,
    }));
    if (wouldCreateCycle(folders, data.id, data.parentId)) {
      throw new Error("That move would put the folder inside itself.");
    }
    const { error } = await client
      .from("podcast_folders")
      .update({ parent_id: data.parentId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteFolder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const client = untyped(context.supabaseAdmin);
    // Checked here even though the database already refuses: both
    // podcast_folders.parent_id and podcast_episodes.folder_id are
    // ON DELETE RESTRICT (verified in 20260926030000), so Postgres would
    // raise 23503 anyway. This exists to turn "update or delete on table
    // violates foreign key constraint" into a sentence, and to name
    // WHICH kind of child is in the way. It is a message, not a control
    // -- the constraint is the control, and it must stay.
    const [{ count: childCount }, { count: episodeCount }] = await Promise.all([
      client.from("podcast_folders").select("id", { count: "exact", head: true }).eq("parent_id", data.id),
      client.from("podcast_episodes").select("id", { count: "exact", head: true }).eq("folder_id", data.id),
    ]);
    if ((childCount ?? 0) > 0) throw new Error("Move or delete the subfolders first.");
    if ((episodeCount ?? 0) > 0) throw new Error("Delete this folder's episodes first.");
    const { error } = await client.from("podcast_folders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: PASS — 5 cycle cases plus the 4 enumeration cases, with the enumeration counts now at 6.

- [ ] **Step 5: Write the folders route**

```tsx
// admin/routes/folders.tsx
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  adminListFolders, adminCreateFolder, adminDeleteFolder,
} from "@/lib/admin.functions";
import { buildFolderTree, type FolderNode } from "@/lib/podcast-tree";

export const Route = createFileRoute("/folders")({
  loader: async () => {
    try {
      return { folders: await adminListFolders() };
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: Folders,
});

function Folders() {
  const { folders } = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setError(null);
    try {
      await adminDeleteFolder({ data: { id } });
      router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Folders</h1>
      {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      <ul className="mt-6 space-y-1">
        {buildFolderTree(folders).map((node) => (
          <FolderRow key={node.id} node={node} depth={0} onDelete={remove} />
        ))}
      </ul>
      <NewFolderForm folders={folders} onDone={() => router.invalidate()} />
    </main>
  );
}

function FolderRow({
  node, depth, onDelete,
}: { node: FolderNode; depth: number; onDelete: (id: string) => void }) {
  return (
    <>
      <li className="flex items-center justify-between" style={{ paddingLeft: depth * 16 }}>
        <span>{node.title} <code className="text-ink-soft">/{node.slug}</code></span>
        <button onClick={() => onDelete(node.id)} className="text-sm text-ember">Delete</button>
      </li>
      {node.children.map((child) => (
        <FolderRow key={child.id} node={child} depth={depth + 1} onDelete={onDelete} />
      ))}
    </>
  );
}

function NewFolderForm({
  folders, onDone,
}: { folders: { id: string; title: string }[]; onDone: () => void }) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await adminCreateFolder({
        data: { parentId: parentId || null, slug, title, description: null, sortOrder: 0 },
      });
      setSlug("");
      setTitle("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-3 border-t border-hairline pt-6">
      <h2 className="font-semibold">New folder</h2>
      <select
        value={parentId} onChange={(e) => setParentId(e.target.value)}
        className="w-full rounded border border-hairline px-3 py-2"
      >
        <option value="">(root)</option>
        {folders.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
      </select>
      <input
        value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required
        className="w-full rounded border border-hairline px-3 py-2"
      />
      <input
        value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug-in-kebab-case" required
        className="w-full rounded border border-hairline px-3 py-2"
      />
      <button type="submit" className="rounded bg-moss px-3 py-2 text-white">Create</button>
      {error ? <p className="text-sm text-ember">{error}</p> : null}
    </form>
  );
}
```

- [ ] **Step 6: Build and typecheck**

Run: `bun run build:admin && bunx tsc --noEmit`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin.functions.ts src/lib/admin.functions.test.ts admin/routes/folders.tsx
git commit -m "feat(admin): folder management

Re-parenting reuses findCycle rather than reimplementing reachability --
a drag-and-drop tree makes a cycle two clicks where the CLI needed a
typo. Delete names which kind of child is in the way: both FKs are ON
DELETE RESTRICT, so Postgres already refuses -- this turns 23503 into a
sentence. It is a message, not a control; the constraint is the control."
```

---

### Task 5: Episode metadata, publish and unpublish

**Files:**
- Create: `admin/routes/episode.$id.tsx`
- Modify: `src/lib/admin.functions.ts`, `src/lib/admin.functions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `untyped`, `slugSchema` (Tasks 2 and 4).
- Produces: `adminListEpisodes({ folderId })`, `adminUpdateEpisode`, `adminSetPublished`.

- [ ] **Step 1: Add the three names, run the enumeration test to see it fail**

Add `"adminListEpisodes"`, `"adminUpdateEpisode"`, `"adminSetPublished"` to `ADMIN_FUNCTION_NAMES`.

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: FAIL — counts 6 vs 9.

- [ ] **Step 2: Add the three functions**

```ts
// append to src/lib/admin.functions.ts
export type AdminEpisode = {
  id: string;
  folderId: string;
  slug: string;
  title: string;
  description: string | null;
  durationSeconds: number;
  published: boolean;
  audioPath: string;
};

/** Every episode in a folder, published or not. */
export const adminListEpisodes = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ folderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AdminEpisode[]> => {
    const { data: rows, error } = await untyped(context.supabaseAdmin)
      .from("podcast_episodes")
      .select("id,folder_id,slug,title,description,duration_seconds,published,audio_path")
      .eq("folder_id", data.folderId)
      .order("slug", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      id: row.id as string,
      folderId: row.folder_id as string,
      slug: row.slug as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      durationSeconds: row.duration_seconds as number,
      published: row.published as boolean,
      audioPath: row.audio_path as string,
    }));
  });

export const adminUpdateEpisode = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(200),
      description: z.string().max(4000).nullable().default(null),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Slug is deliberately not editable here. It is baked into the
    // storage path (storagePathFor), so renaming it without moving the
    // object orphans the audio -- and moving the object is a different,
    // riskier operation than editing a title. Re-publish under a new
    // slug instead.
    const { error } = await untyped(context.supabaseAdmin)
      .from("podcast_episodes")
      .update({ title: data.title, description: data.description })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetPublished = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), published: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await untyped(context.supabaseAdmin)
      .from("podcast_episodes")
      .update({ published: data.published })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
```

- [ ] **Step 3: Run to verify it passes**

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: PASS, counts 9 vs 9.

- [ ] **Step 4: Write the episode route**

```tsx
// admin/routes/episode.$id.tsx
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { adminListEpisodes, adminUpdateEpisode, adminSetPublished } from "@/lib/admin.functions";

export const Route = createFileRoute("/episode/$id")({
  loader: async ({ params }) => {
    try {
      // $id is the FOLDER id here: this screen edits a folder's episodes
      // as a list, which is how they are actually maintained -- an
      // episode is never edited without looking at its neighbours.
      return { episodes: await adminListEpisodes({ data: { folderId: params.id } }) };
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: Episodes,
});

function Episodes() {
  const { episodes } = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function togglePublished(id: string, published: boolean) {
    setError(null);
    try {
      await adminSetPublished({ data: { id, published } });
      router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    }
  }

  async function rename(id: string, title: string) {
    setError(null);
    try {
      await adminUpdateEpisode({ data: { id, title, description: null } });
      router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Episodes</h1>
      {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      <ul className="mt-6 space-y-4">
        {episodes.map((episode) => (
          <li key={episode.id} className="border-b border-hairline pb-4">
            <input
              defaultValue={episode.title}
              onBlur={(e) => rename(episode.id, e.target.value)}
              className="w-full rounded border border-hairline px-3 py-2"
            />
            <div className="mt-2 flex items-center gap-3 text-sm">
              <code className="text-ink-soft">/{episode.slug}</code>
              <button
                onClick={() => togglePublished(episode.id, !episode.published)}
                className="text-moss"
              >
                {episode.published ? "Unlist" : "Publish"}
              </button>
              {/* "Not listed", never "private": the bucket is public-read,
                  so an unpublished episode's audio is still fetchable by
                  anyone with the URL. Saying "private" here would be a
                  lie the storage layer cannot back up. */}
              <span className="text-ink-soft">
                {episode.published ? "Listed" : "Not listed (audio still public by URL)"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: Build and typecheck**

Run: `bun run build:admin && bunx tsc --noEmit`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin.functions.ts src/lib/admin.functions.test.ts admin/routes/episode.\$id.tsx
git commit -m "feat(admin): episode metadata, publish and unlist

Slug is not editable: it is baked into the storage path, so renaming it
without moving the object orphans the audio. The unpublished state is
labelled 'not listed', never 'private' -- the bucket is public-read and
the UI must not claim otherwise."
```

---

### Task 6: Audio upload

**Files:**
- Create: `src/lib/admin-upload.ts`, `src/lib/admin-upload.test.ts`
- Modify: `src/lib/admin.functions.ts`, `src/lib/admin.functions.test.ts`, `admin/routes/episode.$id.tsx`

**Interfaces:**
- Consumes: `storagePathFor`, `validateEpisodeDraft` from `src/lib/podcast-authoring.ts`.
- Produces: `sniffAudioType(bytes: Uint8Array): "mp3" | "mp4" | null`, `MAX_UPLOAD_BYTES`, `adminUploadEpisodeAudio`.

- [ ] **Step 1: Write the failing sniff tests**

```ts
// src/lib/admin-upload.test.ts
import { describe, expect, it } from "vitest";
import { sniffAudioType, MAX_UPLOAD_BYTES, validateUpload } from "./admin-upload";

function bytes(...values: number[]) {
  return new Uint8Array(values);
}

// Review Focus #3. The bucket is public-read and served from a URL under
// our control. Trusting the extension is how it ends up serving an HTML
// file to someone who was told it was an episode.
describe("sniffAudioType", () => {
  it("recognises an ID3-tagged MP3", () => {
    // "ID3" + version bytes
    expect(sniffAudioType(bytes(0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00))).toBe("mp3");
  });

  it("recognises a bare MPEG frame sync", () => {
    // Not every MP3 carries an ID3 tag; a bare frame starts 0xFF 0xFB.
    expect(sniffAudioType(bytes(0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00))).toBe("mp3");
  });

  it("recognises an MP4/M4A ftyp box", () => {
    expect(
      sniffAudioType(bytes(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20)),
    ).toBe("mp4");
  });

  it("rejects HTML regardless of what it is named", () => {
    // The whole point: `<!DOCTYPE html>` saved as episode.mp3.
    expect(sniffAudioType(bytes(0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50))).toBeNull();
  });

  it("rejects a file too short to identify", () => {
    expect(sniffAudioType(bytes(0xff))).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(sniffAudioType(bytes())).toBeNull();
  });
});

describe("validateUpload", () => {
  const mp3 = bytes(0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00);

  it("accepts a real MP3 within the cap", () => {
    expect(validateUpload(mp3, mp3.byteLength)).toBeNull();
  });

  it("rejects a file over the cap even when it is real audio", () => {
    expect(validateUpload(mp3, MAX_UPLOAD_BYTES + 1)).toMatch(/too large/i);
  });

  it("rejects non-audio content", () => {
    expect(validateUpload(bytes(0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50), 8))
      .toMatch(/not an audio file/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/lib/admin-upload.test.ts`
Expected: FAIL — `Failed to resolve import "./admin-upload"`.

- [ ] **Step 3: Implement**

```ts
// src/lib/admin-upload.ts
/**
 * Content-based checks for admin audio upload.
 *
 * The extension is never consulted. The podcast-audio bucket is
 * public-read and served from a URL under our own domain, so an
 * HTML file accepted as "episode.mp3" is a stored-XSS-shaped problem
 * wearing an audio filename.
 */

/** 60 MB. About 2 hours at 64 kbps mono, far above any real episode. */
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

/**
 * Identifies audio from its leading bytes, or null when it is not audio
 * this system accepts.
 *
 * Recognises ID3-tagged MP3, a bare MPEG frame sync, and the MP4/M4A
 * `ftyp` box. Anything else -- including a valid file of some other
 * kind -- is a refusal, because an allowlist of known-good signatures
 * is the only version of this check that stays correct as new formats
 * appear.
 */
export function sniffAudioType(head: Uint8Array): "mp3" | "mp4" | null {
  if (head.byteLength < 8) return null;
  // "ID3"
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return "mp3";
  // MPEG audio frame sync: 11 set bits.
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";
  // "ftyp" at offset 4.
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return "mp4";
  return null;
}

/** A human-readable problem, or null when the upload is acceptable. */
export function validateUpload(head: Uint8Array, totalBytes: number): string | null {
  if (totalBytes > MAX_UPLOAD_BYTES) {
    return `That file is too large (${Math.round(totalBytes / 1024 / 1024)} MB). The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  }
  if (sniffAudioType(head) === null) {
    return "That is not an audio file. Upload an MP3 or M4A.";
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/lib/admin-upload.test.ts`
Expected: PASS 9/9.

- [ ] **Step 5: Mutation-test the sniff on the right axis**

Temporarily change `if (head.byteLength < 8) return null;` to `if (head.byteLength < 1) return null;`.
Run: `bunx vitest run src/lib/admin-upload.test.ts`
Expected: FAIL on "rejects a file too short to identify".

Then temporarily make `validateUpload` return null unconditionally.
Expected: FAIL on both rejection cases.

**Revert both.**

> **Why this is not a plain POST of the file.** The first draft of this
> task base64-encoded the bytes into a server-function body. Base64
> inflates by a third, and a serverless function body is capped at
> roughly 4.5 MB on Vercel — so a 3.4 MB MP3, which is an ordinary
> episode here, would have failed at the platform before any of this
> code ran. The browser therefore uploads **directly to Supabase Storage
> through a signed URL**, and the server verifies afterwards by reading
> the object back. Verification after the write means the window where a
> bad object exists is real, which is why the failure path deletes it
> rather than merely reporting.

- [ ] **Step 6: Add the signed-URL and verification functions**

Add `"adminCreateAudioUploadUrl"` and `"adminVerifyUploadedAudio"` to `ADMIN_FUNCTION_NAMES`, then append:

```ts
// append to src/lib/admin.functions.ts
import { validateUpload, MAX_UPLOAD_BYTES } from "./admin-upload";

const BUCKET = "podcast-audio";

/**
 * A short-lived signed URL the browser uploads the audio to directly.
 *
 * Direct-to-storage because a serverless body is capped near 4.5 MB and
 * base64 inflates by a third -- routing an ordinary episode through a
 * server function would fail at the platform, not in this code.
 */
export const adminCreateAudioUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({
      episodeId: z.string().uuid(),
      audioPath: z.string().min(1).max(400),
      declaredBytes: z.number().int().positive(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ signedUrl: string; token: string }> => {
    // The declared size is the caller's claim and is only a cheap early
    // refusal; the real size is measured from the stored object in
    // adminVerifyUploadedAudio, which is the number that counts.
    if (data.declaredBytes > MAX_UPLOAD_BYTES) {
      throw new Error(
        `That file is too large (${Math.round(data.declaredBytes / 1024 / 1024)} MB). The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      );
    }
    const { data: signed, error } = await untyped(context.supabaseAdmin).storage
      .from(BUCKET)
      .createSignedUploadUrl(data.audioPath, { upsert: true });
    if (error) throw new Error(error.message);
    return { signedUrl: signed.signedUrl, token: signed.token };
  });

/**
 * Reads the stored object back, proves it is audio, and only then
 * writes the duration onto the row.
 *
 * Deletes the object when it is not audio. Verification happens after
 * the write, so a bad object genuinely exists for a moment; leaving it
 * there would mean a public URL under our own domain serving whatever
 * was uploaded. Reporting without deleting is not enough.
 */
export const adminVerifyUploadedAudio = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ episodeId: z.string().uuid(), audioPath: z.string().min(1).max(400) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; durationSeconds: number }> => {
    const client = untyped(context.supabaseAdmin);
    const { data: blob, error: downloadError } = await client.storage
      .from(BUCKET)
      .download(data.audioPath);
    if (downloadError || !blob) throw new Error("The upload did not arrive. Try again.");

    const buffer = Buffer.from(await blob.arrayBuffer());
    const problem = validateUpload(new Uint8Array(buffer.subarray(0, 16)), buffer.byteLength);
    if (problem) {
      await client.storage.from(BUCKET).remove([data.audioPath]);
      throw new Error(problem);
    }

    // music-metadata is imported lazily, matching podcast-tool.ts: a
    // top-level import made commands that never read audio die at
    // import time, and the same would apply to every admin request.
    const { parseBuffer } = await import("music-metadata");
    const metadata = await parseBuffer(buffer, { mimeType: "audio/mpeg" });
    const durationSeconds = Math.round(metadata.format.duration ?? 0);
    if (durationSeconds <= 0) {
      await client.storage.from(BUCKET).remove([data.audioPath]);
      throw new Error("Could not read a duration from that file. It may be truncated.");
    }

    // Written only after the object is proven good. A row claiming a
    // duration the file does not have is precisely what the iOS cache's
    // durationDisagrees check reads as a truncated download, and it
    // would re-download the episode on every launch.
    const { error } = await client
      .from("podcast_episodes")
      .update({ duration_seconds: durationSeconds })
      .eq("id", data.episodeId);
    if (error) throw new Error(error.message);
    return { ok: true, durationSeconds };
  });
```

- [ ] **Step 7: Run the enumeration test**

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: PASS, counts 11 vs 11.

- [ ] **Step 8: Add the upload control to the episode route**

Insert inside the `<li>` in `admin/routes/episode.$id.tsx`, after the publish row:

```tsx
<input
  type="file"
  accept="audio/mpeg,audio/mp4"
  onChange={async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const { signedUrl } = await adminCreateAudioUploadUrl({
        data: {
          episodeId: episode.id,
          audioPath: episode.audioPath,
          declaredBytes: file.size,
        },
      });
      // Straight to Supabase: the bytes never pass through a server
      // function, so the platform body cap does not apply.
      const put = await fetch(signedUrl, {
        method: "PUT",
        headers: { "content-type": "audio/mpeg" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed.");
      await adminVerifyUploadedAudio({
        data: { episodeId: episode.id, audioPath: episode.audioPath },
      });
      router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    }
  }}
  className="mt-2 text-sm"
/>
```

Add `adminCreateAudioUploadUrl` and `adminVerifyUploadedAudio` to that file's import list.

- [ ] **Step 9: Build and typecheck**

Run: `bun run build:admin && bunx tsc --noEmit`
Expected: both succeed.

- [ ] **Step 10: Commit**

```bash
git add src/lib/admin-upload.ts src/lib/admin-upload.test.ts src/lib/admin.functions.ts src/lib/admin.functions.test.ts admin/routes/
git commit -m "feat(admin): audio upload via signed URL, verified on content

A serverless body is capped near 4.5 MB and base64 inflates by a third,
so posting an ordinary 3 MB episode through a server function would have
failed at the platform. The browser uploads straight to Storage; the
server reads the object back, proves it is audio by signature, and
DELETES it when it is not -- the bucket is public-read and served from
our own domain, so leaving a rejected object there is the whole problem."
```

---

### Task 7: Transcript editing

**Files:**
- Modify: `src/lib/admin.functions.ts`, `src/lib/admin.functions.test.ts`, `admin/routes/episode.$id.tsx`

**Interfaces:**
- Consumes: `normalizeTranscript` from `src/lib/podcast-transcript.ts`.
- Produces: `adminGetTranscript({ episodeId })`, `adminSaveTranscript({ episodeId, text })`.

- [ ] **Step 1: Write the failing markup-rejection test**

```ts
// append to src/lib/admin.functions.test.ts
import { normalizeTranscript } from "./podcast-transcript";

// Review Focus #5. In the CLI the script and the transcript are two
// separate files typed on two separate runs. In the admin UI both boxes
// are on one screen, so pasting the SSML script into the transcript box
// is one wrong click -- and SSML rendered as a transcript reaches
// exactly the deaf and hard-of-hearing readers the feature exists for.
//
// This asserts the admin path uses the SAME rule as --transcript rather
// than a second, looser one. Reject, never strip: a stripped transcript
// silently loses the words inside the tags.
describe("the admin transcript rule is the CLI's rule", () => {
  it("rejects ElevenLabs SSML", () => {
    expect(normalizeTranscript('<speak>Hello <break time="1s"/> there</speak>')).toBeNull();
  });

  it("rejects a bare self-closing tag", () => {
    expect(normalizeTranscript('Hello <break time="500ms"/> there')).toBeNull();
  });

  it("accepts prose containing a less-than sign", () => {
    // "5 < 10" and "I <3 coffee" are ordinary transcript content; a rule
    // that rejects them rejects real episodes.
    expect(normalizeTranscript("Five is less than ten: 5 < 10.")).not.toBeNull();
    expect(normalizeTranscript("I <3 coffee.")).not.toBeNull();
  });

  it("rejects an empty transcript", () => {
    expect(normalizeTranscript("   \n\n  ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it passes already**

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: PASS — `normalizeTranscript` already implements this.

**This is a characterisation test, not a red-green cycle, and that is deliberate:** its job is to fail *later*, if someone gives the admin path its own looser transcript rule. Note that in the commit message. Do not invent a failing state by breaking `podcast-transcript.ts`.

- [ ] **Step 3: Add the two server functions**

Add `"adminGetTranscript"` and `"adminSaveTranscript"` to `ADMIN_FUNCTION_NAMES`, then append:

```ts
// append to src/lib/admin.functions.ts
import { normalizeTranscript } from "./podcast-transcript";

export const adminGetTranscript = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ episodeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ text: string | null }> => {
    const { data: row, error } = await untyped(context.supabaseAdmin)
      .from("podcast_transcripts")
      .select("text")
      .eq("episode_id", data.episodeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { text: (row?.text as string | undefined) ?? null };
  });

export const adminSaveTranscript = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ episodeId: z.string().uuid(), text: z.string().max(200_000) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // The SAME rule --transcript enforces, from the same module. A
    // transcript is not the TTS script: episode 1's script carries
    // ElevenLabs SSML, and rendering that to a screen reader is the
    // precise failure this feature exists to prevent. Rejected, never
    // stripped -- stripping silently discards the words inside the tags.
    const normalized = normalizeTranscript(data.text);
    if (normalized === null) {
      throw new Error(
        "That doesn't look like a transcript. Markup isn't allowed — paste the spoken words, not the TTS script.",
      );
    }
    const { error } = await untyped(context.supabaseAdmin)
      .from("podcast_transcripts")
      .upsert({ episode_id: data.episodeId, text: normalized }, { onConflict: "episode_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
```

- [ ] **Step 4: Run the enumeration test**

Run: `bunx vitest run src/lib/admin.functions.test.ts`
Expected: PASS, counts 12 vs 12.

- [ ] **Step 5: Add the transcript editor to the episode route**

Add this component to `admin/routes/episode.$id.tsx` and render `<TranscriptEditor episodeId={episode.id} />` inside each `<li>`:

```tsx
function TranscriptEditor({ episodeId }: { episodeId: string }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const { text: existing } = await adminGetTranscript({ data: { episodeId } });
    setText(existing ?? "");
    setLoaded(true);
  }

  async function save() {
    setStatus(null);
    try {
      await adminSaveTranscript({ data: { episodeId, text } });
      setStatus("Saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
    }
  }

  if (!loaded) {
    return (
      <button onClick={load} className="mt-2 text-sm text-moss">Edit transcript</button>
    );
  }
  return (
    <div className="mt-3">
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={10}
        className="w-full rounded border border-hairline px-3 py-2 font-mono text-sm"
      />
      {/* Said in the UI as well as enforced on the server, because the
          server's refusal arrives after the paste and the warning should
          arrive before it. */}
      <p className="mt-1 text-xs text-ink-soft">
        The spoken words only. Not the TTS script — markup is rejected.
      </p>
      <button onClick={save} className="mt-2 rounded bg-moss px-3 py-2 text-sm text-white">
        Save transcript
      </button>
      {status ? <p className="mt-1 text-sm text-ember">{status}</p> : null}
    </div>
  );
}
```

Add `adminGetTranscript` and `adminSaveTranscript` to that file's imports.

- [ ] **Step 6: Build and typecheck**

Run: `bun run build:admin && bunx tsc --noEmit`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin.functions.ts src/lib/admin.functions.test.ts admin/routes/episode.\$id.tsx
git commit -m "feat(admin): transcript editing, same rule as --transcript

In the CLI the script and the transcript are two files on two runs; in
the admin UI both boxes are on one screen, so pasting SSML into the
transcript is one wrong click. The test is a characterisation test on
purpose: its job is to fail later if the admin path is ever given its
own looser rule."
```

---

### Task 8: The whole suite, docs, and the deployment runbook

**Files:**
- Modify: `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Run the full suite, chunked**

Run: `bunx vitest run --reporter=verbose 2>&1 | tail -40`
Expected: all files pass. **Reconcile the reported file count against the collected count.** A starved run on this machine prints a passing total beside an `Errors N errors` line for files that never executed — three sessions lost a day to that. If the counts disagree, re-run in halves.

- [ ] **Step 2: Run lint and typecheck**

Run: `bun run lint && bunx tsc --noEmit`
Expected: both clean.

- [ ] **Step 3: Update `ARCHITECTURE.md`**

Add after the offline-download section:

```markdown
**Podcast admin (Phase 4).** A second TanStack Start build from the same
repo — `vite.admin.config.ts` points `router.routesDirectory` at
`admin/routes` — so no admin route can reach the learner bundle. A test
checks both directions, because losing that override silently turns the
admin app into a copy of the learner app and is invisible in review.

Authorization is `admin_users`: **RLS enabled with zero policies**, so
only `service_role` (which bypasses RLS) can read it. An allowlist the
guarded application can read is one an attacker can enumerate, and one
it can write is not an allowlist. The first row is inserted by hand in
the SQL editor — there is deliberately no bootstrap endpoint, because
every self-bootstrapping admin mechanism is an authentication bypass
waiting for a misconfiguration.

`requireAdmin` chains `requireSupabaseAuth` and then checks the
allowlist with the service-role client. It throws a message identical to
an ordinary auth failure: a distinct "you are not an admin" tells an
attacker the endpoint exists and their token was otherwise valid. Every
admin server function lives in `src/lib/admin.functions.ts` so one test
can enumerate them and fail if any lacks the middleware — that test
reads the source, because TanStack does not expose the middleware chain
at runtime.

**There is no separate identity provider and cannot be one:** the admin
writes to the same database the learner app reads. What is separate is
the deployment, the origin (and therefore the browser storage holding
the Supabase session), and the authorization check.

Upload is validated on **content, not extension** — the bucket is
public-read and served from our own domain, so a file accepted as
`episode.mp3` because of its name is a stored-XSS-shaped problem wearing
an audio filename. Transcripts go through the same `normalizeTranscript`
the CLI uses; a second, looser rule in a form handler is how the two
paths drift.
```

- [ ] **Step 4: Update `AGENTS.md`**

Add these rows to the file table:

| `src/lib/admin-auth.ts` | `isAdminUser` — the one authorization decision. MUST be called with a service-role client; `admin_users` has RLS on and no policies, so a user's own token reads nothing from it. Fails closed on absent row, query error and empty subject |
| `src/lib/admin-middleware.ts` | `requireAdmin` — chains `requireSupabaseAuth` then the allowlist. Throws a message indistinguishable from an ordinary auth failure, on purpose |
| `src/lib/admin.functions.ts` | Every admin server function, in one file so `admin.functions.test.ts` has one thing to enumerate. Adding an admin function anywhere else defeats that test |
| `src/lib/admin-upload.ts` | Content-based audio sniffing and the size cap. The extension is never consulted |
| `vite.admin.config.ts` | The admin build. `router.routesDirectory` → `admin/routes`, so no admin route reaches the learner bundle |

- [ ] **Step 5: Update `README.md` and `CHANGELOG.md`**

In `README.md`, after the podcast bullet, add:

```markdown
- **Admin app** (`bun run dev:admin`, port 8081) — a separately-deployed
  surface for managing the podcast library: folders, episode metadata,
  audio upload, publish/unlist, and transcripts. Access is an explicit
  allowlist (`admin_users`) that only the server can read; the first
  admin is added by hand in the Supabase SQL editor. See
  `docs/superpowers/specs/2026-09-25-podcast-phase4-admin-design.md`.
```

In `CHANGELOG.md`, add an entry under the V5 heading summarising the
allowlist design, the separate build target, and the content-based
upload validation.

- [ ] **Step 6: Write the deployment runbook into the PR body**

CI builds the admin app but nothing deploys it. The PR must say, in full:

1. Create a second Vercel project from this repo; build command `bun run build:admin`.
2. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` on it. Do **not** add any key to the learner project that it does not already have.
3. Point `admin.<domain>` at it.
4. Insert the first admin by hand:
   ```sql
   INSERT INTO public.admin_users (user_id, note)
   SELECT id, 'account owner' FROM auth.users WHERE email = '<owner email>';
   ```
5. Verify, in this order: signing in as a **non-admin** account reaches `/signin` and no admin function succeeds; signing in as the admin reaches `/`; a folder can be created and deleted; an upload of a renamed non-audio file is refused.

- [ ] **Step 7: Commit**

```bash
git add ARCHITECTURE.md AGENTS.md README.md CHANGELOG.md
git commit -m "docs: record the admin subsystem and its deployment runbook"
```
