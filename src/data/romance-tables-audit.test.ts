import { describe, expect, it } from "vitest";
import { BANK_ES } from "./lesson-bank-es";
import { BANK_FR } from "./lesson-bank-fr";
import type { Pack } from "./bank-engine";
import {
  HOMOPHONE_GROUPS,
  PACK_CLASS_LABELS,
  ROMANCE_A1A2,
  SYNONYM_GROUPS,
  bannedBecause,
  homophoneOnly,
  optionClass,
  sameMeaning,
} from "./romance-options";

// What this guards (backlog 0.0-av, item 5): the option gate decides with the engine's own tables
// (optionClass labels, SYNONYM_GROUPS, HOMOPHONE_GROUPS, bannedBecause), so a wrong table entry
// passes silently: the gate and the engine agree with each other and are both wrong. This file
// checks the tables against facts that do not come from them: a fixed list of weekday and month
// names, the English gloss each pack line already carries, a phonetic fold written here, and a
// short list of word pairs a teacher would sign. Add to the lists when you add to a table.

const packs: Pack[] = [BANK_FR, BANK_ES]
  .flatMap((b) => [...b.A1, ...b.A2])
  .filter((p) => ROMANCE_A1A2.test(p.id));
const lines = (p: Pack) =>
  p.data
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((x) => x.trim()));

const WEEKDAYS = new Set([
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
]);
const MONTHS = new Set([
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]);

describe("class labels agree with facts the labels do not supply", () => {
  const labelled = Object.entries(PACK_CLASS_LABELS).map(([id, labels]) => ({
    id,
    labels,
    rows: lines(packs.find((p) => p.id === id)!),
  }));

  it("a day or month label sits on a weekday or month name, and every such name is labelled so", () => {
    for (const { id, labels, rows } of labelled)
      rows.forEach(([, answer], i) => {
        const a = answer!.toLowerCase();
        const l = labels[i];
        expect(l === "d", `${id} line ${i} ${a}: day label`).toBe(WEEKDAYS.has(a));
        expect(l === "m", `${id} line ${i} ${a}: month label`).toBe(MONTHS.has(a));
      });
  });

  it("a verb label sits on a gloss that starts with 'to ', and no other label does", () => {
    for (const { id, labels, rows } of labelled)
      rows.forEach(([gloss], i) =>
        expect(labels[i] === "v", `${id} line ${i} "${gloss}"`).toBe(/^to [a-z]/i.test(gloss!)),
      );
  });

  it("an unlabelled 'to ...' gloss is a verb whatever the pack (optionClass against the gloss)", () => {
    for (const p of packs)
      lines(p).forEach(([gloss, answer], i) => {
        if (/^to [a-z]/i.test(gloss!))
          expect(optionClass(p.id, i, gloss!, answer!), `${p.id} ${i}`).toBe("verb");
      });
  });

  it("the old failures stay classified: a colour is not a noun, a verb is not a noun", () => {
    expect(optionClass("fra1p5", 0, "Monday", "lundi")).toBe("day");
    expect(optionClass("fra1p5", 7, "February", "février")).toBe("month");
    expect(optionClass("esa1p25", 0, "red", "rojo")).toBe("adj");
    expect(optionClass("esa1p25", 10, "square", "el cuadrado")).toBe("noun");
  });
});

