# Design: Curriculum data — database schema

> Written 2026-09-18. Step 1 of a decomposed effort to give the
> `complete-lesson` Supabase Edge Function (see
> `docs/superpowers/specs/2026-09-17-complete-lesson-edge-function-design.md`)
> real, DB-backed curriculum data to validate completion claims against,
> instead of bundling JSON. This spec covers **schema + migration only**.
> Seed/import script, the Edge Function itself, and any future consumers
> are separate specs that build on this one.

## Decisions made (with rationale)

This design followed a real back-and-forth on scope; recording the
decisions and why, since they weren't obvious up front:

1. **Curriculum data moves to a real Postgres schema** (not bundled JSON
   in the Edge Function), because the goal is a genuinely queryable,
   scalable source of truth — not just unblocking the Edge Function. This
   also directly enables future work that needs to cross-reference
   curriculum content against user progress data in SQL (a weakness-
   detection pipeline joining `lesson_completions`/`review_items` against
   question/topic data, for instance) — that kind of join is only
   possible when both sides live in the same database.
2. **Full curriculum-adjacent dataset migrates**, not just the
   lessons/questions the Edge Function strictly needs: `levels`, `units`,
   `lessons`, `questions`, `vocab_images`, `placement_questions`,
   `scenarios`. Deliberately broader than the Edge Function's own
   requirement, to serve as the real source of truth for future
   consumers (more language modules, more courses, tutor personas via
   `scenarios`, weakness detection).
3. **The web app's own rendering code (`learn.tsx`, `lesson.$id.tsx`,
   `placement.tsx`, `review.tsx`, etc.) is explicitly NOT migrated to
   query these tables.** It keeps importing the static TS files exactly
   as it does today. This matches the precedent already established in
   this codebase: `public.achievements` is a real, seeded, RLS-readable
   table, yet `src/data/achievements.ts` documents itself as "used for
   iconography + labels without hitting the DB" — the web app reads the
   static mirror, not the table. Migrating the rendering routes would add
   real regression risk (converting synchronous in-render data access to
   async DB loaders across multiple routes) for no benefit toward the
   features that actually motivated this work — new courses, personas,
   and weakness detection are new code that will query these tables
   directly from day one; they don't route through `learn.tsx`'s data
   access.
4. **iOS is unaffected.** It already has its own settled pipeline
   (`scripts/export-ios-content.ts` → bundled JSON in the Swift package)
   and isn't part of this decision.

## Schema

Natural text primary keys throughout, matching this codebase's existing
convention (`achievements.id`, `lesson_completions.lesson_id`). IDs were
verified to already be globally unique across both courses by
construction (no collisions found between `lesson-bank.ts`/
`lesson-bank-fr.ts` pack IDs, or between `placement.ts`/`placement-fr.ts`
question IDs — French-course content is consistently prefixed, e.g.
`fra1p1`, `fp1`) — this also matches an existing constraint:
`lesson_completions.lesson_id` has no `course` column, so lesson IDs were
already assumed globally unique.

```sql
-- levels: CEFR band metadata
CREATE TABLE public.levels (
  id text PRIMARY KEY,              -- 'A1'..'C1'
  name text NOT NULL,
  blurb text NOT NULL,
  sort_order integer NOT NULL
);

-- units: a group of lessons within a level/course
CREATE TABLE public.units (
  id text PRIMARY KEY,              -- 'u1', 'a1p1u1', 'fra1p1u1', ...
  course text NOT NULL,             -- 'en' | 'fr'
  level_id text NOT NULL REFERENCES public.levels(id),
  eyebrow text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  sort_order integer NOT NULL
);
CREATE INDEX ON public.units(course, level_id);

-- lessons: belongs to a unit
CREATE TABLE public.lessons (
  id text PRIMARY KEY,              -- 'u1l1', ...  (globally unique already)
  unit_id text NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text NOT NULL,
  sort_order integer NOT NULL
);
CREATE INDEX ON public.lessons(unit_id);

-- questions: belongs to a lesson. id ('q1'..) repeats across lessons, so
-- the primary key is composite (lesson_id, id), unlike every other table
-- here where id alone is globally unique.
CREATE TABLE public.questions (
  lesson_id text NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  id text NOT NULL,                 -- 'q1', 'q2', ... (unique within lesson only)
  type text NOT NULL CHECK (type IN ('mc', 'fill')),
  prompt text NOT NULL,
  choices jsonb,                    -- mc only: string[]
  bank jsonb,                       -- fill only: string[]
  answer_index integer,             -- mc only
  answer_text text,                 -- fill only
  explanation text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (lesson_id, id),
  CONSTRAINT question_shape_matches_type CHECK (
    (type = 'mc' AND choices IS NOT NULL AND answer_index IS NOT NULL
       AND bank IS NULL AND answer_text IS NULL)
    OR
    (type = 'fill' AND bank IS NOT NULL AND answer_text IS NOT NULL
       AND choices IS NULL AND answer_index IS NULL)
  )
);

-- vocab_images: term -> stock photo lookup (global, not course-scoped --
-- matches VOCAB_IMAGES in src/data/vocab-images.ts, which is looked up
-- by lowercased term regardless of course)
CREATE TABLE public.vocab_images (
  term text PRIMARY KEY,            -- lowercased key
  url text NOT NULL,
  alt text NOT NULL,
  credit text NOT NULL
);

-- placement_questions: CEFR placement test pool
CREATE TABLE public.placement_questions (
  id text PRIMARY KEY,
  course text NOT NULL,
  level_id text NOT NULL REFERENCES public.levels(id),
  prompt text NOT NULL,
  choices jsonb NOT NULL,           -- string[]
  answer_index integer NOT NULL
);
CREATE INDEX ON public.placement_questions(course, level_id);

-- scenarios: AI roleplay personas (course-agnostic -- no French variant
-- exists today; src/data/scenarios.ts has no course field)
CREATE TABLE public.scenarios (
  id text PRIMARY KEY,
  title text NOT NULL,
  emoji text NOT NULL,
  blurb text NOT NULL,
  level text NOT NULL,              -- 'Beginner' | 'Intermediate' | 'Advanced' (own scale, not CEFR)
  system_prompt text NOT NULL,
  opener text NOT NULL
);
```

