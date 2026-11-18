-- Interactive branching stories: the owner-approved evolution of graded-stories v1
-- (docs/superpowers/specs/2026-11-18-interactive-branching-stories-design.md), built ON v1's tables
-- (20261121100000_graded_stories.sql). A branching story is a tree of read-along nodes joined by choice points,
-- reaching one of several endings. It extends public.stories with a `nodes` jsonb graph (no parallel tables) and
-- public.story_progress with an endings-found tracker and a one-way, farm-proof reading-credit flag.
--
-- A plain v1 story is just a branching story with no choices: `segments` set, `nodes` NULL, `branching` = false.
-- A branching story: `nodes` set, `branching` = true, `segments` empty (the text lives in the nodes). A CHECK keeps
-- `branching = (nodes IS NOT NULL)` so the flag can never disagree with the data.
--
-- Same security posture as v1: RLS published-only (inherited — no new table, the existing stories grant and policy
-- cover the new columns), own-row progress, SECURITY DEFINER + search_path='', service-role grading, and the
-- review-before-publish CHECK. The grader never trusts a client-claimed ending: it re-walks the stored graph.
--
-- Rollback:
--   DROP FUNCTION public.finish_branching_story(uuid, uuid, jsonb);
--   DELETE FROM public.stories WHERE slug = 'a-day-that-could-go-a-few-ways' AND course = 'en';
--   ALTER TABLE public.story_progress DROP COLUMN reading_credited, DROP COLUMN endings_found;
--   ALTER TABLE public.stories DROP COLUMN branching, DROP COLUMN nodes;
--   ALTER TABLE public.stories ADD CONSTRAINT stories_segments_check
--     CHECK (jsonb_typeof(segments) = 'array' AND jsonb_array_length(segments) BETWEEN 1 AND 60);

-- ---- Schema: extend public.stories with the node graph ----
ALTER TABLE public.stories
  ADD COLUMN nodes jsonb,
  ADD COLUMN branching boolean NOT NULL DEFAULT false;

-- The graph is read and written whole; shape validity is the human review plus the walk rehearsal, so the CHECK is
-- light: an object with a start id and a map object.
ALTER TABLE public.stories
  ADD CONSTRAINT stories_nodes_shape CHECK (
    nodes IS NULL
    OR (jsonb_typeof(nodes) = 'object' AND nodes ? 'start' AND jsonb_typeof(nodes->'map') = 'object')
  ),
  ADD CONSTRAINT stories_branching_consistent CHECK (branching = (nodes IS NOT NULL));

-- A branching story carries its text in the nodes, so its top-level segments array is empty; a linear story still
-- needs 1..60 segments. Replaces v1's inline segments check (auto-named stories_segments_check).
ALTER TABLE public.stories DROP CONSTRAINT IF EXISTS stories_segments_check;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_segments_shape CHECK (
    jsonb_typeof(segments) = 'array'
    AND (branching OR jsonb_array_length(segments) BETWEEN 1 AND 60)
  );

-- ---- Schema: extend public.story_progress with the endings tracker + farm-proof credit flag ----
ALTER TABLE public.story_progress
  ADD COLUMN endings_found jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(endings_found) = 'array'),
  -- One-way: set true the first time the learner reaches a `good` ending, then never cleared. The reading credit is
  -- gated on this flag, so replaying any path cannot farm it.
  ADD COLUMN reading_credited boolean NOT NULL DEFAULT false;

