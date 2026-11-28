import type { Course } from "./course-meta";
import type { EventKind, Stage } from "@/lib/rehearsal-rules";

/**
 * The quick-start presets of Rehearsals: eight ready-made situations, each with a hand-written brief per course. A
 * preset is mapped onto one of the seven event kinds (the schema does not change), makes no model call and uses no brief
 * quota. Everything here is fixed text written by us, so none of it needs the blocked-term filter, and the opener and
 * the key phrases join the shared spoken-line cache (tts-cache.ts).
 *
 * Writing rules (a test pins the counts and lengths; a reviewer reads the rest):
 * - Language of the course, A2 to B1: short sentences, everyday words, one idea per line.
 * - The counterpart is a role ("a hiring manager"), never a name.
 * - The doctor preset practises booking and describing how you feel in simple words. It never gives medical advice or a
 *   diagnosis. The housing, bank and customer-service presets stay general: no legal, financial or immigration advice,
 *   no pressure tactics.
 * - The learner is 13 or older, and the tutor is always an AI (the prompt templates carry the honesty rule).
 * - Meaning lines are in plain English (the app's own language), one short line per key phrase.
 */
export const PRESET_IDS = [
  "job_interview",
  "talk_to_manager",
  "doctor_appointment",
  "apartment_landlord",
  "bank_account",
  "parent_teacher",
  "first_day",
  "customer_service_call",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];
export const isPresetId = (v: unknown): v is PresetId =>
  typeof v === "string" && (PRESET_IDS as readonly string[]).includes(v);

/** What every course shares about a preset: the words of the app's own screens (English) and the event kind it uses. */
export type PresetShared = {
  eventKind: EventKind;
  /** The card and the preview title. */
  label: string;
  /** One line under the title on the preview. */
  blurb: string;
  /** Stored as the rehearsal's counterpart and shown in "Personalise". Fixed text, a role, never a name. */
  counterpart: string;
  /** One line per stage on the preview. */
  stageGoals: Record<Stage, string>;
};

/** One course's hand-written content for a preset. */
export type PresetCourse = {
  setting: string;
  role: string;
  tone: string;
  /** What the counterpart says first. Spoken aloud, so it is a fixed line. */
  opener: string;
  /** 6 to 10 key phrases, each with a short meaning in plain English. */
  phrases: readonly (readonly [phrase: string, meaning: string])[];
  /** 5 beats of the conversation, in order. */
  exchanges: readonly string[];
  /** 3 moments the third stage can raise: a label and an instruction for the other person. */
  hard: readonly (readonly [label: string, prompt: string])[];
};

export const PRESET_SHARED: Record<PresetId, PresetShared> = {
  job_interview: {
    eventKind: "interview",
    label: "Job interview",
    blurb: "A hiring manager asks about you and the job.",
    counterpart: "a hiring manager",
    stageGoals: {
      warmup: "The key phrases for an interview",
      conversation: "The interview, from hello to your own questions",
      hard_moments: "The salary question, a gap in your CV, a question you missed",
    },
  },
  talk_to_manager: {
    eventKind: "meeting",
    label: "Talking to my manager",
    blurb: "A short one-to-one: your work, a request, some feedback.",
    counterpart: "my manager",
    stageGoals: {
      warmup: "The key phrases for talking to a manager",
      conversation: "An update, a request and next steps",
      hard_moments: "Tough feedback, a polite no, a fast instruction",
    },
  },
  doctor_appointment: {
    eventKind: "appointment",
    label: "Doctor's appointment",
    blurb: "A receptionist, then a doctor. Booking and describing how you feel, in simple words.",
    counterpart: "a receptionist and a doctor",
    stageGoals: {
      warmup: "The key phrases for booking and saying how you feel",
      conversation: "Booking in, then seeing the doctor",
      hard_moments: "A question you did not catch, a word you do not know, a time that is full",
    },
  },
  apartment_landlord: {
    eventKind: "housing",
    label: "Apartment viewing or landlord",
    blurb: "A landlord shows you a place to rent. You ask your questions.",
    counterpart: "a landlord",
    stageGoals: {
      warmup: "The key phrases for a viewing",
      conversation: "The visit, from hello to your decision",
      hard_moments: "A question about you, a small problem, something you do not understand",
    },
  },
  bank_account: {
    eventKind: "appointment",
    label: "Opening a bank account",
    blurb: "A bank clerk helps you open a simple account.",
    counterpart: "a bank clerk",
    stageGoals: {
      warmup: "The key phrases for the bank desk",
      conversation: "From hello to signing the form",
      hard_moments: "Spelling your details, a fee question, a missing document",
    },
  },
  parent_teacher: {
    eventKind: "meeting",
    label: "Parent-teacher meeting",
    blurb: "You talk with your child's teacher about how school is going.",
    counterpart: "my child's teacher",
    stageGoals: {
      warmup: "The key phrases for a school meeting",
      conversation: "How your child is doing, and how you can help",
      hard_moments: "A worry about behaviour, a fast explanation, a request for help at home",
    },
  },
  first_day: {
    eventKind: "first_day",
    label: "First day at work or school",
    blurb: "You meet your manager or teacher and the team on day one.",
    counterpart: "my new manager and the team",
    stageGoals: {
      warmup: "The key phrases for a first day",
      conversation: "Meeting people and finding your way",
      hard_moments: "Many names at once, a fast instruction, small talk",
    },
  },
  customer_service_call: {
    eventKind: "other",
    label: "Customer service call",
    blurb: "A phone call about a problem with an order or a bill.",
    counterpart: "a customer service agent",
    stageGoals: {
      warmup: "The key phrases for a phone call",
      conversation: "Explaining the problem and agreeing what happens next",
      hard_moments: "Being put on hold, spelling your details, no answer today",
    },
  },
};

