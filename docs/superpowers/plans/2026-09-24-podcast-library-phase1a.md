# Podcast Library Phase 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend and web half of the Listen feature — storage bucket, schema, authoring CLI, and a browsable folder tree with a persistent audio player on the web app.

**Architecture:** Three new Postgres tables (`podcast_folders`, `podcast_episodes`, `podcast_playback`, `podcast_play_events`) plus a public-read Supabase Storage bucket. Content is published by a service-role CLI (`scripts/podcast-tool.ts`), never by a client. The web app reads through `createServerFn` server functions and renders a generic tree via one splat route, with a single `<audio>` element owned by a Zustand store at shell level so playback survives navigation.

**Tech Stack:** TanStack Start + React 19, TanStack Query, Zustand, Supabase (Postgres + Storage + RLS), Deepgram Aura-2 TTS, `music-metadata`, Vitest + React Testing Library, bun.

**Spec:** `docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md`

## Global Constraints

- Package manager is **bun**. `bun.lock` is authoritative; never generate `package-lock.json`.
- **TDD**: every task writes the failing test first, watches it fail, then implements.
- Migrations follow `supabase/migrations/20260922040000_teams.sql`: commented header citing this spec, `GRANT SELECT` to `authenticated`, `GRANT ALL` to `service_role`, `ENABLE ROW LEVEL SECURITY`, one explicit policy per table.
- `src/integrations/supabase/types.ts` is generated — never hand-edit it; regenerate.
- The Supabase **service-role key is resolved via the `aws-secrets-manager` skill's `{{resolve:secretsmanager:...}}` + `asm-exec` pattern** per `CLAUDE.md`. Never call `get-secret-value`, never read a secret into agent context.
- Storage bucket `podcast-audio` is **public-read with no client write policy**. Only the CLI writes.
- Nothing in `scripts/podcast-tool.ts` that writes may act without `--confirm`, matching `scripts/pack-tool.ts`.
- Deepgram TTS accepts at most **2000 characters** per request (`src/routes/api/tts.ts`).
- Run `bun run lint` and `bunx tsc --noEmit` before each commit; a `prettier/prettier` failure breaks CI for everyone.
- Phase 1a **freezes the schema** for Phase 1b (iOS). A schema change discovered later means amending the spec, not patching around it.

## Review Focus

Five failure modes the spec implies that no obvious task test would cover. Each has its test assigned to the task that owns the code:

1. **Two root folders with the same slug** — `UNIQUE (parent_id, slug)` does not constrain `NULL` parents in Postgres, so without a partial index the tree silently accepts duplicate roots. *(Task 1)*
2. **A folder moved under its own descendant** — creates an unreachable cycle that makes tree rendering infinite-loop. *(Task 2)*
3. **A single sentence longer than 2000 characters** — sentence-boundary chunking finds no split point and emits an oversized chunk that Deepgram truncates silently, losing audio. *(Task 3)*
4. **A saved position beyond a re-uploaded shorter episode's duration** — seeking past the end leaves the player stuck at a black hole instead of restarting. *(Task 5)*
5. **Navigating between folders while audio plays** — the most common way this class of feature breaks; playback must survive a route change. *(Task 6)*

---

### Task 1: Schema and storage

**Files:**
- Create: `supabase/migrations/20260926010000_podcast_library.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerated, not hand-edited)
- Test: `src/lib/podcast-schema.test.ts`

**Interfaces:**
- Consumes: the existing `levels(id)` table and `auth.users(id)`.
- Produces: tables `podcast_folders`, `podcast_episodes`, `podcast_playback`, `podcast_play_events`; bucket `podcast-audio`.

- [ ] **Step 1: Write the migration**

```sql
-- Podcast / audio library, Phase 1a (docs/superpowers/specs/
-- 2026-09-24-podcast-library-phase1-design.md). A folder tree of
-- audio episodes published by the account owner via
-- scripts/podcast-tool.ts. Only service_role writes: there is no
-- client insert/update policy on folders or episodes anywhere.
--
-- Depends on public.levels from 20260918120000_curriculum_data_tables.sql.

