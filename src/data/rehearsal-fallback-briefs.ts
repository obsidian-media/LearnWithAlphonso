import type { Course } from "./course-meta";
import type { EventKind } from "@/lib/rehearsal-rules";

/**
 * The per-kind default brief, used when the model cannot produce a valid one twice. Written in the course language
 * (the counterpart speaks it). `appointment` and `housing` stay general on purpose: describing a problem, asking
 * questions and understanding the answer. No medical advice, no legal advice, no pressure tactics.
 * Shape per kind: a setting, the counterpart's role and tone, 6 key phrases, 5 core exchanges, 3 hard moments.
 */
export type RawBrief = {
  setting: string;
  role: string;
  tone: string;
  phrases: readonly [string, string, string, string, string, string];
  exchanges: readonly [string, string, string, string, string];
  hard: readonly [readonly [string, string], readonly [string, string], readonly [string, string]];
};

const EN: Record<EventKind, RawBrief> = {
  interview: {
    setting: "A job interview in the employer's office.",
    role: "a hiring manager",
    tone: "polite, professional and direct",
    phrases: [
      "Thank you for having me.",
      "I have experience in this area.",
      "One of my strengths is working in a team.",
      "I am available to start in two weeks.",
      "Could you tell me more about the role?",
      "Thank you for your time.",
    ],
    exchanges: [
      "Greeting and small talk before the interview starts",
      "Please introduce yourself",
      "Why do you want this job?",
      "Tell me about a time you solved a problem at work",
      "Do you have any questions for us?",
    ],
    hard: [
      ["The salary question", "Ask what salary the learner expects."],
      ["A gap in the CV", "Ask politely about a gap in the learner's work history."],
      ["Your weakness", "Ask what the learner's biggest weakness is."],
    ],
  },
  meeting: {
    setting: "A work meeting with a few colleagues.",
    role: "a colleague leading the meeting",
    tone: "friendly, busy and to the point",
    phrases: [
      "Can I add something here?",
      "I agree with that point.",
      "Could you repeat that, please?",
      "My update is that the work is on track.",
      "Let me check and get back to you.",
      "Shall we agree on next steps?",
    ],
    exchanges: [
      "Greeting and opening the meeting",
      "Give a short update on your work",
      "Answer a question about a delay or a problem",
      "Give your opinion on a proposal",
      "Agree on next steps and close",
    ],
    hard: [
      ["Being interrupted", "Interrupt the learner mid-sentence with a different point."],
      ["Disagreement", "Disagree politely with the learner's proposal and ask them to justify it."],
      [
        "A question you cannot answer",
        "Ask something the learner probably does not know and see how they respond.",
      ],
    ],
  },
  presentation: {
    setting: "A short presentation to a small audience, followed by questions.",
    role: "a member of the audience",
    tone: "interested, a little challenging",
    phrases: [
      "Thank you all for coming.",
      "Today I would like to talk about",
      "Let me start with the main point.",
      "As you can see, the results show",
      "To sum up",
      "Are there any questions?",
    ],
    exchanges: [
      "Welcome the audience and say what you will cover",
      "Present the main point in a few sentences",
      "Answer a question about a detail",
      "Explain a number or a result",
      "Summarise and close",
    ],
    hard: [
      ["A tough question", "Ask a difficult question that challenges the learner's main point."],
      ["Losing your place", "Ask the learner to go back to something they said earlier."],
      [
        "A request to simplify",
        "Say you did not follow and ask the learner to explain it more simply.",
      ],
    ],
  },
  appointment: {
    setting: "A general appointment at a clinic or a bank reception desk.",
    role: "a receptionist or an advisor",
    tone: "calm, efficient and helpful",
    phrases: [
      "I have an appointment at three o'clock.",
      "I would like to ask about something.",
      "Could you speak a little more slowly, please?",
      "I do not understand. Could you explain?",
      "How long will it take?",
      "Thank you for your help.",
    ],
    exchanges: [
      "Arrive, greet and say your name and appointment",
      "Say in simple words why you came",
      "Answer a few questions about your situation",
      "Ask a question and check you understood the answer",
      "Agree on what happens next and say goodbye",
    ],
    hard: [
      [
        "Not understanding",
        "Use a slightly difficult word and see whether the learner asks for it to be explained.",
      ],
      ["A long wait", "Say there will be a delay and see how the learner reacts."],
      ["A form to fill in", "Ask the learner to give some details for a form, one at a time."],
    ],
  },
  housing: {
    setting: "Talking with a landlord or an agent about a place to rent.",
    role: "a landlord or an agent",
    tone: "friendly but businesslike",
    phrases: [
      "I am interested in the flat.",
      "How much is the rent per month?",
      "Are the bills included?",
      "When is it available?",
      "Could I see it again?",
      "What do you need from me?",
    ],
    exchanges: [
      "Greeting and saying which place you are interested in",
      "Ask about the rent and what is included",
      "Answer questions about when you want to move",
      "Ask about something you noticed in the flat",
      "Agree on the next step and say goodbye",
    ],
    hard: [
      [
        "The price is higher than expected",
        "Say the rent is higher than advertised and see how the learner responds.",
      ],
      [
        "Something is wrong",
        "Mention a small problem with the flat and ask the learner what they think.",
      ],
      ["A quick decision", "Say other people are interested and ask the learner to decide soon."],
    ],
  },
  first_day: {
    setting: "The first morning at a new workplace.",
    role: "a new colleague or a manager",
    tone: "welcoming and a bit rushed",
    phrases: [
      "Nice to meet you.",
      "I am new here.",
      "Where can I find",
      "Could you show me how this works?",
      "What time is lunch?",
      "I will ask if I have a question.",
    ],
    exchanges: [
      "Meet the manager and introduce yourself",
      "Get a short tour and ask where things are",
      "Meet a colleague and make small talk",
      "Ask how a task or a tool works",
      "Agree on what you will do next",
    ],
    hard: [
      ["Names and faces", "Introduce several colleagues quickly and see how the learner copes."],
      [
        "Fast instructions",
        "Give instructions fast and see whether the learner asks you to repeat.",
      ],
      ["Small talk", "Ask about the learner's weekend and their life outside work."],
    ],
  },
  other: {
    setting: "An important conversation the learner has coming up.",
    role: "the person the learner will talk to",
    tone: "polite and natural",
    phrases: [
      "Thank you for seeing me.",
      "I would like to talk about",
      "Could you tell me more?",
      "I am not sure I understood.",
      "That sounds good to me.",
      "Thank you very much.",
    ],
    exchanges: [
      "Greeting and opening the conversation",
      "Say what you came to talk about",
      "Answer a few questions",
      "Ask a question of your own",
      "Agree on what happens next and close",
    ],
    hard: [
      ["A surprise", "Say something the learner did not expect and see how they react."],
      ["Not understanding", "Speak a little fast and see whether the learner asks you to repeat."],
      ["A difficult answer", "Say no to something the learner asks for and see how they continue."],
    ],
  },
};