-- ---- Grader: re-walks the stored graph; the client's claimed ending is ignored ----
-- _path is a jsonb array of integers: the option index chosen at each choice node, in order. The function walks the
-- stored nodes from `start`, auto-following linear links, applying one path entry at each choice node, until it lands
-- on an ending — and THAT node (from the stored graph) is the authoritative ending and quality. A mismatched,
-- out-of-range, negative, or unconsumed path, or an unpublished / non-branching story, is rejected. A 100-step guard
-- stops any malformed cyclic graph. Reading is credited ONCE, on the first `good` ending (add_skill_results), under an
-- advisory lock so two finishes cannot both credit. Service role only: the server fn passes the verified user id.
-- Returns {status: 'not-found' | 'invalid' | 'applied', endingId, quality, endingsFound, endingsTotal, credited}.
CREATE FUNCTION public.finish_branching_story(_user_id uuid, _story_id uuid, _path jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _nodes jsonb;
  _map jsonb;
  _cur text;
  _node jsonb;
  _step integer := 0;
  _path_len integer;
  _guard integer := 0;
  _idx integer;
  _goto text;
  _ending_id text;
  _quality text;
  _found jsonb;
  _already boolean;
  _credited boolean := false;
  _total integer;
BEGIN
  IF _user_id IS NULL OR _story_id IS NULL OR jsonb_typeof(_path) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid branching submission';
  END IF;

  SELECT s.nodes INTO _nodes FROM public.stories s
    WHERE s.id = _story_id AND s.published AND s.branching AND s.nodes IS NOT NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-found'); END IF;

  _map := _nodes->'map';
  _cur := _nodes->>'start';
  _path_len := jsonb_array_length(_path);

  LOOP
    _guard := _guard + 1;
    IF _guard > 100 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    _node := _map->_cur;
    IF _node IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

    IF _node ? 'ending' THEN
      -- Reaching an ending with choices still left in the path means the path was fabricated.
      IF _step <> _path_len THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      _ending_id := _node->'ending'->>'id';
      _quality := _node->'ending'->>'quality';
      EXIT;
    ELSIF _node ? 'choice' THEN
      IF _step >= _path_len THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      IF jsonb_typeof(_path->_step) IS DISTINCT FROM 'number' THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      _idx := (_path->>_step)::int;
      -- Guard a negative index: jsonb array access counts negatives from the end, which would be a fabricated pick.
      IF _idx < 0 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      _goto := _node->'choice'->'options'->_idx->>'goto';
      IF _goto IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      _cur := _goto;
      _step := _step + 1;
    ELSIF _node ? 'next' THEN
      _cur := _node->>'next';
    ELSE
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
  END LOOP;

  -- Serialise this learner's finishes for this story so the first-good-ending credit is given once.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || _story_id::text, 0));

  SELECT coalesce(sp.endings_found, '[]'::jsonb), sp.reading_credited
    INTO _found, _already
    FROM public.story_progress sp WHERE sp.user_id = _user_id AND sp.story_id = _story_id;
  IF _found IS NULL THEN _found := '[]'::jsonb; END IF;
  _already := coalesce(_already, false);

  IF NOT (_found @> to_jsonb(ARRAY[_ending_id])) THEN
    _found := _found || to_jsonb(_ending_id);
  END IF;

  -- Credit reading once, on the first GOOD ending. Owner may switch to any-first-completion by dropping the quality
  -- test here (defaulted decision, flagged in the spec).
  IF _quality = 'good' AND NOT _already THEN
    _credited := true;
  END IF;

  INSERT INTO public.story_progress AS sp
    (user_id, story_id, endings_found, reading_credited, completed_at, updated_at)
  VALUES (_user_id, _story_id, _found, _already OR _credited, now(), now())
  ON CONFLICT (user_id, story_id) DO UPDATE
    SET endings_found = EXCLUDED.endings_found,
        reading_credited = EXCLUDED.reading_credited,
        completed_at = coalesce(sp.completed_at, EXCLUDED.completed_at),
        updated_at = now();

  IF _credited THEN
    PERFORM public.add_skill_results(
      _user_id,
      jsonb_build_array(jsonb_build_object('skill', 'reading', 'right', 1, 'total', 1))
    );
  END IF;

  _total := (SELECT count(*) FROM jsonb_each(_map) e WHERE e.value ? 'ending');

  RETURN jsonb_build_object(
    'status', 'applied',
    'endingId', _ending_id,
    'quality', _quality,
    'endingsFound', _found,
    'endingsTotal', _total,
    'credited', _credited
  );
END;
$$;
REVOKE ALL ON FUNCTION public.finish_branching_story(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_branching_story(uuid, uuid, jsonb) TO service_role;

-- ---- Seed: one hand-crafted proof story, UNPUBLISHED and flagged needs_review ----
-- "A Day That Could Go a Few Ways" (EN, A2): 3 blended choice points, 4 endings; each choice both advances the plot
-- and only makes sense to a learner who read the passage (the "Flat 12" clue style). Agent-drafted, not a native
-- speaker, so seeded UNPUBLISHED (needs_review stays true) until a human reviews it and sets
-- published = true, needs_review = false, published_at = now(). Joined to public.levels so a database without the
-- level rows (a fresh local or CI one) seeds nothing.
--
-- Scene-art slots for the coordinator (public bucket `story-art`, key <course>/<slug>/<nodeId>.jpg):
--   n1  en/a-day-that-could-go-a-few-ways/n1.jpg  Sam in bed, clock reads 8:10, hungry.
--   n2  .../n2.jpg  Sam running down the street, a brown wallet on the path, a bus turning the corner.
--   n3  .../n3.jpg  Sam at the kitchen table with eggs and toast, the bus leaving through the window.
--   n4  .../n4.jpg  Mrs Patel at Flat 12, happy, offering Sam a lift (GOOD ending).
--   n5  .../n5.jpg  Sam on the bus, the wallet in his bag, looking uneasy.
--   n6  .../n6.jpg  Sam arriving late to an outdoor PE class that has started.
--   n7  .../n7.jpg  Sam walking briskly in cool air, warm and ready for PE.
-- Until the files exist the reader shows a themed placeholder; uploading them needs no code change.
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order)
SELECT 'en', l.id, 'a-day-that-could-go-a-few-ways', 'A Day That Could Go a Few Ways',
  '[]'::jsonb, true, $nodes$
{
  "start": "n1",
  "map": {
    "n1": {
      "art": "en/a-day-that-could-go-a-few-ways/n1.jpg",
      "segments": [
        "Sam opens his eyes and looks at the clock. It says 8:10.",
        "His bus to school leaves at 8:20, and the stop is a five-minute walk away.",
        "He is still in bed, and he is very hungry."
      ],
      "choice": {
        "prompt": "The bus leaves in ten minutes. What should Sam do first?",
        "options": [
          { "label": "Get dressed and run to the bus stop.", "goto": "n2", "clue": true },
          { "label": "Make a big breakfast and eat slowly.", "goto": "n3", "clue": false }
        ]
      }
    },
    "n2": {
      "art": "en/a-day-that-could-go-a-few-ways/n2.jpg",
      "segments": [
        "Sam gets dressed fast and runs down the street.",
        "On the path, he sees a brown wallet on the ground.",
        "Inside there is a card: 'Mrs Patel, Flat 12, Green House'.",
        "He can see his bus coming around the corner."
      ],
      "choice": {
        "prompt": "The wallet shows where the owner lives, and the bus is almost here. What does Sam do?",
        "options": [
          { "label": "Take the wallet to Flat 12 before the bus.", "goto": "n4", "clue": true },
          { "label": "Put the wallet in his bag and get on the bus.", "goto": "n5", "clue": false }
        ]
      }
    },
    "n3": {
      "art": "en/a-day-that-could-go-a-few-ways/n3.jpg",
      "segments": [
        "Sam makes eggs and toast, and he eats slowly.",
        "When he looks up, it is 8:22. The bus is gone.",
        "His first class today is PE, and it is outside on the field.",
        "The next bus comes in twenty minutes, or he can walk for thirty minutes."
      ],
      "choice": {
        "prompt": "PE is outside and active, and Sam feels full and slow. What does he do?",
        "options": [
          { "label": "Walk to school, so he arrives warm and ready for PE.", "goto": "n7", "clue": true },
          { "label": "Wait at home for the late bus.", "goto": "n6", "clue": false }
        ]
      }
    },
    "n4": {
      "art": "en/a-day-that-could-go-a-few-ways/n4.jpg",
      "segments": [
        "Sam knocks at Flat 12. Mrs Patel is so happy to get her wallet back.",
        "She is driving into town, and she gives Sam a ride to school.",
        "He arrives early, with a smile and a new friend."
      ],
      "ending": {
        "id": "kind-and-on-time",
        "title": "Kind and on time",
        "wrap": "You read the clue in the wallet and did the kind thing, and the day got better for it.",
        "quality": "good"
      }
    },
    "n5": {
      "art": "en/a-day-that-could-go-a-few-ways/n5.jpg",
      "segments": [
        "Sam gets on the bus and finds a seat.",
        "He is on time, but the wallet sits heavy in his bag all morning.",
        "He keeps thinking about Mrs Patel looking for it."
      ],
      "ending": {
        "id": "on-time-but-uneasy",
        "title": "On time, but uneasy",
        "wrap": "You caught the bus, but the wallet's owner is still looking. Try another path and see what else the day holds.",
        "quality": "lesser"
      }
    },
    "n6": {
      "art": "en/a-day-that-could-go-a-few-ways/n6.jpg",
      "segments": [
        "Sam waits at home and takes the late bus.",
        "He gets to school after PE has started, and he is still full from breakfast.",
        "The teacher is kind, but Sam sits out the first game."
      ],
      "ending": {
        "id": "late-but-calm",
        "title": "Late, but calm",
        "wrap": "A slow, quiet start. You missed the start of PE. Try another path to see a brighter morning.",
        "quality": "lesser"
      }
    },
    "n7": {
      "art": "en/a-day-that-could-go-a-few-ways/n7.jpg",
      "segments": [
        "Sam walks fast, and the cool air wakes him up.",
        "He reaches school a little late, but warm and ready to move.",
        "He joins PE right away and has a good game."
      ],
      "ending": {
        "id": "late-but-ready",
        "title": "A little late, but ready",
        "wrap": "You matched your choice to the day's first class. Not perfect timing, but a strong finish.",
        "quality": "ok"
      }
    }
  }
}
$nodes$::jsonb, 1
FROM public.levels l WHERE l.id = 'A2';