CREATE TABLE public.podcast_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.podcast_folders(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  course text CHECK (course IN ('en', 'fr', 'es')),
  level_id text REFERENCES public.levels(id),
  cover_image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sibling slugs are unique -- but Postgres treats NULL parent_id values
-- as mutually distinct, so this constraint does NOT constrain root
-- folders. The partial index below covers that gap; without it the tree
-- silently accepts two roots called "english".
CREATE UNIQUE INDEX podcast_folders_parent_slug_key
  ON public.podcast_folders (parent_id, slug)
  WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX podcast_folders_root_slug_key
  ON public.podcast_folders (slug)
  WHERE parent_id IS NULL;
CREATE INDEX ON public.podcast_folders (parent_id, sort_order);

GRANT SELECT ON public.podcast_folders TO authenticated;
GRANT ALL ON public.podcast_folders TO service_role;
ALTER TABLE public.podcast_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "podcast_folders_select_all" ON public.podcast_folders
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.podcast_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.podcast_folders(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  audio_path text NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  course text CHECK (course IN ('en', 'fr', 'es')),
  level_id text REFERENCES public.levels(id),
  source text NOT NULL CHECK (source IN ('upload', 'tts')),
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (folder_id, slug)
);
CREATE INDEX ON public.podcast_episodes (folder_id, sort_order);

GRANT SELECT ON public.podcast_episodes TO authenticated;
GRANT ALL ON public.podcast_episodes TO service_role;
ALTER TABLE public.podcast_episodes ENABLE ROW LEVEL SECURITY;
-- Unpublished episodes are invisible to clients. NOTE: this hides the
-- ROW, not the FILE -- the bucket is public-read, so a draft episode's
-- audio is still fetchable by anyone who knows the URL. See the spec's
-- Storage section: `published` is a staging flag, not privacy.
CREATE POLICY "podcast_episodes_select_published" ON public.podcast_episodes
  FOR SELECT TO authenticated USING (published = true);

CREATE TABLE public.podcast_playback (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);
GRANT SELECT, INSERT, UPDATE ON public.podcast_playback TO authenticated;
GRANT ALL ON public.podcast_playback TO service_role;
ALTER TABLE public.podcast_playback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "podcast_playback_own" ON public.podcast_playback
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE TABLE public.podcast_play_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  seconds_listened integer NOT NULL DEFAULT 0 CHECK (seconds_listened >= 0)
);
CREATE INDEX ON public.podcast_play_events (episode_id, started_at);
GRANT SELECT, INSERT ON public.podcast_play_events TO authenticated;
GRANT ALL ON public.podcast_play_events TO service_role;
ALTER TABLE public.podcast_play_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "podcast_play_events_own" ON public.podcast_play_events
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
```

Note the `(SELECT auth.uid())` wrapping — that is the pattern
`20260918150000_optimize_rls_auth_uid.sql` applied repo-wide; a bare
`auth.uid()` re-evaluates per row.

- [ ] **Step 2: Write the failing schema-shape test**

This test guards **Review Focus #1** — the root-slug gap — by asserting
the migration text contains both indexes. It is a text assertion because
this repo has no containerised Postgres in CI.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260926010000_podcast_library.sql", "utf8");

describe("podcast library migration", () => {
  it("constrains sibling slugs for non-root folders", () => {
    expect(sql).toMatch(/UNIQUE INDEX podcast_folders_parent_slug_key[\s\S]*WHERE parent_id IS NOT NULL/);
  });

  it("also constrains root folder slugs, which the composite index cannot", () => {
    expect(sql).toMatch(/UNIQUE INDEX podcast_folders_root_slug_key[\s\S]*WHERE parent_id IS NULL/);
  });

  it("hides unpublished episodes from clients", () => {
    expect(sql).toMatch(/podcast_episodes_select_published[\s\S]*USING \(published = true\)/);
  });

  it("grants no client write on folders or episodes", () => {
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*podcast_(folders|episodes) TO authenticated/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test src/lib/podcast-schema.test.ts`
Expected: FAIL — the migration file does not exist yet if you wrote the test first; write the test, see it fail, then add the SQL from Step 1.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/lib/podcast-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Apply the migration and create the bucket**

