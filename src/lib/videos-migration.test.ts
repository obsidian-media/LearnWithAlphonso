import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const MIGRATIONS = path.join(process.cwd(), "supabase/migrations");
const FILE = "20261115100000_videos_watch_shelf.sql";
const migration = readFileSync(path.join(MIGRATIONS, FILE), "utf8");

describe("videos migration ordering", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
  const version = (f: string) => f.slice(0, 14);
  it("sorts after the newest migration it was written on top of and after levels (db push refuses an older version)", () => {
    expect(version(FILE) > "20261114100000").toBe(true);
    expect(version(FILE) > "20260918120000").toBe(true);
  });
  it("has no duplicate versions", () => {
    expect(new Set(files.map(version)).size).toBe(files.length);
  });
});

describe("videos + video_watches (real Postgres, run as seeded users)", () => {
  let db: PGlite;
  let published: string;
  let draft: string;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role, anon;
      GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
      CREATE TABLE public.levels (id text PRIMARY KEY);
      INSERT INTO public.levels VALUES ('A1'), ('A2');
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (
        id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
        file_size_limit bigint, allowed_mime_types text[]
      );
      CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text);
    `);
    await db.exec(migration);
    const pub = await db.query<{ id: string }>(
      `INSERT INTO public.videos (slug, course, title, level_id, duration_seconds, video_path, captions_path, published)
       VALUES ('en-live', 'en', 'Live', 'A1', 100, 'en/live.mp4', 'en/live.en.vtt', true) RETURNING id`,
    );
    const dr = await db.query<{ id: string }>(
      `INSERT INTO public.videos (slug, course, title, duration_seconds, video_path)
       VALUES ('en-draft', 'en', 'Draft', 100, 'en/draft.mp4') RETURNING id`,
    );
    published = pub.rows[0].id;
    draft = dr.rows[0].id;
  });

  async function asUser(uid: string | null, fn: () => Promise<void>) {
    await db.query("SELECT set_config('test.uid', $1, false)", [uid ?? ""]);
    await db.exec("SET ROLE authenticated");
    try {
      await fn();
    } finally {
      await db.exec("RESET ROLE");
    }
  }
  const save = (id: string, pos: number | null) =>
    db.query<{ progress_seconds: number; completed_at: string | null }>(
      "SELECT * FROM public.save_video_progress($1::uuid, $2::integer)",
      [id, pos],
    );

  it("refuses to publish a video that has no captions", async () => {
    await expect(
      db.exec(`UPDATE public.videos SET captions_path = NULL WHERE id = '${published}'`),
    ).rejects.toThrow(/videos_published_has_captions/);
    await expect(
      db.exec(`UPDATE public.videos SET published = true WHERE id = '${draft}'`),
    ).rejects.toThrow(/videos_published_has_captions/);
    // Unpublishing a captionless video, and drafting one, stays allowed.
    await db.exec(
      `UPDATE public.videos SET published = false, captions_path = NULL WHERE id = '${published}'`,
    );
  });

  it("requires the practice target to be both a kind and an id, or neither", async () => {
    await expect(
      db.exec(`UPDATE public.videos SET practice_kind = 'talk' WHERE id = '${draft}'`),
    ).rejects.toThrow(/videos_practice_pair/);
    await expect(
      db.exec(`UPDATE public.videos SET practice_id = 'coffee' WHERE id = '${draft}'`),
    ).rejects.toThrow(/videos_practice_pair/);
    await expect(
      db.exec(
        `UPDATE public.videos SET practice_kind = 'quiz', practice_id = 'x' WHERE id = '${draft}'`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `UPDATE public.videos SET practice_kind = 'talk', practice_id = 'coffee' WHERE id = '${draft}'`,
    );
  });

  it("shows clients only published videos and lets them write nothing", async () => {
    await asUser(U1, async () => {
      const rows = await db.query<{ slug: string }>("SELECT slug FROM public.videos ORDER BY slug");
      expect(rows.rows.map((r) => r.slug)).toEqual(["en-live"]);
      await expect(
        db.exec(
          `INSERT INTO public.videos (slug, course, title, duration_seconds, video_path) VALUES ('x','en','x',1,'x')`,
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(db.exec(`UPDATE public.videos SET title = 'hacked'`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.exec(`DELETE FROM public.videos`)).rejects.toThrow(/permission denied/);
    });
  });

  it("gives clients no direct write to video_watches: every write is through save_video_progress", async () => {
    await asUser(U1, async () => {
      await expect(
        db.exec(
          `INSERT INTO public.video_watches (user_id, video_id, progress_seconds) VALUES ('${U1}', '${published}', 5)`,
        ),
      ).rejects.toThrow(/permission denied/);
    });
    await asUser(U1, async () => {
      await save(published, 5);
      await expect(db.exec(`UPDATE public.video_watches SET completed_at = now()`)).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("clamps progress into [0, duration] and marks the last seconds as completed", async () => {
    await asUser(U1, async () => {
      expect((await save(published, 40)).rows[0]).toMatchObject({
        progress_seconds: 40,
        completed_at: null,
      });
      expect((await save(published, -9)).rows[0].progress_seconds).toBe(0);
      const end = (await save(published, 99999)).rows[0];
      expect(end.progress_seconds).toBe(100);
      expect(end.completed_at).not.toBeNull();
    });
  });

  it("never moves completed backwards when the learner re-watches from the start", async () => {
    await asUser(U1, async () => {
      const first = (await save(published, 100)).rows[0];
      const again = (await save(published, 3)).rows[0];
      expect(again.progress_seconds).toBe(3);
      expect(again.completed_at).toEqual(first.completed_at);
    });
  });

  it("rejects an unknown video, a draft, a null video, a null position and no session", async () => {
    await asUser(U1, async () => {
      await expect(save("10000000-0000-4000-8000-0000000000ff", 5)).rejects.toThrow(
        /unknown video/,
      );
      await expect(save(draft, 5)).rejects.toThrow(/unknown video/);
      await expect(save(published, null)).rejects.toThrow(/required/);
    });
    await asUser(null, async () => {
      await expect(save(published, 5)).rejects.toThrow(/not authenticated/);
    });
  });

  it("keeps each learner's rows to themselves", async () => {
    await asUser(U1, async () => {
      await save(published, 100);
    });
    await asUser(U2, async () => {
      const rows = await db.query("SELECT * FROM public.video_watches");
      expect(rows.rows).toHaveLength(0);
      await save(published, 10);
      expect((await db.query("SELECT * FROM public.video_watches")).rows).toHaveLength(1);
      // Deleting "my history" only reaches my own row.
      await db.exec(`DELETE FROM public.video_watches`);
    });
    await asUser(U1, async () => {
      expect((await db.query("SELECT * FROM public.video_watches")).rows).toHaveLength(1);
    });
  });

  it("cascades: deleting a user, or a video, removes its watch rows", async () => {
    await asUser(U1, async () => {
      await save(published, 10);
    });
    await asUser(U2, async () => {
      await save(published, 10);
    });
    await db.exec(`DELETE FROM auth.users WHERE id = '${U1}'`);
    expect((await db.query("SELECT 1 FROM public.video_watches")).rows).toHaveLength(1);
    await db.exec(`DELETE FROM public.videos WHERE id = '${published}'`);
    expect((await db.query("SELECT 1 FROM public.video_watches")).rows).toHaveLength(0);
  });

  it("creates the public videos bucket with a size cap and a type allow-list, and no storage policy", async () => {
    const b = await db.query<{
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>(
      "SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'videos'",
    );
    expect(b.rows[0].public).toBe(true);
    expect(Number(b.rows[0].file_size_limit)).toBe(52428800);
    expect(b.rows[0].allowed_mime_types).toEqual(
      expect.arrayContaining(["video/mp4", "image/jpeg", "text/vtt"]),
    );
    expect(migration).not.toMatch(/CREATE POLICY[^;]*storage\.objects/i);
  });
});
