-- review_items' UNIQUE constraint was (user_id, item_key) with no language
-- dimension, even though a `language` column already exists (added
-- 20260908020628). Low collision risk today since lesson IDs are
-- per-course-prefixed, but not structurally prevented -- close it properly
-- so a French and an English item can never collide, and the app's
-- upsert(..., { onConflict: "user_id,item_key,language" }) has a real
-- constraint to target.

ALTER TABLE public.review_items DROP CONSTRAINT review_items_user_id_item_key_key;
ALTER TABLE public.review_items ADD CONSTRAINT review_items_user_id_item_key_language_key
  UNIQUE (user_id, item_key, language);