Apply the migration to the live Supabase project (see `ARCHITECTURE.md`'s "Applying migrations"). Then create the bucket — public, no client write policy:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('podcast-audio', 'podcast-audio', true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 6: Regenerate Supabase types**

Run the project's type generation so `src/integrations/supabase/types.ts` learns the four tables. Do not hand-edit that file.
Verify: `bunx tsc --noEmit` passes.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260926010000_podcast_library.sql src/lib/podcast-schema.test.ts src/integrations/supabase/types.ts
git commit -m "feat: add podcast library schema and storage bucket"
```

---

### Task 2: Folder-tree logic

**Files:**
- Create: `src/lib/podcast-tree.ts`
- Test: `src/lib/podcast-tree.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure functions).
- Produces:
  - `type PodcastFolder = { id: string; parentId: string | null; slug: string; title: string; description: string | null; sortOrder: number }`
  - `type FolderNode = PodcastFolder & { children: FolderNode[] }`
  - `buildFolderTree(folders: PodcastFolder[]): FolderNode[]`
  - `resolveFolderPath(folders: PodcastFolder[], segments: string[]): PodcastFolder | null`
  - `findCycle(folders: PodcastFolder[]): string[] | null`
  - `isValidSlug(slug: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildFolderTree, findCycle, isValidSlug, resolveFolderPath } from "./podcast-tree";

const f = (id: string, parentId: string | null, slug: string, sortOrder = 0) => ({
  id, parentId, slug, title: slug, description: null, sortOrder,
});

describe("buildFolderTree", () => {
  it("nests children under their parent, ordered by sortOrder", () => {
    const tree = buildFolderTree([f("b", "a", "b1", 2), f("a", null, "en"), f("c", "a", "c1", 1)]);
    expect(tree).toHaveLength(1);
    expect(tree[0].slug).toBe("en");
    expect(tree[0].children.map((c) => c.slug)).toEqual(["c1", "b1"]);
  });

  it("drops a child whose parent is missing rather than losing the whole tree", () => {
    const tree = buildFolderTree([f("a", null, "en"), f("orphan", "gone", "lost")]);
    expect(tree.map((n) => n.slug)).toEqual(["en"]);
  });
});

describe("resolveFolderPath", () => {
  it("walks a slug path of arbitrary depth", () => {
    const folders = [f("a", null, "en"), f("b", "a", "a1"), f("c", "b", "cafe")];
    expect(resolveFolderPath(folders, ["en", "a1", "cafe"])?.id).toBe("c");
  });

  it("returns null when a segment does not exist at that level", () => {
    const folders = [f("a", null, "en"), f("b", "a", "a1")];
    expect(resolveFolderPath(folders, ["en", "nope"])).toBeNull();
  });

  it("does not match a folder that exists elsewhere in the tree", () => {
    // "cafe" is a child of a1, not of en -- resolving en/cafe must fail.
    const folders = [f("a", null, "en"), f("b", "a", "a1"), f("c", "b", "cafe")];
    expect(resolveFolderPath(folders, ["en", "cafe"])).toBeNull();
  });
});

// Review Focus #2: a cycle makes tree rendering infinite-loop.
describe("findCycle", () => {
  it("returns null for an acyclic tree", () => {
    expect(findCycle([f("a", null, "en"), f("b", "a", "a1")])).toBeNull();
  });

  it("detects a folder parented to its own descendant", () => {
    const cycle = findCycle([f("a", "b", "en"), f("b", "a", "a1")]);
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("detects a folder parented to itself", () => {
    expect(findCycle([f("a", "a", "en")])).toEqual(["a"]);
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase kebab-case", () => {
    expect(isValidSlug("cafe-orders-a1")).toBe(true);
  });

  it("rejects slugs that would break a URL path or a storage key", () => {
    for (const bad of ["Cafe", "a b", "a/b", "", "-lead", "trail-", "a--b", "é"]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test src/lib/podcast-tree.test.ts`
Expected: FAIL — `Failed to resolve import "./podcast-tree"`.

- [ ] **Step 3: Implement**

```ts
/**
 * Pure folder-tree logic for the podcast library (Phase 1a, see
 * docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md).
 *
 * Cycle detection lives here rather than in a Postgres trigger because
 * only service_role (scripts/podcast-tool.ts) ever writes folders --
 * the same reasoning that keeps pack validation in pack-authoring.ts.
 */

export type PodcastFolder = {
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  description: string | null;
  sortOrder: number;
};

export type FolderNode = PodcastFolder & { children: FolderNode[] };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

export function buildFolderTree(folders: PodcastFolder[]): FolderNode[] {
  const byId = new Map<string, FolderNode>();
  for (const folder of folders) byId.set(folder.id, { ...folder, children: [] });

  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }
    // A child whose parent is absent is dropped, not promoted to a root:
    // surfacing it at top level would misrepresent the tree.
    byId.get(node.parentId)?.children.push(node);
  }

  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}

export function resolveFolderPath(
  folders: PodcastFolder[],
  segments: string[],
): PodcastFolder | null {
  let parentId: string | null = null;
  let current: PodcastFolder | null = null;
  for (const segment of segments) {
    const match = folders.find((f) => f.parentId === parentId && f.slug === segment);
    if (!match) return null;
    current = match;
    parentId = match.id;
  }
  return current;
}

/** Returns the ids involved in the first cycle found, or null if acyclic. */
export function findCycle(folders: PodcastFolder[]): string[] | null {
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  for (const folder of folders) {
    const seen: string[] = [];
    let cursor: string | null | undefined = folder.id;
    while (cursor != null) {
      if (seen.includes(cursor)) return seen.slice(seen.indexOf(cursor));
      seen.push(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test src/lib/podcast-tree.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/podcast-tree.ts src/lib/podcast-tree.test.ts
git commit -m "feat: add podcast folder-tree logic with cycle detection"
```

---

### Task 3: TTS chunking and the concatenation probe

