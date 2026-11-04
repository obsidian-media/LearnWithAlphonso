/**
 * Authored quiz questions for the live podcast episodes.
 *
 * Source of truth for the seed in supabase/migrations/*_podcast_quiz.sql, which scripts/gen-podcast-quiz-migration.ts
 * generates from this file (a test fails when the two drift).
 *
 * Rules every question follows:
 *  - Answerable from the AUDIO alone: it asks about what the host said, never about a title, a caption or the screen.
 *  - Written in the episode's own language, at the episode's level.
 *  - `evidence` is a verbatim excerpt of the published transcript that settles the answer. It is a checked-in snapshot,
 *    so CI can ground each question without a database read. It is never sent to a client or stored in the database.
 *  - Episodes are keyed by (course, folder slug, episode slug) because episode ids are random per database.
 */
export type PodcastQuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  evidence: string;
};

export type PodcastQuiz = {
  course: "en" | "fr" | "es";
  folder: string;
  slug: string;
  questions: PodcastQuizQuestion[];
};

function q(
  prompt: string,
  choices: string[],
  answerIndex: number,
  evidence: string,
): Omit<PodcastQuizQuestion, "id"> {
  return { prompt, choices, answerIndex, evidence };
}

function quiz(
  course: PodcastQuiz["course"],
  folder: string,
  slug: string,
  questions: Omit<PodcastQuizQuestion, "id">[],
): PodcastQuiz {
  return { course, folder, slug, questions: questions.map((x, i) => ({ id: `q${i + 1}`, ...x })) };
}

