-- Mona's New City: twelve new branching stories (EN, A1 to B2), sort_order 101-112. Additive data seed, no schema change.
-- Owner and Design approved the text; it is seeded exactly as written. Cast: Mona, Leo, Priya, Mr. Alder, Dr. Shah, Dalia, Marco, Biscuit.
-- Scene art keys are en/<slug>/<stem>.jpg in the public story-art bucket (uploaded separately; a missing key shows a placeholder).
-- Seeded HIDDEN (published = false) with needs_review = false (text reviewed). To publish, once narration is recorded:
--   UPDATE public.stories SET published = true, published_at = now() WHERE course = 'en' AND slug IN (...the 12 slugs below...);
-- Joined to public.levels so a database without level rows (a fresh local or CI one) seeds nothing. Idempotent:
-- ON CONFLICT (course, slug) DO NOTHING.
--
-- Rollback:
--   DELETE FROM public.stories WHERE course = 'en' AND slug IN ('touchdown', 'the-first-coffee', 'keys-to-the-new-place', 'market-day', 'the-wrong-train', 'dinner-with-new-friends', 'the-interview', 'under-the-weather', 'the-favour', 'crossed-wires', 'the-negotiation', 'the-goodbye');

-- 101: Touchdown (A1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'touchdown', 'Touchdown', '[]'::jsonb, true, $nodes$
{
  "start": "land",
  "map": {
    "land": {
      "art": "en/touchdown/n1-arrival.jpg",
      "segments": [
        "The plane dropped slowly through the clouds, and Mona looked out of the small window.",
        "Below her, a whole new city grew bigger and bigger — grey rivers, long roads, a thousand tiny lights just starting to glow.",
        "Her hands held the seat tightly. For one whole year she had dreamed of this day. Now it was real, and it felt very big.",
        "The wheels touched the ground with a soft bump. \"I'm here,\" she said quietly, to no one. \"I'm really here.\" She took her bag from under the seat, and she smiled."
      ],
      "next": "walk"
    },
    "walk": {
      "art": "en/touchdown/n2-hall.jpg",
      "segments": [
        "Inside, the airport was huge and bright and full of noise. Voices in many languages flew past her ears.",
        "Signs hung from the ceiling, with arrows pointing everywhere. Mona read them slowly: passport control, this way.",
        "Around her, people walked fast, pulling big suitcases. A child cried. A man ran for his gate.",
        "She felt small, and far from home — but she also felt awake, and alive. At the end of a long hall, a line of tired travellers waited. She joined the back of it and took a slow, deep breath."
      ],
      "next": "passport"
    },
    "passport": {
      "art": "en/touchdown/n3-passport.jpg",
      "segments": [
        "The line moved slowly. Mona watched the officer at the desk. He looked tired, and he did not smile at anyone.",
        "At last it was her turn. \"Next, please,\" he said, and waved her forward.",
        "He opened her passport, looked at her photo, then at her face. \"Why are you here?\" he asked."
      ],
      "choice": {
        "prompt": "What does Mona say?",
        "options": [
          {
            "label": "\"I'm here for a new job. I'm very happy to be here.\"",
            "goto": "a_stamp",
            "clue": true
          },
          {
            "label": "\"Work. A job.\"",
            "goto": "b_stamp",
            "clue": false
          },
          {
            "label": "\"Holiday! …No — sorry — a job!\"",
            "goto": "b_stamp",
            "clue": false
          }
        ]
      }
    },
    "a_stamp": {
      "art": "en/touchdown/n3-passport.jpg",
      "segments": [
        "The officer gave a small, surprised smile. \"A new job,\" he said. \"That's brave.\" He stamped the page — a loud, happy sound. \"Good luck in our city, Mona.\"",
        "\"Thank you,\" she said, and she meant it. A kind word, in her very first minute in the country. She walked on with a warm feeling in her chest. Maybe, she thought, this will be okay."
      ],
      "next": "a_bag"
    },
    "b_stamp": {
      "art": "en/touchdown/n3-passport.jpg",
      "segments": [
        "The officer did not smile. He looked at her for a long, quiet moment. Mona's face grew hot. Had she said something wrong? She wanted to explain, but no good words came.",
        "Then — stamp. \"Okay. Next,\" he said, already looking past her. She walked on quickly. Not the best start, she thought. But the stamp was in her passport now. She was really here."
      ],
      "next": "b_bag"
    },
    "a_bag": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "She found the baggage hall, where shiny suitcases went round and round on a long silver belt. Mona waited for her blue bag. One minute. Two minutes. Five. It did not come.",
        "Beside her, an older woman watched the belt and let out a tired little sigh — her bag was missing too. It had been a very long day for everyone in that room."
      ],
      "choice": {
        "prompt": "While they wait together, what does Mona do?",
        "options": [
          {
            "label": "Smile at the woman and say, \"Long day, isn't it?\"",
            "goto": "a_bag2",
            "clue": true
          },
          {
            "label": "Stand quietly and watch the belt alone.",
            "goto": "a_bag2",
            "clue": false
          }
        ]
      }
    },
    "a_bag2": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "At last — there! Her blue bag turned the corner, a little lost among all the black ones. Mona pulled it off the belt and laughed out loud. \"Finally!\" The older woman laughed with her.",
        "Bag in hand and heart a little lighter, Mona rolled towards the wide doors marked ARRIVALS. Behind those doors was her new city — and, she hoped, someone waiting just for her."
      ],
      "next": "a_meet"
    },
    "b_bag": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "She found the baggage hall, but her blue bag was nowhere. The long belt went round and round, almost empty. People pushed past her with huge suitcases and loud wheels.",
        "Mona stepped back and held her arms close to her body. She felt very small, and very far from home. She just wanted this long, long day to end. \"Please come,\" she whispered to the empty belt."
      ],
      "choice": {
        "prompt": "While she waits, what does Mona do?",
        "options": [
          {
            "label": "Take a slow breath and wait calmly.",
            "goto": "b_bag2",
            "clue": true
          },
          {
            "label": "Worry, and check her phone again and again.",
            "goto": "b_bag2",
            "clue": false
          }
        ]
      }
    },
    "b_bag2": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "Her bag came almost last of all. She grabbed it fast and did not look back. She rolled quickly towards the wide doors marked ARRIVALS, her eyes heavy and her feet sore.",
        "Just get outside, she told herself. Fresh air, and then everything will feel better. The doors slid open in front of her."
      ],
      "next": "b_meet"
    },
    "a_meet": {
      "art": "en/touchdown/n5-arrivals.jpg",
      "segments": [
        "Outside the doors, a wall of faces waited — mums, dads, friends, drivers, all looking past her for someone else.",
        "Then she saw it — a man holding a small sign. It said one word: MONA. He had a kind, round face and a set of car keys in his hand. He was looking right at her."
      ],
      "choice": {
        "prompt": "How does Mona greet him?",
        "options": [
          {
            "label": "\"Hello! I'm Mona. Thank you so much for waiting.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "\"Mona. Yes. That's me.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_meet": {
      "art": "en/touchdown/n5-arrivals.jpg",
      "segments": [
        "The cold evening air rushed in and woke her up a little. Mona looked at the sea of waiting people. Somewhere here was her name.",
        "A man stood with a sign — MONA — but she was so tired that her eyes slid right past it. Once. Then twice. She stopped, not sure what to do."
      ],
      "choice": {
        "prompt": "What does Mona do?",
        "options": [
          {
            "label": "Turn back, smile, and say, \"Sorry! I'm Mona. Hello.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "Give up looking and climb into the first taxi she sees.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/touchdown/n6-welcome.jpg",
      "segments": [
        "\"Hello! I'm Mona,\" she said, holding out her hand. \"Thank you so much for waiting.\" The man's face opened into a big smile. \"Welcome, Mona! I'm Marco, your driver. Your new city has been waiting for you.\"",
        "He lifted her heavy bag as if it were nothing and led her to a small car by the curb. As they drove, the city lights came on one by one — gold and warm against the evening sky.",
        "Mona looked out of the window. She was tired, and far from home — and somehow, already, a little bit happy."
      ],
      "ending": {
        "id": "warm-welcome",
        "title": "A Warm Welcome",
        "quality": "good",
        "wrap": "Mona arrived with an open heart, and the city met her halfway. A warm start to a new life."
      }
    },
    "end_ok": {
      "art": "en/touchdown/n7-safe.jpg",
      "segments": [
        "\"Mona. Yes. That's me,\" she said. The man nodded — kind, but quiet — and took her bag. \"Long trip?\" he asked as they walked to the car. \"Very,\" said Mona. It was all she had left to say.",
        "The car moved into the busy evening streets, past red lights and white lights and people everywhere. Mona rested her head on the cool window and closed her eyes for a moment. She was tired — but she was safe."
      ],
      "ending": {
        "id": "safe-and-sound",
        "title": "Safe and Sound",
        "quality": "ok",
        "wrap": "Tomorrow, she thought, I'll say hello properly. Tomorrow I'll feel brave. Not a perfect start — but she made it, in one piece."
      }
    },
    "end_lesser": {
      "art": "en/touchdown/n8-detour.jpg",
      "segments": [
        "Mona gave up looking — she was simply too tired. She saw a line of taxis and climbed into the very first one. \"Where to?\" asked the driver. She read out her new address. Behind her, the man with the MONA sign watched her drive away, puzzled.",
        "The taxi took the long way — through streets she didn't know, past the same tall building twice, while the meter climbed and climbed. When at last she arrived, far too much money lighter, Mona stepped out and had to laugh at herself.",
        "\"Well,\" she said to the quiet street. \"I'm here. The long way round.\""
      ],
      "ending": {
        "id": "long-way-round",
        "title": "The Long Way Round",
        "quality": "lesser",
        "wrap": "A bumpy, funny first night — and a story she'll tell for years. Next time, she'll look for her name first."
      }
    }
  }
}
$nodes$::jsonb, 101, false, false, NULL
FROM public.levels l WHERE l.id = 'A1'
ON CONFLICT (course, slug) DO NOTHING;

-- 102: The First Coffee (A1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'the-first-coffee', 'The First Coffee', '[]'::jsonb, true, $nodes$
{
  "start": "flat",
  "map": {
    "flat": {
      "art": "en/the-first-coffee/n1-flat.jpg",
      "segments": [
        "Mona's first morning in the new flat was very quiet. Too quiet. The rooms were empty, and she had no coffee, no milk, nothing at all.",
        "But she was awake, and she was curious. \"Today,\" she said to the empty kitchen, \"I will go out, and I will speak.\" She put on her mustard cardigan, took a deep breath, and opened the door to her new street."
      ],
      "next": "cafe"
    },
    "cafe": {
      "art": "en/the-first-coffee/n2-cafe.jpg",
      "segments": [
        "The street was full of soft morning light. People walked their dogs. A bus hissed and stopped. On the corner, Mona found a small café with warm yellow windows.",
        "Inside, it smelled of coffee and fresh bread. Behind the counter, a young man with a green apron and curly hair looked up. He had a big, easy smile. \"Morning!\" he said. \"What can I get you?\""
      ],
      "next": "order"
    },
    "order": {
      "art": "en/the-first-coffee/n3-counter.jpg",
      "segments": [
        "Mona's heart beat fast. This was her first real conversation in the new city. She looked at the menu board — so many words. She could do this. The barista waited, friendly and patient."
      ],
      "choice": {
        "prompt": "How does Mona order?",
        "options": [
          {
            "label": "\"A small coffee, please. …And — good morning!\"",
            "goto": "a_talk",
            "clue": true
          },
          {
            "label": "She points at the board: \"This one.\"",
            "goto": "b_talk",
            "clue": false
          },
          {
            "label": "\"Coffee small please thank you sorry.\"",
            "goto": "b_talk",
            "clue": false
          }
        ]
      }
    },
    "a_talk": {
      "art": "en/the-first-coffee/n4-smalltalk.jpg",
      "segments": [
        "\"Coming right up,\" he said. \"I'm Leo, by the way.\" He wrote something on a cup. \"You're new here, right? I know all the regular faces.\" Mona smiled. He was kind. Maybe she could make a friend on day one."
      ],
      "choice": {
        "prompt": "Leo asks, \"So what brings you here?\"",
        "options": [
          {
            "label": "\"I just moved here for a new job. Everything is new — even the coffee!\"",
            "goto": "a_cup",
            "clue": true
          },
          {
            "label": "\"Work.\"",
            "goto": "a_cup",
            "clue": false
          }
        ]
      }
    },
    "a_cup": {
      "art": "en/the-first-coffee/n5-cup.jpg",
      "segments": [
        "Leo laughed. \"A brave move. Welcome.\" He slid a warm cup across the counter. On the side, he had written a name — but not quite hers. It said MOANA. He grinned. \"Close enough?\""
      ],
      "choice": {
        "prompt": "What does Mona say about the name?",
        "options": [
          {
            "label": "\"Ha! Mona, actually — but I like Moana too.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "\"It's Mona.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_talk": {
      "art": "en/the-first-coffee/n4-smalltalk.jpg",
      "segments": [
        "He made the coffee without many words. The machine hissed and steamed. Mona stood quietly, not sure what to say, and the silence felt long. He wrote something on the cup and looked up with a kind but unsure smile."
      ],
      "choice": {
        "prompt": "He asks, \"Everything okay?\"",
        "options": [
          {
            "label": "\"Yes — sorry. My English is a little nervous today!\"",
            "goto": "b_cup",
            "clue": true
          },
          {
            "label": "She just nods and looks at her phone.",
            "goto": "b_cup",
            "clue": false
          }
        ]
      }
    },
    "b_cup": {
      "art": "en/the-first-coffee/n5-cup.jpg",
      "segments": [
        "He nodded and passed her the cup. On the side he had guessed a name — NONA. He didn't ask; he was already turning to the next customer."
      ],
      "choice": {
        "prompt": "What does Mona do?",
        "options": [
          {
            "label": "\"Oh — it's Mona! Thank you, though.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "She takes the wrong-name cup and quietly turns to go.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-first-coffee/n6-friends.jpg",
      "segments": [
        "\"Mona,\" Leo repeated, and fixed the cup with a little smile. \"I'll remember now. First coffee's on me — welcome to the neighbourhood.\" They talked a minute more, about the city, the best bakery, the rainy weather.",
        "When Mona left, Leo called out, \"See you tomorrow, Mona!\" — and she knew she would come back. She stepped into the morning with a warm cup in her hands and a small, bright feeling in her chest."
      ],
      "ending": {
        "id": "a-friend-on-day-one",
        "title": "A Friend on Day One",
        "quality": "good",
        "wrap": "One coffee, one kind word, one new friend. The city felt a little smaller — in the best way."
      }
    },
    "end_ok": {
      "art": "en/the-first-coffee/n7-window.jpg",
      "segments": [
        "Mona took her coffee to a small table by the window and sat down. It was good coffee — hot and strong. Outside, her new city went about its busy morning.",
        "She practised the words in her head: next time, I'll say more. Next time, I'll ask his name. It was a quiet start — but it was a start, and the coffee was warm."
      ],
      "ending": {
        "id": "a-quiet-cup",
        "title": "A Quiet Cup",
        "quality": "ok",
        "wrap": "Not every chat flies on the first try. But she went out, she spoke, and she'll be braver tomorrow."
      }
    },
    "end_lesser": {
      "art": "en/the-first-coffee/n8-street.jpg",
      "segments": [
        "Mona walked out with a cup that said NONA, feeling a little silly. Halfway down the street, a man stopped her. \"Nona! Long time!\" He hugged her like an old friend.",
        "\"I'm — not Nona,\" said Mona, laughing and confused. \"Oh! Sorry — the cup…\" They both laughed. A funny, strange first morning. \"Welcome to the city,\" he said, and walked on."
      ],
      "ending": {
        "id": "mistaken-nona",
        "title": "Mistaken Nona",
        "quality": "lesser",
        "wrap": "A wrong name and a stranger's hug — a silly start, but a story. Tomorrow she'll say her name loud and clear."
      }
    }
  }
}
$nodes$::jsonb, 102, false, false, NULL
FROM public.levels l WHERE l.id = 'A1'
ON CONFLICT (course, slug) DO NOTHING;

-- 103: Keys to the New Place (A1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'keys-to-the-new-place', 'Keys to the New Place', '[]'::jsonb, true, $nodes$
{
  "start": "building",
  "map": {
    "building": {
      "art": "en/keys-to-the-new-place/n1-building.jpg",
      "segments": [
        "The building was old and tall, with red bricks and high windows. Number 14. This was it — her new home. Mona stood on the step with her one suitcase and a box of plates.",
        "Her stomach felt funny. She did not know the city, the street, or the man who had the keys. \"Be brave,\" she told herself, and pressed the bell."
      ],
      "next": "alder"
    },
    "alder": {
      "art": "en/keys-to-the-new-place/n2-alder.jpg",
      "segments": [
        "The door opened. An older man stood there, with grey hair, a flat cap, and small glasses on a chain. \"You must be Mona,\" he said. His voice was slow and kind. \"I'm Mr. Alder. I look after number 14.\"",
        "He held out a hand. Behind him, a warm hallway waited."
      ],
      "choice": {
        "prompt": "How does Mona greet him?",
        "options": [
          {
            "label": "\"Hello, Mr. Alder! Thank you so much. I'm very happy to be here.\"",
            "goto": "a_tour",
            "clue": true
          },
          {
            "label": "\"Hi. Yes. Mona.\"",
            "goto": "b_tour",
            "clue": false
          },
          {
            "label": "\"Hello sorry — is this the right house?\"",
            "goto": "b_tour",
            "clue": false
          }
        ]
      }
    },
    "a_tour": {
      "art": "en/keys-to-the-new-place/n3-stairs.jpg",
      "segments": [
        "\"Come in, come in,\" said Mr. Alder, and showed her up the stairs, slow and steady. \"Flat three. Sunny in the morning. The radiator makes a funny noise, but she's a good old building.\" He opened the door. The flat was small and empty — but the light came in gold through the window, and it was hers."
      ],
      "next": "a_window"
    },
    "a_window": {
      "art": "en/keys-to-the-new-place/n4-window.jpg",
      "segments": [
        "Mr. Alder showed her the keys, the heating, the window. Then he frowned. \"Ah. This window,\" he said. \"It sticks. It won't close all the way. I keep meaning to fix it.\" A cold little breeze came through the gap. Mona would feel it at night."
      ],
      "choice": {
        "prompt": "What does Mona say about the window?",
        "options": [
          {
            "label": "\"No problem! Could you fix it this week? I don't mind waiting.\"",
            "goto": "a_settle",
            "clue": true
          },
          {
            "label": "\"Oh. Okay. It's fine.\"",
            "goto": "a_settle",
            "clue": false
          }
        ]
      }
    },
    "a_settle": {
      "art": "en/keys-to-the-new-place/n5-notebook.jpg",
      "segments": [
        "\"This week — I promise,\" said Mr. Alder, and wrote it in a little notebook. \"I don't forget. Well — not often.\" He smiled. \"You settle in. Knock on my door if you need anything. I'm always home.\""
      ],
      "choice": {
        "prompt": "As he turns to leave, what does Mona do?",
        "options": [
          {
            "label": "\"Thank you. Would you like a cup of tea sometime? I don't know anyone here yet.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "\"Thank you. Goodbye.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_tour": {
      "art": "en/keys-to-the-new-place/n3-stairs.jpg",
      "segments": [
        "\"Right. This way,\" said Mr. Alder, and walked her up without many words. He opened the door to flat three — small, empty, gold light at the window. \"Here you are.\" Mona nodded. She wanted to say something warm, but the words felt stuck."
      ],
      "next": "b_window"
    },
    "b_window": {
      "art": "en/keys-to-the-new-place/n4-window.jpg",
      "segments": [
        "He showed her the keys and the heating, then pointed at the window. \"Sticks a bit. Won't close all the way.\" A cold breeze slipped through the gap. He waited, as if she might say something."
      ],
      "choice": {
        "prompt": "What does Mona do about the window?",
        "options": [
          {
            "label": "\"Oh — could you fix it, please? It's a little cold.\"",
            "goto": "b_keys",
            "clue": true
          },
          {
            "label": "She just nods and says nothing.",
            "goto": "b_keys",
            "clue": false
          }
        ]
      }
    },
    "b_keys": {
      "art": "en/keys-to-the-new-place/n5-notebook.jpg",
      "segments": [
        "\"Hm,\" said Mr. Alder, and wrote nothing down. \"I'll see what I can do.\" He gave her two heavy old keys on a ring. \"Front door and flat. Don't lose them — I've only got one spare.\" Then he went back down the stairs, and the building was quiet."
      ],
      "choice": {
        "prompt": "Alone with her new keys, Mona…",
        "options": [
          {
            "label": "runs down to say, \"Mr. Alder — thank you. Really.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "rushes straight out for a coffee, keys swinging in her hand.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/keys-to-the-new-place/n6-tea.jpg",
      "segments": [
        "Mr. Alder's face lit up. \"Tea? Well, I never say no to tea.\" He tapped his cap. \"Thursday, then. I'll bring biscuits.\" That evening, the window was already fixed — and a little note sat on the sill: \"Welcome home. — A.\"",
        "Mona stood in her small gold room and smiled. She had a home, a kind neighbour, and a cup of tea to look forward to. The city did not feel so big any more."
      ],
      "ending": {
        "id": "tea-on-thursday",
        "title": "Tea on Thursday",
        "quality": "good",
        "wrap": "Mona didn't just get a flat — she got a neighbour."
      }
    },
    "end_ok": {
      "art": "en/keys-to-the-new-place/n7-plates.jpg",
      "segments": [
        "\"Goodbye, Mr. Alder. Thank you,\" said Mona, and he nodded and went down the stairs. She closed the door and stood alone in the quiet flat. The gold light was beautiful. The cold little breeze was not.",
        "She unpacked her plates, one by one, and told herself: I'll learn his name properly, I'll say more next time. It was a small, polite, okay start — in a home that was really, truly hers."
      ],
      "ending": {
        "id": "a-home-of-her-own",
        "title": "A Home of Her Own",
        "quality": "ok",
        "wrap": "A home of her own and a landlord kind enough — she'll warm up the rest with time."
      }
    },
    "end_lesser": {
      "art": "en/keys-to-the-new-place/n8-lockedout.jpg",
      "segments": [
        "Mona hurried out for a coffee, the big keys swinging in her hand — and the heavy front door swung shut behind her. Click. She pushed it. Locked. Wrong key. The other key — wrong again.",
        "She was outside her new home, on her first day, locked out, with no number for Mr. Alder. She sat on the step and laughed at the sky. \"Day one,\" she said. \"Off to a flying start.\" Then a slow, kind voice: \"Lost already?\" — Mr. Alder, with the spare key and a small smile."
      ],
      "ending": {
        "id": "locked-out",
        "title": "Locked Out",
        "quality": "lesser",
        "wrap": "Rescued by the very neighbour she'd rushed past. Tomorrow, she'll slow down."
      }
    }
  }
}
$nodes$::jsonb, 103, false, false, NULL
FROM public.levels l WHERE l.id = 'A1'
ON CONFLICT (course, slug) DO NOTHING;

-- 104: Market Day (A2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'market-day', 'Market Day', '[]'::jsonb, true, $nodes$
{
  "start": "the_empty_kitchen",
  "map": {
    "the_empty_kitchen": {
      "art": "en/market-day/n1-kitchen.jpg",
      "segments": [
        "By her third day, Mona's kitchen was still almost empty — one cup, one plate, and a very sad half-lemon in the fridge. She made a list on a scrap of paper: bread, eggs, fruit, vegetables, something nice.",
        "\"The market,\" Leo had told her. \"Saturday morning. Go early, and go hungry.\" So she pulled on her coat and went."
      ],
      "next": "the_market"
    },
    "the_market": {
      "art": "en/market-day/n2-market.jpg",
      "segments": [
        "The market was alive. Long rows of stalls stretched down the street under bright striped covers. There were mountains of oranges, piles of green beans, cheeses as big as wheels, and flowers in every colour.",
        "Sellers called out their prices. Shoppers pushed and laughed and filled their bags. Mona stood at the edge, holding her little list, and smiled. Where to begin?"
      ],
      "next": "the_fruit_stall"
    },
    "the_fruit_stall": {
      "art": "en/market-day/n3-stall.jpg",
      "segments": [
        "She stopped at a fruit stall, where a round woman with red cheeks was building apples into a perfect pyramid. \"Morning, love!\" the woman said. \"What can I get you?\"",
        "Mona looked at the beautiful fruit. Her list just said \"fruit\" — but which? How much? She took a breath."
      ],
      "choice": {
        "prompt": "How does Mona ask?",
        "options": [
          {
            "label": "\"Good morning! Could I have six apples, please? And are the pears sweet?\"",
            "goto": "a_a_taste",
            "clue": true
          },
          {
            "label": "\"Apples. Those.\"",
            "goto": "b_just_apples",
            "clue": false
          },
          {
            "label": "\"Um… some fruit? I don't know. Sorry.\"",
            "goto": "b_just_apples",
            "clue": false
          }
        ]
      }
    },
    "a_a_taste": {
      "art": "en/market-day/n4-taste.jpg",
      "segments": [
        "\"Sweet? My pears are the sweetest in the city,\" the woman laughed. \"Try one.\" She cut a slice and handed it over. It was soft and honey-sweet. \"Oh — that's lovely,\" said Mona. \"I'll take some of those too.\" The woman weighed the fruit and dropped in an extra pear. \"For a new face,\" she winked. \"You're new, aren't you?\""
      ],
      "choice": {
        "prompt": "She asks where Mona is from.",
        "options": [
          {
            "label": "\"Yes! I moved here last week. Everything is new — even the apples look happier here.\"",
            "goto": "a_paying",
            "clue": true
          },
          {
            "label": "\"Yes. New.\"",
            "goto": "a_paying",
            "clue": false
          }
        ]
      }
    },
    "a_paying": {
      "art": "en/market-day/n5-coins.jpg",
      "segments": [
        "The woman told Mona all about the market — the best cheese stall, the man with the warm bread, the flower seller who gave Saturday discounts. \"That's twelve, love,\" she said at last. Mona opened her purse. She had notes, but the coins were still strange to her — big ones, small ones, gold and silver."
      ],
      "choice": {
        "prompt": "What does Mona do with the money?",
        "options": [
          {
            "label": "\"I'm still learning the coins — is this right?\" She holds them out with a smile.",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "She just gives a large note and takes the change.",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_just_apples": {
      "art": "en/market-day/n4-taste.jpg",
      "segments": [
        "The woman put six apples in a bag without another word. \"Anything else?\" Mona looked at her list — pears, vegetables, bread — but the words felt heavy in her mouth. She pointed at the pears. \"How many?\" the woman asked. Mona wasn't sure what to say."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"Four, please. And — are they sweet?\"",
            "goto": "b_the_strange_coins",
            "clue": true
          },
          {
            "label": "\"No. Just the apples.\"",
            "goto": "b_the_strange_coins",
            "clue": false
          }
        ]
      }
    },
    "b_the_strange_coins": {
      "art": "en/market-day/n5-coins.jpg",
      "segments": [
        "The woman weighed the apples and named the price. Mona reached for her purse — but the coins all looked the same, big and small, gold and silver. People waited behind her. She felt her face go warm. She needed to pay, and quickly."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"Sorry — I'm still learning the money. Could you help me?\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "pushes a big note across and hurries away before the change.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/market-day/n6-friends.jpg",
      "segments": [
        "\"Perfect,\" said the woman, picking the right coins from Mona's hand. \"You learn fast.\" She tucked an extra apple into the bag. \"Come back next Saturday — I'll teach you the good stalls.\"",
        "Mona walked home with heavy bags and a light heart. A man gave her a free flower. The bread was still warm. She already knew three sellers by name — and she had a reason to come back."
      ],
      "ending": {
        "id": "market-full-of-friends",
        "title": "A Market Full of Friends",
        "quality": "good",
        "wrap": "A full basket and a market of friendly faces. Mona is starting to belong here."
      }
    },
    "end_ok": {
      "art": "en/market-day/n7-dinner.jpg",
      "segments": [
        "The woman counted the change into Mona's hand, coin by coin. \"There you go, love.\" Mona thanked her and moved on, buying bread, eggs and a few tired vegetables — pointing more than speaking.",
        "By the end her bags were full and her feet were sore. At home she cooked her first real dinner in the new flat. It wasn't fancy, but it was hers, and it was warm."
      ],
      "ending": {
        "id": "full-basket",
        "title": "A Full Basket",
        "quality": "ok",
        "wrap": "Everything on the list — and a little braver with each stall. Next Saturday she'll talk more."
      }
    },
    "end_lesser": {
      "art": "en/market-day/n8-apples.jpg",
      "segments": [
        "Mona hurried off, her change forgotten and her bag heavier than it should have been. Only at home did she look inside: not six apples, but six kilos. A tower of apples rolled across her tiny counter — she had pointed at the big box, not the small one.",
        "She stood in her kitchen and laughed. \"Apple pie. Apple soup. Apple everything.\" That night she knocked on Mr. Alder's door with a bag of apples and a story to tell."
      ],
      "ending": {
        "id": "six-kilos-of-apples",
        "title": "Six Kilos of Apples",
        "quality": "lesser",
        "wrap": "Six kilos of apples and a neighbour to share them with. Some mistakes come with pie."
      }
    }
  }
}
$nodes$::jsonb, 104, false, false, NULL
FROM public.levels l WHERE l.id = 'A2'
ON CONFLICT (course, slug) DO NOTHING;

-- 105: The Wrong Train (A2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'the-wrong-train', 'The Wrong Train', '[]'::jsonb, true, $nodes$
{
  "start": "monday_morning",
  "map": {
    "monday_morning": {
      "art": "en/the-wrong-train/n1-platform.jpg",
      "segments": [
        "Monday morning: Mona's first day at the new job. She had ironed her shirt twice and left the flat an hour early. \"Take the blue line to Greenpark,\" Priya had written. \"Ten stops. Easy.\" Mona repeated it like a song: blue line, Greenpark, ten stops.",
        "The station was a river of people, all moving fast, all knowing exactly where to go. Mona held her ticket tight and followed the blue signs."
      ],
      "next": "three_stops_wrong"
    },
    "three_stops_wrong": {
      "art": "en/the-wrong-train/n2-realize.jpg",
      "segments": [
        "The train was warm and crowded. Mona found a corner and watched the stations go by. One. Two. Three. But the names looked wrong — Riverside, Old Market, North Gate. Not Greenpark.",
        "Her stomach dropped. A map on the wall showed a tangle of coloured lines. She was on the GREEN line, not the blue, going the wrong way. And her first day started in twenty minutes."
      ],
      "next": "who_to_ask"
    },
    "who_to_ask": {
      "art": "en/the-wrong-train/n3-ask.jpg",
      "segments": [
        "Mona looked around the carriage: a student with headphones, a tired man with a newspaper, and a woman about her own age holding a coffee and a kind face. Her heart beat fast. She had to ask — she had to speak. The next station was coming."
      ],
      "choice": {
        "prompt": "How does Mona ask for help?",
        "options": [
          {
            "label": "To the woman: \"Excuse me — sorry to bother you. Is this the way to Greenpark?\"",
            "goto": "a_cross_the_bridge",
            "clue": true
          },
          {
            "label": "\"Greenpark? Greenpark? Where?\" — to the whole carriage.",
            "goto": "b_alone_on_the_platform",
            "clue": false
          },
          {
            "label": "She whispers it, and the woman doesn't hear.",
            "goto": "b_alone_on_the_platform",
            "clue": false
          }
        ]
      }
    },
    "a_cross_the_bridge": {
      "art": "en/the-wrong-train/n4-bridge.jpg",
      "segments": [
        "The woman smiled. \"Oh, you're going the wrong way — this is the green line. But don't worry: get off at the next stop, cross the bridge, take the blue line back. Five stops. You'll make it.\" \"Cross the bridge, blue line, five stops,\" Mona repeated. \"Thank you so much.\" The doors opened. \"That way — quick!\""
      ],
      "choice": {
        "prompt": "On the busy platform, Mona…",
        "options": [
          {
            "label": "\"Sorry — which bridge? The one on the left?\" (she makes sure)",
            "goto": "a_almost_there",
            "clue": true
          },
          {
            "label": "just runs the way the woman pointed.",
            "goto": "a_almost_there",
            "clue": false
          }
        ]
      }
    },
    "a_almost_there": {
      "art": "en/the-wrong-train/n5-run.jpg",
      "segments": [
        "Mona crossed the bridge, ran down the steps, and reached the blue line just as a train pulled in. GREENPARK — five stops. She squeezed on, breathing hard. Tight, but possible. Three stops, four — and her phone buzzed: Priya. \"All set for today?\""
      ],
      "choice": {
        "prompt": "What does Mona reply?",
        "options": [
          {
            "label": "\"Almost there! Took a small detour — I'll tell you the story. Five minutes.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "\"Yes, fine. On my way.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_alone_on_the_platform": {
      "art": "en/the-wrong-train/n9-alone.jpg",
      "segments": [
        "A few people looked up, then away. The student shrugged. The tired man turned a page. Mona's face burned. Finally the woman with the coffee leaned over — \"Greenpark's the blue line, love, you're on the green one\" — said it quickly as the doors opened, and was gone into the crowd. Mona stood on a strange platform, alone, with arrows in every direction."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "stops a station guard: \"Please — which way to the blue line?\"",
            "goto": "b_running_late",
            "clue": true
          },
          {
            "label": "picks a tunnel and hopes.",
            "goto": "b_running_late",
            "clue": false
          }
        ]
      }
    },
    "b_running_late": {
      "art": "en/the-wrong-train/n5-run.jpg",
      "segments": [
        "After two wrong turns and one long tunnel, Mona finally found the blue line. A train came — GREENPARK. She jumped on, out of breath, and watched the stops crawl past. The clock was not kind. Late — a little, or a lot, she couldn't tell. Her phone buzzed: Priya. \"All set for today?\""
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "replies: \"Running a few minutes late — wrong train! So sorry. Almost there.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "puts the phone away and just runs.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-wrong-train/n6-office.jpg",
      "segments": [
        "Mona walked through the office doors with two minutes to spare, cheeks pink, heart still racing. Priya was waiting with two coffees. \"A detour, you said?\" Mona told the story — the green line, the kind woman, the bridge — and Priya laughed out loud.",
        "\"You asked a stranger and found your way on day one. That's exactly the kind of person we hired.\" Mona sat down at her new desk, a little proud. She had been lost, and she had found her way — by speaking up."
      ],
      "ending": {
        "id": "just-in-time",
        "title": "Just in Time",
        "quality": "good",
        "wrap": "Lost on the wrong train, but brave enough to ask — and she arrived with a story and a smile."
      }
    },
    "end_ok": {
      "art": "en/the-wrong-train/n7-late.jpg",
      "segments": [
        "Mona arrived seven minutes late, out of breath, apologising before she was through the door. \"It's okay,\" said Priya kindly. \"Trains are hard at first. You told me, and you came — that's what matters.\" She handed Mona a coffee.",
        "Her first morning wasn't perfect. But she had crossed a whole strange city, alone, and made it to the right place. Tomorrow, she'd leave even earlier."
      ],
      "ending": {
        "id": "seven-minutes-late",
        "title": "Seven Minutes Late",
        "quality": "ok",
        "wrap": "A few minutes late, but honest and here. The city's map is slowly starting to make sense."
      }
    },
    "end_lesser": {
      "art": "en/the-wrong-train/n8-pool.jpg",
      "segments": [
        "Mona ran out of the station, turned left, ran three streets, and found herself… at a swimming pool. Not an office — a swimming pool. She had read the wrong exit sign. By the time she found the real building she was fifteen minutes late, with wet shoes from a puddle and a leaf in her hair.",
        "Priya looked up, looked at the leaf, and tried very hard not to smile. \"Rough journey?\" \"You have no idea,\" said Mona. At lunch, the leaf-in-the-hair story made the whole team laugh — and, somehow, made her one of them."
      ],
      "ending": {
        "id": "swimming-pool",
        "title": "The Swimming Pool",
        "quality": "lesser",
        "wrap": "A swimming pool, a wet shoe, and a leaf in her hair — a terrible, wonderful first day she'll never forget."
      }
    }
  }
}
$nodes$::jsonb, 105, false, false, NULL
FROM public.levels l WHERE l.id = 'A2'
ON CONFLICT (course, slug) DO NOTHING;

-- 106: Dinner with New Friends (A2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'dinner-with-new-friends', 'Dinner with New Friends', '[]'::jsonb, true, $nodes$
{
  "start": "outside_the_restaurant",
  "map": {
    "outside_the_restaurant": {
      "art": "en/dinner-with-new-friends/n1-outside.jpg",
      "segments": [
        "Leo had invited her. \"A few of us get dinner on Fridays,\" he'd said over the counter. \"Nothing fancy. You should come.\" Mona had said yes before she could feel shy about it. Now, standing outside the little restaurant, she felt very shy indeed.",
        "Through the window she saw a long table, candles, laughing faces she didn't know. She smoothed her cardigan, told herself \"be brave\", and pushed open the door."
      ],
      "next": "the_table"
    },
    "the_table": {
      "art": "en/dinner-with-new-friends/n2-table.jpg",
      "segments": [
        "\"Mona! You came!\" Leo jumped up and waved her over. \"Everyone, this is Mona — she's new in the city.\" Four friendly faces turned to her. \"Hi Mona!\" \"Welcome!\" A space opened on the bench; someone passed her a glass of water.",
        "It was warm, and loud, and a little overwhelming. They were all waiting, kindly, for her to say something."
      ],
      "choice": {
        "prompt": "How does Mona introduce herself?",
        "options": [
          {
            "label": "\"Hi everyone! Thank you for having me. I moved here two weeks ago and don't know a soul — so this is lovely.\"",
            "goto": "a_ordering",
            "clue": true
          },
          {
            "label": "\"Hi. I'm Mona.\"",
            "goto": "b_ordering",
            "clue": false
          },
          {
            "label": "\"Hi! Sorry, I'm the new girl. Please be gentle.\"",
            "goto": "b_ordering",
            "clue": false
          }
        ]
      }
    },
    "a_ordering": {
      "art": "en/dinner-with-new-friends/n3-order.jpg",
      "segments": [
        "\"Two weeks! Then you need the full tour,\" laughed a woman named Dalia, and the table warmed to her at once. A waiter came round. \"The pasta here is famous,\" Leo said, \"but order whatever you like.\" Mona looked at the menu — some words she knew, some she didn't — and she didn't want to just copy everyone."
      ],
      "choice": {
        "prompt": "Mona orders…",
        "options": [
          {
            "label": "\"What's the pasta with the funny name? …I'll have that — it sounds wonderful.\"",
            "goto": "a_the_question",
            "clue": true
          },
          {
            "label": "\"The same as him, please.\"",
            "goto": "a_the_question",
            "clue": false
          }
        ]
      }
    },
    "a_the_question": {
      "art": "en/dinner-with-new-friends/n4-food.jpg",
      "segments": [
        "The food came — steaming bowls, shared bread, a dish of olives passed hand to hand. The table talked over each other, happy and loud. \"So, Mona,\" said Dalia, \"why did you come all this way? To OUR rainy little city?\" Five faces turned to her, curious and kind."
      ],
      "choice": {
        "prompt": "How does Mona answer?",
        "options": [
          {
            "label": "\"Honestly? I wanted a fresh start — a new city, a new language, a braver me. It's scary. But tonight makes it feel worth it.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "\"Oh, you know. Work. The usual.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_ordering": {
      "art": "en/dinner-with-new-friends/n3-order.jpg",
      "segments": [
        "The friends smiled and turned back to their talk. It moved fast — names, jokes, a story about someone called Dan — and Mona couldn't follow all of it. A waiter appeared. \"And for you?\" Everyone looked at her. Mona looked at the menu, full of words, and felt her mind go blank."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"Sorry — could you give me one more minute?\" then chooses.",
            "goto": "b_a_quiet_corner_of_the_table",
            "clue": true
          },
          {
            "label": "panics and points: \"That one. Please.\" (not sure what it is)",
            "goto": "b_a_quiet_corner_of_the_table",
            "clue": false
          }
        ]
      }
    },
    "b_a_quiet_corner_of_the_table": {
      "art": "en/dinner-with-new-friends/n5-talk.jpg",
      "segments": [
        "The table laughed and chatted around her. She smiled and nodded, understanding one word in three, wanting to join in — but the right moment kept slipping past. Then Leo touched her arm. \"You okay over there?\" he asked quietly."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"Yes — just a bit lost! You all talk so fast. But I'm happy I came.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "\"Fine, fine,\" and keeps nodding at jokes she can't hear.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/dinner-with-new-friends/n6-toast.jpg",
      "segments": [
        "The table went quiet for a moment — then Dalia raised her glass. \"To Mona. To a braver you. Welcome.\" Glasses clinked all down the table.",
        "The night went long and warm. They taught her rude words and bad jokes, argued about the best pizza, and made her promise to come every Friday. When Leo walked her to the corner, he said, \"Told you you'd fit in.\" Mona looked up at her new city's sky and, for the first time, it felt like home."
      ],
      "ending": {
        "id": "one-of-us",
        "title": "One of Us",
        "quality": "good",
        "wrap": "She came as a stranger and left with a table full of friends — and a standing invitation to Fridays."
      }
    },
    "end_ok": {
      "art": "en/dinner-with-new-friends/n7-warm.jpg",
      "segments": [
        "Mona smiled and let the conversation flow around her. She didn't catch every joke, but she laughed when they laughed, and the food was good. By the end she knew a few names — Dalia, Dan, Leo's friend with the loud laugh. \"See you around, Mona,\" they said warmly.",
        "She walked home full and a little tired. She hadn't shone, exactly — but she had been there, at the table, among people. And that was more than last Friday."
      ],
      "ending": {
        "id": "pleasant-night",
        "title": "A Pleasant Night",
        "quality": "ok",
        "wrap": "A gentle first dinner. Next time she'll say more — and they'll be glad to hear it."
      }
    },
    "end_lesser": {
      "art": "en/dinner-with-new-friends/n8-eels.jpg",
      "segments": [
        "Mona nodded and smiled her way to the end of the night, understanding almost nothing — and eating all of the grey, wobbly mystery dish, because it felt rude not to. Only in the taxi home did Leo text her: \"Brave of you to finish the jellied eels! Nobody actually eats those.\"",
        "Mona stared at her phone, groaned, then burst out laughing in the back of the taxi. A whole plate of jellied eels, eaten out of pure politeness. \"Next Friday,\" she texted back, \"I'm ordering the pasta.\" Leo sent three laughing faces and one word: \"Deal.\""
      ],
      "ending": {
        "id": "jellied-eels",
        "title": "The Jellied Eels",
        "quality": "lesser",
        "wrap": "A disgusting, hilarious welcome — and she'll be back (for the pasta)."
      }
    }
  }
}
$nodes$::jsonb, 106, false, false, NULL
FROM public.levels l WHERE l.id = 'A2'
ON CONFLICT (course, slug) DO NOTHING;

-- 107: The Interview (B1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'the-interview', 'The Interview', '[]'::jsonb, true, $nodes$
{
  "start": "the_opportunity",
  "map": {
    "the_opportunity": {
      "art": "en/the-interview/n1-email.jpg",
      "segments": [
        "Three months in, Mona had just started to feel at home — and then the email arrived. A senior role, a real step up, on a team she admired. Her first thought was: not me. Too new, too foreign, too nervous. She almost closed the email.",
        "But Priya, reading over her shoulder with a coffee, said simply: \"Apply. You're ready, even if you don't feel it yet.\" So, heart in her mouth, Mona did."
      ],
      "next": "the_waiting_room"
    },
    "the_waiting_room": {
      "art": "en/the-interview/n2-waiting.jpg",
      "segments": [
        "The interview room had a glass door and three chairs on the far side of the table. Mona waited outside, going over her notes, her hands cold. Through the glass she could see them: a woman with sharp eyes, a kind-looking older man, and a younger one scrolling on a tablet.",
        "The door opened. \"Mona? Come in.\" She stood, smoothed her jacket, and told herself the truth: I have earned the right to be in this room."
      ],
      "next": "why_this_role"
    },
    "why_this_role": {
      "art": "en/the-interview/n3-opening.jpg",
      "segments": [
        "\"So,\" said the sharp-eyed woman, \"tell us why you want this role.\" It was the question Mona had practised a hundred times. But in the warm, quiet room, with three faces watching, every clever sentence flew out of her head."
      ],
      "choice": {
        "prompt": "How does Mona begin?",
        "options": [
          {
            "label": "\"I'll be honest — three months ago I couldn't order a coffee here. Today I'm applying for this. I don't just want the role; I want to prove how fast I can grow.\"",
            "goto": "a_tell_me_about_a_failure",
            "clue": true
          },
          {
            "label": "\"I'm hard-working, a team player, and very motivated.\"",
            "goto": "b_everyone_says_that",
            "clue": false
          },
          {
            "label": "\"Honestly? I'm probably not qualified, but I thought I'd try.\"",
            "goto": "b_everyone_says_that",
            "clue": false
          }
        ]
      }
    },
    "a_tell_me_about_a_failure": {
      "art": "en/the-interview/n4-failure.jpg",
      "segments": [
        "The older man leaned forward, interested. \"That takes guts. But this role is hard. Tell me about a time something went wrong — and what you did.\" Mona thought of the wrong train, the six kilos of apples, a hundred small failures, and picked a real one: a project at her last job that had gone badly. She told it honestly — the mistake, the panic, what she learned. She did not pretend to be perfect."
      ],
      "choice": {
        "prompt": "He asks, \"And if it happened again tomorrow?\"",
        "options": [
          {
            "label": "\"I'd catch it a week earlier — because now I ask for help before I'm drowning, not after.\"",
            "goto": "a_the_real_question",
            "clue": true
          },
          {
            "label": "\"It wouldn't happen again. I don't make the same mistake twice.\"",
            "goto": "a_the_real_question",
            "clue": false
          }
        ]
      }
    },
    "a_the_real_question": {
      "art": "en/the-interview/n5-realquestion.jpg",
      "segments": [
        "The sharp-eyed woman had been quiet, watching. Now she spoke. \"You're clearly capable. But you're also the newest person here. Why should we trust you with this?\" It was the real question — the one under all the others. Mona felt it land. She could defend, or be honest."
      ],
      "choice": {
        "prompt": "What does Mona say?",
        "options": [
          {
            "label": "\"Because being new is exactly why. I question everything you've stopped questioning. I'll work twice as hard, and I'll bring a view this team doesn't have yet.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "\"I'll prove it with results. Give me three months.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_everyone_says_that": {
      "art": "en/the-interview/n4-failure.jpg",
      "segments": [
        "\"Hard-working. Motivated.\" The sharp-eyed woman wrote something down without looking up. \"Everyone says that.\" The room felt cooler. Mona realised her safe answers had bored them; she needed to show something real. \"Tell us about a real challenge,\" said the older man, giving her a second chance."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "takes a breath — \"Okay. The real answer: moving here alone was the hardest thing I've ever done. Here's what it taught me…\"",
            "goto": "b_the_weakness_question",
            "clue": true
          },
          {
            "label": "\"Well, there was a difficult project last year…\" (safe, generic)",
            "goto": "b_the_weakness_question",
            "clue": false
          }
        ]
      }
    },
    "b_the_weakness_question": {
      "art": "en/the-interview/n5-realquestion.jpg",
      "segments": [
        "The panel listened, polite but not lit up. The clock ticked. \"Last question,\" said the sharp-eyed woman. \"What's one thing about yourself you'd change?\" The weakness question — the trap. Mona had read that you give a fake weakness (\"I work too hard\"). But these three had heard that a thousand times."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"I second-guess myself — I almost didn't apply for this. I'm learning to trust what I already know.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "\"Honestly? I just care too much.\"",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-interview/n6-news.jpg",
      "segments": [
        "The sharp-eyed woman put down her pen and, for the first time, smiled. \"That,\" she said, \"is the best answer we've heard all week.\" Mona walked out on shaking legs, not sure if she'd been brilliant or mad. Two days later, the email came: the role was hers.",
        "Priya found her in the corridor and hugged her. \"I told you. Ready, even when you don't feel it.\" Mona laughed, and for a moment the frightened newcomer at the airport felt very far away."
      ],
      "ending": {
        "id": "person-for-the-job",
        "title": "The Person for the Job",
        "quality": "good",
        "wrap": "She walked in as the new one and walked out as the person for the job — by being honest instead of safe."
      }
    },
    "end_ok": {
      "art": "en/the-interview/n7-corridor.jpg",
      "segments": [
        "\"Thank you, Mona. We'll be in touch,\" said the older man kindly. She left not knowing how it had gone. A week later: she hadn't got it — but the sharp-eyed woman called her personally. \"You were close. Really close. Keep the honesty, lose the safe answers, and next time it's yours.\"",
        "Mona was disappointed, but not crushed. She had sat in that room, with those people, and held her own. Six months ago she couldn't have imagined it. Next time, she'd be ready."
      ],
      "ending": {
        "id": "close",
        "title": "Close",
        "quality": "ok",
        "wrap": "Not the job — this time. But she proved she belonged in the room."
      }
    },
    "end_lesser": {
      "art": "en/the-interview/n8-drink.jpg",
      "segments": [
        "\"I care too much,\" Mona said — and watched all three faces quietly switch off. She knew the second she said it: the safe, fake answer. The rest of the interview was polite and short. She didn't get the role, and she knew exactly why.",
        "That evening, Priya bought her a drink. \"You went in and performed a person,\" she said gently. \"Next time, just bring Mona. She's more impressive than the script.\" Mona laughed, a little sad, a little wiser."
      ],
      "ending": {
        "id": "script",
        "title": "The Script",
        "quality": "lesser",
        "wrap": "The rehearsed answers cost her the role — but taught her the most useful thing: next time, be real."
      }
    }
  }
}
$nodes$::jsonb, 107, false, false, NULL
FROM public.levels l WHERE l.id = 'B1'
ON CONFLICT (course, slug) DO NOTHING;

-- 108: Under the Weather (B1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'under-the-weather', 'Under the Weather', '[]'::jsonb, true, $nodes$
{
  "start": "thursday",
  "map": {
    "thursday": {
      "art": "en/under-the-weather/n1-bed.jpg",
      "segments": [
        "It started with a scratchy throat on Tuesday. By Thursday, Mona could barely lift her head off the pillow. Her whole body ached, her nose ran like a tap, and a cough rattled deep in her chest. In her own language, she knew exactly how to say all of this; in English, the words felt slippery and strange.",
        "\"I can't work like this,\" she croaked to the empty flat. She found the local clinic's number and, tissue in hand, made an appointment."
      ],
      "next": "the_waiting_room"
    },
    "the_waiting_room": {
      "art": "en/under-the-weather/n2-waiting.jpg",
      "segments": [
        "The clinic smelled of hand gel and old magazines. Mona sat among coughing strangers, rehearsing her symptoms under her breath: \"A temperature. A cough. My body hurts.\" Simple words — but she was afraid of forgetting them, or of not understanding the reply. \"Mona?\" a nurse called. \"The doctor will see you now. Room two.\""
      ],
      "next": "what_s_been_going_on"
    },
    "what_s_been_going_on": {
      "art": "en/under-the-weather/n3-describe.jpg",
      "segments": [
        "Dr. Shah was younger than Mona expected, with a calm voice and tired, kind eyes. \"So — what's been going on?\" This was the moment: she had to explain clearly enough to be helped, and honestly enough to be safe."
      ],
      "choice": {
        "prompt": "How does Mona describe her symptoms?",
        "options": [
          {
            "label": "\"Since Tuesday: a sore throat, then a fever, and now a bad cough and aching all over. Worse at night.\"",
            "goto": "a_the_examination",
            "clue": true
          },
          {
            "label": "\"I feel bad. Very bad. Everywhere.\"",
            "goto": "b_drawing_it_out",
            "clue": false
          },
          {
            "label": "\"I think it might be something serious — I read online —\"",
            "goto": "b_drawing_it_out",
            "clue": false
          }
        ]
      }
    },
    "a_the_examination": {
      "art": "en/under-the-weather/n4-exam.jpg",
      "segments": [
        "\"That's really helpful, thank you,\" said Dr. Shah, and listened to her chest. \"Breathe in… and out.\" The cold stethoscope made her shiver. \"Good news — a nasty viral infection, not your chest. It'll pass in a week. Rest, fluids, and these.\" He wrote a prescription, then said something quickly about \"the pharmacy on the high street\" and \"twice a day with food\" — and Mona caught only half."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"Sorry — could you say the last part again? Twice a day, with food — is that right?\"",
            "goto": "a_just_to_be_sure",
            "clue": true
          },
          {
            "label": "nods and says \"Okay, thank you,\" though she isn't sure.",
            "goto": "a_just_to_be_sure",
            "clue": false
          }
        ]
      }
    },
    "a_just_to_be_sure": {
      "art": "en/under-the-weather/n5-instructions.jpg",
      "segments": [
        "Dr. Shah smiled and repeated it slowly, writing \"2×/day, with food\" on the paper. \"And if the fever doesn't break in three days, or you get short of breath — come straight back. Don't wait.\" \"Come back if the fever stays, or breathing gets hard,\" Mona repeated. \"Exactly,\" he said. \"You're a good patient.\""
      ],
      "choice": {
        "prompt": "On the way out, Mona…",
        "options": [
          {
            "label": "stops at the pharmacy, reads the label, and texts Priya: \"Not coming in — doctor's orders. Back Monday.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "thanks everyone, but secretly plans to work from home anyway.",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_drawing_it_out": {
      "art": "en/under-the-weather/n4-exam.jpg",
      "segments": [
        "\"I feel bad everywhere\" was true, but it didn't give the doctor much. He asked gentle questions — \"How long? Any fever? A cough?\" — and slowly drew the story out of her. It took longer, and Mona felt a little foolish, but Dr. Shah was patient. \"Sounds like a virus. Rest and fluids, and these tablets.\" He explained the dose at a normal speed, and Mona lost the thread halfway through."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"I'm sorry — my English gets worse when I'm ill. Could you write the instructions down?\"",
            "goto": "b_a_paper_full_of_words",
            "clue": true
          },
          {
            "label": "\"Okay, thank you, doctor,\" and takes the paper without really knowing the plan.",
            "goto": "b_a_paper_full_of_words",
            "clue": false
          }
        ]
      }
    },
    "b_a_paper_full_of_words": {
      "art": "en/under-the-weather/n5-instructions.jpg",
      "segments": [
        "He gave her the prescription and a reassuring pat. \"Take care. Come back if you're not better next week.\" Mona left clutching a paper covered in medical words, feeling worse than when she arrived — not in body, but in confidence. How many tablets? When? What to watch for? She wasn't sure."
      ],
      "choice": {
        "prompt": "At the pharmacy, Mona…",
        "options": [
          {
            "label": "shows the paper: \"Could you explain how to take these, please? I didn't catch it all.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "decides she'll \"figure it out at home\" and takes the box.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/under-the-weather/n6-caredfor.jpg",
      "segments": [
        "Mona spent the weekend wrapped in a blanket, tea within reach, tablets twice a day with food, exactly as the little note said. By Sunday the fever broke. Priya sent soup and a funny card. Leo left lemons at the door. Mr. Alder knocked to check she was alive, then fixed the window properly while he was at it.",
        "Lying in her warm bed, cared for by a whole small world of new friends, Mona realised: she was ill, and far from home — and somehow, not alone at all."
      ],
      "ending": {
        "id": "looked-after",
        "title": "Looked After",
        "quality": "good",
        "wrap": "She explained clearly, asked when unsure, and let people help. The city looked after its own."
      }
    },
    "end_ok": {
      "art": "en/under-the-weather/n7-desk.jpg",
      "segments": [
        "Mona got better, more or less. She took the tablets — most days, roughly on time — and rested when she could, though she snuck in a little work she'd promised not to. The cough hung around a few extra days because of it. \"You didn't rest, did you?\" Priya guessed on Monday. Mona looked guilty. \"Next time,\" said Priya, \"when the doctor says rest, you rest.\"",
        "Still, she'd done it — navigated a doctor, a pharmacy, an illness, all in a second language. No small thing."
      ],
      "ending": {
        "id": "muddling-through",
        "title": "Muddling Through",
        "quality": "ok",
        "wrap": "She muddled through and got well — and learned that \"doctor's orders\" includes the resting part."
      }
    },
    "end_lesser": {
      "art": "en/under-the-weather/n8-fridge.jpg",
      "segments": [
        "Mona decided she'd figure out the tablets at home. She did not. The box said \"one, twice daily\"; she read \"two, once daily\", and spent Saturday wondering why she felt so strange and sleepy. On Sunday, worried, she finally phoned the clinic. The nurse untangled it in two minutes. \"Easy mistake — but do ask next time. That's what we're here for.\"",
        "Mona felt silly, then grateful. She stuck the corrected instructions to her fridge in big, clear letters — and finally had a proper rest."
      ],
      "ending": {
        "id": "mix-up",
        "title": "The Mix-Up",
        "quality": "lesser",
        "wrap": "A muddled dose and a worried Saturday — a harmless mistake that taught her to always, always ask."
      }
    }
  }
}
$nodes$::jsonb, 108, false, false, NULL
FROM public.levels l WHERE l.id = 'B1'
ON CONFLICT (course, slug) DO NOTHING;

-- 109: The Favour (B1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'the-favour', 'The Favour', '[]'::jsonb, true, $nodes$
{
  "start": "the_tiniest_favour",
  "map": {
    "the_tiniest_favour": {
      "art": "en/the-favour/n1-phone.jpg",
      "segments": [
        "It was a Tuesday when Dalia called, talking fast, the way she always did. \"Mona! Angel. Lifesaver. I need the tiniest, tiniest favour.\" The \"tiniest favour,\" it turned out, was two weeks of looking after her flat across town: her dog Biscuit, her forty houseplants, her tropical fish, and \"just a bit\" of post. Starting tomorrow.",
        "\"You'll barely notice!\" Dalia sang. But Mona had her own busy fortnight — a big deadline, a cousin visiting — and two weeks of a strange dog across the city was not \"tiny\" at all."
      ],
      "next": "the_squeeze"
    },
    "the_squeeze": {
      "art": "en/the-favour/n2-squeeze.jpg",
      "segments": [
        "\"You're the only person I trust,\" Dalia went on. \"Everyone else said no. You're so kind, so organised — please?\" There it was: flattery, guilt, and a door closing, all at once. Mona liked Dalia and wanted to be a good friend. She also knew that if she said yes, her own two weeks would fall apart. \"So?\" said Dalia. \"Tomorrow? You're a star.\""
      ],
      "choice": {
        "prompt": "How does Mona respond?",
        "options": [
          {
            "label": "\"Dalia, I love that you trust me — but two weeks across town is more than I can do right now, with my deadline. Can I help you find a better plan instead?\"",
            "goto": "a_the_pause",
            "clue": true
          },
          {
            "label": "\"Um… okay. I guess. Sure.\"",
            "goto": "b_biscuit_the_dog",
            "clue": false
          },
          {
            "label": "\"Maybe? Let me check and call you back…\" (and dreads it)",
            "goto": "b_biscuit_the_dog",
            "clue": false
          }
        ]
      }
    },
    "a_the_pause": {
      "art": "en/the-favour/n3-answer.jpg",
      "segments": [
        "There was a pause. For a second Mona was sure she'd ruined it. Then Dalia sighed — not angry, just tired. \"God, no, you're right. I always do this. I ask too much.\" \"You don't ask too much,\" said Mona gently. \"You ask too many things at once.\" Dalia actually laughed. \"Okay. Fair. So what CAN you do, oh organised one?\""
      ],
      "choice": {
        "prompt": "Mona offers…",
        "options": [
          {
            "label": "\"I can walk Biscuit the three evenings I'm free, and let's ring round for a proper dog-sitter tonight — right now, together.\"",
            "goto": "a_fixed_in_twenty_minutes",
            "clue": true
          },
          {
            "label": "\"I can water the plants once, maybe.\"",
            "goto": "a_fixed_in_twenty_minutes",
            "clue": false
          }
        ]
      }
    },
    "a_fixed_in_twenty_minutes": {
      "art": "en/the-favour/n4-fix.jpg",
      "segments": [
        "Together, over the phone, they found a dog-sitter two streets from Dalia's flat — a student who adored dogs and needed the money. Mona offered to drop by with treats mid-week. Problem solved, in twenty minutes. \"You just fixed my whole life without saying yes to any of it,\" Dalia said, amazed. \"Teach me your powers.\" \"It's not magic,\" Mona laughed. \"It's just honesty. And lists.\""
      ],
      "choice": {
        "prompt": "As they hang up, Dalia says, \"I owe you one.\" Mona…",
        "options": [
          {
            "label": "\"You don't owe me anything — but you can buy the first round on Friday.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "\"Oh, it's nothing, really.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_biscuit_the_dog": {
      "art": "en/the-favour/n5-callback.jpg",
      "segments": [
        "\"You're a star!\" Dalia hung up before Mona could change her mind. And just like that, Mona owned a dog named Biscuit, forty thirsty plants, and a two-week knot in her stomach. The deadline loomed. Her cousin arrived. Biscuit ate a shoe and howled at 3 a.m. The fish looked at her accusingly. Mona crossed the city twice a day and slept four hours a night."
      ],
      "choice": {
        "prompt": "To cope, Mona…",
        "options": [
          {
            "label": "asks her visiting cousin to help with the evening walks.",
            "goto": "b_everything_perfect",
            "clue": true
          },
          {
            "label": "tries to do absolutely all of it alone.",
            "goto": "b_everything_perfect",
            "clue": false
          }
        ]
      }
    },
    "b_everything_perfect": {
      "art": "en/the-favour/n5-callback.jpg",
      "segments": [
        "On day ten, running on coffee and panic, her phone rang. Dalia, from her sunny holiday. \"How's my baby? Everything perfect?\" Mona stood in the wrecked kitchen, a chewed shoe in one hand, and had a choice: the truth, or the performance."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"Truthfully? It's been a lot — I took on too much. Let's sort the last days together.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "\"Perfect! All perfect!\" (and keeps drowning)",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-favour/n6-toast.jpg",
      "segments": [
        "Friday came, and Dalia bought the first round — and the second. \"To the woman who said no and somehow helped more than anyone who said yes.\" Biscuit adored his student sitter; the plants survived; Mona's deadline was met, calm and on time. And Dalia, who had lost friends by asking too much, had found one honest enough to keep.",
        "\"You're a keeper, Mona.\" Back home, Mona wouldn't have dared to say no. Here, she was learning that a kind \"no\" could be the start of a real friendship."
      ],
      "ending": {
        "id": "keeper",
        "title": "A Keeper",
        "quality": "good",
        "wrap": "A warm, honest \"no\" — and a smarter \"yes\" — turned a favour into a friendship. Boundaries, it turns out, are a kind of care."
      }
    },
    "end_ok": {
      "art": "en/the-favour/n7-exhausted.jpg",
      "segments": [
        "The last few days, Mona and Dalia sorted a sitter together, and Mona finally slept. When Dalia came home — tanned and happy — she found her flat alive, her dog content, and her friend absolutely exhausted. \"You should have told me sooner. I'd never have wanted this.\" \"I know,\" said Mona. \"I'm still learning to say no.\"",
        "She'd kept the friendship and kept her word — but nearly run herself into the ground to do it."
      ],
      "ending": {
        "id": "hard-way",
        "title": "The Hard Way",
        "quality": "ok",
        "wrap": "She kept her promise and her friend — but learned that a \"yes\" you can't carry helps no one."
      }
    },
    "end_lesser": {
      "art": "en/the-favour/n8-flood.jpg",
      "segments": [
        "Mona said \"perfect!\" right to the bitter end — and it was very far from perfect. On day eleven, a plant she'd over-watered tipped over, cracked the fish tank, and sent a small, polite flood across Dalia's floor. Mona spent her last free evening on her knees with a mop, a nervous dog, and three fish in a salad bowl, laughing helplessly.",
        "When Dalia got home, Mona confessed everything in one long, breathless, hilarious story. Dalia stared — then roared. \"You flooded my flat rather than admit you were tired?\" \"Yes,\" said Mona. \"Yes, I did.\" \"Oh, Mona — just TELL me next time.\""
      ],
      "ending": {
        "id": "flood",
        "title": "The Flood",
        "quality": "lesser",
        "wrap": "A flood and a salad bowl of fish: pretending you're fine helps nobody. (Next time: tell the truth.)"
      }
    }
  }
}
$nodes$::jsonb, 109, false, false, NULL
FROM public.levels l WHERE l.id = 'B1'
ON CONFLICT (course, slug) DO NOTHING;

-- 110: Crossed Wires (B2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'crossed-wires', 'Crossed Wires', '[]'::jsonb, true, $nodes$
{
  "start": "the_midnight_polish",
  "map": {
    "the_midnight_polish": {
      "art": "en/crossed-wires/n1-rework.jpg",
      "segments": [
        "Mona had meant it as a kindness. The client deck was due Monday, so over a sleepless Sunday she reworked the whole thing — tightened the numbers, redesigned the slides, fixed what she was sure were mistakes. She sent it at midnight with a cheerful note: \"Gave it a polish — hope that's okay!\"",
        "On Monday morning she waited for a thank-you. Instead, in the meeting, their boss said warmly, \"Great work on this, Mona\" — and across the table, Priya's smile froze for half a second before it came back, too bright."
      ],
      "next": "the_cold"
    },
    "the_cold": {
      "art": "en/crossed-wires/n2-frozen.jpg",
      "segments": [
        "After the meeting, something had shifted. Priya was polite — perfectly, carefully polite — and that was how Mona knew something was wrong. The easy warmth of three months was gone, replaced by short replies and a closed office door.",
        "Mona replayed it. The \"mistakes\" she'd fixed hadn't been mistakes — they'd been Priya's deliberate choices. The \"polish\" had erased a week of her work, and then Mona had been praised for it, publicly, while Priya said nothing. She hadn't helped. She'd stepped right over the person who believed in her."
      ],
      "next": "the_closed_door"
    },
    "the_closed_door": {
      "art": "en/crossed-wires/n3-door.jpg",
      "segments": [
        "By mid-afternoon the silence was unbearable. Mona could let it blow over and hope it faded — or she could knock on that closed door. She thought about how she'd feel in Priya's chair. She stood, walked over, and knocked."
      ],
      "choice": {
        "prompt": "How does Mona open the conversation?",
        "options": [
          {
            "label": "\"Priya — can we talk? I think I overstepped with the deck, and I don't want to pretend I didn't notice things went cold. Can I explain, and really listen?\"",
            "goto": "a_the_honest_exchange",
            "clue": true
          },
          {
            "label": "\"Hey — everything okay? You seem a bit quiet today.\"",
            "goto": "b_everything_s_fine",
            "clue": false
          },
          {
            "label": "\"I'm SO sorry, I'm the worst, please don't hate me —\"",
            "goto": "b_everything_s_fine",
            "clue": false
          }
        ]
      }
    },
    "a_the_honest_exchange": {
      "art": "en/crossed-wires/n4-honest.jpg",
      "segments": [
        "Priya put down her pen. For a moment she looked like she might say \"it's fine\" — the lie that ends conversations. Then she chose honesty too. \"You rewrote a week of my work overnight, called it a polish, and got praised for it in front of our boss. I didn't know whether to be hurt or impressed.\" It landed hard, because it was true. Mona made herself sit with it instead of defending."
      ],
      "choice": {
        "prompt": "Mona responds:",
        "options": [
          {
            "label": "\"You have every right to be both. I thought I was helping — but I didn't ask, and that's the problem. I erased your decisions and took the credit without meaning to. I'm sorry. That's on me.\"",
            "goto": "a_what_priya_learned_once",
            "clue": true
          },
          {
            "label": "\"I'm sorry, but I really was just trying to help — I didn't know they were on purpose.\"",
            "goto": "a_what_priya_learned_once",
            "clue": false
          }
        ]
      }
    },
    "a_what_priya_learned_once": {
      "art": "en/crossed-wires/n5-lift.jpg",
      "segments": [
        "\"Thank you for saying that,\" said Priya, and some of the ice melted. \"I don't think you were malicious. I think you're hungry and talented and you haven't learned where the lines are yet. When I was new, I did something similar — someone sat me down, exactly like this.\" \"What did they tell you?\" Mona asked. Priya considered. \"That the fastest way to lose a team is to make them feel invisible. And the fastest way to win one is to make sure everyone gets the credit they earned.\""
      ],
      "choice": {
        "prompt": "What does Mona do next?",
        "options": [
          {
            "label": "\"Then let me fix the visible part. I'll email the team and the boss that the strong bones of that deck were yours — because they were. And nothing of yours goes out again without us talking first.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "\"I'll be more careful next time, I promise. It won't happen again.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_everything_s_fine": {
      "art": "en/crossed-wires/n4-honest.jpg",
      "segments": [
        "\"Everything's fine,\" said Priya, in the voice that means nothing is fine, and turned back to her screen. The door was open, but the real conversation stayed firmly shut. The overwritten work, the stolen spotlight — it sat in the room between them, unnamed and growing. Mona could retreat now, or go deeper."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"I don't think it is fine, and I think it's my fault. I rewrote your work and got praised for it. Can we actually talk about that?\"",
            "goto": "b_three_quiet_days",
            "clue": true
          },
          {
            "label": "\"Okay. Sorry to bother you,\" and backs out of the room.",
            "goto": "b_three_quiet_days",
            "clue": false
          }
        ]
      }
    },
    "b_three_quiet_days": {
      "art": "en/crossed-wires/n5-lift.jpg",
      "segments": [
        "Whichever way she'd turned, the true conversation hadn't happened. For three days the office ran on careful politeness — \"Could you forward me that file.\" \"Of course.\" Thank-yous like closing doors. The work got done; the warmth did not return. A problem you don't name doesn't disappear — it goes quiet and waits. On Thursday, their paths crossed at the lift, Priya's coat already on."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "steps into the lift: \"Priya — I owe you a real conversation, not three days of 'fine'. I overstepped, I took credit that was yours, and I've hated every quiet minute since. Can I make it right?\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "\"Have a good evening!\" — and lets the doors close on the silence.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/crossed-wires/n6-coffees.jpg",
      "segments": [
        "Mona sent the email that afternoon — to the team, to the boss — plainly crediting Priya for the backbone of the work. It cost her a little pride and changed everything. Priya appeared at her desk twenty minutes later, two coffees in hand, the old warmth back. \"You didn't have to do that.\" \"Yes I did. And I wanted to.\"",
        "They rebuilt the rule together: nothing ships without a five-minute check-in. The near-disaster made them better — Priya began handing Mona the kind of responsibility you only give someone you trust to have your back. \"Crossed wires,\" Priya said later, \"are just two people who both cared. We'll untangle faster next time.\""
      ],
      "ending": {
        "id": "better-than-before",
        "title": "Better Than Before",
        "quality": "good",
        "wrap": "She owned it, repaired it in public, and traded a stolen spotlight for something far better: trust."
      }
    },
    "end_ok": {
      "art": "en/crossed-wires/n7-lifttalk.jpg",
      "segments": [
        "In the lift, Mona said her piece — late, but honestly — and Priya, tired but not unkind, listened. \"I appreciate it. I wish you'd said it on Monday. But I'm glad you said it at all.\" Over the next weeks the warmth slowly, carefully returned, like a bruise fading.",
        "They were fine. Good, even. But Mona never forgot the three quiet days — the cost of waiting, of hoping a problem would solve itself. \"Next time,\" she told herself, \"I knock on the door the same afternoon.\""
      ],
      "ending": {
        "id": "little-late",
        "title": "A Little Late",
        "quality": "ok",
        "wrap": "Repaired a little late — the friendship survives, and silence turns out to be the most expensive choice of all."
      }
    },
    "end_lesser": {
      "art": "en/crossed-wires/n8-leo-word.jpg",
      "segments": [
        "Mona let the doors close on a cheerful \"Have a good evening!\" — and the real conversation never came. She tried to fix it sideways: praising Priya loudly in meetings (which felt forced), bringing unasked-for coffees (which felt like guilt), tiptoeing for a fortnight. Priya, baffled by the strange energy, pulled further away.",
        "It took a blunt word from Leo weeks later — \"Have you actually TOLD her you're sorry, or just… hovered?\" — for Mona to finally knock, months too late, and say the simple true thing. Priya forgave her, but the easy trust took a long time to rebuild. \"You can't fix a conversation,\" Priya said, \"by having every conversation except that one.\""
      ],
      "ending": {
        "id": "every-conversation-but-that-one",
        "title": "Every Conversation But That One",
        "quality": "lesser",
        "wrap": "Avoiding the hard words stretched a two-minute apology into two painful months. Say the true thing early."
      }
    }
  }
}
$nodes$::jsonb, 110, false, false, NULL
FROM public.levels l WHERE l.id = 'B2'
ON CONFLICT (course, slug) DO NOTHING;

-- 111: The Negotiation (B2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'the-negotiation', 'The Negotiation', '[]'::jsonb, true, $nodes$
{
  "start": "the_letter",
  "map": {
    "the_letter": {
      "art": "en/the-negotiation/n1-letter.jpg",
      "segments": [
        "The letter was formal, typed, and slipped under her door — which told Mona, before she even read it, that Mr. Alder had hated writing it. Costs had risen: the heating, the roof, the insurance. He had no choice but to raise the rent, and the new number made her stomach drop. Not cruel — but more than she could comfortably pay, with everything else still so new.",
        "She loved this flat: the gold morning light, the fixed window, the kind old man downstairs who brought soup when she was ill. She didn't want to leave. But she couldn't pretend the number worked, either."
      ],
      "next": "at_his_door"
    },
    "at_his_door": {
      "art": "en/the-negotiation/n2-doorway.jpg",
      "segments": [
        "She found him in his doorway that evening, cap in hand, looking older than usual. \"You got the letter.\" Not a question. \"I'm sorry, Mona. I put it off a month. The roof won't wait, though.\" He looked as if he expected her to be angry, or to hand in her notice on the spot. And Mona understood: this was a negotiation where both of them were afraid of losing something — and the easy moves were the wrong ones."
      ],
      "choice": {
        "prompt": "How does Mona begin?",
        "options": [
          {
            "label": "\"I'm not angry — I can see this is hard for you too. Honestly: I love it here and want to stay, but that number is a real stretch right now. Can we think about it together?\"",
            "goto": "a_tea_and_the_real_picture",
            "clue": true
          },
          {
            "label": "\"It's okay. I understand. I'll… find the money somehow.\"",
            "goto": "b_the_standoff",
            "clue": false
          },
          {
            "label": "\"That's a huge jump. That can't be legal with no notice.\"",
            "goto": "b_the_standoff",
            "clue": false
          }
        ]
      }
    },
    "a_tea_and_the_real_picture": {
      "art": "en/the-negotiation/n3-tea.jpg",
      "segments": [
        "Mr. Alder blinked, surprised to be treated as a partner rather than a villain. \"Together,\" he repeated, and a little weight lifted from his shoulders. \"Come in. I'll put the kettle on.\" Over tea the real picture came out: he didn't need the full increase from everyone at once — he needed the roof paid by spring. And he was drowning in small jobs his knees could no longer do. Mona, who was organised and whose cousin happened to be handy, began to see a shape."
      ],
      "choice": {
        "prompt": "Mona proposes:",
        "options": [
          {
            "label": "\"What if I take the rise in two steps — half now, half in spring — and in return I help manage the building admin and small repairs? I'm good at lists, and I know someone handy.\"",
            "goto": "a_the_handshake",
            "clue": true
          },
          {
            "label": "\"Could you just give me three months at the old rate to adjust?\"",
            "goto": "a_the_handshake",
            "clue": false
          }
        ]
      }
    },
    "a_the_handshake": {
      "art": "en/the-negotiation/n5-handshake.jpg",
      "segments": [
        "Mr. Alder set down his tea and looked at her a long moment — this young woman who'd arrived six months ago barely able to order a coffee, now solving his problems in his kitchen. \"In forty years of renting rooms,\" he said, \"no one's ever offered to help instead of just argue.\" He put out his hand. \"Half now, half in spring. And if you really can sort my leaking taps, I'll call us even.\""
      ],
      "choice": {
        "prompt": "They shake on it. Then Mona…",
        "options": [
          {
            "label": "\"Let's put it in writing — fair for both of us. And thank you, Mr. Alder, for not just posting a bigger number and hoping. That means a lot.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "\"Great! A handshake's good enough for me.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_the_standoff": {
      "art": "en/the-negotiation/n9-standoff.jpg",
      "segments": [
        "Mona's answer — whether she'd swallowed it or sharpened it — closed the door on the easy conversation. Mr. Alder's face went carefully blank. If she'd accepted, he felt guilty and she felt trapped; if she'd threatened, he felt attacked and dug in — \"I've given thirty days, it's all legal.\" Either way they were now on opposite sides of a table, not the same one. Someone had to change the shape of it."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "\"I'm sorry — can we start again? I came in wrong. I don't want to fight you or flee. I want something that works for both of us.\"",
            "goto": "b_upstairs_deciding",
            "clue": true
          },
          {
            "label": "stays polite but firm in her corner: \"I'll think about it and let you know.\"",
            "goto": "b_upstairs_deciding",
            "clue": false
          }
        ]
      }
    },
    "b_upstairs_deciding": {
      "art": "en/the-negotiation/n10-upstairs.jpg",
      "segments": [
        "The conversation limped to a \"let's both think about it\" that satisfied no one. Mona went back upstairs, the letter still in her hand and a knot in her chest. She had a few days to decide who she wanted to be in this: the tenant who suffered quietly, the one who fought and left — or something better. That night she heard his slow footsteps below, and the clank of him trying, and failing, to fix a tap himself."
      ],
      "choice": {
        "prompt": "The next morning, Mona…",
        "options": [
          {
            "label": "knocks with two coffees: \"Let's try that again — properly this time. I have an idea.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "slides a note under his door accepting the full rent, saying nothing, feeling cold about it.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-negotiation/n6-signing.jpg",
      "segments": [
        "They wrote it up at the kitchen table — half now, half in spring, Mona as the building's unofficial organiser with her cousin on call for the taps. Fair, clear, signed by both. By spring the roof was fixed, the taps stopped leaking, and the other tenants started leaving parcels with \"the girl in flat three who sorts things out.\" Mr. Alder got his Thursdays back for tea and crosswords.",
        "\"Best deal I ever made,\" he told her once, \"was the one where nobody lost.\" Mona — once too frightened to say a word at a passport desk — had just negotiated her own home, not by winning, but by refusing to let either of them lose."
      ],
      "ending": {
        "id": "nobody-lost",
        "title": "Nobody Lost",
        "quality": "good",
        "wrap": "A real negotiation isn't about beating the other person — it's finding the table where you both can sit. Mona found it, and kept her home."
      }
    },
    "end_ok": {
      "art": "en/the-negotiation/n7-middle.jpg",
      "segments": [
        "The second conversation went better than the first. Over fresh coffee, Mona and Mr. Alder found a middle number — not as clever as a true partnership, but fair, kind, and manageable. \"I could've handled the start better,\" Mona admitted. \"We both could,\" he said.",
        "She kept her flat, he kept his dignity, and the gold morning light went on arriving. Not a perfect deal, but an honest one, reached by two people willing to try again. \"Next time there's a letter,\" he said, \"knock first. We'll skip the awkward part.\""
      ],
      "ending": {
        "id": "do-over",
        "title": "A Do-Over",
        "quality": "ok",
        "wrap": "A fair compromise, and a lesson: when a negotiation starts badly, the brave move is to call a do-over."
      }
    },
    "end_lesser": {
      "art": "en/the-negotiation/n8-hallway.jpg",
      "segments": [
        "Mona slid the note under his door — full rent, accepted, no conversation. The safe choice, and the lonely one. She kept the flat, but something small and warm was gone. For weeks she and Mr. Alder nodded in the hall like strangers. The soup stopped coming; the window, when it stuck again, stayed stuck.",
        "Only when she finally knocked, months later, with an apology and a pot of her own soup, did the frost break — and she learned the real cost of avoiding the hard talk: not money, but the warmth of a friendship she'd let go cold to save herself an awkward hour."
      ],
      "ending": {
        "id": "won-the-number-lost-the-warmth",
        "title": "Won the Number, Lost the Warmth",
        "quality": "lesser",
        "wrap": "She won the number and lost the warmth. Some negotiations you \"win\" by paying in full — and still end up poorer."
      }
    }
  }
}
$nodes$::jsonb, 111, false, false, NULL
FROM public.levels l WHERE l.id = 'B2'
ON CONFLICT (course, slug) DO NOTHING;

-- 112: The Goodbye (B2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'en', l.id, 'the-goodbye', 'The Goodbye', '[]'::jsonb, true, $nodes$
{
  "start": "the_news",
  "map": {
    "the_news": {
      "art": "en/the-goodbye/n1-news.jpg",
      "segments": [
        "Leo told her over the counter, the way he'd told her everything — the best bakery, the Friday dinners, the whole map of her new life. But this time his smile wasn't its usual easy self. \"I'm leaving, Mona. Moving north. I'm opening my own place — my own café. It's been the dream forever, and a space came up, and…\" He trailed off, searching her face.",
        "Mona stood very still. Leo had been her first friend in this city — the green apron, the misspelled cup, the kindness on a lonely morning. She'd built half her courage on his easy welcome. And now he was going."
      ],
      "next": "the_send_off"
    },
    "the_send_off": {
      "art": "en/the-goodbye/n2-sendoff.jpg",
      "segments": [
        "They threw him a send-off at the Friday restaurant — the whole warm, loud family of them. Dalia cried into the breadbasket. Someone made a speech that turned into a toast that turned into a song. Mona laughed and clapped with the rest, but under it all sat a quiet ache she couldn't quite name.",
        "At the end of the night, as coats were gathered and taxis called, Leo caught her eye and tilted his head towards the door. \"Walk with me?\" And then it was just the two of them, on the cold bright street, with everything unsaid between them."
      ],
      "next": "any_words_for_the_road"
    },
    "any_words_for_the_road": {
      "art": "en/the-goodbye/n3-walk.jpg",
      "segments": [
        "They walked in silence for a while. Mona knew this was the moment — the one you only get once, where you either say the true thing or let it slip away forever behind a joke. \"So,\" Leo said at last. \"Any words for the road?\" He said it lightly, but his eyes weren't light at all."
      ],
      "choice": {
        "prompt": "What does Mona say?",
        "options": [
          {
            "label": "\"Leo — you have no idea what you did. I came here with nothing, couldn't even order a coffee, and you looked at me like I belonged before I did. You made this city a home. I'll miss you more than I know how to say.\"",
            "goto": "a_under_the_streetlight",
            "clue": true
          },
          {
            "label": "\"I'm really going to miss you. Good luck up there.\"",
            "goto": "b_too_small_for_everything",
            "clue": false
          },
          {
            "label": "\"Try not to misspell everyone's names up north!\"",
            "goto": "b_too_small_for_everything",
            "clue": false
          }
        ]
      }
    },
    "a_under_the_streetlight": {
      "art": "en/the-goodbye/n4-streetlight.jpg",
      "segments": [
        "Leo stopped walking. Under the streetlight, Mona saw that his eyes were wet. \"You think I did that for you,\" he said. \"Mona — you did it. I just made the coffee.\" He laughed, wiped his face, and didn't pretend he wasn't crying. \"The scared girl who came in that first morning, and the woman standing here now — I got to watch that happen. Do you know how rare that is? To watch someone become themselves?\" It was the most anyone had ever said to her. The whole year rose up in her throat."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "lets the tears come: \"Then let me say it properly, before you go — thank you. For the first coffee, and every one after. You were the start of all of it.\"",
            "goto": "a_not_a_real_goodbye",
            "clue": true
          },
          {
            "label": "laughs and hugs him quick: \"Okay, okay, before we flood the street —\"",
            "goto": "a_not_a_real_goodbye",
            "clue": false
          }
        ]
      }
    },
    "a_not_a_real_goodbye": {
      "art": "en/the-goodbye/n5-taxi.jpg",
      "segments": [
        "They stood on the corner a long time, two friends and a whole city of memory between them. \"This isn't a real goodbye,\" Leo said finally. \"My new place is a train ride away, and you, of all people, are not scared of trains any more.\" Mona laughed — a wet, real laugh. \"I'll be your first customer. I'll order loudly and clearly, and you'll spell my name right.\" \"Mona,\" he said, like a promise. \"I always knew it was Mona.\""
      ],
      "choice": {
        "prompt": "As his taxi pulls up, Mona…",
        "options": [
          {
            "label": "presses a tiny card into his hand: \"Opening day. I'm already booked. First coffee's on me this time.\"",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "hugs him hard: \"Go be brilliant.\"",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_too_small_for_everything": {
      "art": "en/the-goodbye/n4-streetlight.jpg",
      "segments": [
        "\"Good luck up there,\" Mona said again, and the words felt too small for everything behind them. Leo nodded, and something flickered across his face — a tiny disappointment, quickly hidden. He'd hoped, maybe, for more. The real things — what he'd meant to her, how frightened she still was under the new confidence, how much she didn't want him to go — stayed folded up tight inside her, safe and useless. The taxi was coming. The window was closing."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "catches herself: \"No — wait. That's not enough. Leo, you were my first friend here. I need you to actually know what that meant.\"",
            "goto": "b_seconds_left",
            "clue": true
          },
          {
            "label": "keeps it bright and breezy right to the end.",
            "goto": "b_seconds_left",
            "clue": false
          }
        ]
      }
    },
    "b_seconds_left": {
      "art": "en/the-goodbye/n5-taxi.jpg",
      "segments": [
        "The taxi pulled up. The once-only moment was right there, shrinking. Everything Mona hadn't said hummed in the cold air between them — the gratitude, the fear, the love of a friendship that has no easy word. She had seconds left to decide whether to let it out, or let it go."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "grabs his sleeve as he reaches the car: \"Leo — thank you. For seeing me before I could see myself. I mean it.\"",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "waves, smiles, \"Drive safe!\" — and the taxi door closes on all of it.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-goodbye/n6-northcafe.jpg",
      "segments": [
        "Six weeks later, Mona stepped off a train in a new northern city, walked into a bright little café that smelled of coffee and fresh bread, and found Leo behind the counter in a brand-new apron, grinning like the sun. \"MAYA,\" said the cup he slid across — spelled perfectly, in big proud letters. On the saucer sat the tiny card she'd given him, framed now, propped by the till. \"My first ever booking. Had to keep it.\"",
        "They talked for hours, the way they always had. Leaving, Mona understood at last, isn't always losing. A goodbye said properly is just a friendship changing shape — stretched over distance, not broken. She'd learned to cross a city; now she knew she could keep the people she loved across a country, too."
      ],
      "ending": {
        "id": "train-ride-away",
        "title": "A Train Ride Away",
        "quality": "good",
        "wrap": "She said the true, hard, beautiful thing instead of hiding behind a joke — and turned a goodbye into a standing invitation. Some farewells are really beginnings."
      }
    },
    "end_ok": {
      "art": "en/the-goodbye/n7-watching.jpg",
      "segments": [
        "\"Go be brilliant,\" Mona said, and hugged him so hard he laughed. It was a good goodbye — warm, real enough, said with a full heart if not quite every word. She watched the taxi lights disappear and walked home through the quiet city that had, somehow, become hers.",
        "She'd text him. She'd visit, probably. They'd stay friends in the easy modern way of people who like each other across a distance. Not everything she might have said — but she'd shown up, hugged him, meant it. Climbing her stairs to the little gold flat, she felt the ache of a chapter closing, and the quiet pride of a year survived and a friend well loved."
      ],
      "ending": {
        "id": "full-heart",
        "title": "A Full Heart",
        "quality": "ok",
        "wrap": "A warm, honest farewell — not every last word, but a full heart. The friendship will travel just fine."
      }
    },
    "end_lesser": {
      "art": "en/the-goodbye/n8-message.jpg",
      "segments": [
        "\"Drive safe!\" Mona called, bright as anything, and the taxi door closed on every single thing she'd meant to say. She walked home light, then — around her own front step — suddenly heavy. In the quiet flat the words finally came, all of them, too late, to an empty room.",
        "But she wasn't too proud to fix it, not any more. She sat down and wrote it all in a long, honest message, and sent it into the night. Leo wrote back within the hour: \"I knew. I always knew. But I'm so glad you said it. Come north soon — and say it again over coffee.\" Mona cried, and laughed, and booked a train for the following month."
      ],
      "ending": {
        "id": "message-she-sent-anyway",
        "title": "The Message She Sent Anyway",
        "quality": "lesser",
        "wrap": "She let the moment pass behind a bright smile — then refused to leave it there. Even a fumbled goodbye can be mended, if you're brave enough to send the message."
      }
    }
  }
}
$nodes$::jsonb, 112, false, false, NULL
FROM public.levels l WHERE l.id = 'B2'
ON CONFLICT (course, slug) DO NOTHING;