Design note on `questions.answer`: the TS type is a discriminated union
(`{ type: 'mc', answer: number }` vs `{ type: 'fill', answer: string }`).
SQL has no compiler to enforce that union, so the table splits it into
two nullable columns (`answer_index`, `answer_text`) plus an explicit
`CHECK` constraint tying the populated column to `type` — more verbose
than the TS source, but the constraint is what makes an inconsistent row
actually impossible to insert, rather than just conventionally avoided.

## Security posture (RLS)

Matches the existing `achievements` table exactly — this is reference
data, not user data:

```sql
GRANT SELECT ON public.levels, public.units, public.lessons,
  public.questions, public.vocab_images, public.placement_questions,
  public.scenarios TO authenticated, anon;
GRANT ALL ON public.levels, public.units, public.lessons,
  public.questions, public.vocab_images, public.placement_questions,
  public.scenarios TO service_role;

ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "levels_read_all" ON public.levels FOR SELECT USING (true);
CREATE POLICY "units_read_all" ON public.units FOR SELECT USING (true);
CREATE POLICY "lessons_read_all" ON public.lessons FOR SELECT USING (true);
CREATE POLICY "questions_read_all" ON public.questions FOR SELECT USING (true);
CREATE POLICY "vocab_images_read_all" ON public.vocab_images FOR SELECT USING (true);
CREATE POLICY "placement_questions_read_all" ON public.placement_questions FOR SELECT USING (true);
CREATE POLICY "scenarios_read_all" ON public.scenarios FOR SELECT USING (true);
```

No `INSERT`/`UPDATE` policies for `authenticated`/`anon` — this data is
seed/admin-managed only (via the service-role client, from the seed
script that's the next spec in this sequence), never user-writable.

Exposing `answer_index`/`answer_text` to public `SELECT` means a
sufficiently motivated client could read question answers directly from
the table via the Supabase client. This is an accepted tradeoff, not an
oversight: the same is already true today (the answer key ships inside
`curriculum.ts`, bundled into the client JS), so this doesn't weaken the
app's existing posture, and it isn't the resource this project's actual
trust boundary protects (`LESSON_SESSION_SECRET`/XP-granting is — see
the Edge Function design). If this ever becomes a real product concern,
a `SECURITY DEFINER` RPC that strips answers for public reads and a
`service_role`-only path for validation would be the fix — out of scope
here.

## Out of scope for this spec

- The seed/import script that populates these tables from
  `curriculum.ts`/`lesson-bank.ts`/etc. — next spec in the sequence.
- The `complete-lesson` Edge Function's actual queries against these
  tables — depends on the seed script existing first.
- Any web app code changes — explicitly not happening (see Decision 3
  above).
- A `courses` table (`en`/`fr` metadata) — `course` stays a plain `text`
  column on `units`/`placement_questions` rather than its own FK'd table,
  since `COURSES` in `src/data/courses.ts` is a 2-row, rarely-changing
  constant; a table for it would be schema ceremony with no real
  consumer benefit at this scale. Revisit if course metadata ever needs
  to be queried or grows past a handful of rows.

## Testing

This spec is schema-only — there's no application code to unit test.
Verification is: the migration applies cleanly (`supabase db reset` /
`supabase migration up` against a local instance), the `CHECK` and
foreign-key constraints actually reject malformed rows (worth a quick
manual `INSERT` sanity check per constraint during implementation), and
RLS policies behave as declared (anon/authenticated can `SELECT`, cannot
`INSERT`/`UPDATE`/`DELETE`).
