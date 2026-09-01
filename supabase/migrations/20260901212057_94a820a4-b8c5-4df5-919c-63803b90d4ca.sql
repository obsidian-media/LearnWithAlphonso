CREATE TABLE public.review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  lesson_id text NOT NULL,
  level text NOT NULL DEFAULT 'A1',
  ease real NOT NULL DEFAULT 2.5,
  interval_days integer NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  due_on date NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_items TO authenticated;
GRANT ALL ON public.review_items TO service_role;

ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ri_own_all" ON public.review_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX review_items_due_idx ON public.review_items (user_id, due_on);

CREATE TRIGGER touch_review_items_updated
  BEFORE UPDATE ON public.review_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();