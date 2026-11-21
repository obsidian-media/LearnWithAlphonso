-- Mona's New City, French and Spanish editions: 24 branching stories (12 fr + 12 es, A1 to B2), sort_order 101-112 per course.
-- Additive data seed, no schema change. Same node ids, gotos, endings and ART KEYS as the English batch (20261126130000):
-- the scene art keys stay en/<slug>/<stem>.jpg because the apps resolve a key to a public story-art URL independent of
-- the story's course, so FR and ES read the existing English images (no copies). Slugs repeat the English ones:
-- stories are UNIQUE (course, slug), so touchdown in fr/es is a different row from touchdown in en.
-- Owner and Design approved the text and the register (dog: Biscuit FR, Galleta ES); seeded exactly as written.
-- Seeded HIDDEN (published = false), needs_review = false. To publish, once narration is recorded
-- (scripts/story-audio.ts generate --course fr|es --slugs ... --include-unpublished):
--   UPDATE public.stories SET published = true, published_at = now() WHERE course IN ('fr','es') AND slug IN (...the 12 slugs...);
-- Joined to public.levels so a database without level rows seeds nothing. Idempotent: ON CONFLICT (course, slug) DO NOTHING.
--
-- Rollback:
--   DELETE FROM public.stories WHERE course IN ('fr', 'es') AND slug IN ('touchdown', 'the-first-coffee', 'keys-to-the-new-place', 'market-day', 'the-wrong-train', 'dinner-with-new-friends', 'the-interview', 'under-the-weather', 'the-favour', 'crossed-wires', 'the-negotiation', 'the-goodbye');

