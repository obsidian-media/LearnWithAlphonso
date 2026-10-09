import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LICENSED_PROVIDERS, VOICE_PROVIDERS } from "./podcast-provenance";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const PLAYBACK = "20261012500000_podcast_playback_user_default.sql";
const PROVENANCE = "20261012500100_podcast_episode_voice_provenance.sql";
const LICENSED_CHECK = "20261012500200_podcast_published_licensed_check.sql";
const read = (file: string) => fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
const version = (file: string) => file.slice(0, 14);

const ALL_MIGRATIONS = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql"));
const OURS = [PLAYBACK, PROVENANCE, LICENSED_CHECK];

describe("podcast migration ordering", () => {
  it("lists the three podcast migrations among the real migration files", () => {
    for (const file of OURS) expect(ALL_MIGRATIONS).toContain(file);
  });

  it("sorts after every other migration in the directory (db push refuses an older version)", () => {
    const others = ALL_MIGRATIONS.filter((file) => !OURS.includes(file));
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) {
      expect(version(PLAYBACK) > version(other), `${PLAYBACK} must sort after ${other}`).toBe(true);
    }
  });

  it("applies in order: playback, then provenance, then the licensed check", () => {
    expect(version(PLAYBACK) < version(PROVENANCE)).toBe(true);
    expect(version(PROVENANCE) < version(LICENSED_CHECK)).toBe(true);
  });

  it("has no duplicate versions", () => {
    const versions = ALL_MIGRATIONS.map(version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe("podcast playback default migration", () => {
  it("defaults user_id to the caller, which is what the iOS first save relies on", () => {
    expect(read(PLAYBACK)).toMatch(
      /ALTER TABLE public\.podcast_playback ALTER COLUMN user_id SET DEFAULT auth\.uid\(\);/,
    );
  });

  it("asserts the (user_id, episode_id) unique key the client upserts on, adding one if missing", () => {
    const sql = read(PLAYBACK);
    expect(sql).toContain("ARRAY['episode_id', 'user_id']");
    expect(sql).toContain("UNIQUE (user_id, episode_id)");
  });

  it("changes no privileges and no policy", () => {
    const sql = read(PLAYBACK);
    expect(sql).not.toMatch(/\bGRANT\b|\bREVOKE\b|CREATE POLICY|DROP POLICY/);
  });

  it("documents its rollback", () => {
    expect(read(PLAYBACK)).toMatch(/Rollback:[\s\S]*DROP DEFAULT/);
  });
});

describe("podcast voice provenance migration", () => {
  it("runs after the playback migration", () => {
    expect(version(PROVENANCE) > version(PLAYBACK)).toBe(true);
  });

  it("allows exactly the providers the authoring tool knows", () => {
    const match = read(PROVENANCE).match(/CHECK \(voice_provider IN \(([^)]*)\)\)/);
    expect(match).not.toBeNull();
    const inSql = match![1]!.split(",").map((value) => value.trim().replace(/'/g, ""));
    expect([...inSql].sort()).toEqual([...VOICE_PROVIDERS].sort());
  });

  it("defaults existing and admin-uploaded rows to unknown, and marks Deepgram TTS rows", () => {
    const sql = read(PROVENANCE);
    expect(sql).toContain("voice_provider text NOT NULL DEFAULT 'unknown'");
    expect(sql).toMatch(
      /UPDATE public\.podcast_episodes SET voice_provider = 'deepgram' WHERE source = 'tts';/,
    );
  });

  it("grants nothing new to clients and creates no table", () => {
    const sql = read(PROVENANCE);
    expect(sql).not.toMatch(/\bGRANT\b/);
    expect(sql).not.toMatch(/CREATE TABLE/);
  });

  it("documents its rollback", () => {
    expect(read(PROVENANCE)).toMatch(
      /Rollback:[\s\S]*DROP COLUMN voice_model, DROP COLUMN voice_provider/,
    );
  });
});

describe("published-must-be-licensed migration", () => {
  const sql = read(LICENSED_CHECK);

  it("allows exactly the providers the app may publish", () => {
    const match = sql.match(
      /CHECK \(NOT published OR voice_provider IN \(([^)]*)\)\)\s+NOT VALID;/,
    );
    expect(match).not.toBeNull();
    const inSql = match![1]!.split(",").map((value) => value.trim().replace(/'/g, ""));
    expect([...inSql].sort()).toEqual([...LICENSED_PROVIDERS].sort());
  });

  it("is NOT VALID, so the rows that exist today do not fail it", () => {
    expect(sql).toMatch(
      /ADD CONSTRAINT podcast_episodes_published_licensed\s+CHECK \([^;]*\) NOT VALID;/,
    );
  });

  it("documents its rollback and the later VALIDATE", () => {
    expect(sql).toMatch(/Rollback:[\s\S]*DROP CONSTRAINT podcast_episodes_published_licensed/);
    expect(sql).toContain("VALIDATE CONSTRAINT");
  });

  it("grants nothing and creates no table", () => {
    expect(sql).not.toMatch(/\bGRANT\b|CREATE TABLE/);
  });
});