const EN: Record<PresetId, PresetCourse> = {
  job_interview: {
    setting: "A job interview in the employer's office, with one hiring manager.",
    role: "a hiring manager",
    tone: "polite, professional and direct",
    opener: "Good morning, please come in and have a seat. Thank you for coming today.",
    phrases: [
      ["Thank you for having me.", "A polite way to start."],
      ["I have experience in this area.", "You have done this kind of work before."],
      ["One of my strengths is working in a team.", "You are good at working with other people."],
      ["I am available to start in two weeks.", "You can begin work in two weeks."],
      ["Could you tell me more about the role?", "Ask for more details about the job."],
      ["I am looking for a chance to learn and grow.", "You want to build your skills."],
      ["Could you repeat the question, please?", "Ask them to say it again."],
      ["Thank you for your time.", "A polite way to finish."],
    ],
    exchanges: [
      "Greetings and a little small talk before the interview starts",
      "Please introduce yourself",
      "Why do you want this job?",
      "Tell me about a time you solved a problem at work",
      "Do you have any questions for us?",
    ],
    hard: [
      ["The salary question", "Ask what salary the learner expects."],
      ["A gap in the CV", "Ask politely about a period without work in the learner's history."],
      [
        "A question you missed",
        "Ask a long question quickly. If the learner asks you to repeat it, say it again more simply.",
      ],
    ],
  },
  talk_to_manager: {
    setting: "A one-to-one meeting with your manager in a small office.",
    role: "a manager",
    tone: "friendly, busy and to the point",
    opener: "Hi, come in. Do you have a few minutes to talk?",
    phrases: [
      ["Do you have a few minutes to talk?", "Ask if it is a good time."],
      ["I wanted to give you an update on my work.", "You want to say how things are going."],
      ["I am finding this task difficult.", "Say politely that you need help."],
      ["Could I ask for a day off next week?", "A polite request for time off."],
      ["Could you explain that again, please?", "Ask for a clearer explanation."],
      ["Can we go through the priorities?", "Ask which tasks come first."],
      ["I understand. I will do that today.", "You agree and say when."],
      ["Thank you for your feedback.", "A polite answer to advice."],
    ],
    exchanges: [
      "A friendly greeting and how the week is going",
      "An update on the work so far",
      "A problem the learner has, and a request for help",
      "A request, such as a day off, and the manager's answer",
      "Agreeing the next steps and saying thank you",
    ],
    hard: [
      [
        "Tough feedback",
        "Say politely that one piece of the learner's work needs to be better, and what to change.",
      ],
      [
        "A polite no",
        "Say that the learner's request is not possible this week. Let the learner answer calmly.",
      ],
      [
        "A fast instruction",
        "Give a short instruction quickly. If the learner asks you to repeat it, say it again slowly.",
      ],
    ],
  },
  doctor_appointment: {
    setting:
      "A clinic: first the reception, to book a visit, then a short talk with the doctor. Practice for the words only.",
    role: "a receptionist, then a doctor",
    tone: "calm, kind and clear",
    opener: "Good morning, reception. How can I help you?",
    phrases: [
      ["I would like to make an appointment.", "You want to book a visit."],
      ["Do you have anything tomorrow morning?", "Ask for a time."],
      ["I have had a headache since Monday.", "Say what hurts and for how long."],
      ["It hurts here.", "Point and say where it hurts."],
      ["I have had a fever since yesterday.", "Say how long you have felt hot and unwell."],
      ["I feel very tired.", "Say how you feel."],
      ["Could you speak more slowly, please?", "Ask them to slow down."],
      ["Could you say that again, please?", "Ask them to repeat."],
      ["Thank you, I understand.", "Say that you understood."],
    ],
    exchanges: [
      "At the reception: greet and ask for an appointment",
      "Give a name and choose a time",
      "With the doctor: say in simple words what is wrong",
      "Answer simple questions about where it hurts and for how long",
      "Check that you understood the next step, and say thank you",
    ],
    hard: [
      [
        "A question you did not catch",
        "Ask a simple question about how the learner feels, a little fast. Never give medical advice or a diagnosis.",
      ],
      [
        "A word you do not know",
        "Use one slightly harder everyday word about the visit. If the learner asks, explain it in simpler words. Never give medical advice.",
      ],
      [
        "The time is full",
        "Say the time the learner asked for is not free and offer another one. Never give medical advice.",
      ],
    ],
  },
  apartment_landlord: {
    setting: "A visit to a flat that is for rent, with the landlord, inside the flat.",
    role: "a landlord",
    tone: "polite and businesslike",
    opener: "Hello, welcome. Please come in. This is the flat I told you about.",
    phrases: [
      ["Thank you for showing me the flat.", "A polite way to start."],
      ["How much is the rent per month?", "Ask the price."],
      ["Are the bills included?", "Ask if water, power and heating are in the price."],
      ["Is the flat furnished?", "Ask if there is furniture."],
      ["Could I see the kitchen, please?", "Ask to see a room."],
      ["When could I move in?", "Ask about the date."],
      ["I would like to think about it.", "A polite way to say you need time."],
      ["Could you send me the details by email?", "Ask for the information in writing."],
    ],
    exchanges: [
      "Greetings and a first look at the rooms",
      "Questions about the rent and what it includes",
      "The landlord asks a little about the learner",
      "Questions about the area and the date to move in",
      "The learner says what happens next",
    ],
    hard: [
      [
        "A question about you",
        "Ask what the learner does and who would live in the flat. Stay general and friendly. Never give legal advice.",
      ],
      [
        "A small problem in the flat",
        "Let the learner notice something small, such as a loose shelf. See if the learner asks politely about it.",
      ],
      [
        "Something you do not understand",
        "Use one slightly harder word about the flat. If the learner asks, explain it simply. Never give legal advice.",
      ],
    ],
  },
  bank_account: {
    setting: "A bank desk, where you ask to open a simple account.",
    role: "a bank clerk",
    tone: "polite, formal and patient",
    opener: "Good morning. How can I help you today?",
    phrases: [
      ["I would like to open a bank account.", "You want a new account."],
      ["What do I need to bring?", "Ask which papers you need."],
      ["Is there a monthly fee?", "Ask if the account costs money each month."],
      ["How does the card work?", "Ask for a simple explanation."],
      ["Where do I sign?", "Ask where to put your name."],
      ["How long will it take?", "Ask about the time."],
      ["Could I have a copy, please?", "Ask for a paper copy."],
      ["Could you speak more slowly, please?", "Ask them to slow down."],
    ],
    exchanges: [
      "Greeting, and the learner says what they would like",
      "The clerk asks for a document and some details",
      "The learner asks about fees and the card",
      "The clerk explains the form and where to sign",
      "The learner checks what happens next and says thank you",
    ],
    hard: [
      [
        "Spelling your details",
        "Ask the learner to spell their name and the name of their street, one at a time.",
      ],
      [
        "A fee question",
        "Mention a small fee for one service and let the learner ask about it. Never give financial or legal advice.",
      ],
      [
        "A missing document",
        "Say one paper is missing today. Let the learner ask what else they could bring. Never give financial or legal advice.",
      ],
    ],
  },
  parent_teacher: {
    setting: "A parent-teacher meeting at school. The learner is the parent.",
    role: "a teacher",
    tone: "friendly and professional",
    opener:
      "Hello, thank you for coming. Please sit down. Shall we talk about how things are going?",
    phrases: [
      ["How is my child doing in class?", "Ask for a general picture."],
      ["What is going well?", "Ask for the good news."],
      ["What can we do at home to help?", "Ask for ideas for home."],
      ["My child says the homework is hard.", "Share what you heard at home."],
      ["Could you explain that in simpler words?", "Ask for a simpler explanation."],
      ["Is my child happy at school?", "Ask about how your child feels."],
      ["When is the next meeting?", "Ask about the date."],
      ["Thank you for your time.", "A polite way to finish."],
    ],
    exchanges: [
      "Greetings and how the school year is going",
      "The teacher says what is going well",
      "The teacher mentions one thing to work on",
      "The parent asks how to help at home",
      "Agreeing what happens next, and saying thank you",
    ],
    hard: [
      [
        "A worry about behaviour",
        "Say gently that the child talks a lot in class. Let the learner respond calmly.",
      ],
      [
        "A fast explanation",
        "Explain how the marks work, a little fast. If the learner asks you to slow down, explain it simply.",
      ],
      [
        "A request for help at home",
        "Ask if the learner can read with the child ten minutes a day. See how the learner answers.",
      ],
    ],
  },
  first_day: {
    setting: "The first day at a new workplace or school, with the manager or teacher.",
    role: "a manager welcoming a new person",
    tone: "warm, quick and helpful",
    opener: "Welcome! You must be the new person. I am glad you are here. Let me show you around.",
    phrases: [
      ["Nice to meet you.", "A polite first hello."],
      ["I am happy to be here.", "Say you are glad to start."],
      ["Where should I put my things?", "Ask where to leave your bag."],
      ["Who should I ask if I have a question?", "Ask who can help you."],
      ["What time do we have lunch?", "Ask about the day."],
      ["Could you show me how this works?", "Ask for a quick demo."],
      ["Sorry, could you repeat your name?", "Ask someone to say their name again."],
      ["Thank you for your help.", "A polite thank you."],
    ],
    exchanges: [
      "A warm welcome and a first hello",
      "A walk around, with the places the learner needs",
      "Meeting two or three people",
      "What the learner will do today, and who to ask for help",
      "The end of the day, and a thank you",
    ],
    hard: [
      [
        "Many names at once",
        "Introduce three colleagues quickly, one after another. See if the learner asks to hear a name again.",
      ],
      [
        "A fast instruction",
        "Give a short instruction with two steps, quickly. If the learner asks you to repeat, say it again slowly.",
      ],
      [
        "A small talk question",
        "Ask where the learner is from and what they did at the weekend. Keep it friendly.",
      ],
    ],
  },
  customer_service_call: {
    setting: "A phone call to customer service about a problem with an order or a bill.",
    role: "a customer service agent",
    tone: "polite, scripted and a little rushed",
    opener: "Hello, you are through to customer service. How can I help you today?",
    phrases: [
      ["I am calling about my order.", "Say why you are calling."],
      ["I have a problem with my bill.", "Say that something is wrong with a bill."],
      ["It has not arrived yet.", "Say the order is late."],
      ["Let me give you my order number.", "Offer the number the agent needs."],
      ["Could you spell that, please?", "Ask for the letters one by one."],
      ["Could you check that for me, please?", "Ask the agent to look it up."],
      ["Could you send me a confirmation by email?", "Ask for it in writing."],
      ["Could you speak more slowly, please?", "Ask them to slow down."],
    ],
    exchanges: [
      "Greeting, and the learner says why they are calling",
      "The agent asks for an order number and a name",
      "The learner explains the problem",
      "The agent suggests a solution",
      "Agreeing what happens next, and saying thank you",
    ],
    hard: [
      [
        "Put on hold",
        "Say you will put the learner on hold for a moment, then come back and ask the question again.",
      ],
      [
        "Spelling your details",
        "Ask the learner to spell their name and email address, one at a time.",
      ],
      [
        "No answer today",
        "Say you cannot solve it today and offer to call back tomorrow. See if the learner agrees politely.",
      ],
    ],
  },
};