export const PODCAST_QUIZZES: PodcastQuiz[] = [
  quiz("en", "a1", "ordering-coffee-v2", [
    q(
      'What does "I\'d like" tell the person you are talking to?',
      [
        "That you are ordering for someone else",
        "That you are asking politely",
        "That you are not sure what you want",
      ],
      1,
      '"I\'d like" is the polite way to ask for something.',
    ),
    q(
      "Which three size words does the host teach?",
      ["Small, medium, large", "Short, tall, grande", "Little, big, huge"],
      0,
      "Small. Medium. Large.",
    ),
    q(
      'What does the word "without" mean?',
      ["More", "Also", "No"],
      2,
      'The word "without" means no.',
    ),
    q(
      "In the first conversation, what does the customer order?",
      ["A large coffee without milk", "A small coffee with milk", "A medium tea with milk"],
      1,
      "I'd like a small coffee with milk, please.",
    ),
    q(
      "In the first conversation, how much is the coffee?",
      ["Two dollars fifty", "Four dollars", "Three dollars fifty"],
      2,
      "That's three dollars fifty.",
    ),
    q(
      'When do you say "Here you are"?',
      ["When you give someone money", "When you say hello", "When you leave the cafe"],
      0,
      "You say this when you give someone money, or anything else.",
    ),
    q(
      'What does "That\'s all" mean?',
      ["You want more coffee", "You do not understand", "You are finished ordering"],
      2,
      "It means you are finished ordering.",
    ),
  ]),
  quiz("en", "b1", "why-phones-are-addictive-v2", [
    q(
      "Which chemical does the host connect with motivation and reward?",
      ["Dopamine", "Caffeine", "Insulin"],
      0,
      "Dopamine is often connected with motivation and reward.",
    ),
    q(
      'What does "variable reward" mean?',
      [
        "You always get the same reward",
        "The reward is not always the same",
        "You pay money to get a reward",
      ],
      1,
      "The reward is not always the same.",
    ),
    q(
      "Why are short videos so hard to stop watching?",
      [
        "They are always about interesting topics",
        "They need a decision before each one",
        "There is almost no stopping point",
      ],
      2,
      "There is almost no stopping point.",
    ),
    q(
      "Does using your phone a lot automatically mean you have a medical addiction?",
      ["Yes, always", "No, it can simply be a strong habit", "Only if you use it at night"],
      1,
      "…it is simply a strong habit.",
    ),
    q(
      "Which simple first step does the host suggest?",
      ["Throw your phone away", "Buy a second phone", "Turn off unnecessary notifications"],
      2,
      "Turn off unnecessary notifications.",
    ),
    q(
      'What does "on purpose" mean in this episode?',
      ["By accident", "Because you decided to do something", "Very quickly"],
      1,
      "Because you decided to do something.",
    ),
    q(
      "What does the host say your phone is?",
      ["A tool", "A distraction", "A habit"],
      0,
      "your phone is a tool.",
    ),
  ]),
  quiz("en", "c1", "does-money-buy-happiness-v2", [
    q(
      "Once your basic needs are covered, what happens to the happiness each extra dollar buys?",
      ["It buys more and more", "It buys the same amount", "It buys less and less"],
      2,
      "each additional dollar buys less and less happiness.",
    ),
    q(
      "What do economists call this pattern?",
      ["Diminishing returns", "The hedonic treadmill", "Supply and demand"],
      0,
      "Economists call this diminishing returns",
    ),
    q(
      "Why does a colleague's bonus make your own raise feel smaller?",
      [
        "You spent your raise on something else",
        "Your reference point changed, not your situation",
        "Your colleague is simply better at their job",
      ],
      1,
      "Nothing about your situation changed. Only your reference point did.",
    ),
    q(
      "Which kind of spending tends to create more lasting satisfaction?",
      ["Spending on things", "Spending on experiences", "Spending it as soon as it arrives"],
      1,
      "Spending on experiences tends to create more lasting satisfaction than spending on things.",
    ),
    q(
      "What does the host say consistently outperforms spending the same money on a possession?",
      ["Buying a bigger house", "Paying off every debt", "Buying back your own time"],
      2,
      "consistently outperforms spending the same money on a possession.",
    ),
    q(
      'According to the host, which question is better than "does money make you happy"?',
      [
        "What is this money actually buying me?",
        "How can I earn ten times more?",
        "Who earns more than I do?",
      ],
      0,
      '"what is this money actually buying me?"',
    ),
    q(
      "In the vocabulary section, what is the hedonic treadmill?",
      [
        "A habit of spending more as you earn more",
        "Quickly returning to a stable level of happiness despite big changes",
        "The point where extra income stops mattering",
      ],
      1,
      "The tendency to quickly return to a stable level of happiness despite major positive or negative changes.",
    ),
  ]),
  quiz("en", "c1", "why-cant-we-focus-v2", [
    q(
      "What do researchers call it when part of your mind stays on the last task?",
      ["Attention residue", "Memory loss", "Task fatigue"],
      0,
      "Researchers call it attention residue.",
    ),
    q(
      "According to the host, what is your brain really doing when you multitask?",
      [
        "Doing two things at exactly the same time",
        "Switching rapidly, and each switch has a cost",
        "Resting between tasks",
      ],
      1,
      "It's switching between them, rapidly, and each switch has a cost.",
    ),
    q(
      "Why is the fight for your attention not a fair one?",
      [
        "Phones are cheaper than they used to be",
        "Apps are only used for work",
        "Every app competes for your attention, and teams work to keep you looking",
      ],
      2,
      "Every app on it is competing for the same limited resource — your attention.",
    ),
    q(
      "What does the host compare attention to?",
      ["A muscle", "A map", "A lamp"],
      0,
      "Attention behaves a lot like a muscle.",
    ),
    q(
      "Where should you put your phone while you work?",
      ["Face down on the desk", "In another room", "In your pocket"],
      1,
      "Put the phone in another room, not just face down",
    ),
    q(
      "Which work block does the host say beats three scattered hours?",
      [
        "Ten minutes between messages",
        "Three hours with the phone beside you",
        "Twenty-five uninterrupted minutes",
      ],
      2,
      "Twenty-five uninterrupted minutes beats three scattered hours.",
    ),
    q(
      "Why does the host say your phone keeps interrupting you?",
      [
        "It is the business model, not an accident",
        "It is designed to help you focus",
        "You switched off the sound too late",
      ],
      0,
      "That's not an accident. It's the business model.",
    ),
  ]),
  quiz("en", "c1", "why-time-feels-faster-v2", [
    q(
      "For a five-year-old, one year is what part of everything they have experienced?",
      ["One-tenth", "One-fifth", "One-half"],
      1,
      "one-fifth of everything you've experienced.",
    ),
    q(
      "Which second explanation does the host say may be even more relevant?",
      ["Days becoming shorter", "Having more things to do", "Memory"],
      2,
      "another explanation that may be even more relevant: memory.",
    ),
    q(
      "Why do you remember a day of travel more clearly than an ordinary Tuesday?",
      [
        "Your brain pays attention to things that stand out",
        "You slept more that night",
        "Travel days are longer",
      ],
      0,
      "your brain pays attention to things that stand out",
    ),
    q(
      "What benefit of routine does the host mention?",
      ["It makes weekends feel longer", "It saves mental energy", "It makes decisions easier"],
      1,
      "Routine saves mental energy",
    ),
    q(
      "What is the trade-off when your days become very similar?",
      ["You make worse decisions", "You have less free time", "Fewer moments stand out in memory"],
      2,
      "fewer moments stand out in memory.",
    ),
    q(
      "What does the host suggest we do now and then?",
      ["Make our lives unfamiliar", "Move to another country", "Plan every minute of the week"],
      0,
      "It's to occasionally make it unfamiliar",
    ),
    q(
      "How can five minutes in a dentist's waiting room feel?",
      ["Very short", "Incredibly long", "Exactly normal"],
      1,
      "Five minutes can feel incredibly long.",
    ),
  ]),
  quiz("en", "c1", "why-changing-minds-is-hard-v2", [
    q(
      "Why can admitting you are wrong feel personal?",
      [
        "Beliefs are connected to our identity",
        "Other people judge us harshly",
        "We prefer to follow the majority",
      ],
      0,
      "They're connected to our identity.",
    ),
    q(
      "What is confirmation bias?",
      [
        "Preferring facts that come from friends",
        "Noticing and remembering information that supports what we already believe",
        "Doubting every piece of information",
      ],
      1,
      "we notice and remember information that supports what we already believe.",
    ),
    q(
      "What is the difference between consistency and stubbornness?",
      [
        "There is no difference",
        "Stubbornness means changing your mind too often",
        "Stubbornness means refusing to update even when new evidence appears",
      ],
      2,
      "stubbornness means refusing to update them even when new evidence appears.",
    ),
    q(
      "What does intellectual humility mean?",
      ['Being able to say "I might be wrong"', "Having no opinions", "Never arguing"],
      0,
      'And intellectual humility means being able to say: "I might be wrong."',
    ),
    q(
      "Which useful question does the host suggest asking yourself?",
      [
        "How can I prove them wrong?",
        "What evidence would actually change my mind?",
        "Who else agrees with me?",
      ],
      1,
      "what evidence would actually change my mind?",
    ),
    q(
      "What happens once you stop treating mistakes as threats to your identity?",
      ["You argue more", "You stop learning", "You become easier to teach and you learn faster"],
      2,
      "you become easier to teach, and you learn faster.",
    ),
    q(
      "Why do people keep investing in something when the evidence is not encouraging?",
      [
        "Changing direction means admitting a mistake",
        "It always works in the end",
        "They have too much time",
      ],
      0,
      "changing direction means admitting a mistake.",
    ),
  ]),
  quiz("en", "c1", "why-we-procrastinate-v2", [
    q(
      "According to researchers, procrastination is mainly about managing what?",
      ["Time", "A feeling", "A habit"],
      1,
      "Procrastination isn't primarily about managing time. It's about managing a feeling.",
    ),
    q(
      "What is present bias?",
      [
        "Valuing future benefits more than immediate relief",
        "Ignoring all deadlines",
        "Valuing immediate relief far more than future benefit",
      ],
      2,
      "Humans are wired to value immediate relief far more than future benefit",
    ),
    q(
      "Why does avoidance feel so effective?",
      [
        "It works in the short term, because the anxiety drops",
        "It gives you more time to prepare",
        "It makes the task easier later",
      ],
      0,
      "Avoidance actually works, in the short term.",
    ),
    q(
      "What do guilt and shame tend to do?",
      [
        "Make you more disciplined",
        "Make the emotional discomfort bigger",
        "Make you more honest with yourself",
      ],
      1,
      "Guilt and shame tend to increase the very emotional discomfort",
    ),
    q(
      "What happens to people who forgive themselves for procrastinating?",
      [
        "They procrastinate more",
        "They stop working",
        "They procrastinate less on the next similar task",
      ],
      2,
      "people who forgive themselves for procrastinating once actually procrastinate less on the next similar task",
    ),
    q(
      "Which example of a tiny first step does the host give?",
      [
        "Open the document and write one sentence",
        "Finish the whole report today",
        "Clean your desk first",
      ],
      0,
      "open the document and write one sentence.",
    ),
    q(
      "How do we treat our future self, according to some researchers?",
      ["Like a coach", "Like a stranger", "Like a rival"],
      1,
      "We treat our future self like a stranger",
    ),
  ]),
  quiz("en", "c1", "why-everyone-looks-better-online-v2", [
    q(
      "What is social comparison?",
      [
        "Looking at photos of friends",
        "Following celebrities",
        "Using other people as the ruler for how well we are doing",
      ],
      2,
      "we borrow other people as the ruler instead. It's called social comparison",
    ),
    q(
      "What do sociologists call it when groups that used to stay separate are blended in one feed?",
      ["Context collapse", "Filter bubble", "Echo chamber"],
      0,
      "Sociologists call this context collapse.",
    ),
    q(
      "For which goal is the system behind the feed optimized?",
      ["Showing you your friends first", "Keeping you looking", "Keeping your data private"],
      1,
      "optimized for one goal: keep you looking.",
    ),
    q(
      "Which content tends to keep people looking longer?",
      [
        "Calm, neutral posts",
        "Content from close friends",
        "Content that triggers a small emotional reaction",
      ],
      2,
      "tends to keep people looking longer than content that doesn't.",
    ),
    q(
      "Why does the feed lack comparisons that make us feel better?",
      [
        "Nobody posts their worst week honestly",
        "Friends delete them",
        "Algorithms remove them by mistake",
      ],
      0,
      "Nobody posts their worst week captioned honestly.",
    ),
    q(
      "What can you actually choose, according to the host?",
      ["The weather", "Your comparison group", "The platform's rules"],
      1,
      "you can, in fact, choose your comparison group",
    ),
    q(
      "What does the host suggest doing with a small envious pull?",
      ["Unfollow everyone", "Compare yourself even harder", "Notice it and name it"],
      2,
      "that small envious pull, and naming it",
    ),
  ]),
  quiz("en", "mind-fools-you", "why-we-trust-our-gut-v2", [
    q(
      "What is a chess grandmaster's quick sense of the right move?",
      ["Pattern recognition", "Wishful thinking", "Natural talent"],
      0,
      "It's pattern recognition, built from thousands of repeated experiences",
    ),
    q(
      "How do gut feelings arrive?",
      [
        "With a label showing how reliable they are",
        "All wearing the same costume: total confidence",
        "Only when you are an expert",
      ],
      1,
      "They both arrive wearing the exact same costume: total confidence.",
    ),
    q(
      "What is the first question of the researchers' filter?",
      [
        "Am I in a good mood?",
        "Does everyone agree with me?",
        "Have I had real, repeated practice here with fast feedback?",
      ],
      2,
      "is this a domain where I've had real, repeated practice with fast feedback?",
    ),
    q(
      "Which professional gets feedback on their instincts constantly?",
      ["A doctor", "A hiring manager", "A new graduate"],
      0,
      "A doctor gets feedback on their instincts constantly",
    ),
    q(
      "When does intuition become less reliable?",
      ["When you are relaxed", "When you are stressed, rushed, or upset", "When you are alone"],
      1,
      "Intuition gets louder and less reliable exactly when you're stressed, rushed, or upset",
    ),
    q(
      "How should you treat a strong gut feeling?",
      ["As a final verdict", "As something to ignore", "As a hypothesis"],
      2,
      "treat it as a hypothesis, not a verdict.",
    ),
    q(
      'What does "to jump to conclusions" mean?',
      [
        "To decide something too quickly, without enough evidence",
        "To ignore evidence on purpose",
        "To make a decision after long thought",
      ],
      0,
      "to decide something too quickly, without enough evidence.",
    ),
  ]),
  quiz("en", "why-we-love", "why-we-fall-for-the-same-type-v2", [
    q(
      "What do psychologists call the pattern formed in early childhood?",
      ["Attachment style", "Personality type", "Love language"],
      0,
      "something called attachment style, formed in early childhood",
    ),
    q(
      "When may an anxious attachment develop?",
      [
        "When care was always warm and steady",
        "When care was unpredictable",
        "When you had no childhood friends",
      ],
      1,
      "if care was unpredictable, sometimes warm, sometimes withdrawn, you may have developed an anxious attachment",
    ),
    q(
      "What does someone who leans avoidant tend to do?",
      ["Share every feeling immediately", "Avoid all relationships", "Keep people at arm's length"],
      2,
      "keeping people at arm's length.",
    ),
    q(
      "What is the familiarity trap?",
      [
        "Being drawn to what is familiar, because it registers as safe",
        "Choosing a partner who is similar to you",
        "Falling in love too quickly",
      ],
      0,
      "We're drawn to what's familiar",
    ),
    q(
      "Is attachment style fixed?",
      ["Yes, it never changes", "No, it can shift through new experience", "Only with a therapist"],
      1,
      "attachment style isn't fixed.",
    ),
    q(
      "Which quiet question does the host suggest asking?",
      [
        "Is this person good-looking?",
        "Do my friends like them?",
        "Is this excitement, or is this just recognition?",
      ],
      2,
      "is this excitement, or is this just recognition?",
    ),
    q(
      'What does "a red flag" mean?',
      [
        "An early warning sign that something is wrong",
        "A sign of strong attraction",
        "A reason to stay patient",
      ],
      0,
      "an early warning sign that something is wrong.",
    ),
  ]),
  quiz("fr", "a1", "au-cafe", [
    q(
      "Quelle expression est la façon polie de demander quelque chose ?",
      ["« Je voudrais »", "« Voilà »", "« Bonne journée »"],
      0,
      "« Je voudrais » est la façon polie de demander.",
    ),
    q(
      "Que veut dire « C'est tout » ?",
      ["Je n'ai pas compris", "Je ne veux rien d'autre", "Je voudrais un autre café"],
      1,
      "« C'est tout » veut dire que vous ne voulez rien d'autre.",
    ),
    q(
      "Dans la conversation, que commande le client ?",
      ["Un grand café sans sucre", "Un thé avec du lait", "Un petit café avec du lait"],
      2,
      "Je voudrais un petit café avec du lait, s'il vous plaît.",
    ),
    q(
      "Dans la conversation, combien coûte le café ?",
      ["Trois euros cinquante", "Deux euros", "Quatre euros"],
      0,
      "Ça fait trois euros cinquante.",
    ),
    q(
      "Quand dit-on « Voilà » ?",
      ["Quand on arrive", "Quand on donne l'argent", "Quand on dit au revoir"],
      1,
      "« Voilà » se dit quand vous donnez l'argent.",
    ),
    q(
      "Quelle phrase veut dire qu'on ne veut pas de sucre ?",
      ["« Avec du lait »", "« Un petit café »", "« Sans sucre »"],
      2,
      "Quatrième phrase. « Sans sucre. »",
    ),
  ]),
  quiz("fr", "a2", "ma-journee", [
    q(
      "À quelle heure s'est-elle réveillée hier ?",
      ["À sept heures", "À huit heures", "À neuf heures"],
      0,
      "je me suis réveillée à sept heures.",
    ),
    q(
      "Comment va-t-elle au travail ?",
      ["À pied", "En bus", "En voiture"],
      1,
      "je suis partie au travail en bus.",
    ),
    q(
      "Combien de temps dure le trajet ?",
      ["Dix minutes", "Une heure", "Vingt minutes"],
      2,
      "Le trajet a duré vingt minutes.",
    ),
    q(
      "Qu'a-t-elle pris à midi ?",
      ["Une soupe et une salade", "Un sandwich", "Du pain avec du beurre"],
      0,
      "J'ai pris une soupe et une salade.",
    ),
    q(
      "À qui a-t-elle téléphoné le soir ?",
      ["À sa mère", "À sa sœur", "À une collègue"],
      1,
      "j'ai téléphoné à ma sœur.",
    ),
    q(
      "Pourquoi n'a-t-elle pas vu la fin du film ?",
      ["Elle est partie", "Il y avait trop de bruit", "Elle s'est endormie"],
      2,
      "je me suis endormie avant la fin.",
    ),
    q(
      "Quel mot très utile pour raconter la narratrice présente-t-elle ?",
      ["« Ensuite »", "« Demain »", "« Toujours »"],
      0,
      "« Ensuite » est un mot très utile pour raconter.",
    ),
  ]),
  quiz("fr", "b1", "chercher-un-appartement", [
    q(
      "Combien voulait-il payer par mois au début ?",
      ["Six cent cinquante euros", "Sept cents euros", "Huit cents euros"],
      1,
      "pour sept cents euros par mois.",
    ),
    q(
      "Quelle est la première difficulté ?",
      ["La concurrence", "Les voisins", "Le prix"],
      2,
      "La première difficulté, c'est le prix.",
    ),
    q(
      "Combien de personnes attendaient devant la porte ?",
      ["Quinze", "Cinq", "Cinquante"],
      0,
      "Il y avait quinze personnes devant la porte",
    ),
    q(
      "Pourquoi n'a-t-il pas eu l'appartement magnifique ?",
      ["Il était trop cher", "Il n'avait rien apporté pour son dossier", "Il est arrivé trop tard"],
      1,
      "Moi, je n'avais rien apporté",
    ),
    q(
      "Comment cherche-t-il maintenant ?",
      [
        "Une fois par semaine",
        "Seulement sur son téléphone",
        "Il regarde les annonces chaque matin et téléphone tout de suite",
      ],
      2,
      "je regarde les nouvelles annonces chaque matin, et je téléphone tout de suite.",
    ),
    q(
      "Comment est l'appartement qu'il a trouvé ?",
      [
        "Petit, calme, avec un balcon",
        "Grand et lumineux, au centre-ville",
        "Moderne, avec deux chambres",
      ],
      0,
      "un petit appartement calme, avec un balcon, pour six cent cinquante euros.",
    ),
    q(
      "Quel est son conseil avant la première visite ?",
      ["Visiter dix appartements", "Préparer son dossier", "Demander un prix plus bas"],
      1,
      "préparez votre dossier avant la première visite",
    ),
  ]),
  quiz("es", "a1", "en-la-cafeteria", [
    q(
      "¿Qué expresión es la forma amable de pedir algo?",
      ['"Quisiera"', '"Aquí tiene"', '"Eso es todo"'],
      0,
      '"Quisiera" es la forma amable de pedir algo.',
    ),
    q(
      '¿Qué quiere decir "Eso es todo"?',
      ["No entiendo", "Ya no quieres nada más", "Quiero otro café"],
      1,
      '"Eso es todo" quiere decir que ya no quieres nada más.',
    ),
    q(
      "En la conversación, ¿qué pide el cliente?",
      ["Un café grande sin azúcar", "Un té con leche", "Un café pequeño con leche"],
      2,
      "Quisiera un café pequeño con leche, por favor.",
    ),
    q(
      "En la conversación, ¿cuánto cuesta el café?",
      ["Tres dólares con cincuenta", "Dos dólares", "Cuatro dólares"],
      0,
      "Son tres dólares con cincuenta.",
    ),
    q(
      '¿Cuándo se dice "Aquí tiene"?',
      ["Cuando llegas", "Cuando entregas el dinero", "Cuando te despides"],
      1,
      '"Aquí tiene" se dice cuando entregas el dinero.',
    ),
    q(
      "¿Qué frase significa que no quieres azúcar?",
      ['"Con leche"', '"Un café pequeño"', '"Sin azúcar"'],
      2,
      'Cuarta frase. "Sin azúcar."',
    ),
  ]),
  quiz("es", "a2", "mi-fin-de-semana", [
    q(
      "¿A qué hora se levantó el sábado?",
      ["A las nueve", "A las siete", "A las once"],
      0,
      "El sábado me levanté tarde, a las nueve.",
    ),
    q(
      "¿Con quién fue al mercado?",
      ["Con su mamá", "Con su hermana", "Con una amiga"],
      1,
      "A las once fui al mercado con mi hermana.",
    ),
    q(
      "¿Qué compraron en el mercado?",
      ["Pan y pescado", "Ropa y zapatos", "Frutas, verduras y un poco de queso"],
      2,
      "Compramos frutas, verduras y un poco de queso.",
    ),
    q(
      "¿Qué pidió ella en el restaurante?",
      ["Una sopa y una ensalada", "Pescado", "Una pizza"],
      0,
      "Yo pedí una sopa y una ensalada",
    ),
    q(
      "¿A quién llamó por teléfono?",
      ["A su hermana", "A su mamá", "A su jefe"],
      1,
      "Luego llamé a mi mamá por teléfono",
    ),
    q(
      "¿Qué hizo el domingo?",
      [
        "Fue al parque todo el día",
        "Limpió la casa",
        "Vio una película y se durmió antes del final",
      ],
      2,
      "Vi una película en casa, pero me dormí antes del final.",
    ),
    q(
      "¿Qué palabra útil para contar una historia presenta la locutora?",
      ['"Después"', '"Nunca"', '"Siempre"'],
      0,
      '"Después" es una palabra muy útil para contar una historia.',
    ),
  ]),
  quiz("es", "b1", "buscar-departamento", [
    q(
      "¿Cuánto quería pagar de alquiler al principio?",
      ["Seiscientos cincuenta dólares", "Setecientos dólares", "Mil dólares"],
      1,
      "por un alquiler de setecientos dólares al mes.",
    ),
    q(
      "¿Cuál es la primera dificultad?",
      ["La competencia", "Los vecinos", "El precio"],
      2,
      "La primera dificultad es el precio.",
    ),
    q(
      "¿Qué traía cada persona que esperaba en la puerta?",
      ["Una carpeta completa", "Un regalo", "Una llave"],
      0,
      "cada una traía su carpeta completa",
    ),
    q(
      "¿Cómo busca ahora?",
      [
        "Una vez por semana",
        "Revisa los anuncios nuevos cada mañana y llama de inmediato",
        "Solo por teléfono, de noche",
      ],
      1,
      "reviso los anuncios nuevos todas las mañanas y llamo de inmediato.",
    ),
    q(
      "¿A qué renunció para encontrar un departamento?",
      ["Al balcón", "A la luz", "Al centro"],
      2,
      "Renuncié al centro, pero elegí un barrio cerca de una estación del metro.",
    ),
    q(
      "¿Cuánto cuesta el departamento que encontró?",
      [
        "Seiscientos cincuenta dólares al mes",
        "Setecientos dólares al mes",
        "Quinientos dólares al mes",
      ],
      0,
      "con un balcón, por seiscientos cincuenta dólares al mes.",
    ),
    q(
      "¿Qué hace ahora en cada visita?",
      ["Toma fotos", "Hace preguntas", "Negocia el precio"],
      1,
      "en cada visita: hago preguntas.",
    ),
  ]),
];