**Files:**
- Create: `src/lib/podcast-tts.ts`
- Test: `src/lib/podcast-tts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `chunkScript(text: string, limit?: number): string[]` (default limit 2000).

- [ ] **Step 1: Run the concatenation probe before writing any code**

This resolves the spec's open technical risk and its answer changes the
implementation, so it comes first. Throwaway work — keep nothing.

Synthesise two short clips via Deepgram, concatenate the MP3 bytes, and check the result:

```bash
curl -s -X POST "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" -H "Content-Type: application/json" \
  -d '{"text":"This is the first half of a test episode about ordering coffee."}' -o /tmp/a.mp3
curl -s -X POST "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" -H "Content-Type: application/json" \
  -d '{"text":"And this is the second half, which should follow on smoothly."}' -o /tmp/b.mp3
cat /tmp/a.mp3 /tmp/b.mp3 > /tmp/joined.mp3
bunx music-metadata /tmp/joined.mp3 2>/dev/null || node -e "require('music-metadata').parseFile('/tmp/joined.mp3').then(m=>console.log(m.format.duration))"
```

Check: does the reported duration equal roughly the sum of both clips, and does seeking to the second half work in a browser `<audio>` element?

**If yes:** proceed with byte concatenation.
**If no:** the CLI requires `ffmpeg` on the authoring machine and joins with `ffmpeg -f concat`. Record which outcome occurred in the spec's "Open questions" section, then delete `/tmp/*.mp3`.

- [ ] **Step 2: Write the failing chunking tests**

```ts
import { describe, expect, it } from "vitest";
import { chunkScript } from "./podcast-tts";

describe("chunkScript", () => {
  it("returns a single chunk when the script fits", () => {
    expect(chunkScript("Hello there. How are you?", 2000)).toEqual([
      "Hello there. How are you?",
    ]);
  });

  it("splits on sentence boundaries, never mid-sentence", () => {
    const chunks = chunkScript("One sentence here. Two sentence here. Three here.", 25);
    expect(chunks.every((c) => c.length <= 25)).toBe(true);
    expect(chunks.join(" ")).toBe("One sentence here. Two sentence here. Three here.");
  });

  it("keeps every chunk within Deepgram's 2000-character limit by default", () => {
    const script = "This is a sentence of moderate length. ".repeat(200);
    for (const chunk of chunkScript(script)) expect(chunk.length).toBeLessThanOrEqual(2000);
  });

  // Review Focus #3: no sentence boundary exists to split on. Without a
  // hard split the chunk exceeds the limit and Deepgram truncates it
  // silently -- audio goes missing with no error anywhere.
  it("hard-splits a single sentence longer than the limit", () => {
    const monster = `${"word ".repeat(600)}.`;
    const chunks = chunkScript(monster, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
  });

  it("returns no chunks for an empty or whitespace-only script", () => {
    expect(chunkScript("   \n  ")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test src/lib/podcast-tts.test.ts`
Expected: FAIL — `Failed to resolve import "./podcast-tts"`.

- [ ] **Step 4: Implement**

```ts
/**
 * Splits a long episode script into Deepgram-sized pieces.
 * src/routes/api/tts.ts caps each request at 2000 characters; a 6-8
 * minute episode is roughly 7000, so a podcast script must be chunked
 * and the audio joined. Splitting on sentence boundaries keeps prosody
 * intact -- a mid-word split is audible.
 */
const DEEPGRAM_CHARACTER_LIMIT = 2000;

function hardSplit(sentence: string, limit: number): string[] {
  const pieces: string[] = [];
  for (let i = 0; i < sentence.length; i += limit) {
    pieces.push(sentence.slice(i, i + limit));
  }
  return pieces;
}