const FR: Record<PresetId, PresetCourse> = {
  job_interview: {
    setting: "Un entretien d'embauche dans les bureaux de l'entreprise, avec un responsable.",
    role: "un responsable du recrutement",
    tone: "poli, professionnel et direct",
    opener: "Bonjour, entrez et asseyez-vous, je vous en prie. Merci de votre venue aujourd'hui.",
    phrases: [
      ["Merci de me recevoir.", "A polite way to start."],
      ["J'ai de l'expérience dans ce domaine.", "You have done this kind of work before."],
      [
        "L'un de mes points forts est le travail en équipe.",
        "You are good at working with others.",
      ],
      ["Je peux commencer dans deux semaines.", "You can begin work in two weeks."],
      ["Pourriez-vous m'en dire plus sur le poste ?", "Ask for more details about the job."],
      ["Je cherche une occasion d'apprendre et de progresser.", "You want to build your skills."],
      ["Pourriez-vous répéter la question, s'il vous plaît ?", "Ask them to say it again."],
      ["Merci pour votre temps.", "A polite way to finish."],
    ],
    exchanges: [
      "Les salutations et un peu de conversation avant l'entretien",
      "Présentez-vous, s'il vous plaît",
      "Pourquoi voulez-vous ce poste ?",
      "Racontez-moi une situation où vous avez résolu un problème au travail",
      "Avez-vous des questions pour nous ?",
    ],
    hard: [
      ["La question du salaire", "Demandez à l'apprenant quelles sont ses prétentions salariales."],
      ["Un trou dans le CV", "Interrogez poliment l'apprenant sur une période sans emploi."],
      [
        "Une question manquée",
        "Posez une longue question assez vite. Si l'apprenant demande de répéter, redites-la plus simplement.",
      ],
    ],
  },
  talk_to_manager: {
    setting: "Un entretien en tête à tête avec votre responsable, dans un petit bureau.",
    role: "un responsable",
    tone: "aimable, occupé et direct",
    opener: "Bonjour, entrez. Vous avez quelques minutes pour parler ?",
    phrases: [
      ["Vous avez quelques minutes pour parler ?", "Ask if it is a good time."],
      ["Je voulais vous faire un point sur mon travail.", "You want to say how things are going."],
      ["Cette tâche est difficile pour moi.", "Say politely that you need help."],
      [
        "Puis-je demander un jour de congé la semaine prochaine ?",
        "A polite request for time off.",
      ],
      ["Pourriez-vous réexpliquer, s'il vous plaît ?", "Ask for a clearer explanation."],
      ["On peut revoir les priorités ?", "Ask which tasks come first."],
      ["Je comprends. Je le fais aujourd'hui.", "You agree and say when."],
      ["Merci pour votre retour.", "A polite answer to advice."],
    ],
    exchanges: [
      "Un accueil aimable et des nouvelles de la semaine",
      "Un point sur le travail en cours",
      "Un problème de l'apprenant et une demande d'aide",
      "Une demande, par exemple un jour de congé, et la réponse du responsable",
      "Les prochaines étapes et un remerciement",
    ],
    hard: [
      [
        "Un retour difficile",
        "Dites poliment qu'un travail de l'apprenant doit être amélioré, et ce qu'il faut changer.",
      ],
      [
        "Un non poli",
        "Dites que la demande de l'apprenant n'est pas possible cette semaine. Laissez-le répondre calmement.",
      ],
      [
        "Une consigne rapide",
        "Donnez une consigne courte, assez vite. Si l'apprenant demande de répéter, redites-la lentement.",
      ],
    ],
  },
  doctor_appointment: {
    setting:
      "Un cabinet médical : d'abord l'accueil, pour prendre rendez-vous, puis un court échange avec le médecin. Entraînement aux mots seulement.",
    role: "une secrétaire, puis un médecin",
    tone: "calme, bienveillant et clair",
    opener: "Bonjour, cabinet médical, j'écoute. Que puis-je faire pour vous ?",
    phrases: [
      ["Je voudrais prendre rendez-vous.", "You want to book a visit."],
      ["Avez-vous quelque chose demain matin ?", "Ask for a time."],
      ["J'ai mal à la tête depuis lundi.", "Say what hurts and for how long."],
      ["J'ai mal ici.", "Point and say where it hurts."],
      ["J'ai de la fièvre depuis hier.", "Say how long you have felt hot and unwell."],
      ["Je n'ai plus beaucoup d'énergie.", "Say how you feel."],
      ["Pourriez-vous parler plus lentement, s'il vous plaît ?", "Ask them to slow down."],
      ["Pourriez-vous répéter, s'il vous plaît ?", "Ask them to repeat."],
      ["Merci, j'ai compris.", "Say that you understood."],
    ],
    exchanges: [
      "À l'accueil : dire bonjour et demander un rendez-vous",
      "Donner son nom et choisir un horaire",
      "Chez le médecin : dire avec des mots simples ce qui ne va pas",
      "Répondre à des questions simples : où et depuis quand",
      "Vérifier qu'on a compris la suite, et remercier",
    ],
    hard: [
      [
        "Une question pas comprise",
        "Posez une question simple sur ce que ressent l'apprenant, un peu vite. Ne donnez jamais de conseil médical ni de diagnostic.",
      ],
      [
        "Un mot inconnu",
        "Utilisez un mot courant un peu plus difficile sur la visite. Si l'apprenant demande, expliquez-le plus simplement. Aucun conseil médical.",
      ],
      [
        "L'horaire est complet",
        "Dites que l'horaire demandé n'est pas libre et proposez-en un autre. Aucun conseil médical.",
      ],
    ],
  },
  apartment_landlord: {
    setting: "La visite d'un logement à louer, avec le propriétaire, dans le logement.",
    role: "un propriétaire",
    tone: "poli et sérieux",
    opener:
      "Bonjour, bienvenue. Entrez, je vous en prie. Voici l'appartement dont je vous ai parlé.",
    phrases: [
      ["Merci de me faire visiter l'appartement.", "A polite way to start."],
      ["Quel est le loyer par mois ?", "Ask the price."],
      ["Les charges sont-elles comprises ?", "Ask if water, power and heating are in the price."],
      ["L'appartement est-il meublé ?", "Ask if there is furniture."],
      ["Puis-je voir la cuisine, s'il vous plaît ?", "Ask to see a room."],
      ["Quand pourrais-je emménager ?", "Ask about the date."],
      ["J'aimerais y réfléchir.", "A polite way to say you need time."],
      ["Pourriez-vous m'envoyer les détails par e-mail ?", "Ask for the information in writing."],
    ],
    exchanges: [
      "Les salutations et un premier regard sur les pièces",
      "Des questions sur le loyer et ce qu'il comprend",
      "Le propriétaire pose quelques questions sur l'apprenant",
      "Des questions sur le quartier et la date d'emménagement",
      "L'apprenant dit ce qui se passe ensuite",
    ],
    hard: [
      [
        "Une question sur vous",
        "Demandez ce que fait l'apprenant et qui habiterait là. Restez général et aimable. Ne donnez aucun conseil juridique.",
      ],
      [
        "Un petit problème",
        "Laissez l'apprenant remarquer un détail, par exemple une étagère qui bouge. Voyez s'il en parle poliment.",
      ],
      [
        "Un mot pas compris",
        "Utilisez un mot un peu plus difficile sur le logement. Si l'apprenant demande, expliquez-le simplement. Aucun conseil juridique.",
      ],
    ],
  },
  bank_account: {
    setting: "Un guichet de banque, où vous demandez à ouvrir un compte simple.",
    role: "un conseiller de banque",
    tone: "poli, formel et patient",
    opener: "Bonjour. Que puis-je faire pour vous aujourd'hui ?",
    phrases: [
      ["Je voudrais ouvrir un compte bancaire.", "You want a new account."],
      ["Qu'est-ce que je dois apporter ?", "Ask which papers you need."],
      ["Y a-t-il des frais mensuels ?", "Ask if the account costs money each month."],
      ["Comment fonctionne la carte ?", "Ask for a simple explanation."],
      ["Où dois-je signer ?", "Ask where to put your name."],
      ["Combien de temps cela prend-il ?", "Ask about the time."],
      ["Puis-je avoir une copie, s'il vous plaît ?", "Ask for a paper copy."],
      ["Pourriez-vous parler plus lentement, s'il vous plaît ?", "Ask them to slow down."],
    ],
    exchanges: [
      "Les salutations, et l'apprenant dit ce qu'il souhaite",
      "Le conseiller demande un document et quelques informations",
      "L'apprenant pose des questions sur les frais et la carte",
      "Le conseiller explique le formulaire et où signer",
      "L'apprenant vérifie la suite et remercie",
    ],
    hard: [
      [
        "Épeler vos informations",
        "Demandez à l'apprenant d'épeler son nom, puis le nom de sa rue, un à la fois.",
      ],
      [
        "Une question de frais",
        "Mentionnez de petits frais pour un service et laissez l'apprenant poser des questions. Aucun conseil financier ni juridique.",
      ],
      [
        "Un document manquant",
        "Dites qu'il manque un papier aujourd'hui. Laissez l'apprenant demander ce qu'il pourrait apporter. Aucun conseil financier ni juridique.",
      ],
    ],
  },
  parent_teacher: {
    setting: "Une réunion parents-professeurs à l'école. L'apprenant est le parent.",
    role: "un enseignant",
    tone: "aimable et professionnel",
    opener:
      "Bonjour, merci de votre venue. Asseyez-vous, je vous en prie. On parle de la façon dont ça se passe ?",
    phrases: [
      ["Comment va mon enfant en classe ?", "Ask for a general picture."],
      ["Qu'est-ce qui va bien ?", "Ask for the good news."],
      ["Que pouvons-nous faire à la maison pour l'aider ?", "Ask for ideas for home."],
      ["Mon enfant dit que les devoirs sont difficiles.", "Share what you heard at home."],
      ["Pourriez-vous expliquer avec des mots plus simples ?", "Ask for a simpler explanation."],
      ["Mon enfant est-il heureux à l'école ?", "Ask about how your child feels."],
      ["Quand aura lieu la prochaine réunion ?", "Ask about the date."],
      ["Merci pour votre temps.", "A polite way to finish."],
    ],
    exchanges: [
      "Les salutations et le déroulement de l'année",
      "L'enseignant dit ce qui va bien",
      "L'enseignant évoque un point à travailler",
      "Le parent demande comment aider à la maison",
      "La suite, et un remerciement",
    ],
    hard: [
      [
        "Une inquiétude sur le comportement",
        "Dites doucement que l'enfant parle beaucoup en classe. Laissez l'apprenant répondre calmement.",
      ],
      [
        "Une explication rapide",
        "Expliquez le système de notes, un peu vite. Si l'apprenant demande de ralentir, expliquez simplement.",
      ],
      [
        "Une demande d'aide à la maison",
        "Demandez si l'apprenant peut lire dix minutes par jour avec l'enfant. Voyez comment il répond.",
      ],
    ],
  },
  first_day: {
    setting:
      "Le premier jour dans un nouveau lieu de travail ou une nouvelle école, avec le responsable ou l'enseignant.",
    role: "un responsable qui accueille une nouvelle personne",
    tone: "chaleureux, rapide et serviable",
    opener:
      "Bienvenue ! Tu dois être la nouvelle personne. Ça me fait plaisir que tu sois là. Je te montre les lieux.",
    phrases: [
      ["Ça me fait plaisir de faire ta connaissance.", "A polite first hello."],
      ["Ça me fait plaisir d'être ici.", "Say you are glad to start."],
      ["Où puis-je poser mes affaires ?", "Ask where to leave your bag."],
      ["À qui puis-je poser mes questions ?", "Ask who can help you."],
      ["À quelle heure est la pause déjeuner ?", "Ask about the day."],
      ["Pourrais-tu me montrer comment ça marche ?", "Ask for a quick demo."],
      ["Excuse-moi, tu peux répéter ton prénom ?", "Ask someone to say their name again."],
      ["Merci pour ton aide.", "A polite thank you."],
    ],
    exchanges: [
      "Un accueil chaleureux et un premier bonjour",
      "Une visite avec les endroits utiles à l'apprenant",
      "La rencontre de deux ou trois personnes",
      "Ce que l'apprenant fera aujourd'hui, et à qui demander de l'aide",
      "La fin de la journée et un remerciement",
    ],
    hard: [
      [
        "Beaucoup de prénoms d'un coup",
        "Présentez trois collègues vite, l'un après l'autre. Voyez si l'apprenant demande à réentendre un prénom.",
      ],
      [
        "Une consigne rapide",
        "Donnez une consigne en deux étapes, assez vite. Si l'apprenant demande de répéter, redites-la lentement.",
      ],
      [
        "Une question de conversation",
        "Demandez d'où vient l'apprenant et ce qu'il a fait ce week-end. Restez aimable.",
      ],
    ],
  },
  customer_service_call: {
    setting: "Un appel au service client à propos d'un problème de commande ou de facture.",
    role: "un conseiller du service client",
    tone: "poli, méthodique et un peu pressé",
    opener: "Bonjour, vous êtes en contact avec le service client. Comment puis-je vous aider ?",
    phrases: [
      ["Je vous appelle au sujet de ma commande.", "Say why you are calling."],
      ["J'ai un problème avec ma facture.", "Say that something is wrong with a bill."],
      ["Elle n'est pas encore arrivée.", "Say the order is late."],
      ["Je vous donne mon numéro de commande.", "Offer the number the agent needs."],
      ["Pourriez-vous épeler, s'il vous plaît ?", "Ask for the letters one by one."],
      ["Pourriez-vous vérifier, s'il vous plaît ?", "Ask the agent to look it up."],
      ["Pourriez-vous m'envoyer une confirmation par e-mail ?", "Ask for it in writing."],
      ["Pourriez-vous parler plus lentement, s'il vous plaît ?", "Ask them to slow down."],
    ],
    exchanges: [
      "Les salutations, et l'apprenant dit pourquoi il appelle",
      "Le conseiller demande un numéro de commande et un nom",
      "L'apprenant explique le problème",
      "Le conseiller propose une solution",
      "La suite, et un remerciement",
    ],
    hard: [
      [
        "Mis en attente",
        "Dites que vous mettez l'apprenant en attente un instant, puis revenez et reposez la question.",
      ],
      [
        "Épeler vos informations",
        "Demandez à l'apprenant d'épeler son nom et son adresse e-mail, un à la fois.",
      ],
      [
        "Pas de réponse aujourd'hui",
        "Dites que vous ne pouvez pas régler cela aujourd'hui et proposez de rappeler demain. Voyez si l'apprenant accepte poliment.",
      ],
    ],
  },
};

