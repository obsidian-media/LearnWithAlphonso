-- Admin console rebuild, PR 10 (Podcast): every podcast and folder write carries a reason, recorded in the same transaction.
--
--   N-7  The nine podcast/folder writes were direct table writes from admin.functions.ts followed by a SEPARATE
--        staff_record call with reason NULL (a record that failed after the change was only logged). They are now one SQL
--        function each: it checks the reason (trimmed, 3 to 500 characters, in SQL, BEFORE anything changes), makes the
--        change and writes the staff_audit_log row, all in one transaction. A missing, short or long reason raises 22023
--        and nothing changes and nothing is recorded. Action names are unchanged (podcast.folder.create ... ), and the
--        row stores ids and sizes only in `after`, never the text a person typed (titles and transcripts stay in their own
--        tables).
--
--          staff_podcast_folder_create / _rename / _move / _delete
--          staff_podcast_episode_create / _update / _set_published / _audio_replace
--          staff_podcast_transcript_save   (empty text removes the transcript, as before)
--
--   Also: staff_podcast_folder_counts() (episodes and published episodes per folder, grouped in the database so a
--   long list cannot be truncated by the API row limit), and a cycle guard in staff_podcast_folder_move (the TypeScript
--   check still gives the readable message; this closes the race between its read and the write).
--
--   Publishing now stamps published_at the first time (the CLI has always done; the console did not), so the screen can
--   show a real "Published <date>".
--
-- Callers (grepped): admin.functions.ts is the only caller. scripts/podcast-tool.ts (the owner-run pipeline, service
-- role) writes the tables directly and never called these, so it is untouched and keeps working: there are no triggers
-- here, only functions. supabase/functions has no podcast writes.
--
-- All SECURITY DEFINER, search_path = '', EXECUTE for service_role only.
-- Depends on 20261113100000 (staff_record) and 20260926030000 / 20260927230000 / 20261012500100 (the podcast tables).
--
-- Rollback: DROP the eleven functions below; admin.functions.ts then needs its previous version.

