import type { Level } from "./levels";
import type { PlacementQuestion } from "./placement";

/** Spanish placement test, same 3-questions-per-band structure as placement.ts. */
export const PLACEMENT_QUESTIONS_ES: PlacementQuestion[] = [
  {
    id: "ep1",
    level: "A1",
    prompt: 'How do you say "thank you" in Spanish?',
    choices: ["Hola", "Gracias", "Adiós", "Perdón"],
    answer: 1,
  },
  {
    id: "ep2",
    level: "A1",
    prompt: "Yo ___ estudiante.",
    choices: ["es", "soy", "está", "son"],
    answer: 1,
  },
  {
    id: "ep3",
    level: "A1",
    prompt: 'Choose the correct number for "five":',
    choices: ["cuatro", "cinco", "seis", "nueve"],
    answer: 1,
  },

  {
    id: "ep4",
    level: "A2",
    prompt: "Ayer yo ___ (ir) al mercado.",
    choices: ["voy", "fui", "iré", "iba"],
    answer: 1,
  },
  {
    id: "ep5",
    level: "A2",
    prompt: "Este vestido es más ___ que el otro.",
    choices: ["caro", "cara", "caros", "más caro"],
    answer: 1,
  },
  {
    id: "ep6",
    level: "A2",
    prompt: "Gira a la izquierda ___ el banco.",
    choices: ["después de", "antes de", "sobre", "en"],
    answer: 1,
  },

  {
    id: "ep7",
    level: "B1",
    prompt: "Si llueve, nosotros ___ dentro.",
    choices: ["quedamos", "quedaremos", "quedáramos", "quedábamos"],
    answer: 1,
  },
  {
    id: "ep8",
    level: "B1",
    prompt: "Es necesario que tú ___ a tiempo.",
    choices: ["eres", "serás", "seas", "ser"],
    answer: 2,
  },
  {
    id: "ep9",
    level: "B1",
    prompt: '"Aunque" introduces…',
    choices: ["a cause", "a concession", "a purpose", "a condition"],
    answer: 1,
  },

  {
    id: "ep10",
    level: "B2",
    prompt: "El informe ___ publicado la próxima semana.",
    choices: ["será", "es", "ha sido", "sería"],
    answer: 0,
  },
  {
    id: "ep11",
    level: "B2",
    prompt: "___ el costo, la demanda aumentó.",
    choices: ["Aunque", "A pesar de", "Sin embargo", "Ya que"],
    answer: 1,
  },
  {
    id: "ep12",
    level: "B2",
    prompt: "Los costos subieron; ___, los precios también.",
    choices: ["por lo tanto", "sin embargo", "a pesar de", "aunque"],
    answer: 0,
  },

  {
    id: "ep13",
    level: "C1",
    prompt: 'The most formal equivalent of "descubrir":',
    choices: ["hallar", "constatar", "encontrar", "ver"],
    answer: 1,
  },
  {
    id: "ep14",
    level: "C1",
    prompt: "Si yo ___ (tener) más tiempo, viajaría más.",
    choices: ["tengo", "tendré", "tuviera", "tenía"],
    answer: 2,
  },
  {
    id: "ep15",
    level: "C1",
    prompt: '"No obstante" is closest in meaning to:',
    choices: ["por ejemplo", "sin embargo", "por lo tanto", "es decir"],
    answer: 1,
  },
];
