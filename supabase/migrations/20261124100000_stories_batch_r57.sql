-- Stories batch r57: one new branching story (EN, A2) and three read-along stories (EN, FR, ES at B1, the level that
-- had no stories yet). Additive seed only, no schema change. Original scripts written for this app (no third-party
-- text). Every row is UNPUBLISHED and needs_review = true; the French and Spanish drafts were written by an agent,
-- not a native speaker, so they are flagged for NATIVE REVIEW before anyone publishes them. To publish after review:
--   UPDATE public.stories SET needs_review = false, published = true, published_at = now() WHERE course = '..' AND slug = '..';
-- Joined to public.levels so a database without level rows (a fresh local or CI one) seeds nothing.
--
-- Rollback:
--   DELETE FROM public.stories WHERE (course, slug) IN (('en','the-package-mix-up'), ('en','the-interview-day'),
--     ('fr','le-velo-de-camille'), ('es','un-viaje-inesperado'));   -- quiz questions cascade
--
-- Branching story "The Package Mix-Up": 3 choice points (n1, n2, n3), 4 endings (1 good, 1 ok, 2 lesser). Every
-- choice both advances the plot and needs the passage to answer (the label on the box: Flat 4, "Keep cool", the
-- 6 pm note); no dead ends. Scene-art slots for the coordinator (public bucket `story-art`, key <course>/<slug>/<nodeId>.jpg):
--   n1  en/the-package-mix-up/n1.jpg  Maya at her door in a hallway holding a white box; label "Mr Okafor, Flat 4"; delivery man leaving.
--   n2  en/the-package-mix-up/n2.jpg  Maya at the door of Flat 4 with the box, a note taped on it: "Back at 6 pm".
--   n3  en/the-package-mix-up/n3.jpg  Maya at her kitchen table, the box open: a birthday cake and a card.
--   n4  en/the-package-mix-up/n4.jpg  Maya putting the cake in her fridge, then Mr Okafor smiling at her door in the evening (GOOD).
--   n5  en/the-package-mix-up/n5.jpg  The box outside Flat 4 in a sunny hallway, the cake soft and sagging.
--   n6  en/the-package-mix-up/n6.jpg  Maya apologising at Mr Okafor's door, cake box in her hands, him laughing kindly.
--   n7  en/the-package-mix-up/n7.jpg  The taped box left at Flat 4's door, Maya peeking around her own door, worried.

INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order)
SELECT 'en', l.id, 'the-package-mix-up', 'The Package Mix-Up',
  '[]'::jsonb, true, $nodes$
{
  "start": "n1",
  "map": {
    "n1": {
      "art": "en/the-package-mix-up/n1.jpg",
      "segments": [
        "On Saturday morning, the doorbell rings, and Maya opens her door.",
        "A delivery man gives her a white box and walks away quickly.",
        "On the box, there is a label: 'Mr Okafor, Flat 4. Fragile. Keep cool.'",
        "Maya lives in Flat 5, and she is not waiting for anything."
      ],
      "choice": {
        "prompt": "The box is not for Maya. What does she do?",
        "options": [
          { "label": "Carry it to Flat 4 and knock.", "goto": "n2", "clue": true },
          { "label": "Open it to see what is inside.", "goto": "n3", "clue": false }
        ]
      }
    },
    "n2": {
      "art": "en/the-package-mix-up/n2.jpg",
      "segments": [
        "Maya knocks at Flat 4, but nobody answers.",
        "There is a note on the door: 'Back at 6 pm. Please leave nothing in the hall.'",
        "It is a warm day, and the label on the box says to keep it cool."
      ],
      "choice": {
        "prompt": "Mr Okafor is out until 6 pm, and the box must stay cool. What does Maya do?",
        "options": [
          { "label": "Put the box in her fridge and leave a note on his door.", "goto": "n4", "clue": true },
          { "label": "Leave the box outside his door.", "goto": "n5", "clue": false }
        ]
      }
    },
    "n3": {
      "art": "en/the-package-mix-up/n3.jpg",
      "segments": [
        "Maya opens the box at her kitchen table.",
        "Inside, there is a small birthday cake and a card: 'Happy birthday, Mr Okafor! Love, Ada.'",
        "The box is now open, and the cake must stay cool until tonight."
      ],
      "choice": {
        "prompt": "Maya opened a box that was not hers. What does she do now?",
        "options": [
          { "label": "Close it, keep the cake cool, and tell Mr Okafor the truth at 6 pm.", "goto": "n6", "clue": true },
          { "label": "Tape the box shut and leave it at Flat 4 without a word.", "goto": "n7", "clue": false }
        ]
      }
    },
    "n4": {
      "art": "en/the-package-mix-up/n4.jpg",
      "segments": [
        "Maya puts the box in her fridge and writes a note: 'Your package is safe with me in Flat 5.'",
        "At 6 pm, Mr Okafor knocks, and he is surprised and happy.",
        "The cake is perfect. He invites Maya to his birthday dinner."
      ],
      "ending": {
        "id": "a-cake-in-the-right-hands",
        "title": "A cake in the right hands",
        "wrap": "You read the label and kept the cake cool, and a mix-up became a new friendship.",
        "quality": "good"
      }
    },
    "n5": {
      "art": "en/the-package-mix-up/n5.jpg",
      "segments": [
        "Maya leaves the box outside Flat 4 and goes home.",
        "The hall is warm, and the sun comes through the window all afternoon.",
        "At 6 pm, Mr Okafor finds a soft, sad cake and a note he cannot read."
      ],
      "ending": {
        "id": "a-warm-cake",
        "title": "A warm cake",
        "wrap": "The label said to keep it cool. Try another path and see how the day can end better.",
        "quality": "lesser"
      }
    },
    "n6": {
      "art": "en/the-package-mix-up/n6.jpg",
      "segments": [
        "Maya closes the box and puts it in her fridge.",
        "At 6 pm, she knocks at Flat 4 and says, 'I am sorry. I opened your box by mistake.'",
        "Mr Okafor laughs kindly. The cake is fine, and he thanks her for telling the truth."
      ],
      "ending": {
        "id": "sorry-and-thank-you",
        "title": "Sorry, and thank you",
        "wrap": "You made a mistake, fixed it, and were honest. That is a good ending, but a better one was possible.",
        "quality": "ok"
      }
    },
    "n7": {
      "art": "en/the-package-mix-up/n7.jpg",
      "segments": [
        "Maya tapes the box and leaves it at the door of Flat 4.",
        "In the warm hall, the cake gets soft, and the tape looks strange.",
        "Mr Okafor sees the box and wonders who opened it. Maya stays inside all evening."
      ],
      "ending": {
        "id": "a-secret-in-the-hall",
        "title": "A secret in the hall",
        "wrap": "Keeping quiet made the day worse. Try another path and see what honesty can do.",
        "quality": "lesser"
      }
    }
  }
}
$nodes$::jsonb, 3
FROM public.levels l WHERE l.id = 'A2';

