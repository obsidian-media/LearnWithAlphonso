import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkNewTableGrants } from "../migration-grants";
import { VOCAB_IMAGE_BUCKET, VOCAB_IMAGE_MAX_BYTES, VOCAB_IMAGE_MIME } from "./url-policy";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../../supabase/migrations");
const FILE = "20261008140000_vocab_images_bucket.sql";
const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
const code = (s: string) => s.replace(/--[^\n]*/g, "");

describe("vocab-images bucket migration", () => {
  it("sorts after the newest migration on main when it was written", () => {
    expect(FILE.slice(0, 14) > "20261007100000").toBe(true);
  });

  it("creates the public bucket with the url-policy constants, idempotently", () => {
    const c = code(sql()).replace(/\s+/g, " ");
    expect(c).toContain(
      `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('${VOCAB_IMAGE_BUCKET}', '${VOCAB_IMAGE_BUCKET}', true, ${VOCAB_IMAGE_MAX_BYTES}, ARRAY['${VOCAB_IMAGE_MIME}'])`,
    );
    expect(c).toMatch(/ON CONFLICT \(id\) DO UPDATE SET public = EXCLUDED\.public/i);
  });

  it("no migration gives any role a storage.objects policy on the bucket", () => {
    const offenders = fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .flatMap((f) =>
        code(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"))
          .split(";")
          .filter(
            (st) =>
              /CREATE\s+POLICY[\s\S]*\bON\s+storage\.objects\b/i.test(st) &&
              st.includes(`'${VOCAB_IMAGE_BUCKET}'`),
          )
          .map((st) => `${f}: ${st.trim().slice(0, 80)}`),
      );
    expect(offenders).toEqual([]);
  });

  it("creates no table, so the client-grants rule has nothing to flag", () => {
    expect(code(sql())).not.toMatch(/CREATE\s+TABLE/i);
    expect(checkNewTableGrants(sql())).toEqual([]);
  });
});