export function chunkScript(text: string, limit = DEEPGRAM_CHARACTER_LIMIT): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences = trimmed.match(/[^.!?]+[.!?]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    // A single sentence over the limit has no boundary to split on.
    // Hard-split it rather than emit an oversized chunk, which Deepgram
    // would truncate silently.
    if (sentence.length > limit) {
      if (current) { chunks.push(current); current = ""; }
      chunks.push(...hardSplit(sentence, limit));
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test src/lib/podcast-tts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/podcast-tts.ts src/lib/podcast-tts.test.ts
git commit -m "feat: add sentence-boundary chunking for long TTS scripts"
```

---

### Task 4: Authoring library and CLI

**Files:**
- Create: `src/lib/podcast-authoring.ts`
- Create: `scripts/podcast-tool.ts`
- Test: `src/lib/podcast-authoring.test.ts`
- Modify: `package.json` (add `music-metadata`)

**Interfaces:**
- Consumes: `isValidSlug`, `findCycle`, `resolveFolderPath` (Task 2); `chunkScript` (Task 3).
- Produces:
  - `type EpisodeDraft = { folderSlugPath: string[]; slug: string; title: string; description: string | null; source: "upload" | "tts"; course: "en" | "fr" | "es" | null; levelId: string | null }`
  - `validateEpisodeDraft(draft: EpisodeDraft, existingSlugs: string[]): string[]` — returns human-readable problems, empty when valid.
  - `storagePathFor(draft: EpisodeDraft): string`

- [ ] **Step 1: Add the dependency**

```bash
bun add music-metadata
```

Used to read `duration_seconds` from the finished MP3 — chosen over `ffprobe` to avoid requiring a system binary.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { storagePathFor, validateEpisodeDraft, type EpisodeDraft } from "./podcast-authoring";

const draft = (over: Partial<EpisodeDraft> = {}): EpisodeDraft => ({
  folderSlugPath: ["en", "a1"],
  slug: "ordering-coffee",
  title: "Ordering Coffee",
  description: null,
  source: "tts",
  course: "en",
  levelId: "A1",
  ...over,
});

describe("validateEpisodeDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(validateEpisodeDraft(draft(), [])).toEqual([]);
  });

  it("rejects an invalid slug", () => {
    expect(validateEpisodeDraft(draft({ slug: "Ordering Coffee" }), [])).toContainEqual(
      expect.stringContaining("slug"),
    );
  });

  it("rejects a slug already used in the same folder", () => {
    expect(validateEpisodeDraft(draft(), ["ordering-coffee"])).toContainEqual(
      expect.stringContaining("already"),
    );
  });

  it("rejects an empty title", () => {
    expect(validateEpisodeDraft(draft({ title: "  " }), [])).toContainEqual(
      expect.stringContaining("title"),
    );
  });

  it("rejects a folder path containing an invalid segment", () => {
    expect(validateEpisodeDraft(draft({ folderSlugPath: ["en", "A1 Level"] }), [])).toContainEqual(
      expect.stringContaining("folder"),
    );
  });
});

describe("storagePathFor", () => {
  it("builds a stable object path from the folder path and slug", () => {
    expect(storagePathFor(draft())).toBe("en/a1/ordering-coffee.mp3");
  });

  it("works for a folder path of any depth", () => {
    expect(storagePathFor(draft({ folderSlugPath: ["en", "a1", "cafe", "week-1"] })))
      .toBe("en/a1/cafe/week-1/ordering-coffee.mp3");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test src/lib/podcast-authoring.test.ts`
Expected: FAIL — `Failed to resolve import "./podcast-authoring"`.

- [ ] **Step 4: Implement the authoring library**

```ts
/**
 * Validation and path logic for podcast authoring. All the real logic
 * lives here -- scripts/podcast-tool.ts is a thin argv/fs wrapper, the
 * same split scripts/pack-tool.ts uses, because scripts/ is outside the
 * typecheck include and gets no test coverage.
 */
import { isValidSlug } from "./podcast-tree";

export type EpisodeDraft = {
  folderSlugPath: string[];
  slug: string;
  title: string;
  description: string | null;
  source: "upload" | "tts";
  course: "en" | "fr" | "es" | null;
  levelId: string | null;
};

export function validateEpisodeDraft(draft: EpisodeDraft, existingSlugs: string[]): string[] {
  const problems: string[] = [];
  if (!isValidSlug(draft.slug)) {
    problems.push(`Invalid slug "${draft.slug}": use lowercase kebab-case, e.g. ordering-coffee.`);
  }
  if (existingSlugs.includes(draft.slug)) {
    problems.push(`An episode with slug "${draft.slug}" already exists in this folder.`);
  }
  if (!draft.title.trim()) problems.push("Episode title must not be empty.");
  if (draft.folderSlugPath.length === 0) problems.push("Episode must name a folder path.");
  for (const segment of draft.folderSlugPath) {
    if (!isValidSlug(segment)) problems.push(`Invalid folder path segment "${segment}".`);
  }
  return problems;
}

export function storagePathFor(draft: EpisodeDraft): string {
  return `${draft.folderSlugPath.join("/")}/${draft.slug}.mp3`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test src/lib/podcast-authoring.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Write the CLI wrapper**

`scripts/podcast-tool.ts`, modelled on `scripts/pack-tool.ts`. Its doc comment must state the same human-gate rule. Commands:

```
bun run scripts/podcast-tool.ts folder  --parent <slug-path|root> --slug intro-a1 --title "..." [--confirm]
bun run scripts/podcast-tool.ts add     --folder en/a1 --file ./ep1.mp3 --slug ordering-coffee --title "..." [--confirm]
bun run scripts/podcast-tool.ts add     --folder en/a1 --script ./ep1.txt --slug ordering-coffee --title "..." [--voice aura-2-thalia-en] [--confirm]
bun run scripts/podcast-tool.ts validate --folder en/a1 --slug ordering-coffee
bun run scripts/podcast-tool.ts publish  --folder en/a1 --slug ordering-coffee [--confirm]
```

Required behaviours:

- Without `--confirm`, every write command prints what it *would* do and exits 0 without touching Supabase.
- `add --script` reads the file, calls `chunkScript`, synthesises each chunk against Deepgram, joins per the Step-1 probe outcome, then proceeds exactly as `--file` does.
- Duration is read from the finished MP3 with `music-metadata`, never taken from a flag.
- **Ordering matters:** upload the object, verify it, and only then insert the row. If the insert fails, print the orphaned object path explicitly so it can be retried or cleaned up:
  `Upload succeeded but the database insert failed. Orphaned object: <path>`
- The service-role key and `DEEPGRAM_API_KEY` are resolved through the `aws-secrets-manager` pattern per `CLAUDE.md` — never printed, never logged.
- `folder` refuses to create a folder whose parent path does not resolve, and runs `findCycle` on the resulting set before writing.

- [ ] **Step 7: Verify the CLI end to end**

```bash
bun run scripts/podcast-tool.ts folder --parent root --slug en --title "English"
bun run scripts/podcast-tool.ts folder --parent root --slug en --title "English" --confirm
bun run scripts/podcast-tool.ts folder --parent en --slug a1 --title "A1 Beginner" --confirm
bun run scripts/podcast-tool.ts add --folder en/a1 --script ./drafts/sample-episode.txt \
  --slug ordering-coffee --title "Ordering Coffee" --confirm
bun run scripts/podcast-tool.ts publish --folder en/a1 --slug ordering-coffee --confirm
```

Expected: the first command is a dry run that writes nothing; the rest create two folders and one published episode. Verify the object exists in the bucket and the row has a non-zero `duration_seconds`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/podcast-authoring.ts src/lib/podcast-authoring.test.ts scripts/podcast-tool.ts package.json bun.lock
git commit -m "feat: add podcast authoring CLI for uploads and TTS episodes"
```

---

### Task 5: Server functions

**Files:**
- Create: `src/lib/podcast.functions.ts`
- Test: `src/lib/podcast.functions.test.ts`

**Interfaces:**
- Consumes: `PodcastFolder`, `resolveFolderPath` (Task 2); the tables from Task 1.
- Produces:
  - `listFolders(): Promise<PodcastFolder[]>`
  - `listEpisodes(data: { folderId: string }): Promise<PodcastEpisode[]>`
  - `type PodcastEpisode = { id: string; folderId: string; slug: string; title: string; description: string | null; audioUrl: string; durationSeconds: number; positionSeconds: number }`
  - `savePlaybackPosition(data: { episodeId: string; positionSeconds: number }): Promise<{ positionSeconds: number }>`
  - `recordPlayEvent(data: { episodeId: string; secondsListened: number }): Promise<void>`
  - `clampPosition(position: number, durationSeconds: number): number`

Follows `src/lib/review.functions.ts`: `createServerFn({ method })` + `.middleware([requireSupabaseAuth])` + a zod `.inputValidator`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { clampPosition } from "./podcast.functions";

// Review Focus #4: a re-uploaded, shorter episode leaves saved positions
// past its end. Seeking there strands the player instead of restarting.
describe("clampPosition", () => {
  it("keeps a position inside the episode", () => {
    expect(clampPosition(42, 300)).toBe(42);
  });

  it("restarts from zero when the saved position is past the end", () => {
    expect(clampPosition(400, 300)).toBe(0);
  });

  it("restarts from zero when the position sits in the final second", () => {
    // Resuming at 299.5/300 would replay half a second and instantly end.
    expect(clampPosition(299.6, 300)).toBe(0);
  });

  it("treats a negative position as the start", () => {
    expect(clampPosition(-5, 300)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test src/lib/podcast.functions.test.ts`
Expected: FAIL — `clampPosition is not exported`.

- [ ] **Step 3: Implement**

```ts
/**
 * Read/write server functions for the podcast library. Same shape as
 * review.functions.ts: createServerFn + requireSupabaseAuth + a zod
 * validator. Episode rows are filtered to published=true by RLS, so no
 * handler here re-checks it.
 */

/**
 * Clamps a stored resume position onto an episode. Returns 0 when the
 * position is at or beyond the end -- an episode can be re-uploaded
 * shorter than a saved position, and seeking past the end leaves the
 * player stranded rather than restarting.
 */
export function clampPosition(position: number, durationSeconds: number): number {
  if (!Number.isFinite(position) || position <= 0) return 0;
  if (position >= durationSeconds - 1) return 0;
  return position;
}
```

Then the four server functions:

- `listFolders` — `GET`, selects all of `podcast_folders`, maps snake_case columns to the camelCase `PodcastFolder` shape.
- `listEpisodes` — `GET`, validator `z.object({ folderId: z.string().uuid() })`. Selects the folder's episodes, left-joins this user's `podcast_playback` row, builds `audioUrl` from the bucket's public URL + `audio_path`, and passes the stored position through `clampPosition` before returning it.
- `savePlaybackPosition` — `POST`, validator `z.object({ episodeId: z.string().uuid(), positionSeconds: z.number().min(0) })`, upserts on `(user_id, episode_id)`.
- `recordPlayEvent` — `POST`, validator `z.object({ episodeId: z.string().uuid(), secondsListened: z.number().min(0) })`, inserts one row.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test src/lib/podcast.functions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/podcast.functions.ts src/lib/podcast.functions.test.ts
git commit -m "feat: add podcast server functions with resume-position clamping"
```

---

### Task 6: Player store and shell-level audio element

**Files:**
- Create: `src/lib/podcast-player.ts` (Zustand store)
- Create: `src/components/PodcastPlayer.tsx` (audio element + mini-player)
- Modify: `src/components/AppShell.tsx` (mount the player above `BottomTabs`)
- Test: `src/components/PodcastPlayer.test.tsx`

**Interfaces:**
- Consumes: `PodcastEpisode`, `savePlaybackPosition`, `recordPlayEvent` (Task 5).
- Produces:
  - `usePodcastPlayer()` with `{ episode: PodcastEpisode | null; isPlaying: boolean; positionSeconds: number; play(episode): void; toggle(): void; seek(seconds): void; close(): void }`
  - `<PodcastPlayer />` — renders nothing when no episode is loaded.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";
import { PodcastPlayer } from "./PodcastPlayer";
import { usePodcastPlayer } from "../lib/podcast-player";

const episode = {
  id: "11111111-1111-1111-1111-111111111111",
  folderId: "22222222-2222-2222-2222-222222222222",
  slug: "ordering-coffee",
  title: "Ordering Coffee",
  description: null,
  audioUrl: "https://example.test/en/a1/ordering-coffee.mp3",
  durationSeconds: 300,
  positionSeconds: 0,
};

beforeEach(() => {
  usePodcastPlayer.setState({ episode: null, isPlaying: false, positionSeconds: 0 });
});

describe("PodcastPlayer", () => {
  it("renders nothing until an episode is playing", () => {
    const { container } = render(<PodcastPlayer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the episode title once one is loaded", () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
  });

  it("resumes from the saved position rather than the start", () => {
    usePodcastPlayer.getState().play({ ...episode, positionSeconds: 90 });
    render(<PodcastPlayer />);
    expect(screen.getByTestId("podcast-audio")).toHaveAttribute("data-start-at", "90");
  });

  it("exposes a labelled play/pause control", async () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    const button = screen.getByRole("button", { name: /pause/i });
    await userEvent.click(button);
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  // Review Focus #5: the single most common way this breaks. The audio
  // element belongs to the shell, so a route change must not remount it.
  it("keeps the same audio element across a re-render of the surrounding page", () => {
    usePodcastPlayer.getState().play(episode);
    const { rerender } = render(<PodcastPlayer />);
    const before = screen.getByTestId("podcast-audio");
    rerender(<PodcastPlayer />);
    expect(screen.getByTestId("podcast-audio")).toBe(before);
  });

  it("shows an error with a retry when the audio fails to load", () => {
    usePodcastPlayer.getState().play(episode);
    render(<PodcastPlayer />);
    screen.getByTestId("podcast-audio").dispatchEvent(new Event("error"));
    expect(screen.getByText(/couldn't play/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test src/components/PodcastPlayer.test.tsx`
Expected: FAIL — `Failed to resolve import "./PodcastPlayer"`.

- [ ] **Step 3: Implement the store and component**

The store is a plain Zustand store (matching `src/lib/progress.ts`'s use of Zustand). The component:

- Renders `null` when `episode === null`.
- Renders one `<audio data-testid="podcast-audio" data-start-at={positionSeconds} src={episode.audioUrl} />`, plus a mini-player bar with the title, a play/pause button whose accessible name is "Play"/"Pause", and a scrubber.
- On the audio element's `error` event, shows "We couldn't play this episode." and a "Try again" button that reloads the source.
- On `timeupdate`, throttles to once every 10 seconds and calls `savePlaybackPosition`; on `pause` and on unload, saves immediately.
- On reaching the end, calls `recordPlayEvent` with the seconds listened.

- [ ] **Step 4: Mount it in the shell**

In `src/components/AppShell.tsx`, render `<PodcastPlayer />` immediately above `<BottomTabs />` — inside the shell, never inside a route component, so navigating between folders cannot unmount it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test src/components/PodcastPlayer.test.tsx src/components/AppShell.test.tsx`
Expected: PASS — the new 6 plus the existing AppShell tests, still green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/podcast-player.ts src/components/PodcastPlayer.tsx src/components/PodcastPlayer.test.tsx src/components/AppShell.tsx
git commit -m "feat: add shell-level podcast player that survives navigation"
```

---

### Task 7: Listen routes and navigation

**Files:**
- Create: `src/routes/_authenticated/listen.tsx`
- Create: `src/routes/_authenticated/listen.$.tsx`
- Modify: `src/components/AppShell.tsx` (fifth tab)
- Modify: `src/routeTree.gen.ts` (regenerated by the router plugin, not hand-edited)
- Test: `src/routes/_authenticated/listen.test.tsx`

**Interfaces:**
- Consumes: `listFolders`, `listEpisodes` (Task 5); `buildFolderTree`, `resolveFolderPath` (Task 2); `usePodcastPlayer` (Task 6).
- Produces: routes `/listen` and `/listen/$` .

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListenFolderView } from "./listen";

const folders = [
  { id: "a", parentId: null, slug: "en", title: "English", description: null, sortOrder: 0 },
  { id: "b", parentId: "a", slug: "a1", title: "A1 Beginner", description: null, sortOrder: 0 },
];

describe("ListenFolderView", () => {
  it("lists the child folders of the current level", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en"]} />);
    expect(screen.getByText("A1 Beginner")).toBeInTheDocument();
  });

  it("lists episodes with their duration", () => {
    render(
      <ListenFolderView
        folders={folders}
        segments={["en", "a1"]}
        episodes={[{
          id: "e1", folderId: "b", slug: "ordering-coffee", title: "Ordering Coffee",
          description: null, audioUrl: "https://example.test/x.mp3",
          durationSeconds: 305, positionSeconds: 0,
        }]}
      />,
    );
    expect(screen.getByText("Ordering Coffee")).toBeInTheDocument();
    expect(screen.getByText("5:05")).toBeInTheDocument();
  });

  it("shows an empty state for a folder with no children or episodes", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en", "a1"]} />);
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it("shows a not-found state for a path that does not resolve", () => {
    render(<ListenFolderView folders={folders} episodes={[]} segments={["en", "nope"]} />);
    expect(screen.getByText(/couldn't find that folder/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test src/routes/_authenticated/listen.test.tsx`
Expected: FAIL — `Failed to resolve import "./listen"`.

- [ ] **Step 3: Implement**

Export a presentational `ListenFolderView({ folders, episodes, segments })` that is pure and testable, plus the two route modules that fetch with `useQuery` (`queryKey: ["podcast-folders"]` / `["podcast-episodes", folderId]`) and render it. `listen.$.tsx` reads the splat param and splits it on `/` into `segments`. Duration renders as `m:ss`. Tapping an episode calls `usePodcastPlayer().play(episode)`.

- [ ] **Step 4: Add the navigation tab**

In `AppShell.tsx`'s `BottomTabs`, add a fifth `TabItem` between Learn and Chat:

```tsx
<TabItem to="/listen" label="Listen" active={pathname.startsWith("/listen")}>
  <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
    <path
      d="M4 14v-2a8 8 0 0 1 16 0v2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M4 14h3v5H5.5A1.5 1.5 0 0 1 4 17.5V14zM20 14h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5V14z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
</TabItem>
```

- [ ] **Step 5: Run the full suite**

Run: `bun run test && bun run lint && bunx tsc --noEmit`
Expected: all pass, including the existing `AppShell.test.tsx` and `router.test.ts` (the latter sees two new routes).

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated/listen.tsx src/routes/_authenticated/listen.\$.tsx src/routes/_authenticated/listen.test.tsx src/components/AppShell.tsx src/routeTree.gen.ts
git commit -m "feat: add the Listen folder browser and web nav tab"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `AGENTS.md`, `docs/BACKLOG.md`
- Modify: `docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md` (record the probe outcome)

- [ ] **Step 1: Record the probe outcome in the spec**

Replace open question 1 with what actually happened in Task 3 Step 1: byte concatenation, or the `ffmpeg` fallback.

- [ ] **Step 2: Update the docs**

- `README.md` — a Listen entry in Features; the authoring CLI under Development.
- `ARCHITECTURE.md` — the four tables, the bucket, and the public-bucket/Pro limitation verbatim from the spec.
- `CHANGELOG.md` — Phase 1a entry.
- `AGENTS.md` — `podcast-tool.ts` alongside `pack-tool.ts` in the content tooling section.
- `docs/BACKLOG.md` — add Phases 1b, 2, 3 and the Phase 4 admin subsystem as open items, plus the two carried risks: offline-only-online Listen on iOS, and revisiting storage before any Pro gating.

- [ ] **Step 3: Commit**

```bash
git add README.md ARCHITECTURE.md CHANGELOG.md AGENTS.md docs/BACKLOG.md docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md
git commit -m "docs: document the podcast library and its Phase 1a decisions"
```