-- Read-along stories at B1 (EN, FR, ES), each with a 3-question multiple-choice check.
INSERT INTO public.stories (course, level_id, slug, title, segments, sort_order)
SELECT v.course, v.level_id, v.slug, v.title, v.segments, v.sort_order FROM (VALUES
('en', 'B1', 'the-interview-day', 'The Interview Day', $j$[
  "Nadia had an interview for a job at a small bakery, and she had been worried about it all week.",
  "She had practised her answers in front of the mirror, but this morning her hands were still shaking.",
  "On the way there, her bus broke down, so she had to run for the last ten minutes.",
  "She arrived out of breath and five minutes late, and the manager, Mr Rossi, was already waiting.",
  "\"I'm so sorry,\" she said. \"The bus stopped, and I didn't want to miss this chance.\"",
  "Mr Rossi smiled. \"Don't worry. Honest people are rare. Tell me why you love baking.\"",
  "Nadia forgot to be nervous and talked about the bread her grandmother used to make every Sunday.",
  "Two days later, the bakery called her, and she started work the following Monday."
]$j$::jsonb, 1),
('fr', 'B1', 'le-velo-de-camille', 'Le vélo de Camille', $j$[
  "Camille habitait à Bordeaux depuis deux ans, et elle allait au travail à vélo tous les jours.",
  "Un matin de novembre, il pleuvait beaucoup, mais elle a quand même décidé de partir.",
  "Au coin de la rue, sa chaîne s'est cassée et elle n'a pas pu continuer.",
  "Elle était en retard et elle ne savait pas quoi faire.",
  "Un vieux monsieur, qui sortait de sa boulangerie, lui a proposé de laisser le vélo dans son magasin.",
  "« Revenez le chercher ce soir, je vous aiderai à le réparer », a-t-il dit.",
  "Camille a pris le tram et elle est arrivée au bureau avec dix minutes de retard.",
  "Le soir, le boulanger avait déjà réparé la chaîne, et elle lui a acheté une grande baguette pour le remercier."
]$j$::jsonb, 1),
('es', 'B1', 'un-viaje-inesperado', 'Un viaje inesperado', $j$[
  "Marta tenía que viajar a Sevilla para visitar a su abuela, que cumplía ochenta años.",
  "Compró el billete de tren con dos semanas de antelación y preparó una maleta pequeña.",
  "El día del viaje, llegó a la estación media hora antes de la salida.",
  "Sin embargo, en el panel decía que el tren llevaba una hora de retraso por una avería.",
  "Mientras esperaba, conoció a un chico llamado Diego, que también iba a Sevilla para una boda.",
  "Hablaron durante toda la espera y descubrieron que los dos habían estudiado en la misma ciudad.",
  "Por fin el tren salió, y Marta llegó a casa de su abuela justo a tiempo para la cena.",
  "Su abuela le dio un abrazo enorme y dijo que el mejor regalo era tenerla allí."
]$j$::jsonb, 1)
) AS v(course, level_id, slug, title, segments, sort_order)
JOIN public.levels l ON l.id = v.level_id;

INSERT INTO public.story_quiz_questions (story_id, position, prompt, choices, answer_index)
SELECT s.id, q.position, q.prompt, q.choices::jsonb, q.answer_index
FROM (VALUES
  ('en', 'the-interview-day', 1, 'Why was Nadia late?', '["She woke up late","Her bus broke down","She forgot the address"]', 1),
  ('en', 'the-interview-day', 2, 'How did Mr Rossi react when she said sorry?', '["He smiled and told her not to worry","He was angry","He ended the interview"]', 0),
  ('en', 'the-interview-day', 3, 'What did Nadia talk about in the interview?', '["Her last job","The bread her grandmother made","Her bus journey"]', 1),
  ('fr', 'le-velo-de-camille', 1, 'Pourquoi Camille ne peut-elle pas continuer à vélo ?', '["Il pleut trop fort","Sa chaîne est cassée","Elle est fatiguée"]', 1),
  ('fr', 'le-velo-de-camille', 2, 'Que propose le vieux monsieur ?', '["De laisser le vélo dans son magasin","De l''emmener en voiture","De lui prêter un vélo"]', 0),
  ('fr', 'le-velo-de-camille', 3, 'Comment Camille va-t-elle au bureau ?', '["À pied","En tram","En taxi"]', 1),
  ('es', 'un-viaje-inesperado', 1, '¿Por qué viaja Marta a Sevilla?', '["Para ir a una boda","Para visitar a su abuela","Para trabajar"]', 1),
  ('es', 'un-viaje-inesperado', 2, '¿Qué pasó con el tren?', '["Llevaba una hora de retraso","Salió media hora antes","Se canceló"]', 0),
  ('es', 'un-viaje-inesperado', 3, '¿Quién es Diego?', '["Su primo","Un chico que iba a una boda","El revisor del tren"]', 1)
) AS q(course, slug, position, prompt, choices, answer_index)
JOIN public.stories s ON s.course = q.course AND s.slug = q.slug;