describe("synonym groups and bans against pairs a teacher would sign", () => {
  const SAME: [string, string][] = [
    ["souvent", "fréquemment"],
    ["parfois", "de temps en temps"],
    ["tous les jours", "chaque jour"],
    ["a veces", "de vez en cuando"],
    ["completamente", "totalmente"],
    ["usé", "vieux"],
  ];
  const DIFFERENT: [string, string][] = [
    ["souvent", "rarement"],
    ["toujours", "jamais"],
    ["parfois", "toujours"],
    ["tous les jours", "tous les mois"],
    ["mucho", "poco"],
    ["algunos", "ninguno"],
    ["a veces", "nunca"],
    ["neuf", "vieux"],
    ["dans", "sous"],
  ];

  it("known synonyms are banned beside each other", () => {
    for (const [a, b] of SAME) expect(bannedBecause(a, b), `${a} / ${b}`).not.toBeNull();
  });

  it("known opposites and neighbours are never banned for meaning", () => {
    for (const [a, b] of DIFFERENT) {
      expect(sameMeaning(a, b), `${a} / ${b}`).toBe(false);
      expect(sameMeaning(b, a), `${b} / ${a}`).toBe(false);
    }
  });

  it("no group lists a word twice, and no group mixes in an opposite", () => {
    const OPPOSITES = [
      ["souvent", "rarement"],
      ["toujours", "jamais"],
      ["mucho", "poco"],
      ["dans", "sous"],
    ];
    for (const g of SYNONYM_GROUPS) {
      expect(new Set(g).size, g.join(" / ")).toBe(g.length);
      for (const [x, y] of OPPOSITES)
        expect(g.includes(x) && g.includes(y), `${x} / ${y} in ${g.join(" / ")}`).toBe(false);
    }
  });
});

describe("homophone groups against a phonetic fold written here", () => {
  // Latin American Spanish: seseo (s, z, c before e/i), yeismo (ll, y), b = v, silent h. A pair
  // that the fold keeps apart is not a homophone pair there; one it merges must be in a group.
  const fold = (w: string) =>
    w
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/h/g, "")
      .replace(/v/g, "b")
      .replace(/ll/g, "y")
      .replace(/z/g, "s")
      .replace(/c([ei])/g, "s$1")
      .replace(/qu/g, "k")
      .replace(/c/g, "k");
  const isSpanish = (g: string[]) =>
    g.some((w) => /[ñ]|ll|cima|casa|taza/.test(w)) ||
    g.every(
      (w) =>
        !/^(ces|ses|cou|coup|vert|verre|pain|pin|mer|mère|maire|sain|saint|sein|foie|fois|foi|ou|où|a|à|sur|sûr|vers|ver)$/.test(
          w,
        ),
    );

  it("every word sits in one group only", () => {
    const seen = new Map<string, number>();
    HOMOPHONE_GROUPS.forEach((g, i) =>
      g.forEach((w) => {
        expect(seen.has(w), `${w} in groups ${seen.get(w)} and ${i}`).toBe(false);
        seen.set(w, i);
      }),
    );
  });

  it("every Spanish group folds to one sound", () => {
    for (const g of HOMOPHONE_GROUPS.filter(isSpanish))
      expect(new Set(g.map(fold)).size, g.join(" / ")).toBe(1);
  });

  it("known French homophones are in a group and known non-homophones are not", () => {
    for (const [a, b] of [
      ["ces", "ses"],
      ["pain", "pin"],
      ["mer", "mère"],
      ["sur", "sûr"],
      ["foie", "fois"],
    ] as const)
      expect(homophoneOnly(`${a} photos`, `${b} photos`), `${a} / ${b}`).toBe(true);
    for (const [a, b] of [
      ["pain", "plein"],
      ["mer", "mur"],
      ["sur", "sous"],
      ["cou", "cour"],
      ["ces", "ces"],
    ] as const)
      expect(homophoneOnly(`${a} photos`, `${b} photos`), `${a} / ${b}`).toBe(false);
  });

  it("known Spanish pairs, and pairs that sound different", () => {
    expect(homophoneOnly("la casa", "la caza")).toBe(true);
    expect(homophoneOnly("el pollo", "el poyo")).toBe(true);
    expect(homophoneOnly("la casa", "la cosa")).toBe(false);
    expect(homophoneOnly("el pollo", "el polo")).toBe(false);
    expect(homophoneOnly("la vaca", "la vara")).toBe(false);
  });
});