const FR: Record<EventKind, RawBrief> = {
  interview: {
    setting: "Un entretien d'embauche dans les bureaux de l'entreprise.",
    role: "un responsable du recrutement",
    tone: "poli, professionnel et direct",
    phrases: [
      "Merci de me recevoir.",
      "J'ai de l'expérience dans ce domaine.",
      "L'un de mes points forts est le travail en équipe.",
      "Je suis disponible dans deux semaines.",
      "Pourriez-vous m'en dire plus sur le poste ?",
      "Merci pour votre temps.",
    ],
    exchanges: [
      "Les salutations avant le début de l'entretien",
      "Présentez-vous, s'il vous plaît",
      "Pourquoi voulez-vous ce poste ?",
      "Racontez-moi une situation où vous avez résolu un problème au travail",
      "Avez-vous des questions pour nous ?",
    ],
    hard: [
      ["La question du salaire", "Demandez à l'apprenant quelles sont ses prétentions salariales."],
      ["Un trou dans le CV", "Interrogez poliment l'apprenant sur une période sans emploi."],
      ["Votre point faible", "Demandez à l'apprenant quel est son plus grand défaut."],
    ],
  },
  meeting: {
    setting: "Une réunion de travail avec quelques collègues.",
    role: "un collègue qui dirige la réunion",
    tone: "aimable, pressé et concis",
    phrases: [
      "Puis-je ajouter quelque chose ?",
      "Je suis d'accord avec ce point.",
      "Pourriez-vous répéter, s'il vous plaît ?",
      "Mon point d'étape : le travail avance bien.",
      "Je vérifie et je reviens vers vous.",
      "On se met d'accord sur la suite ?",
    ],
    exchanges: [
      "Les salutations et l'ouverture de la réunion",
      "Donnez un court point sur votre travail",
      "Répondez à une question sur un retard ou un problème",
      "Donnez votre avis sur une proposition",
      "Convenez de la suite et concluez",
    ],
    hard: [
      ["Être coupé", "Coupez la parole à l'apprenant avec un autre sujet."],
      [
        "Un désaccord",
        "Contredisez poliment la proposition de l'apprenant et demandez-lui de la justifier.",
      ],
      [
        "Une question sans réponse",
        "Posez une question dont l'apprenant ne connaît sans doute pas la réponse.",
      ],
    ],
  },
  presentation: {
    setting: "Une courte présentation devant un petit public, suivie de questions.",
    role: "un membre du public",
    tone: "intéressé, un peu exigeant",
    phrases: [
      "Merci à tous d'être venus.",
      "Aujourd'hui, je voudrais vous parler de",
      "Je commence par l'essentiel.",
      "Comme vous le voyez, les résultats montrent",
      "Pour conclure",
      "Avez-vous des questions ?",
    ],
    exchanges: [
      "Accueillez le public et annoncez le plan",
      "Présentez le point principal en quelques phrases",
      "Répondez à une question sur un détail",
      "Expliquez un chiffre ou un résultat",
      "Résumez et concluez",
    ],
    hard: [
      [
        "Une question difficile",
        "Posez une question difficile qui remet en cause le point principal.",
      ],
      ["Perdre le fil", "Demandez à l'apprenant de revenir sur quelque chose qu'il a dit avant."],
      ["Simplifier", "Dites que vous n'avez pas suivi et demandez d'expliquer plus simplement."],
    ],
  },
  appointment: {
    setting: "Un rendez-vous ordinaire à l'accueil d'un cabinet ou d'une banque.",
    role: "un réceptionniste ou un conseiller",
    tone: "calme, efficace et serviable",
    phrases: [
      "J'ai rendez-vous à quinze heures.",
      "Je voudrais poser une question.",
      "Pourriez-vous parler un peu plus lentement ?",
      "Je ne comprends pas. Pouvez-vous expliquer ?",
      "Combien de temps cela va-t-il prendre ?",
      "Merci pour votre aide.",
    ],
    exchanges: [
      "Arrivez, saluez et donnez votre nom et votre rendez-vous",
      "Dites avec des mots simples pourquoi vous êtes venu",
      "Répondez à quelques questions sur votre situation",
      "Posez une question et vérifiez que vous avez compris",
      "Convenez de la suite et dites au revoir",
    ],
    hard: [
      [
        "Ne pas comprendre",
        "Utilisez un mot un peu difficile et voyez si l'apprenant demande une explication.",
      ],
      ["Une longue attente", "Annoncez un retard et voyez comment l'apprenant réagit."],
      ["Un formulaire", "Demandez à l'apprenant des informations pour un formulaire, une par une."],
    ],
  },
  housing: {
    setting: "Une conversation avec un propriétaire ou une agence au sujet d'un logement à louer.",
    role: "un propriétaire ou un agent immobilier",
    tone: "aimable mais professionnel",
    phrases: [
      "Je suis intéressé par l'appartement.",
      "Quel est le loyer mensuel ?",
      "Les charges sont-elles comprises ?",
      "Quand est-il disponible ?",
      "Pourrais-je le revoir ?",
      "Qu'avez-vous besoin de ma part ?",
    ],
    exchanges: [
      "Les salutations et le logement qui vous intéresse",
      "Demandez le loyer et ce qui est compris",
      "Répondez aux questions sur la date d'emménagement",
      "Posez une question sur quelque chose que vous avez remarqué",
      "Convenez de la suite et dites au revoir",
    ],
    hard: [
      [
        "Un prix plus élevé",
        "Dites que le loyer est plus élevé que l'annonce et voyez la réaction.",
      ],
      [
        "Un petit problème",
        "Mentionnez un petit défaut du logement et demandez ce qu'en pense l'apprenant.",
      ],
      [
        "Une décision rapide",
        "Dites que d'autres personnes sont intéressées et demandez de décider vite.",
      ],
    ],
  },
  first_day: {
    setting: "Le premier matin dans un nouveau lieu de travail.",
    role: "un nouveau collègue ou un responsable",
    tone: "accueillant et un peu pressé",
    phrases: [
      "Enchanté de faire votre connaissance.",
      "Je suis nouveau ici.",
      "Où puis-je trouver",
      "Pourriez-vous me montrer comment ça marche ?",
      "À quelle heure est la pause déjeuner ?",
      "Je demanderai si j'ai une question.",
    ],
    exchanges: [
      "Rencontrez le responsable et présentez-vous",
      "Faites un petit tour et demandez où sont les choses",
      "Rencontrez un collègue et faites la conversation",
      "Demandez comment fonctionne une tâche ou un outil",
      "Convenez de ce que vous ferez ensuite",
    ],
    hard: [
      [
        "Prénoms et visages",
        "Présentez plusieurs collègues d'un coup et voyez comment l'apprenant s'en sort.",
      ],
      [
        "Consignes rapides",
        "Donnez des consignes vite et voyez si l'apprenant demande de répéter.",
      ],
      ["La conversation légère", "Demandez à l'apprenant comment s'est passé son week-end."],
    ],
  },
  other: {
    setting: "Une conversation importante que l'apprenant a prévue.",
    role: "la personne à qui l'apprenant va parler",
    tone: "poli et naturel",
    phrases: [
      "Merci de me recevoir.",
      "Je voudrais parler de",
      "Pourriez-vous m'en dire plus ?",
      "Je ne suis pas sûr d'avoir compris.",
      "Cela me convient.",
      "Merci beaucoup.",
    ],
    exchanges: [
      "Les salutations et l'ouverture de la conversation",
      "Dites de quoi vous êtes venu parler",
      "Répondez à quelques questions",
      "Posez une question à votre tour",
      "Convenez de la suite et concluez",
    ],
    hard: [
      ["Une surprise", "Dites quelque chose d'inattendu et voyez la réaction de l'apprenant."],
      ["Ne pas comprendre", "Parlez un peu vite et voyez si l'apprenant demande de répéter."],
      ["Une réponse difficile", "Refusez une demande de l'apprenant et voyez comment il continue."],
    ],
  },
};

