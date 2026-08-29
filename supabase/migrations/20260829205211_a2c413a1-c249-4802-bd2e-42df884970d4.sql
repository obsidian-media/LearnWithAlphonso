ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS cefr_level text NOT NULL DEFAULT 'A1',
  ADD COLUMN IF NOT EXISTS placement_level text,
  ADD COLUMN IF NOT EXISTS placement_score integer,
  ADD COLUMN IF NOT EXISTS placement_taken_at timestamptz;

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  kind text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, kind)
);

GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_select_own" ON public.ai_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.consume_ai_quota(_kind text, _limit integer)
RETURNS TABLE(allowed boolean, used integer, quota integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  new_count integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 0, _limit;
    RETURN;
  END IF;

  IF _kind NOT IN ('chat', 'stt', 'tts') THEN
    RETURN QUERY SELECT false, 0, _limit;
    RETURN;
  END IF;

  INSERT INTO public.ai_usage (user_id, day, kind, count)
  VALUES (me, current_date, _kind, 1)
  ON CONFLICT (user_id, day, kind) DO UPDATE
    SET count = public.ai_usage.count + 1, updated_at = now()
  RETURNING public.ai_usage.count INTO new_count;

  IF new_count > _limit THEN
    RETURN QUERY SELECT false, new_count, _limit;
  ELSE
    RETURN QUERY SELECT true, new_count, _limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text, integer) TO authenticated, service_role;

CREATE TRIGGER touch_ai_usage_updated
  BEFORE UPDATE ON public.ai_usage
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();