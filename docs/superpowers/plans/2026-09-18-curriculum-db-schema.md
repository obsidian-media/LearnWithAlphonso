# Curriculum Data DB Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Supabase migration that creates the 7 curriculum-data tables (`levels`, `units`, `lessons`, `questions`, `vocab_images`, `placement_questions`, `scenarios`), verify it applies cleanly and its constraints/RLS behave as designed, against a local Supabase instance.

**Architecture:** A single new SQL migration file under `supabase/migrations/`, following this repo's existing migration conventions (natural text PKs, `FOR SELECT USING (true)` public-read RLS, service-role-only writes — same posture as the existing `achievements` table). No application code changes in this plan — this is schema only, verified against a local (Docker-based) Supabase instance via the Supabase CLI (`npx supabase`, no global install needed).

**Tech Stack:** PostgreSQL (via Supabase), Supabase CLI (`npx supabase`), Docker (for local Supabase stack).

**Spec:** `docs/superpowers/specs/2026-09-18-curriculum-db-schema-design.md`

## Global Constraints

- Natural text primary keys throughout (no UUIDs) — matches `achievements.id`, `lesson_completions.lesson_id`.
- Public `SELECT` via `FOR SELECT USING (true)` RLS policy on every table; no `INSERT`/`UPDATE`/`DELETE` policies for `authenticated`/`anon` — all writes are service-role only.
- `GRANT SELECT ... TO authenticated, anon` and `GRANT ALL ... TO service_role` on every table.
- No `courses` table — `course` stays a plain `text` column on `units`/`placement_questions` (per spec's "Out of scope" section).
- This plan does not touch any web app code, the Edge Function, or write a seed script — those are separate, later plans.

---

### Task 1: Write the migration file

**Files:**
- Create: `supabase/migrations/20260918120000_curriculum_data_tables.sql`

**Interfaces:**
- Consumes: nothing (this is the first task).
- Produces: 7 tables (`public.levels`, `public.units`, `public.lessons`, `public.questions`, `public.vocab_images`, `public.placement_questions`, `public.scenarios`) that Task 2 applies and Task 3 verifies. Exact column names/types are as written below — later tasks' verification SQL must match these exactly.

- [ ] **Step 1: Write the full migration SQL**

Create `supabase/migrations/20260918120000_curriculum_data_tables.sql` with this exact content:

```sql
-- =========== levels ===========
CREATE TABLE public.levels (
  id text PRIMARY KEY,              -- 'A1'..'C1'
  name text NOT NULL,
  blurb text NOT NULL,
  sort_order integer NOT NULL
);
GRANT SELECT ON public.levels TO authenticated, anon;
GRANT ALL ON public.levels TO service_role;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "levels_read_all" ON public.levels FOR SELECT USING (true);

-- =========== units ===========
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
GRANT SELECT ON public.units TO authenticated, anon;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units_read_all" ON public.units FOR SELECT USING (true);

-- =========== lessons ===========
CREATE TABLE public.lessons (
  id text PRIMARY KEY,              -- 'u1l1', ...  (globally unique already)
  unit_id text NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text NOT NULL,
  sort_order integer NOT NULL
);
CREATE INDEX ON public.lessons(unit_id);
GRANT SELECT ON public.lessons TO authenticated, anon;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons_read_all" ON public.lessons FOR SELECT USING (true);

-- =========== questions ===========
-- id ('q1'..) repeats across lessons, so the primary key is composite
-- (lesson_id, id), unlike every other table here where id alone is
-- globally unique.
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
GRANT SELECT ON public.questions TO authenticated, anon;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions_read_all" ON public.questions FOR SELECT USING (true);

-- =========== vocab_images ===========
-- term -> stock photo lookup (global, not course-scoped -- matches
-- VOCAB_IMAGES in src/data/vocab-images.ts, which is looked up by
-- lowercased term regardless of course)
CREATE TABLE public.vocab_images (
  term text PRIMARY KEY,            -- lowercased key
  url text NOT NULL,
  alt text NOT NULL,
  credit text NOT NULL
);
GRANT SELECT ON public.vocab_images TO authenticated, anon;
GRANT ALL ON public.vocab_images TO service_role;
ALTER TABLE public.vocab_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vocab_images_read_all" ON public.vocab_images FOR SELECT USING (true);

-- =========== placement_questions ===========
CREATE TABLE public.placement_questions (
  id text PRIMARY KEY,
  course text NOT NULL,
  level_id text NOT NULL REFERENCES public.levels(id),
  prompt text NOT NULL,
  choices jsonb NOT NULL,           -- string[]
  answer_index integer NOT NULL
);
CREATE INDEX ON public.placement_questions(course, level_id);
GRANT SELECT ON public.placement_questions TO authenticated, anon;
GRANT ALL ON public.placement_questions TO service_role;
ALTER TABLE public.placement_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "placement_questions_read_all" ON public.placement_questions FOR SELECT USING (true);

-- =========== scenarios ===========
-- AI roleplay personas (course-agnostic -- no French variant exists
-- today; src/data/scenarios.ts has no course field)
CREATE TABLE public.scenarios (
  id text PRIMARY KEY,
  title text NOT NULL,
  emoji text NOT NULL,
  blurb text NOT NULL,
  level text NOT NULL,              -- 'Beginner' | 'Intermediate' | 'Advanced' (own scale, not CEFR)
  system_prompt text NOT NULL,
  opener text NOT NULL
);
GRANT SELECT ON public.scenarios TO authenticated, anon;
GRANT ALL ON public.scenarios TO service_role;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenarios_read_all" ON public.scenarios FOR SELECT USING (true);
```

- [ ] **Step 2: Sanity-check the file for syntax issues**

Run: `npx supabase db lint --schema public 2>&1 || true` is not reliable without a running project, so instead just re-read the file back and confirm:
- Every `CREATE TABLE` has a matching `GRANT`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, and `CREATE POLICY` block (7 of each).
- No `CREATE POLICY` references a table that hasn't been created yet in the file (top-to-bottom order matters for `REFERENCES` too: `levels` before `units`/`placement_questions`, `units` before `lessons`, `lessons` before `questions`).

This is a manual read-through, not a command — there is no local Postgres running yet to lint against (that's Task 2).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260918120000_curriculum_data_tables.sql
git commit -m "feat(db): add curriculum data tables (levels, units, lessons, questions, vocab_images, placement_questions, scenarios)"
```

---

### Task 2: Apply the migration to a local Supabase instance

**Files:**
- None created/modified — this task runs the migration written in Task 1 against a local Postgres via the Supabase CLI.

**Interfaces:**
- Consumes: `supabase/migrations/20260918120000_curriculum_data_tables.sql` from Task 1.
- Produces: a running local Supabase stack (Postgres on the CLI's default local port) with all 7 tables created — Task 3's verification queries run against this instance.

- [ ] **Step 1: Start the local Supabase stack**

Run: `npx supabase start`

This requires Docker (already confirmed available in this environment: `docker --version` succeeded). First run pulls several images and can take a few minutes. If it fails because Docker isn't running or reachable in this session's sandbox, stop here and report that local verification isn't possible in this environment — do not skip straight to marking the migration verified.

- [ ] **Step 2: Confirm the migration applied**

`supabase start` runs all migrations in `supabase/migrations/` automatically against the fresh local database. Verify the new tables exist:

Run:
```bash
npx supabase db execute --local --sql "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('levels','units','lessons','questions','vocab_images','placement_questions','scenarios') order by table_name;"
```

Expected output: all 7 table names listed.

If the migration failed to apply (`supabase start` would have printed an error), read the error, fix the SQL in Task 1's file, and re-run `npx supabase db reset` (this re-applies every migration from scratch against the local instance) before continuing.

---

### Task 3: Verify constraints and RLS behave as designed

**Files:**
- Create (scratchpad, not committed): `<scratchpad>/verify-curriculum-schema.sql` — a throwaway verification script, per the spec's Testing section ("worth a quick manual INSERT sanity check per constraint during implementation"). This is not application test infrastructure and does not get added to the repo.

**Interfaces:**
- Consumes: the local Supabase instance from Task 2, with the 7 tables from Task 1.
- Produces: confirmation (this task's own console output) that the `question_shape_matches_type` CHECK constraint and the RLS read/write posture work as declared. Nothing here is consumed by a later task — this plan ends after Task 4.

- [ ] **Step 1: Write the verification script**

Create `<scratchpad>/verify-curriculum-schema.sql` (use this session's scratchpad directory) with:

```sql
-- Valid row chain (levels -> units -> lessons -> questions) should succeed.
insert into public.levels (id, name, blurb, sort_order) values ('A1', 'Beginner', 'Greetings, basics, everyday routines.', 1);
insert into public.units (id, course, level_id, eyebrow, title, description, sort_order) values ('u1', 'en', 'A1', 'Unit 1', 'Everyday Basics', 'Greetings, introductions, and the present simple.', 1);
insert into public.lessons (id, unit_id, title, subtitle, sort_order) values ('u1l1', 'u1', 'Saying Hello', 'Common greetings', 1);
insert into public.questions (lesson_id, id, type, prompt, choices, answer_index, explanation, sort_order)
  values ('u1l1', 'q1', 'mc', 'Which is a formal greeting?', '["Hey!","What''s up?","Good morning.","Yo."]'::jsonb, 2, 'Good morning is polite.', 1);
insert into public.questions (lesson_id, id, type, prompt, bank, answer_text, explanation, sort_order)
  values ('u1l1', 'q2', 'fill', 'Nice to ___ you.', '["meet","meat","met","meeting"]'::jsonb, 'meet', 'Standard phrase.', 2);

-- Malformed row: type='mc' but choices/answer_index left null and
-- fill-only columns set instead. Must be rejected by
-- question_shape_matches_type.
do $$
begin
  begin
    insert into public.questions (lesson_id, id, type, prompt, bank, answer_text, explanation, sort_order)
      values ('u1l1', 'q_bad', 'mc', 'broken', '["a","b"]'::jsonb, 'a', 'should fail', 3);
    raise exception 'expected question_shape_matches_type to reject this row, but insert succeeded';
  exception
    when check_violation then
      raise notice 'PASS: malformed mc row correctly rejected by question_shape_matches_type';
  end;
end $$;

-- vocab_images, placement_questions, scenarios: simple valid-row checks
-- (no CHECK constraints of their own, just confirming the tables accept
-- well-formed rows per their NOT NULL/FK requirements).
insert into public.vocab_images (term, url, alt, credit) values ('children', 'https://images.pexels.com/example.jpg', 'A joyful sibling pair outdoors.', 'Janko Ferlic');
insert into public.placement_questions (id, course, level_id, prompt, choices, answer_index) values ('p1', 'en', 'A1', 'She ___ a teacher.', '["are","is","be","am"]'::jsonb, 1);
insert into public.scenarios (id, title, emoji, blurb, level, system_prompt, opener) values ('coffee', 'Order coffee', '☕', 'Practice ordering at a cozy café.', 'Beginner', 'You are Mia, a warm barista...', 'Hi there! Welcome to Ember Coffee.');

select 'row counts' as check, table_name, count(*) from (
  select 'levels' as table_name, id from public.levels
  union all select 'units', id from public.units
  union all select 'lessons', id from public.lessons
  union all select 'questions', lesson_id from public.questions
  union all select 'vocab_images', term from public.vocab_images
  union all select 'placement_questions', id from public.placement_questions
  union all select 'scenarios', id from public.scenarios
) t group by table_name order by table_name;
```

- [ ] **Step 2: Run the verification script against the local instance**

Run: `npx supabase db execute --local --file <scratchpad>/verify-curriculum-schema.sql`

Expected: every `insert` succeeds, the `do $$ ... $$` block prints `NOTICE: PASS: malformed mc row correctly rejected by question_shape_matches_type` (confirming the bad row was rejected, not inserted), and the final row-counts query shows 1 row in every table except `questions` (2 rows — `q1` and `q2`; `q_bad` must NOT appear, since it was rejected).

If the malformed-row insert *succeeds* instead of raising `check_violation`, the `question_shape_matches_type` constraint in Task 1's migration is wrong — go back, fix the `CHECK` clause, `npx supabase db reset` to re-apply from scratch, and re-run this verification.

- [ ] **Step 3: Verify RLS blocks anon writes but allows anon reads**

Run:
```bash
npx supabase db execute --local --sql "set role anon; select count(*) from public.levels;"
```
Expected: succeeds, returns a count (RLS read policy working).

Run:
```bash
npx supabase db execute --local --sql "set role anon; insert into public.levels (id, name, blurb, sort_order) values ('ZZ', 'test', 'test', 99);"
```
Expected: fails with a permission-denied error (no `INSERT` grant/policy exists for `anon` — this is enforced by the `GRANT` statements in Task 1's migration, since RLS policies alone don't grant table-level privileges; the absence of an `INSERT` policy plus the absence of an `INSERT` grant to `anon` in Task 1 together block this).

- [ ] **Step 4: Stop the local Supabase stack**

Run: `npx supabase stop`

This tears down the local Docker containers. The scratchpad verification script is intentionally left uncommitted (throwaway, per its own file header comment above) — no cleanup commit needed for it.

---

### Task 4: Final commit check

**Files:**
- None new — this task confirms the working tree is clean and the migration from Task 1 is the only change this plan introduces.

**Interfaces:**
- Consumes: the commit from Task 1, Step 3.
- Produces: nothing further — this is the plan's terminal task.

- [ ] **Step 1: Confirm git status is clean**

Run: `git status`

Expected: `nothing to commit, working tree clean` (Task 1's migration file was already committed; Task 2/3 touched only local Docker state and a scratchpad file, neither tracked by git).

- [ ] **Step 2: Confirm the migration is the only new file since this plan started**

Run: `git log --oneline -3 -- supabase/migrations/`

Expected: the top entry is Task 1's commit (`feat(db): add curriculum data tables ...`), touching exactly one new file, `supabase/migrations/20260918120000_curriculum_data_tables.sql`.
