import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * The whole migration history replayed in order into PGlite, with stand-ins for what Supabase provides (auth,
 * storage, pg_net, pg_cron, the API roles). Lets a test EXECUTE the real, final version of every function and
 * policy as a seeded user instead of reading SQL text. Takes a few seconds.
 *
 * The two extensions PGlite does not ship are replaced by stub functions with the same call shape; the
 * migrations' CREATE EXTENSION lines for them are dropped.
 */
export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

const STUBS = `
  CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE supabase_admin;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(), raw_user_meta_data jsonb);
  CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
  CREATE TABLE auth.refresh_tokens (id bigserial PRIMARY KEY, user_id varchar(255), session_id uuid);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
  CREATE SCHEMA extensions; CREATE SCHEMA cron; CREATE SCHEMA net;
  CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql
    AS $$ SELECT substring(decode(md5(random()::text) || md5(random()::text), 'hex') from 1 for n) $$;
  CREATE FUNCTION net.http_post(url text DEFAULT NULL, body jsonb DEFAULT NULL, params jsonb DEFAULT NULL,
    headers jsonb DEFAULT NULL, timeout_milliseconds integer DEFAULT NULL) RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
  CREATE FUNCTION cron.schedule(job text, schedule text, command text) RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
  CREATE FUNCTION cron.unschedule(job text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
`;

/** `skip` leaves out migration files (by name), so a test can apply them itself and compare before and after. */
export async function buildFullSchema(options: { skip?: readonly string[] } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !options.skip?.includes(f))
    .sort()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(
      /CREATE EXTENSION IF NOT EXISTS (pg_net|pg_cron);/gi,
      "",
    );
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`migration ${file} failed to apply: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Run `fn` as a role (default authenticated) with auth.uid() = uid; always resets. */
export async function asUser<T>(
  db: PGlite,
  uid: string,
  fn: () => Promise<T>,
  role: "authenticated" | "anon" | "service_role" = "authenticated",
): Promise<T> {
  await db.exec(`SELECT set_config('app.uid', '${uid}', false); SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('app.uid', '', false)");
  }
}