const ES: Record<PresetId, PresetCourse> = {
  job_interview: {
    setting: "Una entrevista de trabajo en las oficinas de la empresa, con un responsable.",
    role: "un responsable de selección",
    tone: "educado, profesional y directo",
    opener: "Buenos días, pase y siéntese, por favor. Gracias por venir hoy.",
    phrases: [
      ["Gracias por recibirme.", "A polite way to start."],
      ["Tengo experiencia en este campo.", "You have done this kind of work before."],
      [
        "Uno de mis puntos fuertes es el trabajo en equipo.",
        "You are good at working with others.",
      ],
      ["Puedo empezar en dos semanas.", "You can begin work in two weeks."],
      ["¿Podría contarme más sobre el puesto?", "Ask for more details about the job."],
      ["Busco una oportunidad para aprender y crecer.", "You want to build your skills."],
      ["¿Podría repetir la pregunta, por favor?", "Ask them to say it again."],
      ["Gracias por su tiempo.", "A polite way to finish."],
    ],
    exchanges: [
      "El saludo y un poco de conversación antes de empezar",
      "Preséntese, por favor",
      "¿Por qué quiere este trabajo?",
      "Cuénteme alguna ocasión en que resolvió un problema en el trabajo",
      "¿Tiene alguna pregunta para nosotros?",
    ],
    hard: [
      ["La pregunta del sueldo", "Pregunte al estudiante qué sueldo espera."],
      ["Un hueco en el currículum", "Pregunte con educación por un periodo sin trabajo."],
      [
        "Una pregunta que no se oyó",
        "Haga una pregunta larga con cierta rapidez. Si el estudiante pide que la repita, dígala otra vez más sencilla.",
      ],
    ],
  },
  talk_to_manager: {
    setting: "Una reunión a solas con su jefe, en un despacho pequeño.",
    role: "un jefe",
    tone: "amable, ocupado y directo",
    opener: "Hola, pase. ¿Tiene unos minutos para hablar?",
    phrases: [
      ["¿Tiene unos minutos para hablar?", "Ask if it is a good time."],
      ["Quería ponerle al día sobre mi trabajo.", "You want to say how things are going."],
      ["Esta tarea me resulta difícil.", "Say politely that you need help."],
      ["¿Podría pedir un día libre la semana que viene?", "A polite request for time off."],
      ["¿Podría explicarlo otra vez, por favor?", "Ask for a clearer explanation."],
      ["¿Podemos repasar las prioridades?", "Ask which tasks come first."],
      ["Entiendo. Lo hago hoy.", "You agree and say when."],
      ["Gracias por sus comentarios.", "A polite answer to advice."],
    ],
    exchanges: [
      "Un saludo amable y cómo va la semana",
      "Un resumen del trabajo hasta ahora",
      "Un problema del estudiante y una petición de ayuda",
      "Una petición, por ejemplo un día libre, y la respuesta del jefe",
      "Los siguientes pasos y un agradecimiento",
    ],
    hard: [
      [
        "Una crítica difícil",
        "Diga con educación que un trabajo del estudiante debe mejorar, y qué cambiar.",
      ],
      [
        "Un no educado",
        "Diga que la petición del estudiante no es posible esta semana. Deje que responda con calma.",
      ],
      [
        "Una instrucción rápida",
        "Dé una instrucción corta con rapidez. Si el estudiante pide que la repita, dígala despacio.",
      ],
    ],
  },
  doctor_appointment: {
    setting:
      "Un centro de salud: primero la recepción, para pedir cita, y luego una charla corta con el médico. Solo se practican las palabras.",
    role: "un recepcionista y luego un médico",
    tone: "tranquilo, amable y claro",
    opener: "Buenos días, centro de salud. ¿En qué puedo ayudarle?",
    phrases: [
      ["Quisiera pedir una cita.", "You want to book a visit."],
      ["¿Tienen algo mañana por la mañana?", "Ask for a time."],
      ["Me duele la cabeza desde el lunes.", "Say what hurts and for how long."],
      ["Me duele aquí.", "Point and say where it hurts."],
      ["Tengo fiebre desde ayer.", "Say how long you have felt hot and unwell."],
      ["Me siento sin energía.", "Say how you feel."],
      ["¿Podría hablar más despacio, por favor?", "Ask them to slow down."],
      ["¿Podría repetirlo, por favor?", "Ask them to repeat."],
      ["Gracias, lo he entendido.", "Say that you understood."],
    ],
    exchanges: [
      "En recepción: saludar y pedir una cita",
      "Dar el nombre y elegir una hora",
      "Con el médico: decir con palabras sencillas qué le pasa",
      "Responder a preguntas sencillas: dónde le duele y desde cuándo",
      "Comprobar que entendió el siguiente paso y dar las gracias",
    ],
    hard: [
      [
        "Una pregunta que no se entendió",
        "Haga una pregunta sencilla sobre cómo se siente el estudiante, un poco rápido. Nunca dé consejo médico ni diagnóstico.",
      ],
      [
        "Una palabra desconocida",
        "Use una palabra corriente algo más difícil sobre la visita. Si el estudiante pregunta, explíquela con palabras más simples. Ningún consejo médico.",
      ],
      [
        "No queda hueco a esa hora",
        "Diga que la hora pedida no está libre y ofrezca otra. Ningún consejo médico.",
      ],
    ],
  },
  apartment_landlord: {
    setting: "La visita a un piso en alquiler, con el propietario, dentro del piso.",
    role: "un propietario",
    tone: "educado y formal",
    opener: "Hola, pase, por favor. Este es el piso del que le hablé.",
    phrases: [
      ["Gracias por enseñarme el piso.", "A polite way to start."],
      ["¿Cuánto es el alquiler al mes?", "Ask the price."],
      ["¿Los gastos están incluidos?", "Ask if water, power and heating are in the price."],
      ["¿El piso está amueblado?", "Ask if there is furniture."],
      ["¿Podría ver la cocina, por favor?", "Ask to see a room."],
      ["¿Cuándo podría mudarme?", "Ask about the date."],
      ["Me gustaría pensarlo.", "A polite way to say you need time."],
      [
        "¿Podría enviarme los detalles por correo electrónico?",
        "Ask for the information in writing.",
      ],
    ],
    exchanges: [
      "El saludo y un primer vistazo a las habitaciones",
      "Preguntas sobre el alquiler y lo que incluye",
      "El propietario hace algunas preguntas al estudiante",
      "Preguntas sobre el barrio y la fecha para mudarse",
      "El estudiante dice qué pasa a continuación",
    ],
    hard: [
      [
        "Una pregunta sobre usted",
        "Pregunte a qué se dedica el estudiante y quién viviría en el piso. Sea general y amable. No dé consejo legal.",
      ],
      [
        "Un pequeño problema",
        "Deje que el estudiante note un detalle, por ejemplo una estantería floja. Vea si lo comenta con educación.",
      ],
      [
        "Una palabra que no se entendió",
        "Use una palabra algo más difícil sobre el piso. Si el estudiante pregunta, explíquela con sencillez. No dé consejo legal.",
      ],
    ],
  },
  bank_account: {
    setting: "Una ventanilla del banco, donde pide abrir una cuenta sencilla.",
    role: "un empleado del banco",
    tone: "educado, formal y paciente",
    opener: "Buenos días. ¿En qué puedo ayudarle hoy?",
    phrases: [
      ["Quisiera abrir una cuenta bancaria.", "You want a new account."],
      ["¿Qué necesito traer?", "Ask which papers you need."],
      ["¿Hay una comisión mensual?", "Ask if the account costs money each month."],
      ["¿Cómo funciona la tarjeta?", "Ask for a simple explanation."],
      ["¿Dónde tengo que firmar?", "Ask where to put your name."],
      ["¿Cuánto tiempo tarda?", "Ask about the time."],
      ["¿Podría darme una copia, por favor?", "Ask for a paper copy."],
      ["¿Podría hablar más despacio, por favor?", "Ask them to slow down."],
    ],
    exchanges: [
      "El saludo, y el estudiante dice lo que quiere",
      "El empleado pide un documento y algunos datos",
      "El estudiante pregunta por las comisiones y la tarjeta",
      "El empleado explica el formulario y dónde firmar",
      "El estudiante comprueba qué pasa después y da las gracias",
    ],
    hard: [
      [
        "Deletrear sus datos",
        "Pida al estudiante que deletree su nombre y el nombre de su calle, uno a uno.",
      ],
      [
        "Una pregunta de comisiones",
        "Mencione una pequeña comisión por un servicio y deje que el estudiante pregunte. Ningún consejo financiero ni legal.",
      ],
      [
        "Un documento que falta",
        "Diga que hoy falta un papel. Deje que el estudiante pregunte qué más podría traer. Ningún consejo financiero ni legal.",
      ],
    ],
  },
  parent_teacher: {
    setting:
      "Una reunión de padres y profesores en el colegio. El estudiante es el padre o la madre.",
    role: "un profesor",
    tone: "amable y profesional",
    opener: "Hola, gracias por venir. Siéntese, por favor. ¿Hablamos de cómo van las cosas?",
    phrases: [
      ["¿Cómo va mi hijo en clase?", "Ask for a general picture."],
      ["¿Qué va bien?", "Ask for the good news."],
      ["¿Qué podemos hacer en casa para ayudar?", "Ask for ideas for home."],
      ["Mi hijo dice que los deberes son difíciles.", "Share what you heard at home."],
      ["¿Podría explicarlo con palabras más sencillas?", "Ask for a simpler explanation."],
      ["¿Mi hijo es feliz en el colegio?", "Ask about how your child feels."],
      ["¿Cuándo es la próxima reunión?", "Ask about the date."],
      ["Gracias por su tiempo.", "A polite way to finish."],
    ],
    exchanges: [
      "El saludo y cómo va el curso",
      "El profesor dice lo que va bien",
      "El profesor menciona algo que mejorar",
      "El padre o la madre pregunta cómo ayudar en casa",
      "Lo que pasa a continuación, y un agradecimiento",
    ],
    hard: [
      [
        "Una preocupación de conducta",
        "Diga con suavidad que el niño habla mucho en clase. Deje que el estudiante responda con calma.",
      ],
      [
        "Una explicación rápida",
        "Explique cómo funcionan las notas, un poco rápido. Si el estudiante pide ir más despacio, explíquelo con sencillez.",
      ],
      [
        "Una petición de ayuda en casa",
        "Pregunte si el estudiante puede leer diez minutos al día con el niño. Vea cómo responde.",
      ],
    ],
  },
  first_day: {
    setting: "El primer día en un nuevo trabajo o colegio, con el jefe o el profesor.",
    role: "un jefe que da la bienvenida a una persona nueva",
    tone: "cálido, rápido y servicial",
    opener:
      "¡Te damos la bienvenida! Tú debes de ser la persona nueva. Me alegro de que estés aquí. Te enseño todo.",
    phrases: [
      ["Mucho gusto.", "A polite first hello."],
      ["Me alegra estar aquí.", "Say you are glad to start."],
      ["¿Dónde puedo dejar mis cosas?", "Ask where to leave your bag."],
      ["¿A quién puedo preguntar si tengo dudas?", "Ask who can help you."],
      ["¿A qué hora es la comida?", "Ask about the day."],
      ["¿Me podrías enseñar cómo funciona esto?", "Ask for a quick demo."],
      ["Perdona, ¿puedes repetir tu nombre?", "Ask someone to say their name again."],
      ["Gracias por tu ayuda.", "A polite thank you."],
    ],
    exchanges: [
      "Una bienvenida cálida y un primer saludo",
      "Un paseo por los sitios que el estudiante necesita",
      "Conocer a dos o tres personas",
      "Lo que hará el estudiante hoy, y a quién pedir ayuda",
      "El final del día y un agradecimiento",
    ],
    hard: [
      [
        "Muchos nombres a la vez",
        "Presente a tres compañeros rápido, uno tras otro. Vea si el estudiante pide oír un nombre otra vez.",
      ],
      [
        "Una instrucción rápida",
        "Dé una instrucción de dos pasos con rapidez. Si el estudiante pide que la repita, dígala despacio.",
      ],
      [
        "Una pregunta de charla",
        "Pregunte de dónde es el estudiante y qué hizo el fin de semana. Sea amable.",
      ],
    ],
  },
  customer_service_call: {
    setting:
      "Una llamada al servicio de atención al cliente por un problema con un pedido o una factura.",
    role: "un agente de atención al cliente",
    tone: "educado, metódico y un poco apresurado",
    opener: "Hola, está hablando con atención al cliente. ¿En qué puedo ayudarle?",
    phrases: [
      ["Llamo por mi pedido.", "Say why you are calling."],
      ["Tengo un problema con mi factura.", "Say that something is wrong with a bill."],
      ["Todavía no ha llegado.", "Say the order is late."],
      ["Le doy mi número de pedido.", "Offer the number the agent needs."],
      ["¿Podría deletrearlo, por favor?", "Ask for the letters one by one."],
      ["¿Podría comprobarlo, por favor?", "Ask the agent to look it up."],
      ["¿Podría enviarme una confirmación por correo electrónico?", "Ask for it in writing."],
      ["¿Podría hablar más despacio, por favor?", "Ask them to slow down."],
    ],
    exchanges: [
      "El saludo, y el estudiante dice por qué llama",
      "El agente pide un número de pedido y un nombre",
      "El estudiante explica el problema",
      "El agente propone una solución",
      "Lo que pasa a continuación, y un agradecimiento",
    ],
    hard: [
      [
        "En espera",
        "Diga que pone al estudiante en espera un momento, y luego vuelva y repita la pregunta.",
      ],
      [
        "Deletrear sus datos",
        "Pida al estudiante que deletree su nombre y su correo electrónico, uno a uno.",
      ],
      [
        "Sin respuesta hoy",
        "Diga que hoy no puede resolverlo y ofrezca llamar mañana. Vea si el estudiante acepta con educación.",
      ],
    ],
  },
};

export const PRESET_COURSES: Record<Course, Record<PresetId, PresetCourse>> = {
  en: EN,
  fr: FR,
  es: ES,
};