const ES: Record<EventKind, RawBrief> = {
  interview: {
    setting: "Una entrevista de trabajo en las oficinas de la empresa.",
    role: "un responsable de selección",
    tone: "educado, profesional y directo",
    phrases: [
      "Gracias por recibirme.",
      "Tengo experiencia en este campo.",
      "Uno de mis puntos fuertes es el trabajo en equipo.",
      "Puedo empezar en dos semanas.",
      "¿Podría contarme más sobre el puesto?",
      "Gracias por su tiempo.",
    ],
    exchanges: [
      "El saludo antes de empezar la entrevista",
      "Preséntese, por favor",
      "¿Por qué quiere este trabajo?",
      "Cuénteme alguna ocasión en que resolvió un problema en el trabajo",
      "¿Tiene alguna pregunta para nosotros?",
    ],
    hard: [
      ["La pregunta del sueldo", "Pregunte al estudiante qué sueldo espera."],
      ["Un hueco en el currículum", "Pregunte con educación por un periodo sin trabajo."],
      ["Su punto débil", "Pregunte al estudiante cuál es su mayor defecto."],
    ],
  },
  meeting: {
    setting: "Una reunión de trabajo con unos pocos compañeros.",
    role: "un compañero que dirige la reunión",
    tone: "amable, con prisa y al grano",
    phrases: [
      "¿Puedo añadir algo?",
      "Estoy de acuerdo con ese punto.",
      "¿Podría repetirlo, por favor?",
      "Por mi parte, el trabajo avanza según lo previsto.",
      "Lo compruebo y le respondo.",
      "¿Acordamos los próximos pasos?",
    ],
    exchanges: [
      "El saludo y el comienzo de la reunión",
      "Dé un breve informe de su trabajo",
      "Responda a una pregunta sobre un retraso o un problema",
      "Dé su opinión sobre una propuesta",
      "Acuerden los próximos pasos y cierren",
    ],
    hard: [
      ["Que le interrumpan", "Interrumpa al estudiante a media frase con otro tema."],
      [
        "Un desacuerdo",
        "Discrepe con educación de la propuesta del estudiante y pídale que la justifique.",
      ],
      [
        "Una pregunta sin respuesta",
        "Haga una pregunta que el estudiante probablemente no sepa contestar.",
      ],
    ],
  },
  presentation: {
    setting: "Una presentación breve ante un público pequeño, con preguntas al final.",
    role: "un miembro del público",
    tone: "interesado, algo exigente",
    phrases: [
      "Gracias a todos por venir.",
      "Hoy quiero hablarles de",
      "Empiezo por lo más importante.",
      "Como pueden ver, los resultados muestran",
      "Para terminar",
      "¿Tienen alguna pregunta?",
    ],
    exchanges: [
      "Dé la bienvenida y diga de qué va a hablar",
      "Presente la idea principal en pocas frases",
      "Responda a una pregunta sobre un detalle",
      "Explique una cifra o un resultado",
      "Resuma y cierre",
    ],
    hard: [
      ["Una pregunta difícil", "Haga una pregunta difícil que ponga en duda la idea principal."],
      ["Perder el hilo", "Pida al estudiante que vuelva a algo que dijo antes."],
      ["Simplificar", "Diga que no ha entendido y pida que lo explique de forma más sencilla."],
    ],
  },
  appointment: {
    setting: "Una cita normal en la recepción de una clínica o de un banco.",
    role: "un recepcionista o un asesor",
    tone: "tranquilo, eficaz y servicial",
    phrases: [
      "Tengo cita a las tres.",
      "Quería hacer una pregunta.",
      "¿Podría hablar un poco más despacio, por favor?",
      "No entiendo. ¿Podría explicármelo?",
      "¿Cuánto tiempo va a tardar?",
      "Gracias por su ayuda.",
    ],
    exchanges: [
      "Llegue, salude y diga su nombre y su cita",
      "Diga con palabras sencillas por qué ha venido",
      "Responda a unas preguntas sobre su situación",
      "Haga una pregunta y compruebe que ha entendido la respuesta",
      "Acuerden lo que pasa después y despídase",
    ],
    hard: [
      [
        "No entender",
        "Use una palabra algo difícil y vea si el estudiante pide que se la expliquen.",
      ],
      ["Una espera larga", "Diga que habrá un retraso y vea cómo reacciona el estudiante."],
      ["Un formulario", "Pida al estudiante unos datos para un formulario, uno por uno."],
    ],
  },
  housing: {
    setting: "Una conversación con un propietario o una agencia sobre un piso de alquiler.",
    role: "un propietario o un agente inmobiliario",
    tone: "amable pero profesional",
    phrases: [
      "Me interesa el piso.",
      "¿Cuánto es el alquiler al mes?",
      "¿Están incluidos los gastos?",
      "¿Cuándo está disponible?",
      "¿Podría verlo otra vez?",
      "¿Qué necesita de mí?",
    ],
    exchanges: [
      "El saludo y el piso que le interesa",
      "Pregunte por el alquiler y lo que incluye",
      "Responda sobre cuándo quiere mudarse",
      "Pregunte por algo que notó en el piso",
      "Acuerden el siguiente paso y despídase",
    ],
    hard: [
      [
        "Un precio más alto",
        "Diga que el alquiler es más alto que en el anuncio y vea la reacción.",
      ],
      [
        "Un pequeño problema",
        "Mencione un defecto pequeño del piso y pregunte qué opina el estudiante.",
      ],
      ["Una decisión rápida", "Diga que hay más interesados y pida que decida pronto."],
    ],
  },
  first_day: {
    setting: "La primera mañana en un lugar de trabajo nuevo.",
    role: "un compañero nuevo o un jefe",
    tone: "acogedor y con algo de prisa",
    phrases: [
      "Encantado de conocerle.",
      "Soy nuevo aquí.",
      "¿Dónde puedo encontrar",
      "¿Podría enseñarme cómo funciona esto?",
      "¿A qué hora es la comida?",
      "Preguntaré si tengo alguna duda.",
    ],
    exchanges: [
      "Conozca al jefe y preséntese",
      "Haga un pequeño recorrido y pregunte dónde está cada cosa",
      "Conozca a un compañero y charlen un rato",
      "Pregunte cómo funciona una tarea o una herramienta",
      "Acuerden lo que hará después",
    ],
    hard: [
      [
        "Nombres y caras",
        "Presente a varios compañeros de golpe y vea cómo lo lleva el estudiante.",
      ],
      [
        "Instrucciones rápidas",
        "Dé instrucciones rápido y vea si el estudiante pide que las repita.",
      ],
      ["La charla informal", "Pregunte al estudiante qué tal le fue el fin de semana."],
    ],
  },
  other: {
    setting: "Una conversación importante que el estudiante tiene prevista.",
    role: "la persona con la que hablará el estudiante",
    tone: "educado y natural",
    phrases: [
      "Gracias por atenderme.",
      "Quería hablar de",
      "¿Podría contarme más?",
      "No estoy seguro de haber entendido.",
      "Me parece bien.",
      "Muchas gracias.",
    ],
    exchanges: [
      "El saludo y el comienzo de la conversación",
      "Diga de qué ha venido a hablar",
      "Responda a unas preguntas",
      "Haga una pregunta usted también",
      "Acuerden lo que pasa después y cierren",
    ],
    hard: [
      ["Una sorpresa", "Diga algo inesperado y vea cómo reacciona el estudiante."],
      ["No entender", "Hable un poco rápido y vea si el estudiante pide que lo repita."],
      ["Una respuesta difícil", "Diga que no a algo que pida el estudiante y vea cómo continúa."],
    ],
  },
};

export const FALLBACK_BRIEFS: Record<Course, Record<EventKind, RawBrief>> = {
  en: EN,
  fr: FR,
  es: ES,
};