-- fr 101: L'arrivée (A1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'touchdown', 'L''arrivée', '[]'::jsonb, true, $nodes$
{
  "start": "land",
  "map": {
    "land": {
      "art": "en/touchdown/n1-arrival.jpg",
      "segments": [
        "L'avion est descendu lentement à travers les nuages, et Mona a regardé par le petit hublot.",
        "En bas, toute une nouvelle ville grandissait, de plus en plus : des rivières grises, de longues routes, mille petites lumières qui commençaient à briller.",
        "Ses mains serraient le siège. Pendant un an entier, elle avait rêvé de ce jour. Maintenant, c'était réel, et cela semblait très grand.",
        "Les roues ont touché le sol avec un petit choc. « J'y suis », a-t-elle dit tout bas, à personne. « J'y suis vraiment. » Elle a pris son sac sous le siège, et elle a souri."
      ],
      "next": "walk"
    },
    "walk": {
      "art": "en/touchdown/n2-hall.jpg",
      "segments": [
        "À l'intérieur, l'aéroport était immense, lumineux et plein de bruit. Des voix dans beaucoup de langues passaient près de ses oreilles.",
        "Des panneaux pendaient du plafond, avec des flèches partout. Mona lisait lentement : contrôle des passeports, par ici.",
        "Autour d'elle, les gens marchaient vite, en tirant de grandes valises. Un enfant pleurait. Un homme courait vers sa porte d'embarquement.",
        "Elle se sentait petite, et loin de chez elle — mais elle se sentait aussi éveillée, et vivante. Au bout d'un long couloir, une file de voyageurs fatigués attendait. Elle s'est mise au bout, et elle a respiré lentement, profondément."
      ],
      "next": "passport"
    },
    "passport": {
      "art": "en/touchdown/n3-passport.jpg",
      "segments": [
        "La file avançait lentement. Mona regardait l'agent au comptoir. Il avait l'air fatigué, et il ne souriait à personne.",
        "Enfin, c'était son tour. « Suivant, s'il vous plaît », a-t-il dit, et il lui a fait signe d'avancer.",
        "Il a ouvert son passeport, a regardé la photo, puis son visage. « Pourquoi êtes-vous ici ? » a-t-il demandé."
      ],
      "choice": {
        "prompt": "Que dit Mona ?",
        "options": [
          {
            "label": "« Je suis ici pour un nouveau travail. Je suis très heureuse d'être ici. »",
            "goto": "a_stamp",
            "clue": true
          },
          {
            "label": "« Le travail. Un travail. »",
            "goto": "b_stamp",
            "clue": false
          },
          {
            "label": "« Les vacances ! … Non — pardon — un travail ! »",
            "goto": "b_stamp",
            "clue": false
          }
        ]
      }
    },
    "a_stamp": {
      "art": "en/touchdown/n3-passport.jpg",
      "segments": [
        "L'agent a eu un petit sourire surpris. « Un nouveau travail », a-t-il dit. « C'est courageux. » Il a tamponné la page — un bruit fort et joyeux. « Bonne chance dans notre ville, Mona. »",
        "« Merci », a-t-elle dit, et elle le pensait. Un mot gentil, dans sa toute première minute dans le pays. Elle a continué avec une sensation chaude dans la poitrine. Peut-être, a-t-elle pensé, que tout ira bien."
      ],
      "next": "a_bag"
    },
    "b_stamp": {
      "art": "en/touchdown/n3-passport.jpg",
      "segments": [
        "L'agent n'a pas souri. Il l'a regardée un long moment, en silence. Le visage de Mona est devenu chaud. Avait-elle dit quelque chose de mal ? Elle voulait expliquer, mais aucun bon mot ne venait.",
        "Puis — tampon. « D'accord. Suivant », a-t-il dit, en regardant déjà derrière elle. Elle a continué vite. Pas le meilleur début, a-t-elle pensé. Mais le tampon était dans son passeport maintenant. Elle était vraiment là."
      ],
      "next": "b_bag"
    },
    "a_bag": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "Elle a trouvé la zone des bagages, où des valises brillantes tournaient sur un long tapis roulant. Mona attendait son sac bleu. Une minute. Deux minutes. Cinq. Il ne venait pas.",
        "À côté d'elle, une dame plus âgée regardait le tapis et a poussé un petit soupir fatigué — son sac à elle manquait aussi. La journée avait été très longue pour tout le monde dans cette salle."
      ],
      "choice": {
        "prompt": "Pendant qu'elles attendent, que fait Mona ?",
        "options": [
          {
            "label": "Elle sourit à la dame et dit : « Longue journée, n'est-ce pas ? »",
            "goto": "a_bag2",
            "clue": true
          },
          {
            "label": "Elle attend en silence et regarde le tapis, toute seule.",
            "goto": "a_bag2",
            "clue": false
          }
        ]
      }
    },
    "a_bag2": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "Enfin — là ! Son sac bleu a tourné au coin, un peu perdu parmi tous les noirs. Mona l'a tiré du tapis et a ri tout fort. « Enfin ! » La dame plus âgée a ri avec elle.",
        "Le sac à la main et le cœur un peu plus léger, Mona a roulé vers les grandes portes marquées ARRIVÉES. Derrière ces portes, il y avait sa nouvelle ville — et, elle l'espérait, quelqu'un qui l'attendait, juste pour elle."
      ],
      "next": "a_meet"
    },
    "b_bag": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "Elle a trouvé la zone des bagages, mais son sac bleu n'était nulle part. Le long tapis tournait, tournait, presque vide. Des gens passaient devant elle avec d'énormes valises et des roues bruyantes.",
        "Mona a reculé et a serré les bras contre son corps. Elle se sentait toute petite, et très loin de chez elle. Elle voulait juste que cette longue, longue journée se termine. « Viens, s'il te plaît », a-t-elle murmuré au tapis vide."
      ],
      "choice": {
        "prompt": "Pendant qu'elle attend, que fait Mona ?",
        "options": [
          {
            "label": "Elle respire lentement et attend calmement.",
            "goto": "b_bag2",
            "clue": true
          },
          {
            "label": "Elle s'inquiète, et regarde son téléphone encore et encore.",
            "goto": "b_bag2",
            "clue": false
          }
        ]
      }
    },
    "b_bag2": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "Son sac est arrivé presque en dernier. Elle l'a attrapé vite et n'a pas regardé en arrière. Elle a roulé rapidement vers les grandes portes marquées ARRIVÉES, les yeux lourds et les pieds douloureux.",
        "Sortir, juste sortir, s'est-elle dit. De l'air frais, et puis tout ira mieux. Les portes se sont ouvertes devant elle."
      ],
      "next": "b_meet"
    },
    "a_meet": {
      "art": "en/touchdown/n5-arrivals.jpg",
      "segments": [
        "Devant les portes, un mur de visages attendait — des mamans, des papas, des amis, des chauffeurs, tous cherchant quelqu'un d'autre.",
        "Puis elle l'a vu — un homme tenait une petite pancarte. Il y avait un seul mot : MONA. Il avait un visage rond et gentil, et des clés de voiture à la main. Il la regardait, elle."
      ],
      "choice": {
        "prompt": "Comment Mona le salue-t-elle ?",
        "options": [
          {
            "label": "« Bonjour ! Je suis Mona. Merci beaucoup d'avoir attendu. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "« Mona. Oui. C'est moi. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_meet": {
      "art": "en/touchdown/n5-arrivals.jpg",
      "segments": [
        "L'air frais du soir est entré d'un coup et l'a un peu réveillée. Mona a regardé la mer de gens qui attendaient. Quelque part ici, il y avait son nom.",
        "Un homme se tenait là avec une pancarte — MONA — mais elle était si fatiguée que ses yeux sont passés juste à côté. Une fois. Puis deux fois. Elle s'est arrêtée, ne sachant pas quoi faire."
      ],
      "choice": {
        "prompt": "Que fait Mona ?",
        "options": [
          {
            "label": "Elle fait demi-tour, sourit et dit : « Pardon ! Je suis Mona. Bonjour. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "Elle renonce à chercher et monte dans le premier taxi qu'elle voit.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/touchdown/n6-welcome.jpg",
      "segments": [
        "« Bonjour ! Je suis Mona », a-t-elle dit, en tendant la main. « Merci beaucoup d'avoir attendu. » Le visage de l'homme s'est ouvert en un grand sourire. « Bienvenue, Mona ! Je suis Marco, votre chauffeur. Votre nouvelle ville vous attendait. »",
        "Il a soulevé son lourd sac comme si de rien n'était et l'a conduite vers une petite voiture au bord du trottoir. Pendant qu'ils roulaient, les lumières de la ville s'allumaient une à une — dorées et chaudes contre le ciel du soir.",
        "Mona a regardé par la fenêtre. Elle était fatiguée, et loin de chez elle — et, déjà, un tout petit peu heureuse."
      ],
      "ending": {
        "id": "warm-welcome",
        "title": "Un accueil chaleureux",
        "quality": "good",
        "wrap": "Mona est arrivée le cœur ouvert, et la ville lui a tendu la main. Un début chaleureux pour une nouvelle vie."
      }
    },
    "end_ok": {
      "art": "en/touchdown/n7-safe.jpg",
      "segments": [
        "« Mona. Oui. C'est moi », a-t-elle dit. L'homme a hoché la tête — gentil, mais silencieux — et a pris son sac. « Long voyage ? » a-t-il demandé pendant qu'ils marchaient vers la voiture. « Très », a dit Mona. C'était tout ce qu'il lui restait à dire.",
        "La voiture s'est engagée dans les rues animées du soir, entre les feux rouges, les feux blancs et les gens partout. Mona a posé la tête contre la vitre fraîche et a fermé les yeux un instant. Elle était fatiguée — mais elle était en sécurité."
      ],
      "ending": {
        "id": "safe-and-sound",
        "title": "Saine et sauve",
        "quality": "ok",
        "wrap": "Demain, s'est-elle dit, je dirai bonjour comme il faut. Demain je serai courageuse. Pas un début parfait — mais elle est arrivée, entière."
      }
    },
    "end_lesser": {
      "art": "en/touchdown/n8-detour.jpg",
      "segments": [
        "Mona a renoncé à chercher — elle était tout simplement trop fatiguée. Elle a vu une file de taxis et est montée dans le tout premier. « Où allez-vous ? » a demandé le chauffeur. Elle a lu sa nouvelle adresse. Derrière elle, l'homme à la pancarte MONA l'a regardée partir, perplexe.",
        "Le taxi a pris le chemin le plus long — par des rues qu'elle ne connaissait pas, passant deux fois devant le même grand immeuble, pendant que le compteur montait et montait. Quand elle est enfin arrivée, bien plus pauvre, Mona est descendue et a dû rire d'elle-même.",
        "« Eh bien », a-t-elle dit à la rue silencieuse. « J'y suis. Par le chemin le plus long. »"
      ],
      "ending": {
        "id": "long-way-round",
        "title": "Le chemin le plus long",
        "quality": "lesser",
        "wrap": "Une première nuit cahoteuse et drôle — et une histoire qu'elle racontera pendant des années. La prochaine fois, elle cherchera son nom d'abord."
      }
    }
  }
}
$nodes$::jsonb, 101, false, false, NULL
FROM public.levels l WHERE l.id = 'A1'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 102: Le premier café (A1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'the-first-coffee', 'Le premier café', '[]'::jsonb, true, $nodes$
{
  "start": "flat",
  "map": {
    "flat": {
      "art": "en/the-first-coffee/n1-flat.jpg",
      "segments": [
        "Le premier matin de Mona dans le nouvel appartement était très silencieux. Trop silencieux. Les pièces étaient vides, et elle n'avait pas de café, pas de lait, rien du tout.",
        "Mais elle était réveillée, et elle était curieuse. « Aujourd'hui », a-t-elle dit à la cuisine vide, « je vais sortir, et je vais parler. » Elle a mis son gilet moutarde, a pris une grande inspiration, et a ouvert la porte sur sa nouvelle rue."
      ],
      "next": "cafe"
    },
    "cafe": {
      "art": "en/the-first-coffee/n2-cafe.jpg",
      "segments": [
        "La rue était pleine d'une douce lumière du matin. Des gens promenaient leurs chiens. Un bus a soufflé et s'est arrêté. Au coin, Mona a trouvé un petit café aux fenêtres jaunes et chaudes.",
        "À l'intérieur, ça sentait le café et le pain frais. Derrière le comptoir, un jeune homme avec un tablier vert et des cheveux bouclés a levé les yeux. Il avait un grand sourire facile. « Bonjour ! » a-t-il dit. « Qu'est-ce que je vous sers ? »"
      ],
      "next": "order"
    },
    "order": {
      "art": "en/the-first-coffee/n3-counter.jpg",
      "segments": [
        "Le cœur de Mona battait vite. C'était sa première vraie conversation dans la nouvelle ville. Elle a regardé le menu au tableau — tant de mots. Elle pouvait le faire. Le barista attendait, aimable et patient."
      ],
      "choice": {
        "prompt": "Comment Mona commande-t-elle ?",
        "options": [
          {
            "label": "« Un petit café, s'il vous plaît. …Et — bonjour ! »",
            "goto": "a_talk",
            "clue": true
          },
          {
            "label": "Elle montre le tableau du doigt : « Celui-ci. »",
            "goto": "b_talk",
            "clue": false
          },
          {
            "label": "« Café petit s'il vous plaît merci pardon. »",
            "goto": "b_talk",
            "clue": false
          }
        ]
      }
    },
    "a_talk": {
      "art": "en/the-first-coffee/n4-smalltalk.jpg",
      "segments": [
        "« Tout de suite », a-t-il dit. « Moi, c'est Leo, au fait. » Il a écrit quelque chose sur un gobelet. « Vous êtes nouvelle ici, non ? Je connais tous les habitués. » Mona a souri. Il était gentil. Peut-être qu'elle pouvait se faire un ami dès le premier jour."
      ],
      "choice": {
        "prompt": "Leo demande : « Alors, qu'est-ce qui vous amène ici ? »",
        "options": [
          {
            "label": "« Je viens d'arriver pour un nouveau travail. Tout est nouveau — même le café ! »",
            "goto": "a_cup",
            "clue": true
          },
          {
            "label": "« Le travail. »",
            "goto": "a_cup",
            "clue": false
          }
        ]
      }
    },
    "a_cup": {
      "art": "en/the-first-coffee/n5-cup.jpg",
      "segments": [
        "Leo a ri. « Un geste courageux. Bienvenue. » Il a fait glisser un gobelet chaud sur le comptoir. Sur le côté, il avait écrit un nom — mais pas tout à fait le sien. C'était écrit MOANA. Il a souri. « Assez proche ? »"
      ],
      "choice": {
        "prompt": "Que dit Mona au sujet du nom ?",
        "options": [
          {
            "label": "« Ha ! Mona, en fait — mais j'aime bien Moana aussi. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "« C'est Mona. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_talk": {
      "art": "en/the-first-coffee/n4-smalltalk.jpg",
      "segments": [
        "Il a fait le café sans beaucoup de mots. La machine sifflait et fumait. Mona est restée là en silence, sans trop savoir quoi dire, et le silence semblait long. Il a écrit quelque chose sur le gobelet et a levé les yeux avec un sourire gentil mais incertain."
      ],
      "choice": {
        "prompt": "Il demande : « Tout va bien ? »",
        "options": [
          {
            "label": "« Oui — pardon. Mon français est un peu timide aujourd'hui ! »",
            "goto": "b_cup",
            "clue": true
          },
          {
            "label": "Elle hoche juste la tête et regarde son téléphone.",
            "goto": "b_cup",
            "clue": false
          }
        ]
      }
    },
    "b_cup": {
      "art": "en/the-first-coffee/n5-cup.jpg",
      "segments": [
        "Il a hoché la tête et lui a tendu le gobelet. Sur le côté, il avait deviné un nom — NONA. Il n'a pas demandé ; il se tournait déjà vers le client suivant."
      ],
      "choice": {
        "prompt": "Que fait Mona ?",
        "options": [
          {
            "label": "« Oh — c'est Mona ! Merci quand même. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "Elle prend le gobelet au mauvais nom et se retourne en silence.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-first-coffee/n6-friends.jpg",
      "segments": [
        "« Mona », a répété Leo, et il a corrigé le gobelet avec un petit sourire. « Je m'en souviendrai maintenant. Le premier café est pour moi — bienvenue dans le quartier. » Ils ont parlé une minute de plus, de la ville, de la meilleure boulangerie, du temps pluvieux.",
        "Quand Mona est partie, Leo a lancé : « À demain, Mona ! » — et elle savait qu'elle reviendrait. Elle est sortie dans le matin avec un gobelet chaud dans les mains et un petit sentiment lumineux dans la poitrine."
      ],
      "ending": {
        "id": "a-friend-on-day-one",
        "title": "Un ami dès le premier jour",
        "quality": "good",
        "wrap": "Un café, un mot gentil, un nouvel ami. La ville a semblé un peu plus petite — dans le bon sens."
      }
    },
    "end_ok": {
      "art": "en/the-first-coffee/n7-window.jpg",
      "segments": [
        "Mona a emporté son café à une petite table près de la fenêtre et s'est assise. C'était un bon café — chaud et fort. Dehors, sa nouvelle ville vivait son matin animé.",
        "Elle répétait les mots dans sa tête : la prochaine fois, je dirai plus. La prochaine fois, je demanderai son nom. C'était un début tranquille — mais c'était un début, et le café était chaud."
      ],
      "ending": {
        "id": "a-quiet-cup",
        "title": "Un café tranquille",
        "quality": "ok",
        "wrap": "Toutes les conversations ne décollent pas du premier coup. Mais elle est sortie, elle a parlé, et elle sera plus courageuse demain."
      }
    },
    "end_lesser": {
      "art": "en/the-first-coffee/n8-street.jpg",
      "segments": [
        "Mona est sortie avec un gobelet qui disait NONA, en se sentant un peu bête. À mi-chemin dans la rue, un homme l'a arrêtée. « Nona ! Ça fait longtemps ! » Il l'a serrée dans ses bras comme une vieille amie.",
        "« Je ne suis… pas Nona », a dit Mona, en riant, confuse. « Oh ! Pardon — le gobelet… » Ils ont ri tous les deux. Un premier matin drôle et bizarre. « Bienvenue dans la ville », a-t-il dit, et il a continué son chemin."
      ],
      "ending": {
        "id": "mistaken-nona",
        "title": "Prise pour Nona",
        "quality": "lesser",
        "wrap": "Un mauvais nom et l'étreinte d'un inconnu — un début idiot, mais une histoire. Demain, elle dira son nom haut et clair."
      }
    }
  }
}
$nodes$::jsonb, 102, false, false, NULL
FROM public.levels l WHERE l.id = 'A1'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 103: Les clés du nouveau logement (A1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'keys-to-the-new-place', 'Les clés du nouveau logement', '[]'::jsonb, true, $nodes$
{
  "start": "building",
  "map": {
    "building": {
      "art": "en/keys-to-the-new-place/n1-building.jpg",
      "segments": [
        "L'immeuble était vieux et haut, avec des briques rouges et de hautes fenêtres. Numéro 14. C'était ici — son nouveau chez-elle. Mona se tenait sur le pas de la porte avec son unique valise et un carton d'assiettes.",
        "Elle avait l'estomac noué. Elle ne connaissait ni la ville, ni la rue, ni l'homme qui avait les clés. « Sois courageuse », s'est-elle dit, et elle a appuyé sur la sonnette."
      ],
      "next": "alder"
    },
    "alder": {
      "art": "en/keys-to-the-new-place/n2-alder.jpg",
      "segments": [
        "La porte s'est ouverte. Un homme plus âgé se tenait là, avec des cheveux gris, une casquette plate et de petites lunettes sur une chaînette. « Vous devez être Mona », a-t-il dit. Sa voix était lente et gentille. « Je suis Monsieur Alder. Je m'occupe du numéro 14. »",
        "Il a tendu la main. Derrière lui, un couloir chaleureux attendait."
      ],
      "choice": {
        "prompt": "Comment Mona le salue-t-elle ?",
        "options": [
          {
            "label": "« Bonjour, Monsieur Alder ! Merci beaucoup. Je suis très contente d'être ici. »",
            "goto": "a_tour",
            "clue": true
          },
          {
            "label": "« Bonjour. Oui. Mona. »",
            "goto": "b_tour",
            "clue": false
          },
          {
            "label": "« Bonjour, pardon — c'est bien la bonne maison ? »",
            "goto": "b_tour",
            "clue": false
          }
        ]
      }
    },
    "a_tour": {
      "art": "en/keys-to-the-new-place/n3-stairs.jpg",
      "segments": [
        "« Entrez, entrez », a dit Monsieur Alder, et il l'a conduite dans l'escalier, lentement et sûrement. « Appartement trois. Ensoleillé le matin. Le radiateur fait un bruit bizarre, mais c'est une bonne vieille maison. » Il a ouvert la porte. L'appartement était petit et vide — mais la lumière entrait, dorée, par la fenêtre, et il était à elle."
      ],
      "next": "a_window"
    },
    "a_window": {
      "art": "en/keys-to-the-new-place/n4-window.jpg",
      "segments": [
        "Monsieur Alder lui a montré les clés, le chauffage, la fenêtre. Puis il a froncé les sourcils. « Ah. Cette fenêtre », a-t-il dit. « Elle coince. Elle ne ferme pas complètement. Je dois toujours la réparer. » Un petit courant d'air froid passait par l'ouverture. Mona le sentirait la nuit."
      ],
      "choice": {
        "prompt": "Que dit Mona au sujet de la fenêtre ?",
        "options": [
          {
            "label": "« Pas de problème ! Pourriez-vous la réparer cette semaine ? Ça ne me dérange pas d'attendre. »",
            "goto": "a_settle",
            "clue": true
          },
          {
            "label": "« Oh. D'accord. Ce n'est rien. »",
            "goto": "a_settle",
            "clue": false
          }
        ]
      }
    },
    "a_settle": {
      "art": "en/keys-to-the-new-place/n5-notebook.jpg",
      "segments": [
        "« Cette semaine — c'est promis », a dit Monsieur Alder, et il l'a noté dans un petit carnet. « Je n'oublie pas. Enfin — pas souvent. » Il a souri. « Installez-vous. Frappez à ma porte si vous avez besoin de quelque chose. Je suis toujours là. »"
      ],
      "choice": {
        "prompt": "Au moment où il s'en va, que fait Mona ?",
        "options": [
          {
            "label": "« Merci. Voudriez-vous prendre un thé un de ces jours ? Je ne connais encore personne ici. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "« Merci. Au revoir. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_tour": {
      "art": "en/keys-to-the-new-place/n3-stairs.jpg",
      "segments": [
        "« Bien. Par ici », a dit Monsieur Alder, et il l'a conduite en haut sans beaucoup de mots. Il a ouvert la porte de l'appartement trois — petit, vide, lumière dorée à la fenêtre. « Voilà. » Mona a hoché la tête. Elle voulait dire quelque chose de chaleureux, mais les mots restaient coincés."
      ],
      "next": "b_window"
    },
    "b_window": {
      "art": "en/keys-to-the-new-place/n4-window.jpg",
      "segments": [
        "Il lui a montré les clés et le chauffage, puis a désigné la fenêtre. « Elle coince un peu. Elle ne ferme pas complètement. » Un courant d'air froid passait par l'ouverture. Il a attendu, comme si elle allait dire quelque chose."
      ],
      "choice": {
        "prompt": "Que fait Mona au sujet de la fenêtre ?",
        "options": [
          {
            "label": "« Oh — pourriez-vous la réparer, s'il vous plaît ? Il fait un peu froid. »",
            "goto": "b_keys",
            "clue": true
          },
          {
            "label": "Elle hoche juste la tête et ne dit rien.",
            "goto": "b_keys",
            "clue": false
          }
        ]
      }
    },
    "b_keys": {
      "art": "en/keys-to-the-new-place/n5-notebook.jpg",
      "segments": [
        "« Hm », a dit Monsieur Alder, et il n'a rien noté. « Je verrai ce que je peux faire. » Il lui a donné deux grosses vieilles clés sur un anneau. « Porte d'entrée et appartement. Ne les perdez pas — je n'ai qu'un seul double. » Puis il est redescendu, et l'immeuble est devenu silencieux."
      ],
      "choice": {
        "prompt": "Seule avec ses nouvelles clés, Mona…",
        "options": [
          {
            "label": "descend en courant pour dire : « Monsieur Alder — merci. Vraiment. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "file dehors pour un café, les clés qui se balancent à la main.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/keys-to-the-new-place/n6-tea.jpg",
      "segments": [
        "Le visage de Monsieur Alder s'est illuminé. « Du thé ? Eh bien, je ne dis jamais non au thé. » Il a tapoté sa casquette. « Jeudi, alors. J'apporterai des biscuits. » Ce soir-là, la fenêtre était déjà réparée — et un petit mot était posé sur le rebord : « Bienvenue chez vous. — A. »",
        "Mona s'est tenue dans sa petite pièce dorée et a souri. Elle avait un chez-elle, un voisin gentil, et un thé à attendre avec impatience. La ville ne semblait plus si grande."
      ],
      "ending": {
        "id": "tea-on-thursday",
        "title": "Thé le jeudi",
        "quality": "good",
        "wrap": "Mona n'a pas seulement eu un appartement — elle a eu un voisin."
      }
    },
    "end_ok": {
      "art": "en/keys-to-the-new-place/n7-plates.jpg",
      "segments": [
        "« Au revoir, Monsieur Alder. Merci », a dit Mona, et il a hoché la tête et est descendu. Elle a fermé la porte et s'est tenue seule dans l'appartement silencieux. La lumière dorée était belle. Le petit courant d'air froid, non.",
        "Elle a déballé ses assiettes, une par une, et s'est dit : j'apprendrai bien son nom, j'en dirai plus la prochaine fois. C'était un début petit, poli, correct — dans un logement qui était vraiment, vraiment le sien."
      ],
      "ending": {
        "id": "a-home-of-her-own",
        "title": "Un logement à elle",
        "quality": "ok",
        "wrap": "Un logement à elle et un propriétaire assez gentil — elle réchauffera le reste avec le temps."
      }
    },
    "end_lesser": {
      "art": "en/keys-to-the-new-place/n8-lockedout.jpg",
      "segments": [
        "Mona s'est dépêchée de sortir pour un café, les grosses clés se balançant à la main — et la lourde porte d'entrée s'est refermée derrière elle. Clac. Elle a poussé. Fermée. Mauvaise clé. L'autre clé — mauvaise aussi.",
        "Elle était dehors, devant son nouveau chez-elle, le premier jour, enfermée dehors, sans numéro pour joindre Monsieur Alder. Elle s'est assise sur la marche et a ri au ciel. « Premier jour », a-t-elle dit. « Quel début en fanfare. » Puis une voix lente et gentille : « Déjà perdue ? » — Monsieur Alder, avec le double et un petit sourire."
      ],
      "ending": {
        "id": "locked-out",
        "title": "Enfermée dehors",
        "quality": "lesser",
        "wrap": "Sauvée par le voisin même qu'elle avait dépassé en courant. Demain, elle ralentira."
      }
    }
  }
}
$nodes$::jsonb, 103, false, false, NULL
FROM public.levels l WHERE l.id = 'A1'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 104: Jour de marché (A2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'market-day', 'Jour de marché', '[]'::jsonb, true, $nodes$
{
  "start": "the_empty_kitchen",
  "map": {
    "the_empty_kitchen": {
      "art": "en/market-day/n1-kitchen.jpg",
      "segments": [
        "À son troisième jour, la cuisine de Mona était encore presque vide — une tasse, une assiette, et un demi-citron très triste dans le frigo. Elle a fait une liste sur un bout de papier : pain, œufs, fruits, légumes, quelque chose de bon.",
        "« Le marché », lui avait dit Leo. « Samedi matin. Vas-y tôt, et vas-y le ventre vide. » Alors elle a enfilé son manteau et elle est partie."
      ],
      "next": "the_market"
    },
    "the_market": {
      "art": "en/market-day/n2-market.jpg",
      "segments": [
        "Le marché était plein de vie. De longues rangées d'étals s'étiraient dans la rue sous des bâches rayées et vives. Il y avait des montagnes d'oranges, des tas de haricots verts, des fromages aussi gros que des roues, et des fleurs de toutes les couleurs.",
        "Les marchands criaient leurs prix. Les clients se bousculaient, riaient et remplissaient leurs sacs. Mona se tenait au bord, sa petite liste à la main, et souriait. Par où commencer ?"
      ],
      "next": "the_fruit_stall"
    },
    "the_fruit_stall": {
      "art": "en/market-day/n3-stall.jpg",
      "segments": [
        "Elle s'est arrêtée à un étal de fruits, où une femme ronde aux joues rouges montait des pommes en une pyramide parfaite. « Bonjour, ma belle ! » a dit la femme. « Qu'est-ce que je vous sers ? »",
        "Mona a regardé les beaux fruits. Sa liste disait juste « fruits » — mais lesquels ? Combien ? Elle a pris une inspiration."
      ],
      "choice": {
        "prompt": "Comment Mona demande-t-elle ?",
        "options": [
          {
            "label": "« Bonjour ! Je pourrais avoir six pommes, s'il vous plaît ? Et est-ce que les poires sont sucrées ? »",
            "goto": "a_a_taste",
            "clue": true
          },
          {
            "label": "« Des pommes. Celles-là. »",
            "goto": "b_just_apples",
            "clue": false
          },
          {
            "label": "« Euh… des fruits ? Je ne sais pas. Pardon. »",
            "goto": "b_just_apples",
            "clue": false
          }
        ]
      }
    },
    "a_a_taste": {
      "art": "en/market-day/n4-taste.jpg",
      "segments": [
        "« Sucrées ? Mes poires sont les plus sucrées de la ville », a ri la femme. « Goûtez. » Elle a coupé une tranche et la lui a tendue. C'était tendre et doux comme du miel. « Oh — c'est délicieux », a dit Mona. « Je vais en prendre aussi. » La femme a pesé les fruits et a glissé une poire en plus. « Pour un nouveau visage », a-t-elle fait un clin d'œil. « Vous êtes nouvelle, non ? »"
      ],
      "choice": {
        "prompt": "Elle demande d'où vient Mona.",
        "options": [
          {
            "label": "« Oui ! J'ai emménagé la semaine dernière. Tout est nouveau — même les pommes ont l'air plus heureuses ici. »",
            "goto": "a_paying",
            "clue": true
          },
          {
            "label": "« Oui. Nouvelle. »",
            "goto": "a_paying",
            "clue": false
          }
        ]
      }
    },
    "a_paying": {
      "art": "en/market-day/n5-coins.jpg",
      "segments": [
        "La femme a tout raconté à Mona sur le marché — le meilleur étal de fromage, l'homme au pain chaud, la fleuriste qui fait des réductions le samedi. « Ça fait douze, ma belle », a-t-elle dit enfin. Mona a ouvert son porte-monnaie. Elle avait des billets, mais les pièces lui étaient encore étranges — des grosses, des petites, dorées et argentées."
      ],
      "choice": {
        "prompt": "Que fait Mona avec l'argent ?",
        "options": [
          {
            "label": "« J'apprends encore les pièces — c'est bien ça ? » Elle les tend avec un sourire.",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "Elle donne simplement un gros billet et prend la monnaie.",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_just_apples": {
      "art": "en/market-day/n4-taste.jpg",
      "segments": [
        "La femme a mis six pommes dans un sac sans un mot de plus. « Et avec ça ? » Mona a regardé sa liste — poires, légumes, pain — mais les mots pesaient lourd dans sa bouche. Elle a montré les poires du doigt. « Combien ? » a demandé la femme. Mona ne savait pas trop quoi dire."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Quatre, s'il vous plaît. Et — elles sont sucrées ? »",
            "goto": "b_the_strange_coins",
            "clue": true
          },
          {
            "label": "« Non. Juste les pommes. »",
            "goto": "b_the_strange_coins",
            "clue": false
          }
        ]
      }
    },
    "b_the_strange_coins": {
      "art": "en/market-day/n5-coins.jpg",
      "segments": [
        "La femme a pesé les pommes et a annoncé le prix. Mona a cherché son porte-monnaie — mais les pièces se ressemblaient toutes, grosses et petites, dorées et argentées. Des gens attendaient derrière elle. Elle a senti son visage chauffer. Elle devait payer, et vite."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Pardon — j'apprends encore la monnaie. Vous pourriez m'aider ? »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "pousse un gros billet et se dépêche de partir avant la monnaie.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/market-day/n6-friends.jpg",
      "segments": [
        "« Parfait », a dit la femme, en prenant les bonnes pièces dans la main de Mona. « Vous apprenez vite. » Elle a glissé une pomme de plus dans le sac. « Revenez samedi prochain — je vous montrerai les bons étals. »",
        "Mona est rentrée avec des sacs lourds et le cœur léger. Un homme lui a offert une fleur. Le pain était encore chaud. Elle connaissait déjà trois marchands par leur nom — et elle avait une raison de revenir."
      ],
      "ending": {
        "id": "market-full-of-friends",
        "title": "Un marché plein d'amis",
        "quality": "good",
        "wrap": "Un panier plein et un marché de visages amicaux. Mona commence à avoir sa place ici."
      }
    },
    "end_ok": {
      "art": "en/market-day/n7-dinner.jpg",
      "segments": [
        "La femme a compté la monnaie dans la main de Mona, pièce par pièce. « Voilà, ma belle. » Mona l'a remerciée et a continué, en achetant du pain, des œufs et quelques légumes fatigués — en montrant du doigt plus qu'en parlant.",
        "À la fin, ses sacs étaient pleins et ses pieds douloureux. À la maison, elle a cuisiné son premier vrai dîner dans le nouvel appartement. Ce n'était pas raffiné, mais c'était le sien, et c'était chaud."
      ],
      "ending": {
        "id": "full-basket",
        "title": "Un panier plein",
        "quality": "ok",
        "wrap": "Tout ce qu'il y avait sur la liste — et un peu plus courageuse à chaque étal. Samedi prochain, elle parlera plus."
      }
    },
    "end_lesser": {
      "art": "en/market-day/n8-apples.jpg",
      "segments": [
        "Mona s'est éloignée en vitesse, sa monnaie oubliée et son sac plus lourd qu'il n'aurait dû. Ce n'est qu'à la maison qu'elle a regardé dedans : pas six pommes, mais six kilos. Une tour de pommes a roulé sur son petit plan de travail — elle avait montré la grande caisse, pas la petite.",
        "Elle s'est tenue dans sa cuisine et a ri. « Tarte aux pommes. Soupe aux pommes. Pommes à toutes les sauces. » Ce soir-là, elle a frappé à la porte de Monsieur Alder avec un sac de pommes et une histoire à raconter."
      ],
      "ending": {
        "id": "six-kilos-of-apples",
        "title": "Six kilos de pommes",
        "quality": "lesser",
        "wrap": "Six kilos de pommes et un voisin pour les partager. Certaines erreurs viennent avec de la tarte."
      }
    }
  }
}
$nodes$::jsonb, 104, false, false, NULL
FROM public.levels l WHERE l.id = 'A2'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 105: Le mauvais train (A2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'the-wrong-train', 'Le mauvais train', '[]'::jsonb, true, $nodes$
{
  "start": "monday_morning",
  "map": {
    "monday_morning": {
      "art": "en/the-wrong-train/n1-platform.jpg",
      "segments": [
        "Lundi matin : le premier jour de Mona au nouveau travail. Elle avait repassé sa chemise deux fois et quitté l'appartement une heure en avance. « Prends la ligne bleue jusqu'à Parc-Vert », avait écrit Priya. « Dix stations. Facile. » Mona le répétait comme une chanson : ligne bleue, Parc-Vert, dix stations.",
        "La gare était un fleuve de gens, tous pressés, tous sachant exactement où aller. Mona serrait son ticket et suivait les panneaux bleus."
      ],
      "next": "three_stops_wrong"
    },
    "three_stops_wrong": {
      "art": "en/the-wrong-train/n2-realize.jpg",
      "segments": [
        "Le train était chaud et bondé. Mona a trouvé un coin et a regardé défiler les stations. Une. Deux. Trois. Mais les noms semblaient faux — Les Berges, Vieux-Marché, Porte-Nord. Pas Parc-Vert.",
        "Son estomac s'est serré. Un plan au mur montrait un enchevêtrement de lignes de couleur. Elle était sur la ligne VERTE, pas la bleue, et dans le mauvais sens. Et son premier jour commençait dans vingt minutes."
      ],
      "next": "who_to_ask"
    },
    "who_to_ask": {
      "art": "en/the-wrong-train/n3-ask.jpg",
      "segments": [
        "Mona a regardé autour d'elle dans la rame : un étudiant avec un casque, un homme fatigué avec un journal, et une femme à peu près de son âge, un café à la main et un visage gentil. Son cœur battait vite. Elle devait demander — elle devait parler. La station suivante arrivait."
      ],
      "choice": {
        "prompt": "Comment Mona demande-t-elle de l'aide ?",
        "options": [
          {
            "label": "À la femme : « Excusez-moi — pardon de vous déranger. C'est bien la direction de Parc-Vert ? »",
            "goto": "a_cross_the_bridge",
            "clue": true
          },
          {
            "label": "« Parc-Vert ? Parc-Vert ? Où ? » — à toute la rame.",
            "goto": "b_alone_on_the_platform",
            "clue": false
          },
          {
            "label": "Elle le murmure, et la femme n'entend pas.",
            "goto": "b_alone_on_the_platform",
            "clue": false
          }
        ]
      }
    },
    "a_cross_the_bridge": {
      "art": "en/the-wrong-train/n4-bridge.jpg",
      "segments": [
        "La femme a souri. « Oh, vous allez dans le mauvais sens — c'est la ligne verte. Mais ne vous inquiétez pas : descendez au prochain arrêt, traversez la passerelle, reprenez la ligne bleue en sens inverse. Cinq stations. Vous y serez. » « La passerelle, ligne bleue, cinq stations », a répété Mona. « Merci beaucoup. » Les portes se sont ouvertes. « Par là — vite ! »"
      ],
      "choice": {
        "prompt": "Sur le quai bondé, Mona…",
        "options": [
          {
            "label": "« Pardon — quelle passerelle ? Celle de gauche ? » (elle vérifie)",
            "goto": "a_almost_there",
            "clue": true
          },
          {
            "label": "court simplement dans la direction que la femme a montrée.",
            "goto": "a_almost_there",
            "clue": false
          }
        ]
      }
    },
    "a_almost_there": {
      "art": "en/the-wrong-train/n5-run.jpg",
      "segments": [
        "Mona a traversé la passerelle, descendu les marches en courant, et atteint la ligne bleue juste au moment où un train entrait. PARC-VERT — cinq stations. Elle s'est glissée à bord, le souffle court. Juste, mais possible. Trois stations, quatre — et son téléphone a vibré : Priya. « Tout est prêt pour aujourd'hui ? »"
      ],
      "choice": {
        "prompt": "Que répond Mona ?",
        "options": [
          {
            "label": "« J'arrive ! J'ai fait un petit détour — je te raconterai. Cinq minutes. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "« Oui, tout va bien. J'arrive. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_alone_on_the_platform": {
      "art": "en/the-wrong-train/n9-alone.jpg",
      "segments": [
        "Quelques personnes ont levé les yeux, puis les ont détournés. L'étudiant a haussé les épaules. L'homme fatigué a tourné une page. Le visage de Mona a brûlé. Finalement, la femme au café s'est penchée — « Parc-Vert, c'est la ligne bleue, vous êtes sur la verte » — l'a dit vite au moment où les portes s'ouvraient, et a disparu dans la foule. Mona s'est retrouvée sur un quai inconnu, seule, avec des flèches dans tous les sens."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "arrête un agent de la gare : « S'il vous plaît — par où pour la ligne bleue ? »",
            "goto": "b_running_late",
            "clue": true
          },
          {
            "label": "choisit un tunnel et espère.",
            "goto": "b_running_late",
            "clue": false
          }
        ]
      }
    },
    "b_running_late": {
      "art": "en/the-wrong-train/n5-run.jpg",
      "segments": [
        "Après deux mauvais virages et un long tunnel, Mona a enfin trouvé la ligne bleue. Un train est arrivé — PARC-VERT. Elle a sauté dedans, à bout de souffle, et a regardé les stations défiler lentement. L'horloge n'était pas tendre. En retard — un peu, ou beaucoup, elle ne savait pas. Son téléphone a vibré : Priya. « Tout est prêt pour aujourd'hui ? »"
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "répond : « J'ai quelques minutes de retard — mauvais train ! Vraiment désolée. J'arrive. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "range son téléphone et se contente de courir.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-wrong-train/n6-office.jpg",
      "segments": [
        "Mona a franchi les portes du bureau avec deux minutes d'avance, les joues roses, le cœur encore emballé. Priya l'attendait avec deux cafés. « Un détour, tu disais ? » Mona a raconté l'histoire — la ligne verte, la femme gentille, la passerelle — et Priya a éclaté de rire.",
        "« Tu as demandé à une inconnue et tu as trouvé ton chemin dès le premier jour. C'est exactement le genre de personne qu'on a embauchée. » Mona s'est assise à son nouveau bureau, un peu fière. Elle s'était perdue, et elle avait trouvé son chemin — en osant parler."
      ],
      "ending": {
        "id": "just-in-time",
        "title": "Juste à temps",
        "quality": "good",
        "wrap": "Perdue dans le mauvais train, mais assez courageuse pour demander — et elle est arrivée avec une histoire et un sourire."
      }
    },
    "end_ok": {
      "art": "en/the-wrong-train/n7-late.jpg",
      "segments": [
        "Mona est arrivée avec sept minutes de retard, essoufflée, en s'excusant avant même d'avoir passé la porte. « Ce n'est rien », a dit Priya avec gentillesse. « Les trains, c'est difficile au début. Tu m'as prévenue, et tu es venue — c'est ça qui compte. » Elle a tendu un café à Mona.",
        "Sa première matinée n'était pas parfaite. Mais elle avait traversé toute une ville inconnue, seule, et elle était arrivée au bon endroit. Demain, elle partirait encore plus tôt."
      ],
      "ending": {
        "id": "seven-minutes-late",
        "title": "Sept minutes de retard",
        "quality": "ok",
        "wrap": "Quelques minutes de retard, mais honnête et bien là. Le plan de la ville commence lentement à prendre un sens."
      }
    },
    "end_lesser": {
      "art": "en/the-wrong-train/n8-pool.jpg",
      "segments": [
        "Mona est sortie en courant de la gare, a tourné à gauche, couru trois rues, et s'est retrouvée… à une piscine. Pas un bureau — une piscine. Elle avait lu la mauvaise sortie. Le temps de trouver le vrai bâtiment, elle avait quinze minutes de retard, les chaussures mouillées par une flaque et une feuille dans les cheveux.",
        "Priya a levé les yeux, a regardé la feuille, et a essayé très fort de ne pas sourire. « Voyage difficile ? » « Tu n'as pas idée », a dit Mona. Au déjeuner, l'histoire de la feuille dans les cheveux a fait rire toute l'équipe — et, d'une certaine façon, a fait d'elle l'une des leurs."
      ],
      "ending": {
        "id": "swimming-pool",
        "title": "La piscine",
        "quality": "lesser",
        "wrap": "Une piscine, une chaussure mouillée et une feuille dans les cheveux — un premier jour affreux et merveilleux qu'elle n'oubliera jamais."
      }
    }
  }
}
$nodes$::jsonb, 105, false, false, NULL
FROM public.levels l WHERE l.id = 'A2'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 106: Dîner entre nouveaux amis (A2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'dinner-with-new-friends', 'Dîner entre nouveaux amis', '[]'::jsonb, true, $nodes$
{
  "start": "outside_the_restaurant",
  "map": {
    "outside_the_restaurant": {
      "art": "en/dinner-with-new-friends/n1-outside.jpg",
      "segments": [
        "Leo l'avait invitée. « On est quelques-uns à dîner ensemble le vendredi », avait-il dit par-dessus le comptoir. « Rien de chic. Tu devrais venir. » Mona avait dit oui avant d'avoir le temps d'être timide. Maintenant, debout devant le petit restaurant, elle se sentait très timide, justement.",
        "Par la fenêtre, elle voyait une longue table, des bougies, des visages rieurs qu'elle ne connaissait pas. Elle a lissé son gilet, s'est dit « sois courageuse », et a poussé la porte."
      ],
      "next": "the_table"
    },
    "the_table": {
      "art": "en/dinner-with-new-friends/n2-table.jpg",
      "segments": [
        "« Mona ! Tu es venue ! » Leo s'est levé d'un bond et lui a fait signe. « Tout le monde, voici Mona — elle est nouvelle dans la ville. » Quatre visages amicaux se sont tournés vers elle. « Salut Mona ! » « Bienvenue ! » Une place s'est ouverte sur la banquette ; quelqu'un lui a passé un verre d'eau.",
        "C'était chaleureux, et bruyant, et un peu intimidant. Ils attendaient tous, gentiment, qu'elle dise quelque chose."
      ],
      "choice": {
        "prompt": "Comment Mona se présente-t-elle ?",
        "options": [
          {
            "label": "« Bonjour à tous ! Merci de m'accueillir. J'ai emménagé il y a deux semaines et je ne connais personne — alors ça, c'est adorable. »",
            "goto": "a_ordering",
            "clue": true
          },
          {
            "label": "« Salut. Je suis Mona. »",
            "goto": "b_ordering",
            "clue": false
          },
          {
            "label": "« Salut ! Désolée, je suis la nouvelle. Soyez gentils. »",
            "goto": "b_ordering",
            "clue": false
          }
        ]
      }
    },
    "a_ordering": {
      "art": "en/dinner-with-new-friends/n3-order.jpg",
      "segments": [
        "« Deux semaines ! Alors il te faut le tour complet », a ri une femme qui s'appelait Dalia, et la table s'est réchauffée pour elle d'un coup. Un serveur est passé. « Les pâtes ici sont célèbres », a dit Leo, « mais prends ce que tu veux. » Mona a regardé le menu — certains mots qu'elle connaissait, d'autres non — et elle ne voulait pas juste copier tout le monde."
      ],
      "choice": {
        "prompt": "Mona commande…",
        "options": [
          {
            "label": "« Qu'est-ce que c'est, les pâtes au nom rigolo ? …Je vais prendre ça — ça a l'air délicieux. »",
            "goto": "a_the_question",
            "clue": true
          },
          {
            "label": "« La même chose que lui, s'il vous plaît. »",
            "goto": "a_the_question",
            "clue": false
          }
        ]
      }
    },
    "a_the_question": {
      "art": "en/dinner-with-new-friends/n4-food.jpg",
      "segments": [
        "Les plats sont arrivés — des bols fumants, du pain partagé, un plat d'olives passé de main en main. La table parlait en même temps, heureuse et bruyante. « Alors, Mona », a dit Dalia, « pourquoi es-tu venue de si loin ? Dans NOTRE petite ville pluvieuse ? » Cinq visages se sont tournés vers elle, curieux et gentils."
      ],
      "choice": {
        "prompt": "Comment Mona répond-elle ?",
        "options": [
          {
            "label": "« Honnêtement ? Je voulais un nouveau départ — une nouvelle ville, une nouvelle langue, une version plus courageuse de moi. Ça fait peur. Mais ce soir, j'ai l'impression que ça en valait la peine. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "« Oh, tu sais. Le travail. Comme d'habitude. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_ordering": {
      "art": "en/dinner-with-new-friends/n3-order.jpg",
      "segments": [
        "Les amis ont souri et sont retournés à leur conversation. Ça allait vite — des prénoms, des blagues, une histoire sur quelqu'un qui s'appelait Dan — et Mona ne pouvait pas tout suivre. Un serveur est apparu. « Et pour vous ? » Tout le monde l'a regardée. Mona a regardé le menu, plein de mots, et elle a senti sa tête se vider."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Pardon — vous pouvez me laisser encore une minute ? » puis elle choisit.",
            "goto": "b_a_quiet_corner_of_the_table",
            "clue": true
          },
          {
            "label": "elle panique et montre du doigt : « Celui-là. S'il vous plaît. » (sans savoir ce que c'est)",
            "goto": "b_a_quiet_corner_of_the_table",
            "clue": false
          }
        ]
      }
    },
    "b_a_quiet_corner_of_the_table": {
      "art": "en/dinner-with-new-friends/n5-talk.jpg",
      "segments": [
        "La table riait et bavardait autour d'elle. Elle souriait et hochait la tête, comprenant un mot sur trois, voulant participer — mais le bon moment lui échappait toujours. Puis Leo lui a touché le bras. « Ça va, de ton côté ? » a-t-il demandé doucement."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Oui — juste un peu perdue ! Vous parlez tous si vite. Mais je suis contente d'être venue. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "« Ça va, ça va », et elle continue de hocher la tête à des blagues qu'elle n'entend pas.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/dinner-with-new-friends/n6-toast.jpg",
      "segments": [
        "La table s'est tue un instant — puis Dalia a levé son verre. « À Mona. À une version plus courageuse de toi. Bienvenue. » Les verres ont tinté tout le long de la table.",
        "La soirée a été longue et chaleureuse. Ils lui ont appris des gros mots et de mauvaises blagues, se sont disputés sur la meilleure pizza, et lui ont fait promettre de venir chaque vendredi. Quand Leo l'a raccompagnée au coin de la rue, il a dit : « Je t'avais dit que tu t'intégrerais. » Mona a levé les yeux vers le ciel de sa nouvelle ville et, pour la première fois, c'était comme chez elle."
      ],
      "ending": {
        "id": "one-of-us",
        "title": "L'une des nôtres",
        "quality": "good",
        "wrap": "Elle est venue en inconnue et repart avec une table pleine d'amis — et une invitation permanente pour les vendredis."
      }
    },
    "end_ok": {
      "art": "en/dinner-with-new-friends/n7-warm.jpg",
      "segments": [
        "Mona a souri et a laissé la conversation couler autour d'elle. Elle ne saisissait pas chaque blague, mais elle riait quand ils riaient, et la nourriture était bonne. À la fin, elle connaissait quelques prénoms — Dalia, Dan, l'ami de Leo au rire sonore. « À bientôt, Mona », ont-ils dit chaleureusement.",
        "Elle est rentrée chez elle rassasiée et un peu fatiguée. Elle n'avait pas brillé, à proprement parler — mais elle avait été là, à table, parmi des gens. Et c'était déjà plus que vendredi dernier."
      ],
      "ending": {
        "id": "pleasant-night",
        "title": "Une belle soirée",
        "quality": "ok",
        "wrap": "Un premier dîner tout en douceur. La prochaine fois, elle en dira plus — et ils seront ravis de l'entendre."
      }
    },
    "end_lesser": {
      "art": "en/dinner-with-new-friends/n8-eels.jpg",
      "segments": [
        "Mona a hoché la tête et souri jusqu'à la fin de la soirée, ne comprenant presque rien — et a mangé tout le plat mystère, gris et tremblotant, parce que ça semblait impoli de ne pas le faire. Ce n'est que dans le taxi du retour que Leo lui a envoyé un message : « Courageuse d'avoir fini les anguilles en gelée ! Personne ne mange vraiment ça. »",
        "Mona a fixé son téléphone, a grogné, puis a éclaté de rire à l'arrière du taxi. Toute une assiette d'anguilles en gelée, mangée par pure politesse. « Vendredi prochain », a-t-elle répondu, « je prends les pâtes. » Leo a envoyé trois visages qui rient et un seul mot : « Marché conclu. »"
      ],
      "ending": {
        "id": "jellied-eels",
        "title": "Les anguilles en gelée",
        "quality": "lesser",
        "wrap": "Un accueil dégoûtant et hilarant — et elle reviendra (pour les pâtes)."
      }
    }
  }
}
$nodes$::jsonb, 106, false, false, NULL
FROM public.levels l WHERE l.id = 'A2'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 107: L'entretien (B1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'the-interview', 'L''entretien', '[]'::jsonb, true, $nodes$
{
  "start": "the_opportunity",
  "map": {
    "the_opportunity": {
      "art": "en/the-interview/n1-email.jpg",
      "segments": [
        "Au bout de trois mois, Mona commençait tout juste à se sentir chez elle — et puis l'e-mail est arrivé. Un poste à responsabilité, une vraie promotion, dans une équipe qu'elle admirait. Sa première pensée a été : pas moi. Trop nouvelle, trop étrangère, trop nerveuse. Elle a failli fermer l'e-mail.",
        "Mais Priya, qui lisait par-dessus son épaule avec un café, a dit simplement : « Postule. Tu es prête, même si tu ne le sens pas encore. » Alors, le cœur battant, Mona l'a fait."
      ],
      "next": "the_waiting_room"
    },
    "the_waiting_room": {
      "art": "en/the-interview/n2-waiting.jpg",
      "segments": [
        "La salle d'entretien avait une porte vitrée et trois chaises de l'autre côté de la table. Mona attendait dehors, relisant ses notes, les mains froides. À travers la vitre, elle les voyait : une femme au regard perçant, un homme plus âgé à l'air gentil, et un plus jeune qui faisait défiler une tablette.",
        "La porte s'est ouverte. « Mona ? Entrez. » Elle s'est levée, a lissé sa veste, et s'est dit la vérité : j'ai gagné le droit d'être dans cette salle."
      ],
      "next": "why_this_role"
    },
    "why_this_role": {
      "art": "en/the-interview/n3-opening.jpg",
      "segments": [
        "« Alors », a dit la femme au regard perçant, « dites-nous pourquoi vous voulez ce poste. » C'était la question que Mona avait répétée cent fois. Mais dans cette salle chaude et silencieuse, avec trois visages qui l'observaient, chaque phrase bien tournée s'est envolée de sa tête."
      ],
      "choice": {
        "prompt": "Comment Mona commence-t-elle ?",
        "options": [
          {
            "label": "« Je serai honnête — il y a trois mois, je ne savais pas commander un café ici. Aujourd'hui, je postule pour ça. Je ne veux pas seulement le poste ; je veux prouver à quelle vitesse je peux progresser. »",
            "goto": "a_tell_me_about_a_failure",
            "clue": true
          },
          {
            "label": "« Je suis travailleuse, j'ai l'esprit d'équipe, et je suis très motivée. »",
            "goto": "b_everyone_says_that",
            "clue": false
          },
          {
            "label": "« Honnêtement ? Je ne suis sans doute pas qualifiée, mais je me suis dit que j'allais essayer. »",
            "goto": "b_everyone_says_that",
            "clue": false
          }
        ]
      }
    },
    "a_tell_me_about_a_failure": {
      "art": "en/the-interview/n4-failure.jpg",
      "segments": [
        "L'homme plus âgé s'est penché en avant, intéressé. « Ça demande du cran. Mais ce poste est difficile. Parlez-moi d'une fois où quelque chose a mal tourné — et de ce que vous avez fait. » Mona a pensé au mauvais train, aux six kilos de pommes, à cent petits échecs, et en a choisi un vrai : un projet à son ancien travail qui avait mal tourné. Elle l'a raconté honnêtement — l'erreur, la panique, ce qu'elle en avait appris. Elle n'a pas fait semblant d'être parfaite."
      ],
      "choice": {
        "prompt": "Il demande : « Et si cela se reproduisait demain ? »",
        "options": [
          {
            "label": "« Je le repérerais une semaine plus tôt — parce que maintenant, je demande de l'aide avant de couler, pas après. »",
            "goto": "a_the_real_question",
            "clue": true
          },
          {
            "label": "« Ça ne se reproduirait pas. Je ne fais pas deux fois la même erreur. »",
            "goto": "a_the_real_question",
            "clue": false
          }
        ]
      }
    },
    "a_the_real_question": {
      "art": "en/the-interview/n5-realquestion.jpg",
      "segments": [
        "La femme au regard perçant était restée silencieuse, à observer. Maintenant, elle a parlé. « Vous êtes manifestement compétente. Mais vous êtes aussi la personne la plus récente ici. Pourquoi devrions-nous vous confier cela ? » C'était la vraie question — celle qui se cachait sous toutes les autres. Mona l'a sentie arriver. Elle pouvait se défendre, ou être honnête."
      ],
      "choice": {
        "prompt": "Que dit Mona ?",
        "options": [
          {
            "label": "« Parce qu'être nouvelle, c'est justement la raison. Je remets en question tout ce que vous avez cessé de questionner. Je travaillerai deux fois plus, et j'apporterai un regard que cette équipe n'a pas encore. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "« Je le prouverai par les résultats. Donnez-moi trois mois. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_everyone_says_that": {
      "art": "en/the-interview/n4-failure.jpg",
      "segments": [
        "« Travailleuse. Motivée. » La femme au regard perçant a noté quelque chose sans lever les yeux. « Tout le monde dit ça. » La salle a semblé plus froide. Mona a compris que ses réponses prudentes les avaient ennuyés ; il lui fallait montrer quelque chose de vrai. « Parlez-nous d'un vrai défi », a dit l'homme plus âgé, en lui donnant une deuxième chance."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "prend une inspiration — « D'accord. La vraie réponse : venir ici toute seule a été la chose la plus difficile de ma vie. Voici ce que ça m'a appris… »",
            "goto": "b_the_weakness_question",
            "clue": true
          },
          {
            "label": "« Eh bien, il y a eu un projet compliqué l'an dernier… » (prudent, générique)",
            "goto": "b_the_weakness_question",
            "clue": false
          }
        ]
      }
    },
    "b_the_weakness_question": {
      "art": "en/the-interview/n5-realquestion.jpg",
      "segments": [
        "Le jury écoutait, poli mais sans s'enflammer. L'horloge tournait. « Dernière question », a dit la femme au regard perçant. « Quelle est une chose chez vous que vous changeriez ? » La question du défaut — le piège. Mona avait lu qu'il faut donner un faux défaut (« je travaille trop »). Mais ces trois-là l'avaient entendue mille fois."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Je doute trop de moi — j'ai failli ne pas postuler. J'apprends à faire confiance à ce que je sais déjà. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "« Honnêtement ? C'est juste que je tiens trop aux choses. »",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-interview/n6-news.jpg",
      "segments": [
        "La femme au regard perçant a posé son stylo et, pour la première fois, a souri. « Ça », a-t-elle dit, « c'est la meilleure réponse qu'on ait entendue de toute la semaine. » Mona est sortie sur des jambes tremblantes, sans savoir si elle avait été brillante ou folle. Deux jours plus tard, l'e-mail est arrivé : le poste était pour elle.",
        "Priya l'a retrouvée dans le couloir et l'a serrée dans ses bras. « Je te l'avais dit. Prête, même quand tu ne le sens pas. » Mona a ri, et l'espace d'un instant, la nouvelle venue terrifiée de l'aéroport a semblé très loin."
      ],
      "ending": {
        "id": "person-for-the-job",
        "title": "La personne qu'il fallait",
        "quality": "good",
        "wrap": "Elle est entrée comme la nouvelle et ressortie comme la personne qu'il fallait — en étant honnête plutôt que prudente."
      }
    },
    "end_ok": {
      "art": "en/the-interview/n7-corridor.jpg",
      "segments": [
        "« Merci, Mona. Nous vous recontacterons », a dit l'homme plus âgé avec gentillesse. Elle est partie sans savoir comment ça s'était passé. Une semaine plus tard : elle ne l'avait pas eu — mais la femme au regard perçant l'a appelée en personne. « Vous étiez proche. Vraiment proche. Gardez l'honnêteté, laissez tomber les réponses prudentes, et la prochaine fois, ce sera pour vous. »",
        "Mona était déçue, mais pas effondrée. Elle s'était assise dans cette salle, avec ces gens, et elle avait tenu bon. Six mois plus tôt, elle n'aurait pas pu l'imaginer. La prochaine fois, elle serait prête."
      ],
      "ending": {
        "id": "close",
        "title": "De justesse",
        "quality": "ok",
        "wrap": "Pas le poste — cette fois. Mais elle a prouvé qu'elle avait sa place dans la salle."
      }
    },
    "end_lesser": {
      "art": "en/the-interview/n8-drink.jpg",
      "segments": [
        "« Je tiens trop aux choses », a dit Mona — et elle a vu les trois visages s'éteindre doucement. Elle l'a su à la seconde où elle l'a dit : la réponse prudente et fausse. Le reste de l'entretien a été poli et court. Elle n'a pas eu le poste, et elle savait exactement pourquoi.",
        "Ce soir-là, Priya lui a offert un verre. « Tu es entrée et tu as joué un personnage », a-t-elle dit avec douceur. « La prochaine fois, amène juste Mona. Elle est plus impressionnante que le texte. » Mona a ri, un peu triste, un peu plus sage."
      ],
      "ending": {
        "id": "script",
        "title": "Le texte",
        "quality": "lesser",
        "wrap": "Les réponses répétées lui ont coûté le poste — mais lui ont appris le plus utile : la prochaine fois, être vraie."
      }
    }
  }
}
$nodes$::jsonb, 107, false, false, NULL
FROM public.levels l WHERE l.id = 'B1'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 108: Un coup de froid (B1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'under-the-weather', 'Un coup de froid', '[]'::jsonb, true, $nodes$
{
  "start": "thursday",
  "map": {
    "thursday": {
      "art": "en/under-the-weather/n1-bed.jpg",
      "segments": [
        "Ça a commencé par un mal de gorge le mardi. Jeudi, Mona arrivait à peine à soulever la tête de l'oreiller. Tout son corps lui faisait mal, son nez coulait comme une fontaine, et une toux grasse lui râpait la poitrine. Dans sa langue, elle aurait su dire tout ça exactement ; en français, les mots lui glissaient entre les doigts.",
        "« Je ne peux pas travailler comme ça », a-t-elle croassé à l'appartement vide. Elle a trouvé le numéro du cabinet médical du quartier et, un mouchoir à la main, a pris rendez-vous."
      ],
      "next": "the_waiting_room"
    },
    "the_waiting_room": {
      "art": "en/under-the-weather/n2-waiting.jpg",
      "segments": [
        "La salle d'attente sentait le gel hydroalcoolique et les vieux magazines. Mona était assise parmi des inconnus qui toussaient, répétant ses symptômes à voix basse : « De la fièvre. Une toux. J'ai mal partout. » Des mots simples — mais elle avait peur de les oublier, ou de ne pas comprendre la réponse. « Mona ? » a appelé une infirmière. « Le médecin va vous recevoir. Salle deux. »"
      ],
      "next": "what_s_been_going_on"
    },
    "what_s_been_going_on": {
      "art": "en/under-the-weather/n3-describe.jpg",
      "segments": [
        "Le docteur Shah était plus jeune que Mona ne l'imaginait, la voix calme et les yeux fatigués mais gentils. « Alors — qu'est-ce qui vous arrive ? » C'était le moment : elle devait expliquer assez clairement pour être soignée, et assez honnêtement pour être en sécurité."
      ],
      "choice": {
        "prompt": "Comment Mona décrit-elle ses symptômes ?",
        "options": [
          {
            "label": "« Depuis mardi : un mal de gorge, puis de la fièvre, et maintenant une grosse toux et des courbatures partout. C'est pire la nuit. »",
            "goto": "a_the_examination",
            "clue": true
          },
          {
            "label": "« Je me sens mal. Très mal. Partout. »",
            "goto": "b_drawing_it_out",
            "clue": false
          },
          {
            "label": "« Je crois que c'est peut-être grave — j'ai lu sur internet — »",
            "goto": "b_drawing_it_out",
            "clue": false
          }
        ]
      }
    },
    "a_the_examination": {
      "art": "en/under-the-weather/n4-exam.jpg",
      "segments": [
        "« C'est très utile, merci », a dit le docteur Shah, et il a écouté sa poitrine. « Inspirez… et expirez. » Le stéthoscope froid l'a fait frissonner. « Bonne nouvelle — une vilaine infection virale, pas les bronches. Ça passera en une semaine. Du repos, buvez beaucoup, et prenez ça. » Il a rédigé une ordonnance, puis a dit quelque chose rapidement à propos de « la pharmacie de la grande rue » et « deux fois par jour, au moment des repas » — et Mona n'a saisi que la moitié."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Pardon — vous pourriez répéter la dernière partie ? Deux fois par jour, au moment des repas — c'est bien ça ? »",
            "goto": "a_just_to_be_sure",
            "clue": true
          },
          {
            "label": "hoche la tête et dit « D'accord, merci », même si elle n'est pas sûre.",
            "goto": "a_just_to_be_sure",
            "clue": false
          }
        ]
      }
    },
    "a_just_to_be_sure": {
      "art": "en/under-the-weather/n5-instructions.jpg",
      "segments": [
        "Le docteur Shah a souri et a répété lentement, en écrivant « 2×/jour, aux repas » sur le papier. « Et si la fièvre ne tombe pas d'ici trois jours, ou si vous avez du mal à respirer — revenez tout de suite. N'attendez pas. » « Revenir si la fièvre reste, ou si je respire mal », a répété Mona. « Exactement », a-t-il dit. « Vous êtes une bonne patiente. »"
      ],
      "choice": {
        "prompt": "En sortant, Mona…",
        "options": [
          {
            "label": "s'arrête à la pharmacie, lit la notice, et envoie un message à Priya : « Je ne viens pas — ordre du médecin. De retour lundi. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "remercie tout le monde, mais compte secrètement travailler de chez elle quand même.",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_drawing_it_out": {
      "art": "en/under-the-weather/n4-exam.jpg",
      "segments": [
        "« J'ai mal partout » était vrai, mais ça n'aidait pas beaucoup le médecin. Il a posé des questions douces — « Depuis quand ? De la fièvre ? Une toux ? » — et a lentement tiré l'histoire d'elle. Ça a pris plus de temps, et Mona s'est sentie un peu bête, mais le docteur Shah était patient. « On dirait un virus. Du repos, buvez beaucoup, et ces comprimés. » Il a expliqué la posologie à vitesse normale, et Mona a perdu le fil à mi-chemin."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Je suis désolée — mon français empire quand je suis malade. Vous pourriez m'écrire les instructions ? »",
            "goto": "b_a_paper_full_of_words",
            "clue": true
          },
          {
            "label": "« D'accord, merci, docteur », et prend le papier sans vraiment connaître le plan.",
            "goto": "b_a_paper_full_of_words",
            "clue": false
          }
        ]
      }
    },
    "b_a_paper_full_of_words": {
      "art": "en/under-the-weather/n5-instructions.jpg",
      "segments": [
        "Il lui a donné l'ordonnance et une petite tape rassurante. « Prenez soin de vous. Revenez si vous n'allez pas mieux la semaine prochaine. » Mona est partie en serrant un papier couvert de mots médicaux, se sentant plus mal qu'à son arrivée — pas dans le corps, mais dans la confiance. Combien de comprimés ? Quand ? Quoi surveiller ? Elle n'était pas sûre."
      ],
      "choice": {
        "prompt": "À la pharmacie, Mona…",
        "options": [
          {
            "label": "montre le papier : « Vous pourriez m'expliquer comment les prendre, s'il vous plaît ? Je n'ai pas tout saisi. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "décide qu'elle « comprendra à la maison » et prend la boîte.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/under-the-weather/n6-caredfor.jpg",
      "segments": [
        "Mona a passé le week-end enveloppée dans un plaid, le thé à portée de main, les comprimés deux fois par jour aux repas, exactement comme le disait le petit mot. Dimanche, la fièvre est tombée. Priya a envoyé de la soupe et une carte rigolote. Leo a laissé des citrons devant la porte. Monsieur Alder a frappé pour vérifier qu'elle était vivante, puis a réparé la fenêtre pour de bon tant qu'il y était.",
        "Allongée dans son lit bien chaud, entourée par tout un petit monde de nouveaux amis, Mona a compris : elle était malade, et loin de chez elle — et, pourtant, pas seule du tout."
      ],
      "ending": {
        "id": "looked-after",
        "title": "Bien entourée",
        "quality": "good",
        "wrap": "Elle a expliqué clairement, demandé quand elle n'était pas sûre, et laissé les gens l'aider. La ville prend soin des siens."
      }
    },
    "end_ok": {
      "art": "en/under-the-weather/n7-desk.jpg",
      "segments": [
        "Mona s'est remise, plus ou moins. Elle a pris les comprimés — presque tous les jours, à peu près à l'heure — et s'est reposée quand elle pouvait, même si elle a glissé un peu de travail qu'elle avait promis d'éviter. La toux a traîné quelques jours de plus à cause de ça. « Tu ne t'es pas reposée, hein ? » a deviné Priya le lundi. Mona a pris un air coupable. « La prochaine fois », a dit Priya, « quand le médecin dit repos, tu te reposes. »",
        "N'empêche, elle l'avait fait — un médecin, une pharmacie, une maladie, le tout dans une deuxième langue. Pas rien."
      ],
      "ending": {
        "id": "muddling-through",
        "title": "Tant bien que mal",
        "quality": "ok",
        "wrap": "Elle s'en est sortie tant bien que mal et a guéri — en apprenant que « ordre du médecin » inclut la partie repos."
      }
    },
    "end_lesser": {
      "art": "en/under-the-weather/n8-fridge.jpg",
      "segments": [
        "Mona a décidé qu'elle comprendrait les comprimés à la maison. Elle n'a pas compris. La boîte disait « un, deux fois par jour » ; elle a lu « deux, une fois par jour », et a passé le samedi à se demander pourquoi elle se sentait si bizarre et somnolente. Le dimanche, inquiète, elle a enfin appelé le cabinet. L'infirmière a démêlé ça en deux minutes. « Erreur facile — mais demandez, la prochaine fois. C'est pour ça qu'on est là. »",
        "Mona s'est sentie bête, puis reconnaissante. Elle a collé les instructions corrigées sur son frigo, en grosses lettres bien claires — et s'est enfin reposée pour de bon."
      ],
      "ending": {
        "id": "mix-up",
        "title": "Le quiproquo",
        "quality": "lesser",
        "wrap": "Une dose embrouillée et un samedi d'inquiétude — une erreur sans gravité qui lui a appris à toujours, toujours demander."
      }
    }
  }
}
$nodes$::jsonb, 108, false, false, NULL
FROM public.levels l WHERE l.id = 'B1'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 109: Le service (B1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'the-favour', 'Le service', '[]'::jsonb, true, $nodes$
{
  "start": "the_tiniest_favour",
  "map": {
    "the_tiniest_favour": {
      "art": "en/the-favour/n1-phone.jpg",
      "segments": [
        "C'était un mardi quand Dalia a appelé, parlant à toute vitesse, comme toujours. « Mona ! Mon ange. Ma sauveuse. J'ai besoin du plus tout petit service. » Le « tout petit service », en fait, c'était deux semaines à s'occuper de son appartement à l'autre bout de la ville : son chien Biscuit, ses quarante plantes vertes, ses poissons tropicaux, et « juste un peu » de courrier. À partir de demain.",
        "« Tu verras à peine la différence ! » chantait Dalia. Mais Mona avait ses propres deux semaines chargées — une grosse échéance, un cousin en visite — et deux semaines avec un chien inconnu à l'autre bout de la ville, ce n'était pas « tout petit » du tout."
      ],
      "next": "the_squeeze"
    },
    "the_squeeze": {
      "art": "en/the-favour/n2-squeeze.jpg",
      "segments": [
        "« Tu es la seule personne en qui j'ai confiance », a continué Dalia. « Tout le monde a dit non. Tu es si gentille, si organisée — s'il te plaît ? » Voilà : la flatterie, la culpabilité et une porte qui se referme, le tout d'un coup. Mona aimait bien Dalia et voulait être une bonne amie. Elle savait aussi que si elle disait oui, ses propres deux semaines s'effondreraient. « Alors ? » a dit Dalia. « Demain ? Tu es un amour. »"
      ],
      "choice": {
        "prompt": "Comment Mona répond-elle ?",
        "options": [
          {
            "label": "« Dalia, j'adore que tu me fasses confiance — mais deux semaines à l'autre bout de la ville, c'est plus que je ne peux faire en ce moment, avec mon échéance. Je peux plutôt t'aider à trouver une meilleure solution ? »",
            "goto": "a_the_pause",
            "clue": true
          },
          {
            "label": "« Euh… d'accord. Je suppose. Oui. »",
            "goto": "b_biscuit_the_dog",
            "clue": false
          },
          {
            "label": "« Peut-être ? Laisse-moi vérifier et je te rappelle… » (et elle redoute ça)",
            "goto": "b_biscuit_the_dog",
            "clue": false
          }
        ]
      }
    },
    "a_the_pause": {
      "art": "en/the-favour/n3-answer.jpg",
      "segments": [
        "Il y a eu un silence. Pendant une seconde, Mona était sûre d'avoir tout gâché. Puis Dalia a soupiré — pas en colère, juste fatiguée. « Non mais tu as raison. Je fais toujours ça. J'en demande trop. » « Tu ne demandes pas trop », a dit Mona doucement. « Tu demandes trop de choses à la fois. » Dalia a vraiment ri. « Bon. D'accord. Alors qu'est-ce que tu PEUX faire, ô grande organisée ? »"
      ],
      "choice": {
        "prompt": "Mona propose…",
        "options": [
          {
            "label": "« Je peux promener Biscuit les trois soirs où je suis libre, et appelons dès ce soir pour trouver un vrai dog-sitter — maintenant, ensemble. »",
            "goto": "a_fixed_in_twenty_minutes",
            "clue": true
          },
          {
            "label": "« Je peux arroser les plantes une fois, peut-être. »",
            "goto": "a_fixed_in_twenty_minutes",
            "clue": false
          }
        ]
      }
    },
    "a_fixed_in_twenty_minutes": {
      "art": "en/the-favour/n4-fix.jpg",
      "segments": [
        "Ensemble, au téléphone, elles ont trouvé un dog-sitter à deux rues de chez Dalia — une étudiante qui adorait les chiens et avait besoin d'argent. Mona a proposé de passer avec des friandises en milieu de semaine. Problème réglé, en vingt minutes. « Tu viens de réparer toute ma vie sans dire oui à rien », a dit Dalia, émerveillée. « Apprends-moi tes pouvoirs. » « Ce n'est pas magique », a ri Mona. « C'est juste de l'honnêteté. Et des listes. »"
      ],
      "choice": {
        "prompt": "En raccrochant, Dalia dit : « Je t'en dois une. » Mona…",
        "options": [
          {
            "label": "« Tu ne me dois rien — mais tu peux payer la première tournée vendredi. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "« Oh, ce n'est rien, vraiment. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_biscuit_the_dog": {
      "art": "en/the-favour/n5-callback.jpg",
      "segments": [
        "« Tu es un amour ! » Dalia a raccroché avant que Mona puisse changer d'avis. Et voilà : Mona possédait un chien nommé Biscuit, quarante plantes assoiffées, et un nœud de deux semaines à l'estomac. L'échéance approchait. Son cousin est arrivé. Biscuit a mangé une chaussure et hurlé à 3 heures du matin. Les poissons la regardaient d'un air accusateur. Mona traversait la ville deux fois par jour et dormait quatre heures par nuit."
      ],
      "choice": {
        "prompt": "Pour tenir le coup, Mona…",
        "options": [
          {
            "label": "demande à son cousin en visite de l'aider pour les promenades du soir.",
            "goto": "b_everything_perfect",
            "clue": true
          },
          {
            "label": "essaie de tout faire absolument toute seule.",
            "goto": "b_everything_perfect",
            "clue": false
          }
        ]
      }
    },
    "b_everything_perfect": {
      "art": "en/the-favour/n5-callback.jpg",
      "segments": [
        "Le dixième jour, tenant au café et à la panique, son téléphone a sonné. Dalia, depuis ses vacances ensoleillées. « Comment va mon bébé ? Tout est parfait ? » Mona se tenait dans la cuisine dévastée, une chaussure mâchouillée à la main, et avait le choix : la vérité, ou le spectacle."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Franchement ? Ça a été beaucoup — j'en ai trop pris. Réglons les derniers jours ensemble. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "« Parfait ! Tout est parfait ! » (et elle continue de couler)",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-favour/n6-toast.jpg",
      "segments": [
        "Vendredi est arrivé, et Dalia a payé la première tournée — et la deuxième. « À la femme qui a dit non et a quand même aidé plus que tous ceux qui ont dit oui. » Biscuit adorait son étudiante ; les plantes ont survécu ; l'échéance de Mona a été tenue, calmement et à l'heure. Et Dalia, qui avait perdu des amis à trop demander, en avait trouvé une assez honnête pour la garder.",
        "« Tu es une perle, Mona. » Chez elle, Mona n'aurait jamais osé dire non. Ici, elle apprenait qu'un « non » gentil pouvait être le début d'une vraie amitié."
      ],
      "ending": {
        "id": "keeper",
        "title": "Une perle",
        "quality": "good",
        "wrap": "Un « non » chaleureux et honnête — et un « oui » plus malin — ont transformé un service en amitié. Les limites, finalement, sont une forme d'attention."
      }
    },
    "end_ok": {
      "art": "en/the-favour/n7-exhausted.jpg",
      "segments": [
        "Les derniers jours, Mona et Dalia ont trouvé un sitter ensemble, et Mona a enfin dormi. Quand Dalia est rentrée — bronzée et heureuse — elle a trouvé son appartement bien vivant, son chien content, et son amie complètement épuisée. « Tu aurais dû me le dire plus tôt. Je n'aurais jamais voulu ça. » « Je sais », a dit Mona. « J'apprends encore à dire non. »",
        "Elle avait gardé l'amitié et tenu parole — mais avait failli s'épuiser pour y arriver."
      ],
      "ending": {
        "id": "hard-way",
        "title": "À la dure",
        "quality": "ok",
        "wrap": "Elle a tenu sa promesse et gardé son amie — mais a appris qu'un « oui » qu'on ne peut pas porter n'aide personne."
      }
    },
    "end_lesser": {
      "art": "en/the-favour/n8-flood.jpg",
      "segments": [
        "Mona a dit « parfait ! » jusqu'au bout — et c'était très loin d'être parfait. Le onzième jour, une plante qu'elle avait trop arrosée a basculé, fêlé l'aquarium, et envoyé une petite inondation polie sur le sol de Dalia. Mona a passé sa dernière soirée libre à genoux avec une serpillière, un chien nerveux, et trois poissons dans un saladier, riant sans pouvoir s'arrêter.",
        "Quand Dalia est rentrée, Mona a tout avoué dans une longue histoire haletante et hilarante. Dalia l'a fixée — puis a éclaté de rire. « Tu as inondé mon appartement plutôt que d'admettre que tu étais fatiguée ? » « Oui », a dit Mona. « Oui, c'est ça. » « Oh, Mona — dis-le-moi, la prochaine fois. »"
      ],
      "ending": {
        "id": "flood",
        "title": "L'inondation",
        "quality": "lesser",
        "wrap": "Une inondation et un saladier de poissons : faire semblant d'aller bien n'aide personne. (La prochaine fois : dire la vérité.)"
      }
    }
  }
}
$nodes$::jsonb, 109, false, false, NULL
FROM public.levels l WHERE l.id = 'B1'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 110: Fils croisés (B2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'crossed-wires', 'Fils croisés', '[]'::jsonb, true, $nodes$
{
  "start": "the_midnight_polish",
  "map": {
    "the_midnight_polish": {
      "art": "en/crossed-wires/n1-rework.jpg",
      "segments": [
        "Mona l'avait pensé comme une gentillesse. Le dossier client était à rendre lundi, alors au cours d'un dimanche sans sommeil, elle avait tout repris — resserré les chiffres, redessiné les diapos, corrigé ce qu'elle était sûre d'être des erreurs. Elle l'a envoyé à minuit avec un petit mot joyeux : « Je l'ai peaufiné — j'espère que ça te va ! »",
        "Lundi matin, elle attendait un merci. À la place, en réunion, leur chef a dit chaleureusement : « Excellent travail, Mona » — et en face, le sourire de Priya s'est figé une demi-seconde avant de revenir, trop éclatant."
      ],
      "next": "the_cold"
    },
    "the_cold": {
      "art": "en/crossed-wires/n2-frozen.jpg",
      "segments": [
        "Après la réunion, quelque chose avait changé. Priya était polie — parfaitement, soigneusement polie — et c'est à ça que Mona a compris que ça n'allait pas. La chaleur facile de trois mois avait disparu, remplacée par des réponses brèves et une porte de bureau fermée.",
        "Mona a tout rejoué dans sa tête. Les « erreurs » qu'elle avait corrigées n'en étaient pas — c'étaient les choix délibérés de Priya. Le « peaufinage » avait effacé une semaine de son travail, et Mona en avait ensuite été félicitée, en public, pendant que Priya ne disait rien. Elle n'avait pas aidé. Elle avait marché droit sur la personne qui croyait en elle."
      ],
      "next": "the_closed_door"
    },
    "the_closed_door": {
      "art": "en/crossed-wires/n3-door.jpg",
      "segments": [
        "En milieu d'après-midi, le silence était insupportable. Mona pouvait laisser passer et espérer que ça s'estompe — ou frapper à cette porte fermée. Elle a pensé à ce qu'elle ressentirait à la place de Priya. Elle s'est levée, a traversé le bureau, et a frappé."
      ],
      "choice": {
        "prompt": "Comment Mona entame-t-elle la conversation ?",
        "options": [
          {
            "label": "« Priya — on peut parler ? Je crois que j'ai dépassé les bornes avec le dossier, et je ne veux pas faire comme si je n'avais pas senti le froid. Je peux t'expliquer, et vraiment t'écouter ? »",
            "goto": "a_the_honest_exchange",
            "clue": true
          },
          {
            "label": "« Hé — tout va bien ? Tu as l'air un peu silencieuse aujourd'hui. »",
            "goto": "b_everything_s_fine",
            "clue": false
          },
          {
            "label": "« Je suis TELLEMENT désolée, je suis la pire, ne me déteste pas s'il te plaît — »",
            "goto": "b_everything_s_fine",
            "clue": false
          }
        ]
      }
    },
    "a_the_honest_exchange": {
      "art": "en/crossed-wires/n4-honest.jpg",
      "segments": [
        "Priya a posé son stylo. Un instant, elle a eu l'air de vouloir dire « c'est rien » — le mensonge qui clôt les conversations. Puis elle a choisi l'honnêteté elle aussi. « Tu as réécrit une semaine de mon travail en une nuit, tu as appelé ça un peaufinage, et tu as été félicitée pour ça devant notre chef. Je ne savais pas si je devais être blessée ou impressionnée. » Ça a fait mal, parce que c'était vrai. Mona s'est forcée à rester avec ça au lieu de se défendre."
      ],
      "choice": {
        "prompt": "Mona répond :",
        "options": [
          {
            "label": "« Tu as tout à fait le droit d'être les deux. Je croyais aider — mais je n'ai pas demandé, et c'est ça le problème. J'ai effacé tes décisions et pris le crédit sans le vouloir. Je suis désolée. C'est ma faute. »",
            "goto": "a_what_priya_learned_once",
            "clue": true
          },
          {
            "label": "« Je suis désolée, mais je voulais vraiment juste aider — je ne savais pas que c'était exprès. »",
            "goto": "a_what_priya_learned_once",
            "clue": false
          }
        ]
      }
    },
    "a_what_priya_learned_once": {
      "art": "en/crossed-wires/n5-lift.jpg",
      "segments": [
        "« Merci de dire ça », a dit Priya, et un peu de la glace a fondu. « Je ne pense pas que tu étais malveillante. Je pense que tu es affamée et douée, et que tu n'as pas encore appris où sont les limites. Quand j'étais nouvelle, j'ai fait quelque chose de semblable — quelqu'un m'a prise à part, exactement comme ça. » « Qu'est-ce qu'on t'a dit ? » a demandé Mona. Priya a réfléchi. « Que le moyen le plus rapide de perdre une équipe, c'est de la rendre invisible. Et le moyen le plus rapide de la gagner, c'est de s'assurer que chacun reçoive le crédit qu'il a mérité. »"
      ],
      "choice": {
        "prompt": "Que fait Mona ensuite ?",
        "options": [
          {
            "label": "« Alors laisse-moi réparer la partie visible. J'enverrai un mail à l'équipe et au chef : les fondations solides de ce dossier étaient les tiennes — parce que c'est vrai. Et plus rien de toi ne sort sans qu'on en parle d'abord. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "« Je ferai plus attention la prochaine fois, promis. Ça ne se reproduira pas. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_everything_s_fine": {
      "art": "en/crossed-wires/n4-honest.jpg",
      "segments": [
        "« Tout va bien », a dit Priya, de la voix qui veut dire que rien ne va, et elle s'est retournée vers son écran. La porte était ouverte, mais la vraie conversation restait fermement close. Le travail réécrit, la lumière volée — tout ça restait dans la pièce entre elles, sans nom et grandissant. Mona pouvait battre en retraite, ou aller plus loin."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Je ne crois pas que ça aille, et je crois que c'est ma faute. J'ai réécrit ton travail et j'ai été félicitée pour ça. On peut vraiment en parler ? »",
            "goto": "b_three_quiet_days",
            "clue": true
          },
          {
            "label": "« D'accord. Désolée de t'avoir dérangée », et ressort de la pièce.",
            "goto": "b_three_quiet_days",
            "clue": false
          }
        ]
      }
    },
    "b_three_quiet_days": {
      "art": "en/crossed-wires/n5-lift.jpg",
      "segments": [
        "Quelle que soit la direction qu'elle avait prise, la vraie conversation n'avait pas eu lieu. Pendant trois jours, le bureau a tourné à la politesse appliquée — « Tu pourrais me transférer ce fichier. » « Bien sûr. » Des mercis comme des portes qui se ferment. Le travail se faisait ; la chaleur ne revenait pas. Un problème qu'on ne nomme pas ne disparaît pas — il se tait et attend. Le jeudi, leurs chemins se sont croisés à l'ascenseur, Priya déjà en manteau."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "entre dans l'ascenseur : « Priya — je te dois une vraie conversation, pas trois jours de « ça va ». J'ai dépassé les bornes, j'ai pris un crédit qui était le tien, et j'ai détesté chaque minute de silence depuis. Je peux réparer ça ? »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "« Bonne soirée ! » — et laisse les portes se refermer sur le silence.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/crossed-wires/n6-coffees.jpg",
      "segments": [
        "Mona a envoyé le mail cet après-midi-là — à l'équipe, au chef — en créditant clairement Priya pour l'ossature du travail. Ça lui a coûté un peu de fierté et a tout changé. Priya est apparue à son bureau vingt minutes plus tard, deux cafés à la main, l'ancienne chaleur revenue. « Tu n'étais pas obligée de faire ça. » « Si. Et j'en avais envie. »",
        "Elles ont reconstruit la règle ensemble : rien ne part sans un point de cinq minutes. Le quasi-désastre les a rendues meilleures — Priya a commencé à confier à Mona le genre de responsabilités qu'on ne donne qu'à quelqu'un dont on sait qu'il vous protégera. « Les fils croisés », a dit Priya plus tard, « ce sont juste deux personnes qui tenaient toutes les deux. On les démêlera plus vite la prochaine fois. »"
      ],
      "ending": {
        "id": "better-than-before",
        "title": "Mieux qu'avant",
        "quality": "good",
        "wrap": "Elle l'a assumé, l'a réparé en public, et a échangé une lumière volée contre quelque chose de bien meilleur : la confiance."
      }
    },
    "end_ok": {
      "art": "en/crossed-wires/n7-lifttalk.jpg",
      "segments": [
        "Dans l'ascenseur, Mona a dit ce qu'elle avait à dire — en retard, mais honnêtement — et Priya, fatiguée mais pas méchante, a écouté. « J'apprécie. J'aurais aimé que tu le dises lundi. Mais je suis contente que tu l'aies dit du tout. » Au fil des semaines, la chaleur est revenue lentement, prudemment, comme un bleu qui s'efface.",
        "Elles allaient bien. Très bien, même. Mais Mona n'a jamais oublié les trois jours de silence — le coût de l'attente, de l'espoir qu'un problème se règle tout seul. « La prochaine fois », s'est-elle dit, « je frappe à la porte le jour même. »"
      ],
      "ending": {
        "id": "little-late",
        "title": "Un peu tard",
        "quality": "ok",
        "wrap": "Réparé un peu tard — l'amitié survit, et le silence se révèle le choix le plus coûteux de tous."
      }
    },
    "end_lesser": {
      "art": "en/crossed-wires/n8-leo-word.jpg",
      "segments": [
        "Mona a laissé les portes se refermer sur un joyeux « Bonne soirée ! » — et la vraie conversation n'est jamais venue. Elle a essayé de réparer de biais : en vantant Priya bien fort en réunion (ce qui sonnait faux), en apportant des cafés non demandés (ce qui sonnait comme de la culpabilité), en marchant sur des œufs pendant quinze jours. Priya, déroutée par cette énergie étrange, s'est éloignée encore plus.",
        "Il a fallu un mot sans détour de Leo, des semaines plus tard — « Tu lui as vraiment DIT que tu étais désolée, ou tu as juste… tourné autour ? » — pour que Mona frappe enfin, des mois trop tard, et dise la chose simple et vraie. Priya lui a pardonné, mais la confiance facile a mis longtemps à revenir. « On ne répare pas une conversation », a dit Priya, « en ayant toutes les conversations sauf celle-là. »"
      ],
      "ending": {
        "id": "every-conversation-but-that-one",
        "title": "Toutes les conversations sauf celle-là",
        "quality": "lesser",
        "wrap": "Éviter les mots difficiles a étiré des excuses de deux minutes en deux mois douloureux. Dis la chose vraie tôt."
      }
    }
  }
}
$nodes$::jsonb, 110, false, false, NULL
FROM public.levels l WHERE l.id = 'B2'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 111: La négociation (B2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'the-negotiation', 'La négociation', '[]'::jsonb, true, $nodes$
{
  "start": "the_letter",
  "map": {
    "the_letter": {
      "art": "en/the-negotiation/n1-letter.jpg",
      "segments": [
        "La lettre était formelle, tapée à la machine, et glissée sous sa porte — ce qui disait à Mona, avant même de la lire, que Monsieur Alder avait détesté l'écrire. Les coûts avaient grimpé : le chauffage, le toit, l'assurance. Il n'avait pas le choix, il devait augmenter le loyer, et le nouveau montant lui a serré l'estomac. Pas cruel — mais plus qu'elle ne pouvait payer confortablement, avec tout le reste encore si nouveau.",
        "Elle adorait cet appartement : la lumière dorée du matin, la fenêtre réparée, le vieil homme gentil du dessous qui montait de la soupe quand elle était malade. Elle ne voulait pas partir. Mais elle ne pouvait pas non plus faire semblant que le montant tenait debout."
      ],
      "next": "at_his_door"
    },
    "at_his_door": {
      "art": "en/the-negotiation/n2-doorway.jpg",
      "segments": [
        "Elle l'a trouvé dans son embrasure de porte ce soir-là, la casquette à la main, l'air plus vieux que d'habitude. « Vous avez eu la lettre. » Pas une question. « Je suis désolé, Mona. Je l'ai repoussée d'un mois. Mais le toit n'attendra pas. » Il avait l'air de s'attendre à ce qu'elle se fâche, ou qu'elle donne son préavis sur-le-champ. Et Mona a compris : c'était une négociation où tous les deux avaient peur de perdre quelque chose — et les coups faciles étaient les mauvais."
      ],
      "choice": {
        "prompt": "Comment Mona commence-t-elle ?",
        "options": [
          {
            "label": "« Je ne suis pas fâchée — je vois bien que c'est difficile pour vous aussi. Honnêtement : j'adore vivre ici et je veux rester, mais ce montant est vraiment juste pour moi en ce moment. On peut y réfléchir ensemble ? »",
            "goto": "a_tea_and_the_real_picture",
            "clue": true
          },
          {
            "label": "« Ce n'est rien. Je comprends. Je… trouverai l'argent, d'une façon ou d'une autre. »",
            "goto": "b_the_standoff",
            "clue": false
          },
          {
            "label": "« C'est une énorme hausse. Ça ne peut pas être légal, sans préavis. »",
            "goto": "b_the_standoff",
            "clue": false
          }
        ]
      }
    },
    "a_tea_and_the_real_picture": {
      "art": "en/the-negotiation/n3-tea.jpg",
      "segments": [
        "Monsieur Alder a cligné des yeux, surpris d'être traité en partenaire plutôt qu'en méchant. « Ensemble », a-t-il répété, et un peu de poids a quitté ses épaules. « Entrez. Je mets la bouilloire. » Autour d'un thé, le vrai tableau est apparu : il n'avait pas besoin de l'augmentation complète de tout le monde d'un coup — il avait besoin que le toit soit payé avant le printemps. Et il croulait sous les petits travaux que ses genoux ne pouvaient plus faire. Mona, organisée et dont le cousin se trouvait être bricoleur, a commencé à voir une forme se dessiner."
      ],
      "choice": {
        "prompt": "Mona propose :",
        "options": [
          {
            "label": "« Et si je prends la hausse en deux temps — la moitié maintenant, la moitié au printemps — et qu'en échange je m'occupe de la gestion de l'immeuble et des petites réparations ? Je suis douée pour les listes, et je connais quelqu'un de bricoleur. »",
            "goto": "a_the_handshake",
            "clue": true
          },
          {
            "label": "« Vous pourriez juste me laisser trois mois à l'ancien tarif, le temps de m'adapter ? »",
            "goto": "a_the_handshake",
            "clue": false
          }
        ]
      }
    },
    "a_the_handshake": {
      "art": "en/the-negotiation/n5-handshake.jpg",
      "segments": [
        "Monsieur Alder a posé son thé et l'a regardée un long moment — cette jeune femme arrivée six mois plus tôt, à peine capable de commander un café, qui résolvait maintenant ses problèmes dans sa cuisine. « En quarante ans à louer des chambres », a-t-il dit, « personne ne m'a jamais proposé d'aider plutôt que de discuter. » Il a tendu la main. « La moitié maintenant, la moitié au printemps. Et si vous arrivez vraiment à réparer mes robinets qui fuient, on sera quittes. »"
      ],
      "choice": {
        "prompt": "Ils se serrent la main. Puis Mona…",
        "options": [
          {
            "label": "« Mettons-le par écrit — équitable pour nous deux. Et merci, Monsieur Alder, de ne pas avoir juste affiché un chiffre plus gros en espérant que ça passe. Ça compte beaucoup. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "« Super ! Une poignée de main me suffit. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_the_standoff": {
      "art": "en/the-negotiation/n9-standoff.jpg",
      "segments": [
        "La réponse de Mona — qu'elle l'ait avalée ou aiguisée — a fermé la porte à la conversation facile. Le visage de Monsieur Alder est devenu soigneusement neutre. Si elle avait accepté, il se sentait coupable et elle se sentait piégée ; si elle avait menacé, il se sentait attaqué et se braquait — « J'ai donné trente jours, tout est légal. » Dans les deux cas, ils étaient maintenant de part et d'autre d'une table, pas du même côté. Quelqu'un devait en changer la forme."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "« Pardon — on peut reprendre depuis le début ? Je m'y suis mal prise. Je ne veux ni vous combattre ni fuir. Je veux quelque chose qui marche pour nous deux. »",
            "goto": "b_upstairs_deciding",
            "clue": true
          },
          {
            "label": "reste polie mais ferme dans son coin : « Je vais y réfléchir et je vous tiens au courant. »",
            "goto": "b_upstairs_deciding",
            "clue": false
          }
        ]
      }
    },
    "b_upstairs_deciding": {
      "art": "en/the-negotiation/n10-upstairs.jpg",
      "segments": [
        "La conversation a boité jusqu'à un « réfléchissons-y tous les deux » qui ne satisfaisait personne. Mona est remontée, la lettre encore à la main et un nœud dans la poitrine. Elle avait quelques jours pour décider qui elle voulait être là-dedans : la locataire qui souffre en silence, celle qui se bat et s'en va — ou quelque chose de mieux. Cette nuit-là, elle a entendu ses pas lents en bas, et le cliquetis de lui essayant, en vain, de réparer un robinet tout seul."
      ],
      "choice": {
        "prompt": "Le lendemain matin, Mona…",
        "options": [
          {
            "label": "frappe avec deux cafés : « On réessaie — comme il faut, cette fois. J'ai une idée. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "glisse un mot sous sa porte en acceptant le loyer plein, sans rien dire, le cœur froid.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-negotiation/n6-signing.jpg",
      "segments": [
        "Ils ont tout rédigé à la table de la cuisine — la moitié maintenant, la moitié au printemps, Mona comme organisatrice officieuse de l'immeuble, avec son cousin de garde pour les robinets. Équitable, clair, signé des deux. Au printemps, le toit était réparé, les robinets ne fuyaient plus, et les autres locataires ont commencé à laisser des colis à « la fille de l'appartement trois qui règle les choses ». Monsieur Alder a retrouvé ses jeudis pour le thé et les mots croisés.",
        "« Le meilleur accord que j'aie jamais conclu », lui a-t-il dit un jour, « c'est celui où personne n'a perdu. » Mona — autrefois trop effrayée pour dire un mot à un guichet de passeports — venait de négocier son propre foyer, non pas en gagnant, mais en refusant de laisser l'un ou l'autre perdre."
      ],
      "ending": {
        "id": "nobody-lost",
        "title": "Personne n'a perdu",
        "quality": "good",
        "wrap": "Une vraie négociation, ce n'est pas battre l'autre — c'est trouver la table où vous pouvez vous asseoir tous les deux. Mona l'a trouvée, et a gardé son foyer."
      }
    },
    "end_ok": {
      "art": "en/the-negotiation/n7-middle.jpg",
      "segments": [
        "La deuxième conversation s'est mieux passée que la première. Autour d'un café frais, Mona et Monsieur Alder ont trouvé un montant du milieu — pas aussi malin qu'un vrai partenariat, mais équitable, gentil et gérable. « J'aurais pu mieux gérer le début », a admis Mona. « Nous deux », a-t-il dit.",
        "Elle a gardé son appartement, lui a gardé sa dignité, et la lumière dorée du matin a continué d'arriver. Pas un accord parfait, mais un accord honnête, atteint par deux personnes prêtes à réessayer. « La prochaine fois qu'il y a une lettre », a-t-il dit, « frappez d'abord. On sautera la partie gênante. »"
      ],
      "ending": {
        "id": "do-over",
        "title": "Une seconde chance",
        "quality": "ok",
        "wrap": "Un compromis équitable, et une leçon : quand une négociation commence mal, le geste courageux est de tout recommencer."
      }
    },
    "end_lesser": {
      "art": "en/the-negotiation/n8-hallway.jpg",
      "segments": [
        "Mona a glissé le mot sous sa porte — loyer plein, accepté, sans conversation. Le choix sûr, et le choix solitaire. Elle a gardé l'appartement, mais quelque chose de petit et de chaud avait disparu. Pendant des semaines, Monsieur Alder et elle se sont salués d'un signe de tête dans le couloir, comme des étrangers. La soupe a cessé d'arriver ; la fenêtre, quand elle a recoincé, est restée coincée.",
        "Ce n'est que lorsqu'elle a enfin frappé, des mois plus tard, avec des excuses et une marmite de sa propre soupe, que le gel a fondu — et elle a appris le vrai coût d'éviter la conversation difficile : pas de l'argent, mais la chaleur d'une amitié qu'elle avait laissée refroidir pour s'épargner une heure gênante."
      ],
      "ending": {
        "id": "won-the-number-lost-the-warmth",
        "title": "Gagner le chiffre, perdre la chaleur",
        "quality": "lesser",
        "wrap": "Elle a gagné le chiffre et perdu la chaleur. Certaines négociations, on les « gagne » en payant plein tarif — et on en ressort quand même plus pauvre."
      }
    }
  }
}
$nodes$::jsonb, 111, false, false, NULL
FROM public.levels l WHERE l.id = 'B2'
ON CONFLICT (course, slug) DO NOTHING;

-- fr 112: L'au revoir (B2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'fr', l.id, 'the-goodbye', 'L''au revoir', '[]'::jsonb, true, $nodes$
{
  "start": "the_news",
  "map": {
    "the_news": {
      "art": "en/the-goodbye/n1-news.jpg",
      "segments": [
        "Leo le lui a annoncé par-dessus le comptoir, comme il lui avait annoncé tout le reste — la meilleure boulangerie, les dîners du vendredi, toute la carte de sa nouvelle vie. Mais cette fois, son sourire n'était pas aussi facile que d'habitude. « Je pars, Mona. Je monte vers le nord. J'ouvre mon propre endroit — mon propre café. C'est le rêve depuis toujours, un local s'est libéré, et… » Il s'est interrompu, scrutant son visage.",
        "Mona est restée parfaitement immobile. Leo avait été son premier ami dans cette ville — le tablier vert, la tasse mal orthographiée, la gentillesse d'un matin solitaire. Elle avait bâti la moitié de son courage sur son accueil chaleureux. Et maintenant, il s'en allait."
      ],
      "next": "the_send_off"
    },
    "the_send_off": {
      "art": "en/the-goodbye/n2-sendoff.jpg",
      "segments": [
        "Ils lui ont organisé un pot de départ au restaurant du vendredi — toute leur grande famille chaleureuse et bruyante. Dalia a pleuré dans la corbeille à pain. Quelqu'un a fait un discours qui a tourné en toast qui a tourné en chanson. Mona a ri et applaudi avec les autres, mais sous tout ça couvait une douleur silencieuse qu'elle n'arrivait pas tout à fait à nommer.",
        "À la fin de la soirée, alors qu'on rassemblait les manteaux et appelait les taxis, Leo a croisé son regard et a incliné la tête vers la porte. « Tu me raccompagnes ? » Et puis il n'y avait plus qu'eux deux, dans la rue froide et claire, avec tout ce qui restait à dire entre eux."
      ],
      "next": "any_words_for_the_road"
    },
    "any_words_for_the_road": {
      "art": "en/the-goodbye/n3-walk.jpg",
      "segments": [
        "Ils ont marché en silence un moment. Mona savait que c'était le moment — celui qu'on n'a qu'une fois, où l'on dit la chose vraie ou on la laisse s'échapper pour toujours derrière une blague. « Alors », a fini par dire Leo. « Un mot pour la route ? » Il l'a dit avec légèreté, mais ses yeux n'avaient rien de léger."
      ],
      "choice": {
        "prompt": "Que dit Mona ?",
        "options": [
          {
            "label": "« Leo — tu n'imagines pas ce que tu as fait. Je suis arrivée ici sans rien, incapable même de commander un café, et tu m'as regardée comme si j'avais ma place avant même que ce soit vrai. Tu as fait de cette ville un foyer. Tu vas me manquer plus que je ne sais le dire. »",
            "goto": "a_under_the_streetlight",
            "clue": true
          },
          {
            "label": "« Tu vas vraiment me manquer. Bonne chance là-haut. »",
            "goto": "b_too_small_for_everything",
            "clue": false
          },
          {
            "label": "« Essaie de ne pas écorcher le prénom de tout le monde dans le nord ! »",
            "goto": "b_too_small_for_everything",
            "clue": false
          }
        ]
      }
    },
    "a_under_the_streetlight": {
      "art": "en/the-goodbye/n4-streetlight.jpg",
      "segments": [
        "Leo s'est arrêté de marcher. Sous le réverbère, Mona a vu que ses yeux étaient humides. « Tu crois que j'ai fait ça pour toi », a-t-il dit. « Mona — c'est toi qui l'as fait. Moi, j'ai juste préparé le café. » Il a ri, s'est essuyé le visage, et n'a pas fait semblant de ne pas pleurer. « La fille effrayée qui est entrée ce premier matin, et la femme debout ici maintenant — j'ai eu la chance de voir ça arriver. Tu sais à quel point c'est rare ? De voir quelqu'un devenir soi-même ? » C'était ce qu'on lui avait jamais dit de plus beau. Toute l'année lui est remontée dans la gorge."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "laisse venir les larmes : « Alors laisse-moi le dire comme il faut, avant que tu partes — merci. Pour le premier café, et tous ceux d'après. Tu as été le début de tout. »",
            "goto": "a_not_a_real_goodbye",
            "clue": true
          },
          {
            "label": "rit et le serre vite dans ses bras : « Bon, bon, avant qu'on inonde la rue — »",
            "goto": "a_not_a_real_goodbye",
            "clue": false
          }
        ]
      }
    },
    "a_not_a_real_goodbye": {
      "art": "en/the-goodbye/n5-taxi.jpg",
      "segments": [
        "Ils sont restés longtemps au coin de la rue, deux amis avec toute une ville de souvenirs entre eux. « Ce n'est pas un vrai adieu », a dit Leo enfin. « Mon nouvel endroit est à un trajet de train, et toi, entre tous, tu n'as plus peur des trains. » Mona a ri — un rire mouillé et vrai. « Je serai ta première cliente. Je commanderai fort et clairement, et tu écriras mon prénom correctement. » « Mona », a-t-il dit, comme une promesse. « J'ai toujours su que c'était Mona. »"
      ],
      "choice": {
        "prompt": "Quand son taxi arrive, Mona…",
        "options": [
          {
            "label": "lui glisse une toute petite carte dans la main : « Jour d'ouverture. Je suis déjà réservée. Le premier café, c'est moi qui l'offre, cette fois. »",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "le serre fort dans ses bras : « Va être brillant. »",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_too_small_for_everything": {
      "art": "en/the-goodbye/n4-streetlight.jpg",
      "segments": [
        "« Bonne chance là-haut », a répété Mona, et les mots semblaient trop petits pour tout ce qu'il y avait derrière. Leo a hoché la tête, et quelque chose a traversé son visage — une petite déception, vite cachée. Il avait espéré, peut-être, un peu plus. Les vraies choses — ce qu'il avait représenté pour elle, à quel point elle avait encore peur sous sa nouvelle assurance, combien elle ne voulait pas qu'il parte — sont restées pliées bien serrées en elle, à l'abri et inutiles. Le taxi arrivait. La fenêtre se refermait."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "se reprend : « Non — attends. Ce n'est pas assez. Leo, tu as été mon premier ami ici. J'ai besoin que tu saches vraiment ce que ça a voulu dire. »",
            "goto": "b_seconds_left",
            "clue": true
          },
          {
            "label": "garde le ton léger et enjoué jusqu'au bout.",
            "goto": "b_seconds_left",
            "clue": false
          }
        ]
      }
    },
    "b_seconds_left": {
      "art": "en/the-goodbye/n5-taxi.jpg",
      "segments": [
        "Le taxi s'est arrêté. Le moment unique était là, qui rétrécissait. Tout ce que Mona n'avait pas dit vibrait dans l'air froid entre eux — la gratitude, la peur, l'amour d'une amitié qui n'a pas de mot facile. Il lui restait quelques secondes pour décider de le laisser sortir, ou de le laisser partir."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "l'attrape par la manche alors qu'il atteint la voiture : « Leo — merci. De m'avoir vue avant que je puisse me voir moi-même. Je le pense vraiment. »",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "fait un signe, sourit, « Roule prudemment ! » — et la portière du taxi se referme sur tout ça.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-goodbye/n6-northcafe.jpg",
      "segments": [
        "Six semaines plus tard, Mona est descendue d'un train dans une nouvelle ville du nord, est entrée dans un petit café lumineux qui sentait le café et le pain frais, et a trouvé Leo derrière le comptoir dans un tablier tout neuf, souriant comme le soleil. « MONA », disait la tasse qu'il a fait glisser vers elle — orthographiée parfaitement, en grandes lettres fières. Sur la soucoupe était posée la toute petite carte qu'elle lui avait donnée, encadrée maintenant, calée près de la caisse. « Ma toute première réservation. Je devais la garder. »",
        "Ils ont parlé pendant des heures, comme toujours. Partir, Mona l'a enfin compris, ce n'est pas toujours perdre. Un adieu dit comme il faut n'est qu'une amitié qui change de forme — étirée sur la distance, pas brisée. Elle avait appris à traverser une ville ; maintenant elle savait qu'elle pouvait garder les gens qu'elle aimait d'un bout à l'autre d'un pays, aussi."
      ],
      "ending": {
        "id": "train-ride-away",
        "title": "À un train de là",
        "quality": "good",
        "wrap": "Elle a dit la chose vraie, difficile et belle au lieu de se cacher derrière une blague — et a transformé un adieu en invitation permanente. Certains départs sont en fait des commencements."
      }
    },
    "end_ok": {
      "art": "en/the-goodbye/n7-watching.jpg",
      "segments": [
        "« Va être brillant », a dit Mona, et elle l'a serré si fort qu'il a ri. C'était un bon adieu — chaleureux, assez vrai, dit avec le cœur plein si ce n'est tout à fait chaque mot. Elle a regardé les feux du taxi disparaître et est rentrée à pied par la ville tranquille qui, d'une certaine façon, était devenue la sienne.",
        "Elle lui enverrait des messages. Elle irait le voir, sans doute. Ils resteraient amis à la manière facile et moderne des gens qui s'apprécient malgré la distance. Pas tout ce qu'elle aurait pu dire — mais elle était venue, l'avait serré dans ses bras, l'avait pensé. En montant l'escalier vers son petit appartement doré, elle a senti la douleur d'un chapitre qui se referme, et la fierté tranquille d'une année survécue et d'un ami bien aimé."
      ],
      "ending": {
        "id": "full-heart",
        "title": "Le cœur plein",
        "quality": "ok",
        "wrap": "Un adieu chaleureux et honnête — pas chaque dernier mot, mais le cœur plein. L'amitié voyagera très bien."
      }
    },
    "end_lesser": {
      "art": "en/the-goodbye/n8-message.jpg",
      "segments": [
        "« Roule prudemment ! » a lancé Mona, enjouée comme tout, et la portière du taxi s'est refermée sur chacune des choses qu'elle avait voulu dire. Elle est rentrée d'un pas léger, puis — devant sa propre porte — soudain lourde. Dans l'appartement silencieux, les mots sont enfin venus, tous, trop tard, pour une pièce vide.",
        "Mais elle n'était plus trop fière pour réparer ça. Elle s'est assise et a tout écrit dans un long message honnête, et l'a envoyé dans la nuit. Leo a répondu dans l'heure : « Je savais. J'ai toujours su. Mais je suis tellement content que tu l'aies dit. Monte vite dans le nord — et redis-le-moi autour d'un café. » Mona a pleuré, et ri, et réservé un train pour le mois suivant."
      ],
      "ending": {
        "id": "message-she-sent-anyway",
        "title": "Le message qu'elle a quand même envoyé",
        "quality": "lesser",
        "wrap": "Elle a laissé le moment passer derrière un sourire éclatant — puis a refusé d'en rester là. Même un adieu raté peut se réparer, si l'on est assez courageux pour envoyer le message."
      }
    }
  }
}
$nodes$::jsonb, 112, false, false, NULL
FROM public.levels l WHERE l.id = 'B2'
ON CONFLICT (course, slug) DO NOTHING;

-- es 101: La llegada (A1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'touchdown', 'La llegada', '[]'::jsonb, true, $nodes$
{
  "start": "land",
  "map": {
    "land": {
      "art": "en/touchdown/n1-arrival.jpg",
      "segments": [
        "El avión bajó despacio entre las nubes, y Mona miró por la pequeña ventanilla.",
        "Abajo, toda una ciudad nueva crecía, cada vez más grande: ríos grises, carreteras largas, mil lucecitas que empezaban a brillar.",
        "Sus manos apretaban el asiento. Durante todo un año había soñado con este día. Ahora era real, y parecía muy grande.",
        "Las ruedas tocaron el suelo con un golpe suave. «Ya estoy aquí», dijo en voz baja, a nadie. «Estoy aquí de verdad.» Cogió su bolsa de debajo del asiento, y sonrió."
      ],
      "next": "walk"
    },
    "walk": {
      "art": "en/touchdown/n2-hall.jpg",
      "segments": [
        "Dentro, el aeropuerto era enorme, luminoso y lleno de ruido. Voces en muchos idiomas pasaban junto a sus oídos.",
        "Del techo colgaban carteles, con flechas por todas partes. Mona leía despacio: control de pasaportes, por aquí.",
        "A su alrededor, la gente andaba deprisa, tirando de maletas grandes. Un niño lloraba. Un hombre corría hacia su puerta de embarque.",
        "Se sentía pequeña, y lejos de casa — pero también se sentía despierta, y viva. Al final de un pasillo largo, esperaba una fila de viajeros cansados. Se puso al final, y respiró despacio y hondo."
      ],
      "next": "passport"
    },
    "passport": {
      "art": "en/touchdown/n3-passport.jpg",
      "segments": [
        "La fila avanzaba despacio. Mona miraba al agente del mostrador. Parecía cansado, y no le sonreía a nadie.",
        "Por fin le tocó a ella. «El siguiente, por favor», dijo, y le hizo un gesto para que avanzara.",
        "Abrió su pasaporte, miró la foto, y luego su cara. «¿Por qué está usted aquí?», preguntó."
      ],
      "choice": {
        "prompt": "¿Qué dice Mona?",
        "options": [
          {
            "label": "«Estoy aquí por un trabajo nuevo. Estoy muy contenta de estar aquí.»",
            "goto": "a_stamp",
            "clue": true
          },
          {
            "label": "«Trabajo. Un trabajo.»",
            "goto": "b_stamp",
            "clue": false
          },
          {
            "label": "«¡Vacaciones! … No — perdón — ¡un trabajo!»",
            "goto": "b_stamp",
            "clue": false
          }
        ]
      }
    },
    "a_stamp": {
      "art": "en/touchdown/n3-passport.jpg",
      "segments": [
        "El agente esbozó una pequeña sonrisa de sorpresa. «Un trabajo nuevo», dijo. «Eso es valiente.» Selló la página — un ruido fuerte y alegre. «Buena suerte en nuestra ciudad, Mona.»",
        "«Gracias», dijo ella, y lo decía de verdad. Una palabra amable, en su primer minuto en el país. Siguió andando con una sensación cálida en el pecho. Quizá, pensó, todo vaya bien."
      ],
      "next": "a_bag"
    },
    "b_stamp": {
      "art": "en/touchdown/n3-passport.jpg",
      "segments": [
        "El agente no sonrió. La miró un largo rato, en silencio. La cara de Mona se puso caliente. ¿Había dicho algo mal? Quería explicarse, pero no le salía ninguna palabra buena.",
        "Entonces — sello. «Vale. El siguiente», dijo, mirando ya detrás de ella. Siguió andando deprisa. No era el mejor comienzo, pensó. Pero el sello ya estaba en su pasaporte. Estaba aquí de verdad."
      ],
      "next": "b_bag"
    },
    "a_bag": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "Encontró la zona de equipajes, donde maletas brillantes daban vueltas en una cinta larga. Mona esperaba su bolsa azul. Un minuto. Dos minutos. Cinco. No llegaba.",
        "A su lado, una señora mayor miraba la cinta y soltó un suspiro cansado — su maleta también faltaba. Había sido un día muy largo para todos en aquella sala."
      ],
      "choice": {
        "prompt": "Mientras esperan, ¿qué hace Mona?",
        "options": [
          {
            "label": "Sonríe a la señora y dice: «Un día largo, ¿verdad?»",
            "goto": "a_bag2",
            "clue": true
          },
          {
            "label": "Espera en silencio y mira la cinta, sola.",
            "goto": "a_bag2",
            "clue": false
          }
        ]
      }
    },
    "a_bag2": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "Por fin — ¡ahí! Su bolsa azul dobló la esquina, un poco perdida entre todas las negras. Mona la sacó de la cinta y se rió en voz alta. «¡Por fin!» La señora mayor se rió con ella.",
        "Con la bolsa en la mano y el corazón más ligero, Mona avanzó hacia las puertas grandes que decían LLEGADAS. Detrás de esas puertas estaba su ciudad nueva — y, eso esperaba, alguien esperándola solo a ella."
      ],
      "next": "a_meet"
    },
    "b_bag": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "Encontró la zona de equipajes, pero su bolsa azul no estaba por ninguna parte. La cinta larga daba vueltas y vueltas, casi vacía. La gente pasaba a su lado con maletas enormes y ruedas ruidosas.",
        "Mona dio un paso atrás y apretó los brazos contra el cuerpo. Se sentía muy pequeña, y muy lejos de casa. Solo quería que aquel día tan, tan largo terminara. «Ven, por favor», susurró a la cinta vacía."
      ],
      "choice": {
        "prompt": "Mientras espera, ¿qué hace Mona?",
        "options": [
          {
            "label": "Respira despacio y espera con calma.",
            "goto": "b_bag2",
            "clue": true
          },
          {
            "label": "Se preocupa, y mira el móvil una y otra vez.",
            "goto": "b_bag2",
            "clue": false
          }
        ]
      }
    },
    "b_bag2": {
      "art": "en/touchdown/n4-baggage.jpg",
      "segments": [
        "Su bolsa llegó casi la última. La cogió rápido y no miró atrás. Avanzó deprisa hacia las puertas grandes que decían LLEGADAS, con los ojos pesados y los pies doloridos.",
        "Salir, solo salir, se dijo. Aire fresco, y luego todo irá mejor. Las puertas se abrieron ante ella."
      ],
      "next": "b_meet"
    },
    "a_meet": {
      "art": "en/touchdown/n5-arrivals.jpg",
      "segments": [
        "Fuera de las puertas, esperaba un muro de caras — madres, padres, amigos, conductores, todos buscando a otra persona.",
        "Entonces lo vio — un hombre sostenía un pequeño cartel. Había una sola palabra: MONA. Tenía una cara redonda y amable, y unas llaves de coche en la mano. La miraba a ella."
      ],
      "choice": {
        "prompt": "¿Cómo lo saluda Mona?",
        "options": [
          {
            "label": "«¡Hola! Soy Mona. Muchas gracias por esperar.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "«Mona. Sí. Soy yo.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_meet": {
      "art": "en/touchdown/n5-arrivals.jpg",
      "segments": [
        "El aire fresco de la tarde entró de golpe y la despertó un poco. Mona miró el mar de gente que esperaba. En algún lugar de allí estaba su nombre.",
        "Un hombre estaba de pie con un cartel — MONA — pero estaba tan cansada que sus ojos pasaron justo por su lado. Una vez. Luego otra. Se paró, sin saber qué hacer."
      ],
      "choice": {
        "prompt": "¿Qué hace Mona?",
        "options": [
          {
            "label": "Se da la vuelta, sonríe y dice: «¡Perdón! Soy Mona. Hola.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "Deja de buscar y se sube al primer taxi que ve.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/touchdown/n6-welcome.jpg",
      "segments": [
        "«¡Hola! Soy Mona», dijo, tendiéndole la mano. «Muchas gracias por esperar.» La cara del hombre se abrió en una gran sonrisa. «¡Bienvenida, Mona! Soy Marco, su conductor. Su ciudad nueva la estaba esperando.»",
        "Levantó su pesada bolsa como si no pesara nada y la llevó hacia un coche pequeño junto a la acera. Mientras conducían, las luces de la ciudad se encendían una a una — doradas y cálidas contra el cielo de la tarde.",
        "Mona miró por la ventanilla. Estaba cansada, y lejos de casa — y, ya, un poquito feliz."
      ],
      "ending": {
        "id": "warm-welcome",
        "title": "Una bienvenida cálida",
        "quality": "good",
        "wrap": "Mona llegó con el corazón abierto, y la ciudad le tendió la mano. Un comienzo cálido para una vida nueva."
      }
    },
    "end_ok": {
      "art": "en/touchdown/n7-safe.jpg",
      "segments": [
        "«Mona. Sí. Soy yo», dijo. El hombre asintió — amable, pero callado — y cogió su bolsa. «¿Viaje largo?», preguntó mientras andaban hacia el coche. «Mucho», dijo Mona. Era todo lo que le quedaba por decir.",
        "El coche se metió en las calles concurridas de la tarde, entre semáforos en rojo, luces blancas y gente por todas partes. Mona apoyó la cabeza en la ventanilla fría y cerró los ojos un momento. Estaba cansada — pero estaba a salvo."
      ],
      "ending": {
        "id": "safe-and-sound",
        "title": "Sana y salva",
        "quality": "ok",
        "wrap": "Mañana, pensó, saludaré como es debido. Mañana seré valiente. No fue un comienzo perfecto — pero llegó, de una pieza."
      }
    },
    "end_lesser": {
      "art": "en/touchdown/n8-detour.jpg",
      "segments": [
        "Mona dejó de buscar — simplemente estaba demasiado cansada. Vio una fila de taxis y se subió al primero de todos. «¿Adónde va?», preguntó el conductor. Leyó su nueva dirección. Detrás de ella, el hombre del cartel de MONA la vio marcharse, desconcertado.",
        "El taxi tomó el camino más largo — por calles que no conocía, pasando dos veces por delante del mismo edificio alto, mientras el taxímetro subía y subía. Cuando por fin llegó, mucho más pobre, Mona se bajó y tuvo que reírse de sí misma.",
        "«Bueno», le dijo a la calle silenciosa. «Ya estoy aquí. Por el camino más largo.»"
      ],
      "ending": {
        "id": "long-way-round",
        "title": "El camino más largo",
        "quality": "lesser",
        "wrap": "Una primera noche movida y divertida — y una historia que contará durante años. La próxima vez, buscará su nombre primero."
      }
    }
  }
}
$nodes$::jsonb, 101, false, false, NULL
FROM public.levels l WHERE l.id = 'A1'
ON CONFLICT (course, slug) DO NOTHING;

-- es 102: El primer café (A1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'the-first-coffee', 'El primer café', '[]'::jsonb, true, $nodes$
{
  "start": "flat",
  "map": {
    "flat": {
      "art": "en/the-first-coffee/n1-flat.jpg",
      "segments": [
        "La primera mañana de Mona en el piso nuevo fue muy silenciosa. Demasiado silenciosa. Las habitaciones estaban vacías, y no tenía café, ni leche, ni nada de nada.",
        "Pero estaba despierta, y tenía curiosidad. «Hoy», le dijo a la cocina vacía, «voy a salir, y voy a hablar.» Se puso su rebeca color mostaza, respiró hondo, y abrió la puerta a su calle nueva."
      ],
      "next": "cafe"
    },
    "cafe": {
      "art": "en/the-first-coffee/n2-cafe.jpg",
      "segments": [
        "La calle estaba llena de una luz suave de la mañana. La gente paseaba a sus perros. Un autobús resopló y paró. En la esquina, Mona encontró una pequeña cafetería con ventanas amarillas y cálidas.",
        "Dentro olía a café y a pan recién hecho. Detrás del mostrador, un chico joven con un delantal verde y el pelo rizado levantó la vista. Tenía una sonrisa grande y fácil. «¡Buenos días!», dijo. «¿Qué te pongo?»"
      ],
      "next": "order"
    },
    "order": {
      "art": "en/the-first-coffee/n3-counter.jpg",
      "segments": [
        "El corazón de Mona latía deprisa. Era su primera conversación de verdad en la ciudad nueva. Miró el menú de la pizarra — cuántas palabras. Podía hacerlo. El camarero esperaba, amable y paciente."
      ],
      "choice": {
        "prompt": "¿Cómo pide Mona?",
        "options": [
          {
            "label": "«Un café pequeño, por favor. …Y — ¡buenos días!»",
            "goto": "a_talk",
            "clue": true
          },
          {
            "label": "Señala la pizarra con el dedo: «Este.»",
            "goto": "b_talk",
            "clue": false
          },
          {
            "label": "«Café pequeño por favor gracias perdón.»",
            "goto": "b_talk",
            "clue": false
          }
        ]
      }
    },
    "a_talk": {
      "art": "en/the-first-coffee/n4-smalltalk.jpg",
      "segments": [
        "«Enseguida», dijo. «Por cierto, soy Leo.» Escribió algo en un vaso. «Eres nueva por aquí, ¿no? Conozco todas las caras de siempre.» Mona sonrió. Era amable. Quizá podía hacer un amigo el primer día."
      ],
      "choice": {
        "prompt": "Leo pregunta: «Entonces, ¿qué te trae por aquí?»",
        "options": [
          {
            "label": "«Acabo de llegar por un trabajo nuevo. Todo es nuevo — ¡hasta el café!»",
            "goto": "a_cup",
            "clue": true
          },
          {
            "label": "«El trabajo.»",
            "goto": "a_cup",
            "clue": false
          }
        ]
      }
    },
    "a_cup": {
      "art": "en/the-first-coffee/n5-cup.jpg",
      "segments": [
        "Leo se rió. «Un movimiento valiente. Bienvenida.» Deslizó un vaso caliente por el mostrador. En el lado había escrito un nombre — pero no del todo el suyo. Decía MOANA. Sonrió. «¿Casi acierto?»"
      ],
      "choice": {
        "prompt": "¿Qué dice Mona sobre el nombre?",
        "options": [
          {
            "label": "«¡Ja! Mona, en realidad — pero Moana también me gusta.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "«Es Mona.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_talk": {
      "art": "en/the-first-coffee/n4-smalltalk.jpg",
      "segments": [
        "Hizo el café sin muchas palabras. La máquina silbaba y echaba vapor. Mona se quedó allí en silencio, sin saber muy bien qué decir, y el silencio se hizo largo. Escribió algo en el vaso y levantó la vista con una sonrisa amable pero insegura."
      ],
      "choice": {
        "prompt": "Él pregunta: «¿Todo bien?»",
        "options": [
          {
            "label": "«Sí — perdón. Hoy mi español está un poco tímido.»",
            "goto": "b_cup",
            "clue": true
          },
          {
            "label": "Solo asiente y mira el móvil.",
            "goto": "b_cup",
            "clue": false
          }
        ]
      }
    },
    "b_cup": {
      "art": "en/the-first-coffee/n5-cup.jpg",
      "segments": [
        "Asintió y le pasó el vaso. En el lado había adivinado un nombre — NONA. No preguntó; ya se giraba hacia el siguiente cliente."
      ],
      "choice": {
        "prompt": "¿Qué hace Mona?",
        "options": [
          {
            "label": "«Oh — ¡es Mona! Gracias de todas formas.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "Coge el vaso con el nombre equivocado y se gira en silencio.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-first-coffee/n6-friends.jpg",
      "segments": [
        "«Mona», repitió Leo, y corrigió el vaso con una pequeña sonrisa. «Ahora me acordaré. El primer café lo invito yo — bienvenida al barrio.» Hablaron un minuto más, de la ciudad, de la mejor panadería, del tiempo lluvioso.",
        "Cuando Mona se fue, Leo le dijo: «¡Hasta mañana, Mona!» — y supo que volvería. Salió a la mañana con un vaso caliente en las manos y un sentimiento pequeño y luminoso en el pecho."
      ],
      "ending": {
        "id": "a-friend-on-day-one",
        "title": "Un amigo el primer día",
        "quality": "good",
        "wrap": "Un café, una palabra amable, un amigo nuevo. La ciudad pareció un poco más pequeña — en el buen sentido."
      }
    },
    "end_ok": {
      "art": "en/the-first-coffee/n7-window.jpg",
      "segments": [
        "Mona se llevó su café a una mesa pequeña junto a la ventana y se sentó. Era un buen café — caliente y fuerte. Fuera, su ciudad nueva seguía con su mañana ajetreada.",
        "Repetía las palabras en su cabeza: la próxima vez diré más. La próxima vez le preguntaré su nombre. Fue un comienzo tranquilo — pero fue un comienzo, y el café estaba caliente."
      ],
      "ending": {
        "id": "a-quiet-cup",
        "title": "Un café tranquilo",
        "quality": "ok",
        "wrap": "No todas las charlas despegan al primer intento. Pero salió, habló, y mañana será más valiente."
      }
    },
    "end_lesser": {
      "art": "en/the-first-coffee/n8-street.jpg",
      "segments": [
        "Mona salió con un vaso que decía NONA, sintiéndose un poco tonta. A mitad de la calle, un hombre la paró. «¡Nona! ¡Cuánto tiempo!» La abrazó como a una vieja amiga.",
        "«No soy… Nona», dijo Mona, riéndose, confundida. «¡Oh! Perdona — el vaso…» Se rieron los dos. Una primera mañana rara y divertida. «Bienvenida a la ciudad», dijo, y siguió su camino."
      ],
      "ending": {
        "id": "mistaken-nona",
        "title": "Confundida con Nona",
        "quality": "lesser",
        "wrap": "Un nombre equivocado y el abrazo de un desconocido — un comienzo tonto, pero una historia. Mañana dirá su nombre alto y claro."
      }
    }
  }
}
$nodes$::jsonb, 102, false, false, NULL
FROM public.levels l WHERE l.id = 'A1'
ON CONFLICT (course, slug) DO NOTHING;

-- es 103: Las llaves de la casa nueva (A1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'keys-to-the-new-place', 'Las llaves de la casa nueva', '[]'::jsonb, true, $nodes$
{
  "start": "building",
  "map": {
    "building": {
      "art": "en/keys-to-the-new-place/n1-building.jpg",
      "segments": [
        "El edificio era viejo y alto, con ladrillos rojos y ventanas altas. Número 14. Era aquí — su casa nueva. Mona estaba de pie en el escalón con su única maleta y una caja de platos.",
        "Tenía el estómago revuelto. No conocía la ciudad, ni la calle, ni al hombre que tenía las llaves. «Sé valiente», se dijo, y llamó al timbre."
      ],
      "next": "alder"
    },
    "alder": {
      "art": "en/keys-to-the-new-place/n2-alder.jpg",
      "segments": [
        "La puerta se abrió. Un hombre mayor estaba allí, con el pelo gris, una gorra plana y unas gafas pequeñas con una cadenita. «Usted debe de ser Mona», dijo. Su voz era lenta y amable. «Soy el señor Alder. Me encargo del número 14.»",
        "Tendió la mano. Detrás de él, un pasillo cálido esperaba."
      ],
      "choice": {
        "prompt": "¿Cómo lo saluda Mona?",
        "options": [
          {
            "label": "«¡Buenos días, señor Alder! Muchas gracias. Estoy muy contenta de estar aquí.»",
            "goto": "a_tour",
            "clue": true
          },
          {
            "label": "«Hola. Sí. Mona.»",
            "goto": "b_tour",
            "clue": false
          },
          {
            "label": "«Buenos días, perdone — ¿es esta la casa correcta?»",
            "goto": "b_tour",
            "clue": false
          }
        ]
      }
    },
    "a_tour": {
      "art": "en/keys-to-the-new-place/n3-stairs.jpg",
      "segments": [
        "«Pase, pase», dijo el señor Alder, y la llevó por las escaleras, despacio y con cuidado. «Piso tres. Soleado por la mañana. El radiador hace un ruido raro, pero es una casa vieja y buena.» Abrió la puerta. El piso era pequeño y vacío — pero la luz entraba dorada por la ventana, y era suyo."
      ],
      "next": "a_window"
    },
    "a_window": {
      "art": "en/keys-to-the-new-place/n4-window.jpg",
      "segments": [
        "El señor Alder le enseñó las llaves, la calefacción, la ventana. Luego frunció el ceño. «Ah. Esta ventana», dijo. «Se atasca. No cierra del todo. Siempre digo que la voy a arreglar.» Una corriente de aire frío entraba por la rendija. Mona la notaría por la noche."
      ],
      "choice": {
        "prompt": "¿Qué dice Mona sobre la ventana?",
        "options": [
          {
            "label": "«¡No pasa nada! ¿Podría arreglarla esta semana? No me importa esperar.»",
            "goto": "a_settle",
            "clue": true
          },
          {
            "label": "«Ah. Vale. No pasa nada.»",
            "goto": "a_settle",
            "clue": false
          }
        ]
      }
    },
    "a_settle": {
      "art": "en/keys-to-the-new-place/n5-notebook.jpg",
      "segments": [
        "«Esta semana — se lo prometo», dijo el señor Alder, y lo apuntó en una libretita. «No me olvido. Bueno — no a menudo.» Sonrió. «Instálese. Llame a mi puerta si necesita algo. Siempre estoy en casa.»"
      ],
      "choice": {
        "prompt": "Cuando se va, ¿qué hace Mona?",
        "options": [
          {
            "label": "«Gracias. ¿Le apetecería tomar un té un día de estos? Todavía no conozco a nadie aquí.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "«Gracias. Adiós.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_tour": {
      "art": "en/keys-to-the-new-place/n3-stairs.jpg",
      "segments": [
        "«Bien. Por aquí», dijo el señor Alder, y la llevó arriba sin muchas palabras. Abrió la puerta del piso tres — pequeño, vacío, luz dorada en la ventana. «Aquí lo tiene.» Mona asintió. Quería decir algo cálido, pero las palabras se le quedaban atascadas."
      ],
      "next": "b_window"
    },
    "b_window": {
      "art": "en/keys-to-the-new-place/n4-window.jpg",
      "segments": [
        "Le enseñó las llaves y la calefacción, luego señaló la ventana. «Se atasca un poco. No cierra del todo.» Una corriente de aire frío se colaba por la rendija. Esperó, como si ella fuera a decir algo."
      ],
      "choice": {
        "prompt": "¿Qué hace Mona con la ventana?",
        "options": [
          {
            "label": "«Oh — ¿podría arreglarla, por favor? Hace un poco de frío.»",
            "goto": "b_keys",
            "clue": true
          },
          {
            "label": "Solo asiente y no dice nada.",
            "goto": "b_keys",
            "clue": false
          }
        ]
      }
    },
    "b_keys": {
      "art": "en/keys-to-the-new-place/n5-notebook.jpg",
      "segments": [
        "«Hm», dijo el señor Alder, y no apuntó nada. «Veré qué puedo hacer.» Le dio dos llaves grandes y viejas en una anilla. «Puerta de la calle y piso. No las pierda — solo tengo una copia.» Luego bajó las escaleras, y el edificio se quedó en silencio."
      ],
      "choice": {
        "prompt": "Sola con sus llaves nuevas, Mona…",
        "options": [
          {
            "label": "baja corriendo para decir: «Señor Alder — gracias. De verdad.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "sale corriendo a por un café, con las llaves balanceándose en la mano.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/keys-to-the-new-place/n6-tea.jpg",
      "segments": [
        "La cara del señor Alder se iluminó. «¿Té? Bueno, al té nunca le digo que no.» Se tocó la gorra. «El jueves, entonces. Traeré galletas.» Esa tarde, la ventana ya estaba arreglada — y una pequeña nota descansaba en el alféizar: «Bienvenida a casa. — A.»",
        "Mona se quedó de pie en su pequeña habitación dorada y sonrió. Tenía una casa, un vecino amable, y un té que esperar con ganas. La ciudad ya no parecía tan grande."
      ],
      "ending": {
        "id": "tea-on-thursday",
        "title": "Té el jueves",
        "quality": "good",
        "wrap": "Mona no solo consiguió un piso — consiguió un vecino."
      }
    },
    "end_ok": {
      "art": "en/keys-to-the-new-place/n7-plates.jpg",
      "segments": [
        "«Adiós, señor Alder. Gracias», dijo Mona, y él asintió y bajó las escaleras. Cerró la puerta y se quedó sola en el piso silencioso. La luz dorada era preciosa. La corriente de aire frío, no.",
        "Desempaquetó sus platos, uno a uno, y se dijo: aprenderé bien su nombre, diré más la próxima vez. Fue un comienzo pequeño, educado, correcto — en una casa que era, de verdad, suya."
      ],
      "ending": {
        "id": "a-home-of-her-own",
        "title": "Una casa propia",
        "quality": "ok",
        "wrap": "Una casa propia y un casero bastante amable — lo demás lo irá calentando con el tiempo."
      }
    },
    "end_lesser": {
      "art": "en/keys-to-the-new-place/n8-lockedout.jpg",
      "segments": [
        "Mona salió deprisa a por un café, con las llaves grandes balanceándose en la mano — y la pesada puerta de la calle se cerró detrás de ella. Clac. Empujó. Cerrada. Llave equivocada. La otra llave — equivocada también.",
        "Estaba fuera de su casa nueva, el primer día, encerrada fuera, sin un número para llamar al señor Alder. Se sentó en el escalón y se rió al cielo. «Día uno», dijo. «Menudo comienzo triunfal.» Entonces una voz lenta y amable: «¿Ya perdida?» — el señor Alder, con la copia y una pequeña sonrisa."
      ],
      "ending": {
        "id": "locked-out",
        "title": "Encerrada fuera",
        "quality": "lesser",
        "wrap": "Rescatada por el mismo vecino al que había pasado corriendo. Mañana irá más despacio."
      }
    }
  }
}
$nodes$::jsonb, 103, false, false, NULL
FROM public.levels l WHERE l.id = 'A1'
ON CONFLICT (course, slug) DO NOTHING;

-- es 104: Día de mercado (A2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'market-day', 'Día de mercado', '[]'::jsonb, true, $nodes$
{
  "start": "the_empty_kitchen",
  "map": {
    "the_empty_kitchen": {
      "art": "en/market-day/n1-kitchen.jpg",
      "segments": [
        "A su tercer día, la cocina de Mona seguía casi vacía — una taza, un plato, y medio limón muy triste en la nevera. Hizo una lista en un trozo de papel: pan, huevos, fruta, verduras, algo rico.",
        "«El mercado», le había dicho Leo. «El sábado por la mañana. Ve pronto, y ve con hambre.» Así que se puso el abrigo y salió."
      ],
      "next": "the_market"
    },
    "the_market": {
      "art": "en/market-day/n2-market.jpg",
      "segments": [
        "El mercado estaba lleno de vida. Largas filas de puestos se extendían por la calle bajo toldos de rayas y colores. Había montañas de naranjas, montones de judías verdes, quesos tan grandes como ruedas, y flores de todos los colores.",
        "Los vendedores cantaban sus precios. Los clientes se empujaban, se reían y llenaban sus bolsas. Mona se quedó a un lado, con su pequeña lista en la mano, y sonrió. ¿Por dónde empezar?"
      ],
      "next": "the_fruit_stall"
    },
    "the_fruit_stall": {
      "art": "en/market-day/n3-stall.jpg",
      "segments": [
        "Se paró en un puesto de fruta, donde una mujer rellenita de mejillas coloradas levantaba manzanas en una pirámide perfecta. «¡Buenos días, guapa!», dijo la mujer. «¿Qué te pongo?»",
        "Mona miró la fruta tan bonita. Su lista solo decía «fruta» — pero ¿cuál? ¿cuánta? Respiró hondo."
      ],
      "choice": {
        "prompt": "¿Cómo pregunta Mona?",
        "options": [
          {
            "label": "«¡Buenos días! ¿Me pone seis manzanas, por favor? ¿Y las peras están dulces?»",
            "goto": "a_a_taste",
            "clue": true
          },
          {
            "label": "«Manzanas. Esas.»",
            "goto": "b_just_apples",
            "clue": false
          },
          {
            "label": "«Eh… ¿fruta? No sé. Perdón.»",
            "goto": "b_just_apples",
            "clue": false
          }
        ]
      }
    },
    "a_a_taste": {
      "art": "en/market-day/n4-taste.jpg",
      "segments": [
        "«¿Dulces? Mis peras son las más dulces de la ciudad», se rió la mujer. «Prueba una.» Cortó una rodaja y se la dio. Estaba tierna y dulce como la miel. «Oh — qué rica», dijo Mona. «Me llevo unas cuantas.» La mujer pesó la fruta y metió una pera de más. «Para una cara nueva», le guiñó un ojo. «Eres nueva, ¿verdad?»"
      ],
      "choice": {
        "prompt": "Le pregunta de dónde es Mona.",
        "options": [
          {
            "label": "«¡Sí! Me mudé la semana pasada. Todo es nuevo — hasta las manzanas parecen más contentas aquí.»",
            "goto": "a_paying",
            "clue": true
          },
          {
            "label": "«Sí. Nueva.»",
            "goto": "a_paying",
            "clue": false
          }
        ]
      }
    },
    "a_paying": {
      "art": "en/market-day/n5-coins.jpg",
      "segments": [
        "La mujer le contó a Mona todo sobre el mercado — el mejor puesto de queso, el hombre del pan caliente, la florista que hace descuentos los sábados. «Son doce, guapa», dijo por fin. Mona abrió el monedero. Tenía billetes, pero las monedas todavía le resultaban raras — grandes, pequeñas, doradas y plateadas."
      ],
      "choice": {
        "prompt": "¿Qué hace Mona con el dinero?",
        "options": [
          {
            "label": "«Todavía estoy aprendiendo las monedas — ¿está bien así?» Las tiende con una sonrisa.",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "Simplemente da un billete grande y coge el cambio.",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_just_apples": {
      "art": "en/market-day/n4-taste.jpg",
      "segments": [
        "La mujer metió seis manzanas en una bolsa sin decir nada más. «¿Algo más?» Mona miró su lista — peras, verduras, pan — pero las palabras le pesaban en la boca. Señaló las peras con el dedo. «¿Cuántas?», preguntó la mujer. Mona no sabía muy bien qué decir."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«Cuatro, por favor. Y — ¿están dulces?»",
            "goto": "b_the_strange_coins",
            "clue": true
          },
          {
            "label": "«No. Solo las manzanas.»",
            "goto": "b_the_strange_coins",
            "clue": false
          }
        ]
      }
    },
    "b_the_strange_coins": {
      "art": "en/market-day/n5-coins.jpg",
      "segments": [
        "La mujer pesó las manzanas y dijo el precio. Mona buscó el monedero — pero las monedas parecían todas iguales, grandes y pequeñas, doradas y plateadas. Había gente esperando detrás de ella. Notó que se le calentaba la cara. Tenía que pagar, y rápido."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«Perdón — todavía estoy aprendiendo el dinero. ¿Me podría ayudar?»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "empuja un billete grande y se va deprisa antes del cambio.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/market-day/n6-friends.jpg",
      "segments": [
        "«Perfecto», dijo la mujer, cogiendo las monedas justas de la mano de Mona. «Aprendes rápido.» Metió una manzana más en la bolsa. «Vuelve el sábado que viene — te enseño los puestos buenos.»",
        "Mona volvió a casa con las bolsas pesadas y el corazón ligero. Un hombre le regaló una flor. El pan todavía estaba caliente. Ya conocía a tres vendedores por su nombre — y tenía un motivo para volver."
      ],
      "ending": {
        "id": "market-full-of-friends",
        "title": "Un mercado lleno de amigos",
        "quality": "good",
        "wrap": "Una cesta llena y un mercado de caras amables. Mona empieza a tener su sitio aquí."
      }
    },
    "end_ok": {
      "art": "en/market-day/n7-dinner.jpg",
      "segments": [
        "La mujer le contó el cambio en la mano, moneda a moneda. «Aquí tienes, guapa.» Mona le dio las gracias y siguió, comprando pan, huevos y unas verduras algo mustias — señalando más que hablando.",
        "Al final, las bolsas estaban llenas y los pies doloridos. En casa, cocinó su primera cena de verdad en el piso nuevo. No era nada del otro mundo, pero era suya, y estaba caliente."
      ],
      "ending": {
        "id": "full-basket",
        "title": "Una cesta llena",
        "quality": "ok",
        "wrap": "Todo lo de la lista — y un poco más valiente en cada puesto. El sábado que viene hablará más."
      }
    },
    "end_lesser": {
      "art": "en/market-day/n8-apples.jpg",
      "segments": [
        "Mona se alejó deprisa, con el cambio olvidado y la bolsa más pesada de lo que debía. Solo en casa miró dentro: no seis manzanas, sino seis kilos. Una torre de manzanas rodó por su pequeña encimera — había señalado la caja grande, no la pequeña.",
        "Se quedó de pie en su cocina y se rió. «Tarta de manzana. Sopa de manzana. Manzana para todo.» Esa noche llamó a la puerta del señor Alder con una bolsa de manzanas y una historia que contar."
      ],
      "ending": {
        "id": "six-kilos-of-apples",
        "title": "Seis kilos de manzanas",
        "quality": "lesser",
        "wrap": "Seis kilos de manzanas y un vecino con quien compartirlas. Algunos errores vienen con tarta."
      }
    }
  }
}
$nodes$::jsonb, 104, false, false, NULL
FROM public.levels l WHERE l.id = 'A2'
ON CONFLICT (course, slug) DO NOTHING;

-- es 105: El tren equivocado (A2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'the-wrong-train', 'El tren equivocado', '[]'::jsonb, true, $nodes$
{
  "start": "monday_morning",
  "map": {
    "monday_morning": {
      "art": "en/the-wrong-train/n1-platform.jpg",
      "segments": [
        "Lunes por la mañana: el primer día de Mona en el trabajo nuevo. Había planchado la camisa dos veces y había salido del piso una hora antes. «Coge la línea azul hasta Parque Verde», había escrito Priya. «Diez paradas. Fácil.» Mona lo repetía como una canción: línea azul, Parque Verde, diez paradas.",
        "La estación era un río de gente, todos con prisa, todos sabiendo exactamente adónde ir. Mona apretaba su billete y seguía los carteles azules."
      ],
      "next": "three_stops_wrong"
    },
    "three_stops_wrong": {
      "art": "en/the-wrong-train/n2-realize.jpg",
      "segments": [
        "El tren iba caliente y lleno. Mona encontró un rincón y miró pasar las estaciones. Una. Dos. Tres. Pero los nombres parecían equivocados — Ribera, Mercado Viejo, Puerta Norte. No Parque Verde.",
        "Se le encogió el estómago. Un plano en la pared mostraba una maraña de líneas de colores. Iba en la línea VERDE, no la azul, y en sentido contrario. Y su primer día empezaba en veinte minutos."
      ],
      "next": "who_to_ask"
    },
    "who_to_ask": {
      "art": "en/the-wrong-train/n3-ask.jpg",
      "segments": [
        "Mona miró a su alrededor en el vagón: un estudiante con auriculares, un hombre cansado con un periódico, y una mujer más o menos de su edad, con un café en la mano y una cara amable. El corazón le latía deprisa. Tenía que preguntar — tenía que hablar. La siguiente estación se acercaba."
      ],
      "choice": {
        "prompt": "¿Cómo pide ayuda Mona?",
        "options": [
          {
            "label": "A la mujer: «Perdone — siento molestarla. ¿Esta es la dirección de Parque Verde?»",
            "goto": "a_cross_the_bridge",
            "clue": true
          },
          {
            "label": "«¿Parque Verde? ¿Parque Verde? ¿Dónde?» — a todo el vagón.",
            "goto": "b_alone_on_the_platform",
            "clue": false
          },
          {
            "label": "Lo susurra, y la mujer no la oye.",
            "goto": "b_alone_on_the_platform",
            "clue": false
          }
        ]
      }
    },
    "a_cross_the_bridge": {
      "art": "en/the-wrong-train/n4-bridge.jpg",
      "segments": [
        "La mujer sonrió. «Ay, va en sentido contrario — esta es la línea verde. Pero no se preocupe: bájese en la próxima parada, cruce el puente, coja la línea azul de vuelta. Cinco paradas. Llega de sobra.» «El puente, línea azul, cinco paradas», repitió Mona. «Muchas gracias.» Las puertas se abrieron. «¡Por ahí — rápido!»"
      ],
      "choice": {
        "prompt": "En el andén lleno, Mona…",
        "options": [
          {
            "label": "«Perdone — ¿qué puente? ¿El de la izquierda?» (se asegura)",
            "goto": "a_almost_there",
            "clue": true
          },
          {
            "label": "simplemente corre hacia donde la mujer ha señalado.",
            "goto": "a_almost_there",
            "clue": false
          }
        ]
      }
    },
    "a_almost_there": {
      "art": "en/the-wrong-train/n5-run.jpg",
      "segments": [
        "Mona cruzó el puente, bajó las escaleras corriendo, y llegó a la línea azul justo cuando entraba un tren. PARQUE VERDE — cinco paradas. Se coló dentro, sin aliento. Justo, pero posible. Tres paradas, cuatro — y le vibró el móvil: Priya. «¿Todo listo para hoy?»"
      ],
      "choice": {
        "prompt": "¿Qué responde Mona?",
        "options": [
          {
            "label": "«¡Ya casi llego! He dado un pequeño rodeo — te lo cuento. Cinco minutos.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "«Sí, todo bien. Estoy de camino.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_alone_on_the_platform": {
      "art": "en/the-wrong-train/n9-alone.jpg",
      "segments": [
        "Unas cuantas personas levantaron la vista, y luego la apartaron. El estudiante se encogió de hombros. El hombre cansado pasó una página. La cara de Mona ardió. Por fin, la mujer del café se inclinó — «Parque Verde es la línea azul, va usted en la verde» — lo dijo deprisa justo cuando se abrían las puertas, y desapareció entre la gente. Mona se quedó en un andén desconocido, sola, con flechas en todas las direcciones."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "para a un vigilante de la estación: «Por favor — ¿por dónde se va a la línea azul?»",
            "goto": "b_running_late",
            "clue": true
          },
          {
            "label": "elige un túnel y cruza los dedos.",
            "goto": "b_running_late",
            "clue": false
          }
        ]
      }
    },
    "b_running_late": {
      "art": "en/the-wrong-train/n5-run.jpg",
      "segments": [
        "Después de dos giros equivocados y un túnel largo, Mona por fin encontró la línea azul. Llegó un tren — PARQUE VERDE. Saltó dentro, sin aliento, y miró pasar las paradas despacio. El reloj no era amable. Tarde — un poco, o mucho, no sabía. Le vibró el móvil: Priya. «¿Todo listo para hoy?»"
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "responde: «Llego unos minutos tarde — ¡tren equivocado! Lo siento mucho. Ya casi estoy.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "guarda el móvil y se pone a correr sin más.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-wrong-train/n6-office.jpg",
      "segments": [
        "Mona cruzó las puertas de la oficina con dos minutos de sobra, las mejillas rosadas, el corazón todavía acelerado. Priya la esperaba con dos cafés. «¿Un rodeo, decías?» Mona le contó la historia — la línea verde, la mujer amable, el puente — y Priya se rió a carcajadas.",
        "«Le preguntaste a una desconocida y encontraste el camino el primer día. Eres justo el tipo de persona que contratamos.» Mona se sentó en su mesa nueva, un poco orgullosa. Se había perdido, y había encontrado el camino — atreviéndose a hablar."
      ],
      "ending": {
        "id": "just-in-time",
        "title": "Justo a tiempo",
        "quality": "good",
        "wrap": "Perdida en el tren equivocado, pero lo bastante valiente para preguntar — y llegó con una historia y una sonrisa."
      }
    },
    "end_ok": {
      "art": "en/the-wrong-train/n7-late.jpg",
      "segments": [
        "Mona llegó siete minutos tarde, sin aliento, pidiendo perdón antes incluso de cruzar la puerta. «No pasa nada», dijo Priya con amabilidad. «Los trenes son difíciles al principio. Me avisaste, y viniste — eso es lo que importa.» Le dio un café a Mona.",
        "Su primera mañana no fue perfecta. Pero había cruzado toda una ciudad desconocida, sola, y había llegado al sitio correcto. Mañana saldría aún más pronto."
      ],
      "ending": {
        "id": "seven-minutes-late",
        "title": "Siete minutos tarde",
        "quality": "ok",
        "wrap": "Unos minutos tarde, pero sincera y presente. El plano de la ciudad empieza poco a poco a tener sentido."
      }
    },
    "end_lesser": {
      "art": "en/the-wrong-train/n8-pool.jpg",
      "segments": [
        "Mona salió corriendo de la estación, giró a la izquierda, corrió tres calles, y se encontró… en una piscina. No una oficina — una piscina. Había leído la salida equivocada. Para cuando encontró el edificio de verdad, llegaba quince minutos tarde, con los zapatos mojados por un charco y una hoja en el pelo.",
        "Priya levantó la vista, miró la hoja, e intentó con todas sus fuerzas no sonreír. «¿Viaje difícil?» «No te haces una idea», dijo Mona. En la comida, la historia de la hoja en el pelo hizo reír a todo el equipo — y, de alguna manera, la convirtió en una de ellos."
      ],
      "ending": {
        "id": "swimming-pool",
        "title": "La piscina",
        "quality": "lesser",
        "wrap": "Una piscina, un zapato mojado y una hoja en el pelo — un primer día horrible y maravilloso que nunca olvidará."
      }
    }
  }
}
$nodes$::jsonb, 105, false, false, NULL
FROM public.levels l WHERE l.id = 'A2'
ON CONFLICT (course, slug) DO NOTHING;

-- es 106: Cena con amigos nuevos (A2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'dinner-with-new-friends', 'Cena con amigos nuevos', '[]'::jsonb, true, $nodes$
{
  "start": "outside_the_restaurant",
  "map": {
    "outside_the_restaurant": {
      "art": "en/dinner-with-new-friends/n1-outside.jpg",
      "segments": [
        "Leo la había invitado. «Unos cuantos cenamos juntos los viernes», había dicho por encima del mostrador. «Nada especial. Deberías venir.» Mona había dicho que sí antes de que le diera tiempo a ponerse tímida. Ahora, de pie delante del pequeño restaurante, se sentía muy tímida, precisamente.",
        "Por la ventana veía una mesa larga, velas, caras risueñas que no conocía. Se alisó la rebeca, se dijo «sé valiente», y empujó la puerta."
      ],
      "next": "the_table"
    },
    "the_table": {
      "art": "en/dinner-with-new-friends/n2-table.jpg",
      "segments": [
        "«¡Mona! ¡Has venido!» Leo se levantó de un salto y le hizo señas. «Chicos, esta es Mona — es nueva en la ciudad.» Cuatro caras amables se giraron hacia ella. «¡Hola Mona!» «¡Bienvenida!» Se abrió un hueco en el banco; alguien le pasó un vaso de agua.",
        "Era acogedor, y ruidoso, y un poco abrumador. Todos esperaban, con amabilidad, a que dijera algo."
      ],
      "choice": {
        "prompt": "¿Cómo se presenta Mona?",
        "options": [
          {
            "label": "«¡Hola a todos! Gracias por invitarme. Me mudé hace dos semanas y no conozco a nadie — así que esto es una maravilla.»",
            "goto": "a_ordering",
            "clue": true
          },
          {
            "label": "«Hola. Soy Mona.»",
            "goto": "b_ordering",
            "clue": false
          },
          {
            "label": "«¡Hola! Perdonad, soy la nueva. Sed buenos conmigo.»",
            "goto": "b_ordering",
            "clue": false
          }
        ]
      }
    },
    "a_ordering": {
      "art": "en/dinner-with-new-friends/n3-order.jpg",
      "segments": [
        "«¡Dos semanas! Entonces te hace falta el tour completo», se rió una mujer que se llamaba Dalia, y la mesa se volcó con ella al instante. Pasó un camarero. «La pasta de aquí es famosa», dijo Leo, «pero pide lo que quieras.» Mona miró el menú — algunas palabras las conocía, otras no — y no quería solo copiar a los demás."
      ],
      "choice": {
        "prompt": "Mona pide…",
        "options": [
          {
            "label": "«¿Qué es esa pasta con el nombre tan raro? …Me pido eso — suena buenísimo.»",
            "goto": "a_the_question",
            "clue": true
          },
          {
            "label": "«Lo mismo que él, por favor.»",
            "goto": "a_the_question",
            "clue": false
          }
        ]
      }
    },
    "a_the_question": {
      "art": "en/dinner-with-new-friends/n4-food.jpg",
      "segments": [
        "Llegó la comida — cuencos humeantes, pan para compartir, un plato de aceitunas que iba de mano en mano. La mesa hablaba toda a la vez, feliz y ruidosa. «Entonces, Mona», dijo Dalia, «¿por qué viniste desde tan lejos? ¿A NUESTRA pequeña ciudad lluviosa?» Cinco caras se giraron hacia ella, curiosas y amables."
      ],
      "choice": {
        "prompt": "¿Cómo responde Mona?",
        "options": [
          {
            "label": "«¿Sinceramente? Quería empezar de cero — una ciudad nueva, un idioma nuevo, una yo más valiente. Da miedo. Pero esta noche hace que parezca que valió la pena.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "«Ah, ya sabes. El trabajo. Lo de siempre.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_ordering": {
      "art": "en/dinner-with-new-friends/n3-order.jpg",
      "segments": [
        "Los amigos sonrieron y volvieron a su conversación. Iba rápido — nombres, bromas, una historia sobre alguien que se llamaba Dan — y Mona no podía seguirlo todo. Apareció un camarero. «¿Y para usted?» Todos la miraron. Mona miró el menú, lleno de palabras, y notó que la mente se le quedaba en blanco."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«Perdone — ¿me da un minuto más?» y luego elige.",
            "goto": "b_a_quiet_corner_of_the_table",
            "clue": true
          },
          {
            "label": "le entra el pánico y señala: «Ese. Por favor.» (sin saber qué es)",
            "goto": "b_a_quiet_corner_of_the_table",
            "clue": false
          }
        ]
      }
    },
    "b_a_quiet_corner_of_the_table": {
      "art": "en/dinner-with-new-friends/n5-talk.jpg",
      "segments": [
        "La mesa se reía y charlaba a su alrededor. Ella sonreía y asentía, entendiendo una palabra de cada tres, con ganas de participar — pero el momento bueno se le escapaba siempre. Entonces Leo le tocó el brazo. «¿Todo bien por ahí?», preguntó en voz baja."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«Sí — ¡solo un poco perdida! Habláis todos tan rápido. Pero me alegro de haber venido.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "«Bien, bien», y sigue asintiendo a bromas que no oye.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/dinner-with-new-friends/n6-toast.jpg",
      "segments": [
        "La mesa se quedó callada un momento — y entonces Dalia levantó su copa. «Por Mona. Por una tú más valiente. Bienvenida.» Las copas tintinearon por toda la mesa.",
        "La noche se hizo larga y cálida. Le enseñaron palabrotas y chistes malos, discutieron sobre la mejor pizza, y le hicieron prometer que vendría todos los viernes. Cuando Leo la acompañó hasta la esquina, dijo: «Te dije que encajarías.» Mona miró el cielo de su ciudad nueva y, por primera vez, se sintió como en casa."
      ],
      "ending": {
        "id": "one-of-us",
        "title": "Una de nosotros",
        "quality": "good",
        "wrap": "Llegó como una desconocida y se fue con una mesa llena de amigos — y una invitación fija para los viernes."
      }
    },
    "end_ok": {
      "art": "en/dinner-with-new-friends/n7-warm.jpg",
      "segments": [
        "Mona sonrió y dejó que la conversación fluyera a su alrededor. No cazaba todos los chistes, pero se reía cuando ellos se reían, y la comida estaba buena. Al final conocía algunos nombres — Dalia, Dan, el amigo de Leo de la risa fuerte. «Hasta pronto, Mona», dijeron con cariño.",
        "Volvió a casa llena y un poco cansada. No había brillado, exactamente — pero había estado allí, en la mesa, entre gente. Y eso ya era más que el viernes pasado."
      ],
      "ending": {
        "id": "pleasant-night",
        "title": "Una noche agradable",
        "quality": "ok",
        "wrap": "Una primera cena tranquila. La próxima vez dirá más — y ellos estarán encantados de escucharla."
      }
    },
    "end_lesser": {
      "art": "en/dinner-with-new-friends/n8-eels.jpg",
      "segments": [
        "Mona asintió y sonrió hasta el final de la noche, sin entender casi nada — y se comió todo el plato misterioso, gris y tembloroso, porque parecía de mala educación no hacerlo. Solo en el taxi de vuelta Leo le mandó un mensaje: «¡Qué valiente por acabarte la anguila en gelatina! Nadie se come eso de verdad.»",
        "Mona miró el móvil, gruñó, y luego se echó a reír en el asiento de atrás del taxi. Un plato entero de anguila en gelatina, comido por pura educación. «El viernes que viene», respondió, «me pido la pasta.» Leo mandó tres caras riéndose y una sola palabra: «Trato hecho.»"
      ],
      "ending": {
        "id": "jellied-eels",
        "title": "La anguila en gelatina",
        "quality": "lesser",
        "wrap": "Una bienvenida asquerosa y divertidísima — y volverá (por la pasta)."
      }
    }
  }
}
$nodes$::jsonb, 106, false, false, NULL
FROM public.levels l WHERE l.id = 'A2'
ON CONFLICT (course, slug) DO NOTHING;

-- es 107: La entrevista (B1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'the-interview', 'La entrevista', '[]'::jsonb, true, $nodes$
{
  "start": "the_opportunity",
  "map": {
    "the_opportunity": {
      "art": "en/the-interview/n1-email.jpg",
      "segments": [
        "A los tres meses, Mona apenas empezaba a sentirse en casa — y entonces llegó el correo. Un puesto de responsabilidad, un ascenso de verdad, en un equipo que admiraba. Su primer pensamiento fue: yo no. Demasiado nueva, demasiado extranjera, demasiado nerviosa. Estuvo a punto de cerrar el correo.",
        "Pero Priya, que leía por encima de su hombro con un café, dijo sin más: «Preséntate. Estás lista, aunque todavía no lo sientas.» Así que, con el corazón en un puño, Mona lo hizo."
      ],
      "next": "the_waiting_room"
    },
    "the_waiting_room": {
      "art": "en/the-interview/n2-waiting.jpg",
      "segments": [
        "La sala de la entrevista tenía una puerta de cristal y tres sillas al otro lado de la mesa. Mona esperaba fuera, repasando sus notas, con las manos frías. A través del cristal los veía: una mujer de mirada aguda, un hombre mayor de aspecto amable, y uno más joven deslizando el dedo por una tableta.",
        "La puerta se abrió. «¿Mona? Pase.» Se levantó, se alisó la chaqueta, y se dijo la verdad: me he ganado el derecho a estar en esta sala."
      ],
      "next": "why_this_role"
    },
    "why_this_role": {
      "art": "en/the-interview/n3-opening.jpg",
      "segments": [
        "«Bueno», dijo la mujer de mirada aguda, «díganos por qué quiere este puesto.» Era la pregunta que Mona había ensayado cien veces. Pero en aquella sala cálida y silenciosa, con tres caras observándola, cada frase ingeniosa se le voló de la cabeza."
      ],
      "choice": {
        "prompt": "¿Cómo empieza Mona?",
        "options": [
          {
            "label": "«Voy a ser sincera — hace tres meses no sabía pedir un café aquí. Hoy me presento para esto. No quiero solo el puesto; quiero demostrar lo rápido que puedo crecer.»",
            "goto": "a_tell_me_about_a_failure",
            "clue": true
          },
          {
            "label": "«Soy trabajadora, sé trabajar en equipo, y estoy muy motivada.»",
            "goto": "b_everyone_says_that",
            "clue": false
          },
          {
            "label": "«¿Sinceramente? Seguramente no estoy cualificada, pero me dije que lo intentaría.»",
            "goto": "b_everyone_says_that",
            "clue": false
          }
        ]
      }
    },
    "a_tell_me_about_a_failure": {
      "art": "en/the-interview/n4-failure.jpg",
      "segments": [
        "El hombre mayor se inclinó hacia delante, interesado. «Eso tiene mérito. Pero este puesto es difícil. Hábleme de una vez en que algo salió mal — y de lo que hizo.» Mona pensó en el tren equivocado, en los seis kilos de manzanas, en cien pequeños fracasos, y eligió uno de verdad: un proyecto de su trabajo anterior que había salido mal. Lo contó con sinceridad — el error, el pánico, lo que aprendió. No fingió ser perfecta."
      ],
      "choice": {
        "prompt": "Él pregunta: «¿Y si volviera a pasar mañana?»",
        "options": [
          {
            "label": "«Lo detectaría una semana antes — porque ahora pido ayuda antes de hundirme, no después.»",
            "goto": "a_the_real_question",
            "clue": true
          },
          {
            "label": "«No volvería a pasar. No cometo dos veces el mismo error.»",
            "goto": "a_the_real_question",
            "clue": false
          }
        ]
      }
    },
    "a_the_real_question": {
      "art": "en/the-interview/n5-realquestion.jpg",
      "segments": [
        "La mujer de mirada aguda había estado callada, observando. Ahora habló. «Es evidente que es capaz. Pero también es la persona más nueva de aquí. ¿Por qué deberíamos confiarle esto?» Era la pregunta de verdad — la que estaba debajo de todas las demás. Mona la sintió llegar. Podía defenderse, o ser sincera."
      ],
      "choice": {
        "prompt": "¿Qué dice Mona?",
        "options": [
          {
            "label": "«Porque ser nueva es precisamente la razón. Yo cuestiono todo lo que ustedes han dejado de cuestionar. Trabajaré el doble, y aportaré una mirada que este equipo todavía no tiene.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "«Lo demostraré con resultados. Denme tres meses.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_everyone_says_that": {
      "art": "en/the-interview/n4-failure.jpg",
      "segments": [
        "«Trabajadora. Motivada.» La mujer de mirada aguda anotó algo sin levantar la vista. «Eso lo dice todo el mundo.» La sala pareció más fría. Mona se dio cuenta de que sus respuestas prudentes los habían aburrido; necesitaba enseñar algo de verdad. «Háblenos de un reto real», dijo el hombre mayor, dándole una segunda oportunidad."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "respira hondo — «De acuerdo. La respuesta de verdad: venir aquí sola ha sido lo más difícil que he hecho en mi vida. Esto es lo que me enseñó…»",
            "goto": "b_the_weakness_question",
            "clue": true
          },
          {
            "label": "«Bueno, hubo un proyecto complicado el año pasado…» (prudente, genérico)",
            "goto": "b_the_weakness_question",
            "clue": false
          }
        ]
      }
    },
    "b_the_weakness_question": {
      "art": "en/the-interview/n5-realquestion.jpg",
      "segments": [
        "El tribunal escuchaba, educado pero sin entusiasmarse. El reloj corría. «Última pregunta», dijo la mujer de mirada aguda. «¿Qué es una cosa de usted misma que cambiaría?» La pregunta del defecto — la trampa. Mona había leído que hay que dar un defecto falso («trabajo demasiado»). Pero esos tres lo habían oído mil veces."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«Dudo demasiado de mí misma — estuve a punto de no presentarme. Estoy aprendiendo a confiar en lo que ya sé.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "«¿Sinceramente? Es que me importa demasiado todo.»",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-interview/n6-news.jpg",
      "segments": [
        "La mujer de mirada aguda dejó el bolígrafo y, por primera vez, sonrió. «Esa», dijo, «es la mejor respuesta que hemos oído en toda la semana.» Mona salió con las piernas temblando, sin saber si había estado brillante o loca. Dos días después llegó el correo: el puesto era suyo.",
        "Priya la encontró en el pasillo y la abrazó. «Te lo dije. Lista, aunque no lo sientas.» Mona se rió, y por un momento la recién llegada aterrada del aeropuerto pareció muy lejana."
      ],
      "ending": {
        "id": "person-for-the-job",
        "title": "La persona indicada",
        "quality": "good",
        "wrap": "Entró como la nueva y salió como la persona indicada — siendo sincera en vez de prudente."
      }
    },
    "end_ok": {
      "art": "en/the-interview/n7-corridor.jpg",
      "segments": [
        "«Gracias, Mona. Ya nos pondremos en contacto», dijo el hombre mayor con amabilidad. Se fue sin saber cómo había ido. Una semana después: no lo había conseguido — pero la mujer de mirada aguda la llamó en persona. «Estuvo cerca. Muy cerca. Conserve la sinceridad, deje las respuestas prudentes, y la próxima vez será suyo.»",
        "Mona estaba decepcionada, pero no hundida. Se había sentado en aquella sala, con aquella gente, y había aguantado el tipo. Seis meses antes no habría podido imaginarlo. La próxima vez estaría lista."
      ],
      "ending": {
        "id": "close",
        "title": "Por poco",
        "quality": "ok",
        "wrap": "El puesto no — esta vez. Pero demostró que su sitio estaba en esa sala."
      }
    },
    "end_lesser": {
      "art": "en/the-interview/n8-drink.jpg",
      "segments": [
        "«Me importa demasiado todo», dijo Mona — y vio cómo las tres caras se apagaban despacio. Lo supo en el momento en que lo dijo: la respuesta prudente y falsa. El resto de la entrevista fue educado y corto. No consiguió el puesto, y sabía exactamente por qué.",
        "Esa noche, Priya la invitó a una copa. «Entraste e interpretaste a un personaje», dijo con dulzura. «La próxima vez, trae solo a Mona. Es más impresionante que el guion.» Mona se rió, un poco triste, un poco más sabia."
      ],
      "ending": {
        "id": "script",
        "title": "El guion",
        "quality": "lesser",
        "wrap": "Las respuestas ensayadas le costaron el puesto — pero le enseñaron lo más útil: la próxima vez, ser auténtica."
      }
    }
  }
}
$nodes$::jsonb, 107, false, false, NULL
FROM public.levels l WHERE l.id = 'B1'
ON CONFLICT (course, slug) DO NOTHING;

-- es 108: Pachucha (B1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'under-the-weather', 'Pachucha', '[]'::jsonb, true, $nodes$
{
  "start": "thursday",
  "map": {
    "thursday": {
      "art": "en/under-the-weather/n1-bed.jpg",
      "segments": [
        "Empezó con un dolor de garganta el martes. El jueves, Mona apenas podía levantar la cabeza de la almohada. Le dolía todo el cuerpo, le goteaba la nariz como un grifo, y una tos le raspaba en el pecho. En su idioma habría sabido decir todo esto exactamente; en español, las palabras se le escurrían.",
        "«Así no puedo trabajar», le dijo con voz ronca al piso vacío. Buscó el número del centro de salud del barrio y, con un pañuelo en la mano, pidió cita."
      ],
      "next": "the_waiting_room"
    },
    "the_waiting_room": {
      "art": "en/under-the-weather/n2-waiting.jpg",
      "segments": [
        "La sala de espera olía a gel hidroalcohólico y a revistas viejas. Mona estaba sentada entre desconocidos que tosían, repasando sus síntomas en voz baja: «Fiebre. Tos. Me duele todo.» Palabras sencillas — pero tenía miedo de olvidarlas, o de no entender la respuesta. «¿Mona?», llamó una enfermera. «El médico la atiende ahora. Consulta dos.»"
      ],
      "next": "what_s_been_going_on"
    },
    "what_s_been_going_on": {
      "art": "en/under-the-weather/n3-describe.jpg",
      "segments": [
        "El doctor Shah era más joven de lo que Mona esperaba, con una voz tranquila y unos ojos cansados pero amables. «Bueno — ¿qué le pasa?» Era el momento: tenía que explicarse con suficiente claridad para que la ayudaran, y con suficiente sinceridad para estar segura."
      ],
      "choice": {
        "prompt": "¿Cómo describe Mona sus síntomas?",
        "options": [
          {
            "label": "«Desde el martes: dolor de garganta, luego fiebre, y ahora una tos fuerte y agujetas por todo el cuerpo. Por la noche es peor.»",
            "goto": "a_the_examination",
            "clue": true
          },
          {
            "label": "«Me siento mal. Muy mal. En todas partes.»",
            "goto": "b_drawing_it_out",
            "clue": false
          },
          {
            "label": "«Creo que puede ser algo serio — lo he leído en internet — »",
            "goto": "b_drawing_it_out",
            "clue": false
          }
        ]
      }
    },
    "a_the_examination": {
      "art": "en/under-the-weather/n4-exam.jpg",
      "segments": [
        "«Eso ayuda mucho, gracias», dijo el doctor Shah, y le auscultó el pecho. «Inspire… y espire.» El estetoscopio frío la hizo tiritar. «Buena noticia — una infección vírica fea, no es el pecho. Se le pasará en una semana. Descanse, beba líquidos, y tome esto.» Escribió una receta, y luego dijo algo deprisa sobre «la farmacia de la calle mayor» y «dos veces al día, con las comidas» — y Mona solo pilló la mitad."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«Perdone — ¿podría repetir la última parte? Dos veces al día, con las comidas — ¿es así?»",
            "goto": "a_just_to_be_sure",
            "clue": true
          },
          {
            "label": "asiente y dice «Vale, gracias», aunque no está segura.",
            "goto": "a_just_to_be_sure",
            "clue": false
          }
        ]
      }
    },
    "a_just_to_be_sure": {
      "art": "en/under-the-weather/n5-instructions.jpg",
      "segments": [
        "El doctor Shah sonrió y lo repitió despacio, escribiendo «2×/día, con comida» en el papel. «Y si la fiebre no baja en tres días, o le cuesta respirar — vuelva enseguida. No espere.» «Volver si sigue la fiebre, o si respiro mal», repitió Mona. «Exacto», dijo él. «Es usted una buena paciente.»"
      ],
      "choice": {
        "prompt": "Al salir, Mona…",
        "options": [
          {
            "label": "se para en la farmacia, lee el prospecto, y le escribe a Priya: «No voy — órdenes del médico. Vuelvo el lunes.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "da las gracias a todos, pero en secreto piensa trabajar desde casa igualmente.",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_drawing_it_out": {
      "art": "en/under-the-weather/n4-exam.jpg",
      "segments": [
        "«Me duele todo» era verdad, pero no le daba mucho al médico. Él le hizo preguntas suaves — «¿Desde cuándo? ¿Fiebre? ¿Tos?» — y poco a poco le sacó la historia. Tardó más, y Mona se sintió un poco tonta, pero el doctor Shah fue paciente. «Parece un virus. Descanse, beba líquidos, y estas pastillas.» Explicó la dosis a velocidad normal, y Mona perdió el hilo a mitad de camino."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«Lo siento — mi español empeora cuando estoy enferma. ¿Podría escribirme las instrucciones?»",
            "goto": "b_a_paper_full_of_words",
            "clue": true
          },
          {
            "label": "«Vale, gracias, doctor», y coge el papel sin saber bien el plan.",
            "goto": "b_a_paper_full_of_words",
            "clue": false
          }
        ]
      }
    },
    "b_a_paper_full_of_words": {
      "art": "en/under-the-weather/n5-instructions.jpg",
      "segments": [
        "Él le dio la receta y una palmadita tranquilizadora. «Cuídese. Vuelva si no mejora la semana que viene.» Mona se fue apretando un papel cubierto de palabras médicas, sintiéndose peor que al llegar — no en el cuerpo, sino en la confianza. ¿Cuántas pastillas? ¿Cuándo? ¿Qué vigilar? No estaba segura."
      ],
      "choice": {
        "prompt": "En la farmacia, Mona…",
        "options": [
          {
            "label": "enseña el papel: «¿Me puede explicar cómo tomarlas, por favor? No lo pillé todo.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "decide que ya «lo resolverá en casa» y coge la caja.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/under-the-weather/n6-caredfor.jpg",
      "segments": [
        "Mona pasó el fin de semana envuelta en una manta, el té al alcance de la mano, las pastillas dos veces al día con las comidas, justo como decía la notita. El domingo bajó la fiebre. Priya le mandó sopa y una tarjeta graciosa. Leo le dejó limones en la puerta. El señor Alder llamó para comprobar que seguía viva, y de paso le arregló la ventana en condiciones.",
        "Tumbada en su cama calentita, cuidada por todo un pequeño mundo de amigos nuevos, Mona se dio cuenta: estaba enferma, y lejos de casa — y, sin embargo, nada sola."
      ],
      "ending": {
        "id": "looked-after",
        "title": "Bien cuidada",
        "quality": "good",
        "wrap": "Explicó con claridad, preguntó cuando no estaba segura, y dejó que la gente la ayudara. La ciudad cuida de los suyos."
      }
    },
    "end_ok": {
      "art": "en/under-the-weather/n7-desk.jpg",
      "segments": [
        "Mona se recuperó, más o menos. Se tomó las pastillas — casi todos los días, más o menos a su hora — y descansó cuando pudo, aunque coló un poco del trabajo que había prometido no hacer. La tos se alargó unos días de más por eso. «No descansaste, ¿verdad?», adivinó Priya el lunes. Mona puso cara de culpable. «La próxima vez», dijo Priya, «cuando el médico dice descanso, descansas.»",
        "Aun así, lo había hecho — un médico, una farmacia, una enfermedad, todo en un segundo idioma. No era poca cosa."
      ],
      "ending": {
        "id": "muddling-through",
        "title": "A trancas y barrancas",
        "quality": "ok",
        "wrap": "Salió del paso y se curó — y aprendió que «órdenes del médico» incluye la parte de descansar."
      }
    },
    "end_lesser": {
      "art": "en/under-the-weather/n8-fridge.jpg",
      "segments": [
        "Mona decidió que ya entendería las pastillas en casa. No las entendió. La caja decía «una, dos veces al día»; ella leyó «dos, una vez al día», y se pasó el sábado preguntándose por qué se sentía tan rara y adormilada. El domingo, preocupada, por fin llamó al centro de salud. La enfermera lo aclaró en dos minutos. «Un error fácil — pero pregunte la próxima vez. Para eso estamos.»",
        "Mona se sintió tonta, y luego agradecida. Pegó las instrucciones corregidas en la nevera, en letras grandes y claras — y por fin descansó de verdad."
      ],
      "ending": {
        "id": "mix-up",
        "title": "El malentendido",
        "quality": "lesser",
        "wrap": "Una dosis liada y un sábado de preocupación — un error inofensivo que le enseñó a preguntar siempre, siempre."
      }
    }
  }
}
$nodes$::jsonb, 108, false, false, NULL
FROM public.levels l WHERE l.id = 'B1'
ON CONFLICT (course, slug) DO NOTHING;

-- es 109: El favor (B1)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'the-favour', 'El favor', '[]'::jsonb, true, $nodes$
{
  "start": "the_tiniest_favour",
  "map": {
    "the_tiniest_favour": {
      "art": "en/the-favour/n1-phone.jpg",
      "segments": [
        "Era martes cuando llamó Dalia, hablando a toda velocidad, como siempre. «¡Mona! Ángel mío. Salvadora. Necesito el favor más pequeñito del mundo.» El «favor pequeñito», resultó, eran dos semanas cuidando de su piso al otro lado de la ciudad: su perra Galleta, sus cuarenta plantas, sus peces tropicales, y «solo un poco» de correo. A partir de mañana.",
        "«¡Ni lo vas a notar!», cantaba Dalia. Pero Mona tenía sus propias dos semanas muy ocupadas — una entrega importante, un primo de visita — y dos semanas con una perra desconocida al otro lado de la ciudad no era «pequeñito» en absoluto."
      ],
      "next": "the_squeeze"
    },
    "the_squeeze": {
      "art": "en/the-favour/n2-squeeze.jpg",
      "segments": [
        "«Eres la única persona en quien confío», siguió Dalia. «Todos los demás me han dicho que no. Eres tan amable, tan organizada — ¿porfa?» Ahí estaba: la adulación, la culpa y una puerta cerrándose, todo a la vez. Mona apreciaba a Dalia y quería ser una buena amiga. También sabía que si decía que sí, sus propias dos semanas se vendrían abajo. «¿Entonces?», dijo Dalia. «¿Mañana? Eres un sol.»"
      ],
      "choice": {
        "prompt": "¿Cómo responde Mona?",
        "options": [
          {
            "label": "«Dalia, me encanta que confíes en mí — pero dos semanas al otro lado de la ciudad es más de lo que puedo ahora mismo, con mi entrega. ¿Te ayudo mejor a buscar otra solución?»",
            "goto": "a_the_pause",
            "clue": true
          },
          {
            "label": "«Eh… vale. Supongo. Sí.»",
            "goto": "b_biscuit_the_dog",
            "clue": false
          },
          {
            "label": "«¿Quizá? Deja que lo mire y te llamo… » (y lo teme)",
            "goto": "b_biscuit_the_dog",
            "clue": false
          }
        ]
      }
    },
    "a_the_pause": {
      "art": "en/the-favour/n3-answer.jpg",
      "segments": [
        "Hubo un silencio. Por un segundo, Mona estuvo segura de haberlo estropeado todo. Luego Dalia suspiró — no enfadada, solo cansada. «Madre mía, tienes razón. Siempre hago lo mismo. Pido demasiado.» «No pides demasiado», dijo Mona con suavidad. «Pides demasiadas cosas a la vez.» Dalia se rió de verdad. «Vale. Justo. ¿Entonces qué PUEDES hacer, oh gran organizada?»"
      ],
      "choice": {
        "prompt": "Mona propone…",
        "options": [
          {
            "label": "«Puedo pasear a Galleta las tres tardes que tengo libres, y llamemos esta noche para buscar a alguien que la cuide de verdad — ahora, juntas.»",
            "goto": "a_fixed_in_twenty_minutes",
            "clue": true
          },
          {
            "label": "«Puedo regar las plantas una vez, quizá.»",
            "goto": "a_fixed_in_twenty_minutes",
            "clue": false
          }
        ]
      }
    },
    "a_fixed_in_twenty_minutes": {
      "art": "en/the-favour/n4-fix.jpg",
      "segments": [
        "Juntas, por teléfono, encontraron a alguien que cuidara a la perra a dos calles de casa de Dalia — una estudiante que adoraba los perros y necesitaba el dinero. Mona se ofreció a pasarse con premios a media semana. Problema resuelto, en veinte minutos. «Acabas de arreglarme la vida entera sin decir que sí a nada», dijo Dalia, maravillada. «Enséñame tus poderes.» «No es magia», se rió Mona. «Es solo honestidad. Y listas.»"
      ],
      "choice": {
        "prompt": "Al colgar, Dalia dice: «Te debo una.» Mona…",
        "options": [
          {
            "label": "«No me debes nada — pero puedes pagar la primera ronda el viernes.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "«Ay, no es nada, de verdad.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_biscuit_the_dog": {
      "art": "en/the-favour/n5-callback.jpg",
      "segments": [
        "«¡Eres un sol!» Dalia colgó antes de que Mona pudiera cambiar de idea. Y así, sin más, Mona tenía una perra llamada Galleta, cuarenta plantas sedientas, y un nudo de dos semanas en el estómago. La entrega se acercaba. Llegó su primo. Galleta se comió un zapato y aulló a las 3 de la madrugada. Los peces la miraban con reproche. Mona cruzaba la ciudad dos veces al día y dormía cuatro horas por noche."
      ],
      "choice": {
        "prompt": "Para aguantar, Mona…",
        "options": [
          {
            "label": "le pide a su primo de visita que la ayude con los paseos de la tarde.",
            "goto": "b_everything_perfect",
            "clue": true
          },
          {
            "label": "intenta hacerlo absolutamente todo ella sola.",
            "goto": "b_everything_perfect",
            "clue": false
          }
        ]
      }
    },
    "b_everything_perfect": {
      "art": "en/the-favour/n5-callback.jpg",
      "segments": [
        "El décimo día, funcionando a base de café y pánico, le sonó el teléfono. Dalia, desde sus vacaciones soleadas. «¿Cómo está mi bebé? ¿Todo perfecto?» Mona estaba de pie en la cocina destrozada, con un zapato mordisqueado en la mano, y tenía una elección: la verdad, o el teatro."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«¿Sinceramente? Ha sido mucho — me eché encima demasiado. Arreglemos los últimos días juntas.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "«¡Perfecto! ¡Todo perfecto!» (y sigue hundiéndose)",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-favour/n6-toast.jpg",
      "segments": [
        "Llegó el viernes, y Dalia pagó la primera ronda — y la segunda. «Por la mujer que dijo que no y aun así ayudó más que todos los que dijeron que sí.» Galleta adoraba a su estudiante; las plantas sobrevivieron; Mona entregó su trabajo, tranquila y a tiempo. Y Dalia, que había perdido amigos por pedir demasiado, había encontrado a una lo bastante sincera para conservarla.",
        "«Eres de las que valen, Mona.» En su país, Mona nunca se habría atrevido a decir que no. Aquí estaba aprendiendo que un «no» amable podía ser el principio de una amistad de verdad."
      ],
      "ending": {
        "id": "keeper",
        "title": "De las que valen",
        "quality": "good",
        "wrap": "Un «no» cálido y sincero — y un «sí» más listo — convirtieron un favor en amistad. Los límites, resulta, son una forma de cariño."
      }
    },
    "end_ok": {
      "art": "en/the-favour/n7-exhausted.jpg",
      "segments": [
        "Los últimos días, Mona y Dalia buscaron juntas a alguien que cuidara a la perra, y Mona por fin durmió. Cuando Dalia volvió — morena y feliz — se encontró su piso lleno de vida, su perra contenta, y a su amiga absolutamente agotada. «Deberías habérmelo dicho antes. Nunca habría querido esto.» «Lo sé», dijo Mona. «Todavía estoy aprendiendo a decir que no.»",
        "Había conservado la amistad y cumplido su palabra — pero casi se había dejado la piel para lograrlo."
      ],
      "ending": {
        "id": "hard-way",
        "title": "Por las malas",
        "quality": "ok",
        "wrap": "Cumplió su promesa y conservó a su amiga — pero aprendió que un «sí» que no puedes sostener no ayuda a nadie."
      }
    },
    "end_lesser": {
      "art": "en/the-favour/n8-flood.jpg",
      "segments": [
        "Mona dijo «¡perfecto!» hasta el amargo final — y estuvo muy lejos de ser perfecto. El día once, una planta que había regado de más se volcó, agrietó la pecera, y mandó una pequeña y educada inundación por el suelo de Dalia. Mona pasó su última tarde libre de rodillas con una fregona, una perra nerviosa, y tres peces en una ensaladera, riéndose sin poder parar.",
        "Cuando Dalia volvió, Mona se lo confesó todo en una larga historia sin aliento y divertidísima. Dalia se la quedó mirando — y luego soltó una carcajada. «¿Inundaste mi piso antes que admitir que estabas cansada?» «Sí», dijo Mona. «Sí, eso hice.» «Ay, Mona — la próxima vez, dímelo.»"
      ],
      "ending": {
        "id": "flood",
        "title": "La inundación",
        "quality": "lesser",
        "wrap": "Una inundación y una ensaladera de peces: fingir que estás bien no ayuda a nadie. (La próxima vez: di la verdad.)"
      }
    }
  }
}
$nodes$::jsonb, 109, false, false, NULL
FROM public.levels l WHERE l.id = 'B1'
ON CONFLICT (course, slug) DO NOTHING;

-- es 110: Cables cruzados (B2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'crossed-wires', 'Cables cruzados', '[]'::jsonb, true, $nodes$
{
  "start": "the_midnight_polish",
  "map": {
    "the_midnight_polish": {
      "art": "en/crossed-wires/n1-rework.jpg",
      "segments": [
        "Mona lo había hecho con buena intención. La presentación para el cliente era para el lunes, así que durante un domingo sin dormir lo rehízo todo — ajustó las cifras, rediseñó las diapositivas, corrigió lo que estaba segura de que eran errores. La envió a medianoche con una nota alegre: «Le he dado un repaso — ¡espero que te parezca bien!»",
        "El lunes por la mañana esperaba un gracias. En cambio, en la reunión, su jefe dijo con calidez: «Gran trabajo con esto, Mona» — y enfrente, la sonrisa de Priya se congeló medio segundo antes de volver, demasiado radiante."
      ],
      "next": "the_cold"
    },
    "the_cold": {
      "art": "en/crossed-wires/n2-frozen.jpg",
      "segments": [
        "Después de la reunión, algo había cambiado. Priya estaba educada — perfecta, cuidadosamente educada — y fue así como Mona supo que algo iba mal. La calidez fácil de tres meses había desaparecido, sustituida por respuestas secas y una puerta de despacho cerrada.",
        "Mona lo repasó todo. Los «errores» que había corregido no lo eran — eran las decisiones deliberadas de Priya. El «repaso» había borrado una semana de su trabajo, y luego habían felicitado a Mona, en público, mientras Priya no decía nada. No había ayudado. Había pasado por encima de la persona que creía en ella."
      ],
      "next": "the_closed_door"
    },
    "the_closed_door": {
      "art": "en/crossed-wires/n3-door.jpg",
      "segments": [
        "A media tarde, el silencio era insoportable. Mona podía dejar que se pasara y esperar que se diluyera — o llamar a esa puerta cerrada. Pensó en cómo se sentiría ella en el sitio de Priya. Se levantó, cruzó la oficina, y llamó."
      ],
      "choice": {
        "prompt": "¿Cómo empieza Mona la conversación?",
        "options": [
          {
            "label": "«Priya — ¿podemos hablar? Creo que me pasé con la presentación, y no quiero fingir que no he notado que todo se ha enfriado. ¿Te lo explico, y te escucho de verdad?»",
            "goto": "a_the_honest_exchange",
            "clue": true
          },
          {
            "label": "«Oye — ¿todo bien? Te noto un poco callada hoy.»",
            "goto": "b_everything_s_fine",
            "clue": false
          },
          {
            "label": "«Lo siento MUCHÍSIMO, soy lo peor, por favor no me odies — »",
            "goto": "b_everything_s_fine",
            "clue": false
          }
        ]
      }
    },
    "a_the_honest_exchange": {
      "art": "en/crossed-wires/n4-honest.jpg",
      "segments": [
        "Priya dejó el bolígrafo. Por un momento pareció que iba a decir «no pasa nada» — la mentira que cierra las conversaciones. Luego ella también eligió la sinceridad. «Reescribiste una semana de mi trabajo en una noche, lo llamaste un repaso, y te felicitaron por ello delante de nuestro jefe. No sabía si dolerme o admirarte.» Cayó fuerte, porque era verdad. Mona se obligó a quedarse con ello en vez de defenderse."
      ],
      "choice": {
        "prompt": "Mona responde:",
        "options": [
          {
            "label": "«Tienes todo el derecho a sentir las dos cosas. Creía que ayudaba — pero no pregunté, y ese es el problema. Borré tus decisiones y me llevé el mérito sin querer. Lo siento. Es culpa mía.»",
            "goto": "a_what_priya_learned_once",
            "clue": true
          },
          {
            "label": "«Lo siento, pero de verdad solo intentaba ayudar — no sabía que eran a propósito.»",
            "goto": "a_what_priya_learned_once",
            "clue": false
          }
        ]
      }
    },
    "a_what_priya_learned_once": {
      "art": "en/crossed-wires/n5-lift.jpg",
      "segments": [
        "«Gracias por decir eso», dijo Priya, y parte del hielo se derritió. «No creo que fueras malintencionada. Creo que tienes hambre y talento, y que todavía no has aprendido dónde están los límites. Cuando yo era nueva, hice algo parecido — alguien me sentó, exactamente así.» «¿Qué te dijeron?», preguntó Mona. Priya lo pensó. «Que la forma más rápida de perder a un equipo es hacer que se sienta invisible. Y la forma más rápida de ganártelo es asegurarte de que cada uno reciba el mérito que se ha ganado.»"
      ],
      "choice": {
        "prompt": "¿Qué hace Mona a continuación?",
        "options": [
          {
            "label": "«Entonces déjame arreglar la parte visible. Le escribiré al equipo y al jefe que la base sólida de esa presentación era tuya — porque lo era. Y nada tuyo vuelve a salir sin que lo hablemos antes.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "«Tendré más cuidado la próxima vez, te lo prometo. No volverá a pasar.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_everything_s_fine": {
      "art": "en/crossed-wires/n4-honest.jpg",
      "segments": [
        "«No pasa nada», dijo Priya, con la voz que significa que sí pasa, y se volvió hacia su pantalla. La puerta estaba abierta, pero la conversación de verdad seguía firmemente cerrada. El trabajo reescrito, el protagonismo robado — seguía en la sala entre ellas, sin nombre y creciendo. Mona podía retirarse, o ir más hondo."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«No creo que esté bien, y creo que es culpa mía. Reescribí tu trabajo y me felicitaron por ello. ¿Podemos hablarlo de verdad?»",
            "goto": "b_three_quiet_days",
            "clue": true
          },
          {
            "label": "«Vale. Perdona por molestarte», y sale de la sala.",
            "goto": "b_three_quiet_days",
            "clue": false
          }
        ]
      }
    },
    "b_three_quiet_days": {
      "art": "en/crossed-wires/n5-lift.jpg",
      "segments": [
        "Fuera cual fuera el camino que había tomado, la conversación de verdad no había ocurrido. Durante tres días, la oficina funcionó a base de educación cuidadosa — «¿Me reenvías ese archivo?» «Claro.» Gracias como puertas que se cierran. El trabajo salía; la calidez no volvía. Un problema que no nombras no desaparece — se calla y espera. El jueves, sus caminos se cruzaron en el ascensor, Priya ya con el abrigo puesto."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "entra en el ascensor: «Priya — te debo una conversación de verdad, no tres días de 'no pasa nada'. Me pasé, me llevé un mérito que era tuyo, y he odiado cada minuto de silencio desde entonces. ¿Puedo arreglarlo?»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "«¡Buenas tardes!» — y deja que las puertas se cierren sobre el silencio.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/crossed-wires/n6-coffees.jpg",
      "segments": [
        "Mona envió el correo esa misma tarde — al equipo, al jefe — atribuyendo claramente a Priya la columna vertebral del trabajo. Le costó un poco de orgullo y lo cambió todo. Priya apareció en su mesa veinte minutos después, con dos cafés en la mano, la vieja calidez de vuelta. «No tenías por qué hacer eso.» «Sí tenía. Y quería.»",
        "Reconstruyeron la norma juntas: nada se envía sin una puesta en común de cinco minutos. El casi desastre las hizo mejores — Priya empezó a darle a Mona la clase de responsabilidad que solo le das a alguien que sabes que te va a cubrir. «Los cables cruzados», dijo Priya más tarde, «son solo dos personas a las que les importaba. Los desenredaremos más rápido la próxima vez.»"
      ],
      "ending": {
        "id": "better-than-before",
        "title": "Mejor que antes",
        "quality": "good",
        "wrap": "Lo asumió, lo reparó en público, y cambió un protagonismo robado por algo mucho mejor: confianza."
      }
    },
    "end_ok": {
      "art": "en/crossed-wires/n7-lifttalk.jpg",
      "segments": [
        "En el ascensor, Mona dijo lo suyo — tarde, pero con sinceridad — y Priya, cansada pero no antipática, escuchó. «Te lo agradezco. Ojalá lo hubieras dicho el lunes. Pero me alegro de que lo dijeras.» Con las semanas, la calidez volvió despacio, con cuidado, como un moratón que se va.",
        "Estaban bien. Muy bien, incluso. Pero Mona nunca olvidó los tres días de silencio — el precio de esperar, de confiar en que un problema se resolviera solo. «La próxima vez», se dijo, «llamo a la puerta esa misma tarde.»"
      ],
      "ending": {
        "id": "little-late",
        "title": "Un poco tarde",
        "quality": "ok",
        "wrap": "Reparado un poco tarde — la amistad sobrevive, y el silencio resulta ser la opción más cara de todas."
      }
    },
    "end_lesser": {
      "art": "en/crossed-wires/n8-leo-word.jpg",
      "segments": [
        "Mona dejó que las puertas se cerraran con un alegre «¡Buenas tardes!» — y la conversación de verdad nunca llegó. Intentó arreglarlo de lado: alabando a Priya en voz alta en las reuniones (lo cual sonaba forzado), llevándole cafés no pedidos (lo cual parecía culpa), andando de puntillas durante quince días. Priya, desconcertada por esa energía rara, se alejó aún más.",
        "Hizo falta una palabra sin rodeos de Leo, semanas después — «¿De verdad le has DICHO que lo sientes, o solo… has rondado?» — para que Mona por fin llamara, meses tarde, y dijera lo simple y verdadero. Priya la perdonó, pero la confianza fácil tardó mucho en volver. «No puedes arreglar una conversación», dijo Priya, «teniendo todas las conversaciones menos esa.»"
      ],
      "ending": {
        "id": "every-conversation-but-that-one",
        "title": "Todas las conversaciones menos esa",
        "quality": "lesser",
        "wrap": "Evitar las palabras difíciles estiró una disculpa de dos minutos a dos meses dolorosos. Di la cosa verdadera pronto."
      }
    }
  }
}
$nodes$::jsonb, 110, false, false, NULL
FROM public.levels l WHERE l.id = 'B2'
ON CONFLICT (course, slug) DO NOTHING;

-- es 111: La negociación (B2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'the-negotiation', 'La negociación', '[]'::jsonb, true, $nodes$
{
  "start": "the_letter",
  "map": {
    "the_letter": {
      "art": "en/the-negotiation/n1-letter.jpg",
      "segments": [
        "La carta era formal, escrita a máquina, y pasada por debajo de su puerta — lo cual le decía a Mona, antes incluso de leerla, que al señor Alder le había costado escribirla. Los gastos habían subido: la calefacción, el tejado, el seguro. No le quedaba más remedio que subir el alquiler, y la nueva cifra le encogió el estómago. No era cruel — pero sí más de lo que podía pagar con holgura, con todo lo demás todavía tan nuevo.",
        "Adoraba ese piso: la luz dorada de la mañana, la ventana arreglada, el anciano amable de abajo que le subía sopa cuando estaba enferma. No quería irse. Pero tampoco podía fingir que la cifra le cuadraba."
      ],
      "next": "at_his_door"
    },
    "at_his_door": {
      "art": "en/the-negotiation/n2-doorway.jpg",
      "segments": [
        "Lo encontró en el umbral de su puerta esa tarde, la gorra en la mano, con aspecto más viejo de lo normal. «Recibió la carta.» No era una pregunta. «Lo siento, Mona. Lo he ido aplazando un mes. Pero el tejado no espera.» Parecía esperar que ella se enfadara, o que le entregara el preaviso allí mismo. Y Mona lo entendió: era una negociación en la que los dos tenían miedo de perder algo — y los movimientos fáciles eran los equivocados."
      ],
      "choice": {
        "prompt": "¿Cómo empieza Mona?",
        "options": [
          {
            "label": "«No estoy enfadada — veo que para usted también es difícil. Con sinceridad: me encanta vivir aquí y quiero quedarme, pero esa cifra me aprieta de verdad ahora mismo. ¿Podemos pensarlo juntos?»",
            "goto": "a_tea_and_the_real_picture",
            "clue": true
          },
          {
            "label": "«No pasa nada. Lo entiendo. Ya… sacaré el dinero de donde sea.»",
            "goto": "b_the_standoff",
            "clue": false
          },
          {
            "label": "«Es una subida enorme. Eso no puede ser legal, sin preaviso.»",
            "goto": "b_the_standoff",
            "clue": false
          }
        ]
      }
    },
    "a_tea_and_the_real_picture": {
      "art": "en/the-negotiation/n3-tea.jpg",
      "segments": [
        "El señor Alder parpadeó, sorprendido de que lo trataran como a un socio y no como a un villano. «Juntos», repitió, y un poco de peso le abandonó los hombros. «Pase. Pongo el agua.» Con un té por delante salió el panorama de verdad: no necesitaba la subida entera de todos a la vez — necesitaba tener el tejado pagado para la primavera. Y estaba desbordado por las pequeñas reparaciones que sus rodillas ya no podían hacer. Mona, que era organizada y cuyo primo resultaba ser mañoso, empezó a ver una forma."
      ],
      "choice": {
        "prompt": "Mona propone:",
        "options": [
          {
            "label": "«¿Y si me subo en dos pasos — la mitad ahora, la mitad en primavera — y a cambio me encargo de la gestión del edificio y las reparaciones pequeñas? Se me dan bien las listas, y conozco a alguien mañoso.»",
            "goto": "a_the_handshake",
            "clue": true
          },
          {
            "label": "«¿Podría dejarme tres meses al precio antiguo, para irme adaptando?»",
            "goto": "a_the_handshake",
            "clue": false
          }
        ]
      }
    },
    "a_the_handshake": {
      "art": "en/the-negotiation/n5-handshake.jpg",
      "segments": [
        "El señor Alder dejó el té y la miró un buen rato — esta joven que había llegado seis meses antes apenas capaz de pedir un café, y ahora le resolvía los problemas en su cocina. «En cuarenta años alquilando habitaciones», dijo, «nunca nadie se ha ofrecido a ayudar en vez de discutir.» Le tendió la mano. «La mitad ahora, la mitad en primavera. Y si de verdad consigue arreglarme los grifos que gotean, lo dejamos en paz.»"
      ],
      "choice": {
        "prompt": "Se dan la mano. Luego Mona…",
        "options": [
          {
            "label": "«Pongámoslo por escrito — justo para los dos. Y gracias, señor Alder, por no limitarse a poner una cifra más alta y cruzar los dedos. Eso significa mucho.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "«¡Genial! Con un apretón de manos me basta.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_the_standoff": {
      "art": "en/the-negotiation/n9-standoff.jpg",
      "segments": [
        "La respuesta de Mona — tanto si se la había tragado como si la había afilado — cerró la puerta a la conversación fácil. La cara del señor Alder se quedó cuidadosamente neutra. Si ella había aceptado, él se sentía culpable y ella atrapada; si había amenazado, él se sentía atacado y se cerraba en banda — «He dado treinta días, todo es legal.» En cualquier caso, ahora estaban a ambos lados de una mesa, no en el mismo lado. Alguien tenía que cambiarle la forma."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "«Perdone — ¿podemos empezar otra vez? He entrado mal. No quiero ni pelear con usted ni huir. Quiero algo que nos funcione a los dos.»",
            "goto": "b_upstairs_deciding",
            "clue": true
          },
          {
            "label": "se mantiene educada pero firme en su rincón: «Lo pensaré y le digo algo.»",
            "goto": "b_upstairs_deciding",
            "clue": false
          }
        ]
      }
    },
    "b_upstairs_deciding": {
      "art": "en/the-negotiation/n10-upstairs.jpg",
      "segments": [
        "La conversación cojeó hasta un «pensémoslo los dos» que no contentaba a nadie. Mona subió de nuevo, la carta aún en la mano y un nudo en el pecho. Tenía unos días para decidir quién quería ser en todo esto: la inquilina que sufre en silencio, la que pelea y se va — o algo mejor. Esa noche oyó sus pasos lentos abajo, y el traqueteo de él intentando, en vano, arreglar un grifo él solo."
      ],
      "choice": {
        "prompt": "A la mañana siguiente, Mona…",
        "options": [
          {
            "label": "llama con dos cafés: «Lo intentamos otra vez — como es debido, esta vez. Tengo una idea.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "le pasa una nota por debajo de la puerta aceptando el alquiler entero, sin decir nada, con frialdad.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-negotiation/n6-signing.jpg",
      "segments": [
        "Lo redactaron en la mesa de la cocina — la mitad ahora, la mitad en primavera, Mona como organizadora no oficial del edificio, con su primo de guardia para los grifos. Justo, claro, firmado por ambos. Para la primavera el tejado estaba arreglado, los grifos dejaron de gotear, y los demás inquilinos empezaron a dejar paquetes con «la chica del piso tres que soluciona las cosas». El señor Alder recuperó sus jueves de té y crucigramas.",
        "«El mejor trato que he hecho nunca», le dijo una vez, «fue ese en el que nadie perdió.» Mona — antes demasiado asustada para decir una palabra en un mostrador de pasaportes — acababa de negociar su propio hogar, no ganando, sino negándose a dejar que ninguno de los dos perdiera."
      ],
      "ending": {
        "id": "nobody-lost",
        "title": "Nadie perdió",
        "quality": "good",
        "wrap": "Una negociación de verdad no consiste en vencer al otro — es encontrar la mesa donde los dos podéis sentaros. Mona la encontró, y conservó su hogar."
      }
    },
    "end_ok": {
      "art": "en/the-negotiation/n7-middle.jpg",
      "segments": [
        "La segunda conversación fue mejor que la primera. Con un café recién hecho, Mona y el señor Alder encontraron una cifra intermedia — no tan ingeniosa como una verdadera colaboración, pero justa, amable y manejable. «Podría haber llevado mejor el principio», admitió Mona. «Los dos podríamos», dijo él.",
        "Ella conservó su piso, él conservó su dignidad, y la luz dorada de la mañana siguió llegando. No un trato perfecto, pero sí honesto, alcanzado por dos personas dispuestas a intentarlo de nuevo. «La próxima vez que haya una carta», dijo él, «llame primero. Nos saltamos la parte incómoda.»"
      ],
      "ending": {
        "id": "do-over",
        "title": "Una segunda oportunidad",
        "quality": "ok",
        "wrap": "Un acuerdo justo, y una lección: cuando una negociación empieza mal, el gesto valiente es volver a empezar."
      }
    },
    "end_lesser": {
      "art": "en/the-negotiation/n8-hallway.jpg",
      "segments": [
        "Mona pasó la nota por debajo de la puerta — alquiler entero, aceptado, sin conversación. La opción segura, y la solitaria. Conservó el piso, pero algo pequeño y cálido había desaparecido. Durante semanas, el señor Alder y ella se saludaban con la cabeza en el pasillo, como desconocidos. La sopa dejó de llegar; la ventana, cuando volvió a atascarse, se quedó atascada.",
        "Solo cuando por fin llamó, meses después, con una disculpa y una olla de su propia sopa, se rompió la escarcha — y aprendió el precio real de evitar la conversación difícil: no dinero, sino la calidez de una amistad que había dejado enfriarse por ahorrarse una hora incómoda."
      ],
      "ending": {
        "id": "won-the-number-lost-the-warmth",
        "title": "Ganó la cifra, perdió la calidez",
        "quality": "lesser",
        "wrap": "Ganó la cifra y perdió la calidez. Algunas negociaciones las «ganas» pagando el precio entero — y aun así sales más pobre."
      }
    }
  }
}
$nodes$::jsonb, 111, false, false, NULL
FROM public.levels l WHERE l.id = 'B2'
ON CONFLICT (course, slug) DO NOTHING;

-- es 112: La despedida (B2)
INSERT INTO public.stories (course, level_id, slug, title, segments, branching, nodes, sort_order, needs_review, published, published_at)
SELECT 'es', l.id, 'the-goodbye', 'La despedida', '[]'::jsonb, true, $nodes$
{
  "start": "the_news",
  "map": {
    "the_news": {
      "art": "en/the-goodbye/n1-news.jpg",
      "segments": [
        "Leo se lo contó por encima del mostrador, como le había contado todo lo demás — la mejor panadería, las cenas de los viernes, todo el mapa de su nueva vida. Pero esta vez su sonrisa no era la de siempre, tan fácil. «Me voy, Mona. Me mudo al norte. Voy a abrir mi propio sitio — mi propia cafetería. Es el sueño de toda la vida, salió un local, y… » Se quedó callado, buscándole la cara.",
        "Mona se quedó muy quieta. Leo había sido su primer amigo en esta ciudad — el delantal verde, la taza con el nombre mal escrito, la amabilidad de una mañana solitaria. Había construido la mitad de su valor sobre su bienvenida fácil. Y ahora se iba."
      ],
      "next": "the_send_off"
    },
    "the_send_off": {
      "art": "en/the-goodbye/n2-sendoff.jpg",
      "segments": [
        "Le organizaron una despedida en el restaurante de los viernes — toda su cálida y ruidosa familia. Dalia lloró sobre la cesta del pan. Alguien hizo un discurso que se convirtió en brindis que se convirtió en canción. Mona rió y aplaudió con los demás, pero por debajo de todo latía un dolor callado que no acababa de saber nombrar.",
        "Al final de la noche, mientras se recogían los abrigos y se pedían los taxis, Leo le buscó la mirada e inclinó la cabeza hacia la puerta. «¿Me acompañas?» Y entonces solo estaban los dos, en la calle fría y luminosa, con todo lo no dicho entre ellos."
      ],
      "next": "any_words_for_the_road"
    },
    "any_words_for_the_road": {
      "art": "en/the-goodbye/n3-walk.jpg",
      "segments": [
        "Caminaron en silencio un rato. Mona sabía que era el momento — ese que solo tienes una vez, en el que dices lo verdadero o dejas que se escape para siempre detrás de una broma. «Bueno», dijo Leo por fin. «¿Unas palabras para el camino?» Lo dijo a la ligera, pero sus ojos no tenían nada de ligero."
      ],
      "choice": {
        "prompt": "¿Qué dice Mona?",
        "options": [
          {
            "label": "«Leo — no tienes ni idea de lo que hiciste. Llegué aquí sin nada, sin saber ni pedir un café, y tú me miraste como si perteneciera a este sitio antes de que fuera verdad. Convertiste esta ciudad en un hogar. Te voy a echar de menos más de lo que sé decir.»",
            "goto": "a_under_the_streetlight",
            "clue": true
          },
          {
            "label": "«Te voy a echar mucho de menos. Mucha suerte por el norte.»",
            "goto": "b_too_small_for_everything",
            "clue": false
          },
          {
            "label": "«¡Intenta no escribir mal el nombre de todo el mundo en el norte!»",
            "goto": "b_too_small_for_everything",
            "clue": false
          }
        ]
      }
    },
    "a_under_the_streetlight": {
      "art": "en/the-goodbye/n4-streetlight.jpg",
      "segments": [
        "Leo dejó de caminar. Bajo la farola, Mona vio que tenía los ojos húmedos. «Crees que lo hice por ti», dijo. «Mona — lo hiciste tú. Yo solo hacía el café.» Se rió, se secó la cara, y no fingió que no estaba llorando. «La chica asustada que entró aquella primera mañana, y la mujer que está aquí ahora — pude verlo suceder. ¿Sabes lo raro que es eso? ¿Ver a alguien convertirse en sí misma?» Era lo más bonito que nadie le había dicho nunca. El año entero le subió a la garganta."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "deja que lleguen las lágrimas: «Entonces déjame decirlo bien, antes de que te vayas — gracias. Por el primer café, y por todos los de después. Fuiste el principio de todo.»",
            "goto": "a_not_a_real_goodbye",
            "clue": true
          },
          {
            "label": "se ríe y lo abraza rápido: «Vale, vale, antes de que inundemos la calle — »",
            "goto": "a_not_a_real_goodbye",
            "clue": false
          }
        ]
      }
    },
    "a_not_a_real_goodbye": {
      "art": "en/the-goodbye/n5-taxi.jpg",
      "segments": [
        "Se quedaron un buen rato en la esquina, dos amigos con toda una ciudad de recuerdos entre ellos. «Esto no es una despedida de verdad», dijo Leo por fin. «Mi sitio nuevo está a un viaje en tren, y tú, precisamente tú, ya no le tienes miedo a los trenes.» Mona se rió — una risa húmeda y de verdad. «Seré tu primera clienta. Pediré alto y claro, y tú escribirás bien mi nombre.» «Mona», dijo él, como una promesa. «Siempre supe que era Mona.»"
      ],
      "choice": {
        "prompt": "Cuando llega su taxi, Mona…",
        "options": [
          {
            "label": "le mete una tarjetita en la mano: «El día de la inauguración. Ya tengo reserva. El primer café lo pago yo, esta vez.»",
            "goto": "end_good",
            "clue": true
          },
          {
            "label": "lo abraza fuerte: «Ve y sé brillante.»",
            "goto": "end_ok",
            "clue": false
          }
        ]
      }
    },
    "b_too_small_for_everything": {
      "art": "en/the-goodbye/n4-streetlight.jpg",
      "segments": [
        "«Mucha suerte por el norte», repitió Mona, y las palabras parecían demasiado pequeñas para todo lo que había detrás. Leo asintió, y algo le cruzó la cara — una pequeña decepción, escondida enseguida. Había esperado, quizá, algo más. Las cosas de verdad — lo que él había significado para ella, lo asustada que seguía estando bajo la nueva confianza, lo poco que quería que se fuera — se quedaron dobladas y apretadas dentro de ella, a salvo e inútiles. El taxi se acercaba. La ventana se cerraba."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "se corrige: «No — espera. Eso no es suficiente. Leo, fuiste mi primer amigo aquí. Necesito que sepas de verdad lo que eso significó.»",
            "goto": "b_seconds_left",
            "clue": true
          },
          {
            "label": "lo mantiene todo ligero y animado hasta el final.",
            "goto": "b_seconds_left",
            "clue": false
          }
        ]
      }
    },
    "b_seconds_left": {
      "art": "en/the-goodbye/n5-taxi.jpg",
      "segments": [
        "El taxi paró. El momento irrepetible estaba ahí, encogiéndose. Todo lo que Mona no había dicho zumbaba en el aire frío entre ellos — la gratitud, el miedo, el cariño de una amistad que no tiene una palabra fácil. Le quedaban segundos para decidir si dejarlo salir, o dejarlo ir."
      ],
      "choice": {
        "prompt": "Mona…",
        "options": [
          {
            "label": "lo agarra de la manga cuando llega al coche: «Leo — gracias. Por verme antes de que yo pudiera verme a mí misma. Lo digo de verdad.»",
            "goto": "end_ok",
            "clue": true
          },
          {
            "label": "saluda con la mano, sonríe, «¡Conduce con cuidado!» — y la puerta del taxi se cierra sobre todo ello.",
            "goto": "end_lesser",
            "clue": false
          }
        ]
      }
    },
    "end_good": {
      "art": "en/the-goodbye/n6-northcafe.jpg",
      "segments": [
        "Seis semanas después, Mona se bajó de un tren en una ciudad nueva del norte, entró en una cafetería pequeña y luminosa que olía a café y a pan recién hecho, y encontró a Leo detrás del mostrador con un delantal nuevecito, sonriendo como el sol. «MONA», decía la taza que le deslizó — escrita perfectamente, en letras grandes y orgullosas. En el platito estaba la tarjetita que ella le había dado, enmarcada ahora, apoyada junto a la caja. «Mi primerísima reserva. Tenía que guardarla.»",
        "Hablaron durante horas, como siempre. Irse, Mona lo entendió por fin, no siempre es perder. Una despedida dicha como es debido es solo una amistad que cambia de forma — estirada sobre la distancia, no rota. Había aprendido a cruzar una ciudad; ahora sabía que también podía conservar a la gente que quería de un extremo a otro de un país."
      ],
      "ending": {
        "id": "train-ride-away",
        "title": "A un tren de distancia",
        "quality": "good",
        "wrap": "Dijo lo verdadero, lo difícil y lo hermoso en vez de esconderse detrás de una broma — y convirtió una despedida en una invitación permanente. Algunas despedidas son en realidad comienzos."
      }
    },
    "end_ok": {
      "art": "en/the-goodbye/n7-watching.jpg",
      "segments": [
        "«Ve y sé brillante», dijo Mona, y lo abrazó tan fuerte que él se rió. Fue una buena despedida — cálida, bastante de verdad, dicha con el corazón lleno aunque no con cada palabra. Miró desaparecer las luces del taxi y volvió a casa a pie por la ciudad tranquila que, de algún modo, se había vuelto suya.",
        "Le escribiría. Lo visitaría, seguramente. Seguirían siendo amigos a la manera fácil y moderna de la gente que se cae bien a distancia. No todo lo que podría haber dicho — pero había ido, lo había abrazado, lo había sentido. Subiendo las escaleras hacia su pequeño piso dorado, notó el dolor de un capítulo que se cierra, y el orgullo tranquilo de un año sobrevivido y un amigo bien querido."
      ],
      "ending": {
        "id": "full-heart",
        "title": "El corazón lleno",
        "quality": "ok",
        "wrap": "Una despedida cálida y sincera — no cada última palabra, pero el corazón lleno. La amistad viajará de maravilla."
      }
    },
    "end_lesser": {
      "art": "en/the-goodbye/n8-message.jpg",
      "segments": [
        "«¡Conduce con cuidado!», exclamó Mona, animada como nada, y la puerta del taxi se cerró sobre cada una de las cosas que había querido decir. Volvió a casa ligera, y luego — delante de su propia puerta — de repente pesada. En el piso silencioso, las palabras por fin llegaron, todas, demasiado tarde, para una habitación vacía.",
        "Pero ya no era demasiado orgullosa para arreglarlo. Se sentó y lo escribió todo en un mensaje largo y sincero, y lo envió a la noche. Leo respondió en menos de una hora: «Lo sabía. Siempre lo supe. Pero me alegro muchísimo de que lo dijeras. Sube pronto al norte — y dímelo otra vez con un café delante.» Mona lloró, y rió, y reservó un tren para el mes siguiente."
      ],
      "ending": {
        "id": "message-she-sent-anyway",
        "title": "El mensaje que mandó igualmente",
        "quality": "lesser",
        "wrap": "Dejó pasar el momento detrás de una sonrisa radiante — y luego se negó a dejarlo ahí. Incluso una despedida torpe puede arreglarse, si tienes el valor de mandar el mensaje."
      }
    }
  }
}
$nodes$::jsonb, 112, false, false, NULL
FROM public.levels l WHERE l.id = 'B2'
ON CONFLICT (course, slug) DO NOTHING;