-- The one place the reason rule lives for the podcast actions.
CREATE FUNCTION public.staff_podcast_reason(p_reason text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 OR char_length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'a reason of 3 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  RETURN btrim(p_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_reason(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_reason(text) TO service_role;

-- ---- folders ----

CREATE FUNCTION public.staff_podcast_folder_create(
  p_actor uuid, p_role text, p_parent uuid, p_slug text, p_title text, p_description text, p_sort_order integer,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_podcast_reason(p_reason);
  new_id uuid;
BEGIN
  INSERT INTO public.podcast_folders (parent_id, slug, title, description, sort_order)
  VALUES (p_parent, p_slug, p_title, p_description, COALESCE(p_sort_order, 0))
  RETURNING id INTO new_id;
  PERFORM public.staff_record(
    p_actor, p_role, 'podcast.folder.create', NULL, why, NULL,
    jsonb_build_object('folderId', new_id, 'parentId', p_parent, 'slug', p_slug), NULL);
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_folder_create(uuid, text, uuid, text, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_folder_create(uuid, text, uuid, text, text, text, integer, text)
  TO service_role;

-- Title and description only: the slug is part of every episode's storage path underneath the folder.
-- Returns false (nothing recorded) when the folder is gone.
CREATE FUNCTION public.staff_podcast_folder_rename(
  p_actor uuid, p_role text, p_id uuid, p_title text, p_description text, p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_podcast_reason(p_reason);
  changed integer;
BEGIN
  UPDATE public.podcast_folders SET title = p_title, description = p_description WHERE id = p_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 0 THEN
    RETURN false;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'podcast.folder.rename', NULL, why, NULL, jsonb_build_object('folderId', p_id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_folder_rename(uuid, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_folder_rename(uuid, text, uuid, text, text, text) TO service_role;

-- Returns false when the folder is gone. Refuses (23514) a move that would put the folder inside itself.
CREATE FUNCTION public.staff_podcast_folder_move(
  p_actor uuid, p_role text, p_id uuid, p_parent uuid, p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_podcast_reason(p_reason);
  changed integer;
BEGIN
  IF p_parent IS NOT NULL AND (
    p_parent = p_id OR EXISTS (
      WITH RECURSIVE up(id, parent_id) AS (
        SELECT f.id, f.parent_id FROM public.podcast_folders f WHERE f.id = p_parent
        UNION
        SELECT f.id, f.parent_id FROM public.podcast_folders f JOIN up ON f.id = up.parent_id
      )
      SELECT 1 FROM up WHERE up.id = p_id
    )
  ) THEN
    RAISE EXCEPTION 'that move would put the folder inside itself' USING ERRCODE = '23514';
  END IF;
  UPDATE public.podcast_folders SET parent_id = p_parent WHERE id = p_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 0 THEN
    RETURN false;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'podcast.folder.move', NULL, why, NULL,
    jsonb_build_object('folderId', p_id, 'parentId', p_parent), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_folder_move(uuid, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_folder_move(uuid, text, uuid, uuid, text) TO service_role;

-- Returns false when the folder is already gone. A folder with subfolders or episodes is refused by the foreign keys
-- (ON DELETE RESTRICT, 23503), which stay the control.
CREATE FUNCTION public.staff_podcast_folder_delete(p_actor uuid, p_role text, p_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_podcast_reason(p_reason);
  removed integer;
BEGIN
  DELETE FROM public.podcast_folders WHERE id = p_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed = 0 THEN
    RETURN false;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'podcast.folder.delete', NULL, why, NULL, jsonb_build_object('folderId', p_id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_folder_delete(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_folder_delete(uuid, text, uuid, text) TO service_role;

-- Episodes and published episodes per folder. Grouped here so the count never depends on an API row limit.
CREATE FUNCTION public.staff_podcast_folder_counts()
RETURNS TABLE (folder_id uuid, total bigint, published bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT e.folder_id, count(*)::bigint, count(*) FILTER (WHERE e.published)::bigint
      FROM public.podcast_episodes e
     GROUP BY e.folder_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_folder_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_folder_counts() TO service_role;

-- ---- episodes ----

-- A brand-new episode, unpublished, after its audio was verified and promoted by the server.
CREATE FUNCTION public.staff_podcast_episode_create(
  p_actor uuid, p_role text, p_folder uuid, p_slug text, p_title text, p_description text, p_audio_path text,
  p_duration integer, p_course text, p_level text, p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_podcast_reason(p_reason);
  new_id uuid;
BEGIN
  INSERT INTO public.podcast_episodes
    (folder_id, slug, title, description, audio_path, duration_seconds, course, level_id, source, published)
  VALUES
    (p_folder, p_slug, p_title, p_description, p_audio_path, p_duration, p_course, p_level, 'upload', false)
  RETURNING id INTO new_id;
  PERFORM public.staff_record(
    p_actor, p_role, 'podcast.episode.create', NULL, why, NULL,
    jsonb_build_object('episodeId', new_id, 'folderId', p_folder, 'slug', p_slug), NULL);
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_episode_create(uuid, text, uuid, text, text, text, text, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_episode_create(uuid, text, uuid, text, text, text, text, integer, text, text, text)
  TO service_role;

-- Title and description only (the slug is baked into the storage path). Returns false when the episode is gone.
CREATE FUNCTION public.staff_podcast_episode_update(
  p_actor uuid, p_role text, p_id uuid, p_title text, p_description text, p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_podcast_reason(p_reason);
  changed integer;
BEGIN
  UPDATE public.podcast_episodes SET title = p_title, description = p_description WHERE id = p_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 0 THEN
    RETURN false;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'podcast.episode.update', NULL, why, NULL, jsonb_build_object('episodeId', p_id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_episode_update(uuid, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_episode_update(uuid, text, uuid, text, text, text) TO service_role;

-- Publish or unlist. Publishing stamps published_at the first time only. The table's published_licensed CHECK still
-- refuses audio the app may not distribute (23514). Returns false when the episode is gone.
CREATE FUNCTION public.staff_podcast_episode_set_published(
  p_actor uuid, p_role text, p_id uuid, p_published boolean, p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_podcast_reason(p_reason);
  changed integer;
BEGIN
  IF p_published IS NULL THEN
    RAISE EXCEPTION 'published must be true or false' USING ERRCODE = '22023';
  END IF;
  UPDATE public.podcast_episodes
     SET published = p_published,
         published_at = CASE WHEN p_published THEN COALESCE(published_at, now()) ELSE published_at END
   WHERE id = p_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 0 THEN
    RETURN false;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role,
    CASE WHEN p_published THEN 'podcast.episode.publish' ELSE 'podcast.episode.unpublish' END,
    NULL, why, NULL, jsonb_build_object('episodeId', p_id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_episode_set_published(uuid, text, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_episode_set_published(uuid, text, uuid, boolean, text) TO service_role;

-- The new duration, written only after the server verified and promoted the replacement audio.
CREATE FUNCTION public.staff_podcast_episode_audio_replace(
  p_actor uuid, p_role text, p_id uuid, p_duration integer, p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_podcast_reason(p_reason);
  changed integer;
BEGIN
  UPDATE public.podcast_episodes SET duration_seconds = p_duration WHERE id = p_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 0 THEN
    RETURN false;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'podcast.episode.audio_replace', NULL, why, NULL,
    jsonb_build_object('episodeId', p_id, 'durationSeconds', p_duration), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_episode_audio_replace(uuid, text, uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_episode_audio_replace(uuid, text, uuid, integer, text)
  TO service_role;

-- Saves a transcript (the server has already normalised and refused markup). Empty text removes it. Returns 'saved' or
-- 'deleted'. An episode that does not exist is refused by the foreign key (23503).
CREATE FUNCTION public.staff_podcast_transcript_save(
  p_actor uuid, p_role text, p_episode uuid, p_text text, p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_podcast_reason(p_reason);
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    DELETE FROM public.podcast_transcripts WHERE episode_id = p_episode;
    PERFORM public.staff_record(
      p_actor, p_role, 'podcast.transcript.delete', NULL, why, NULL, jsonb_build_object('episodeId', p_episode), NULL);
    RETURN 'deleted';
  END IF;
  INSERT INTO public.podcast_transcripts (episode_id, text) VALUES (p_episode, p_text)
  ON CONFLICT (episode_id) DO UPDATE SET text = EXCLUDED.text, updated_at = now();
  PERFORM public.staff_record(
    p_actor, p_role, 'podcast.transcript.save', NULL, why, NULL,
    jsonb_build_object('episodeId', p_episode, 'characters', char_length(p_text)), NULL);
  RETURN 'saved';
END;
$$;
REVOKE ALL ON FUNCTION public.staff_podcast_transcript_save(uuid, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_podcast_transcript_save(uuid, text, uuid, text, text) TO service_role;
