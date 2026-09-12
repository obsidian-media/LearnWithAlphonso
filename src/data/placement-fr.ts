import type { Level } from "./levels";
import type { PlacementQuestion } from "./placement";

/** French placement test, same 3-questions-per-band structure as placement.ts. */
export const PLACEMENT_QUESTIONS_FR: PlacementQuestion[] = [
  {
    id: "fp1",
    level: "A1",
    prompt: 'Comment dit-on "thank you" en français ?',
    choices: ["Bonjour", "Merci", "Pardon", "Salut"],
    answer: 1,
  },
  {
    id: "fp2",
    level: "A1",
    prompt: "Je ___ étudiant.",
    choices: ["es", "suis", "est", "sont"],
    answer: 1,
  },
  {
    id: "fp3",
    level: "A1",
    prompt: 'Choisissez le bon nombre pour "cinq":',
    choices: ["4", "5", "6", "9"],
    answer: 1,
  },

  {
    id: "fp4",
    level: "A2",
    prompt: "Hier, je ___ (aller) au marché.",
    choices: ["vais", "suis allé", "aller", "irai"],
    answer: 1,
  },
  {
    id: "fp5",
    level: "A2",
    prompt: "Cette robe est plus ___ que l'autre.",
    choices: ["cher", "chère", "chers", "chère que"],
    answer: 1,
  },
  {
    id: "fp6",
    level: "A2",
    prompt: "Tournez à gauche ___ la banque.",
    choices: ["après", "avant", "sur", "dans"],
    answer: 0,
  },

  {
    id: "fp7",
    level: "B1",
    prompt: "S'il pleut, nous ___ à l'intérieur.",
    choices: ["restons", "resterons", "resterions", "restâmes"],
    answer: 1,
  },
  {
    id: "fp8",
    level: "B1",
    prompt: "Il faut que tu ___ à l'heure.",
    choices: ["es", "seras", "sois", "être"],
    answer: 2,
  },
  {
    id: "fp9",
    level: "B1",
    prompt: '"Bien que" introduit…',
    choices: ["une cause", "une concession", "un but", "une condition"],
    answer: 1,
  },

  {
    id: "fp10",
    level: "B2",
    prompt: "Le rapport ___ publié la semaine prochaine.",
    choices: ["sera", "est", "a été", "serait"],
    answer: 0,
  },
  {
    id: "fp11",
    level: "B2",
    prompt: "___ le coût, la demande a augmenté.",
    choices: ["Bien que", "Malgré", "Cependant", "Puisque"],
    answer: 1,
  },
  {
    id: "fp12",
    level: "B2",
    prompt: "Les coûts ont augmenté ; ___, les prix ont suivi.",
    choices: ["par conséquent", "cependant", "malgré", "bien que"],
    answer: 0,
  },

  {
    id: "fp13",
    level: "C1",
    prompt: 'L\'équivalent le plus formel de "découvrir":',
    choices: ["dénicher", "constater", "trouver", "voir"],
    answer: 1,
  },
  {
    id: "fp14",
    level: "C1",
    prompt: '"Cela ne tient pas ___."',
    choices: ["l'air", "debout", "le sol", "le poids"],
    answer: 1,
  },
  {
    id: "fp15",
    level: "C1",
    prompt: "Quelle phrase évite la lourdeur nominale ?",
    choices: [
      "La mise en œuvre de la réduction des coûts",
      "Nous avons réduit les coûts",
      "La réduction des coûts en œuvre",
      "L'entreprise de réduction des coûts",
    ],
    answer: 1,
  },
];

export const PLACEMENT_ORDER_FR: Level[] = ["A1", "A2", "B1", "B2", "C1"];
