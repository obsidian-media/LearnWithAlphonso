import { describe, expect, it } from "vitest";
import { esDefects } from "./es-check";
import { frDefects } from "./fr-check";
import { FR_H_FLAGS } from "./fr-compile";

/**
 * Gate 4 (unit level): the checker itself, exercised on hand-written cases the
 * generated content may never reach (aspirated h, y-initial words, the
 * contractions). These use their own flag list, not the lexicon's, so a word
 * the lexicon lacks still proves the rule.
 */
const KNOWN = new Map<string, boolean>([
  ["héros", false],
  ["haricots", false],
  ["handball", false],
  ["hauteur", false],
  ["honte", false],
  ["yaourt", false],
  ["yoga", false],
  ["homme", true],
  ["heure", true],
  ["hôtel", true],
  ["habite", true],
]);
const d = (s: string) => frDefects(s, KNOWN);

describe("frDefects: elision", () => {
  it("accepts correct elision and rejects missing or wrong elision", () => {
    expect(d("Il aime l'eau.")).toEqual([]);
    expect(d("Il aime le yaourt.")).toEqual([]);
    expect(d("Il voit le héros.")).toEqual([]);
    expect(d("Elle mange du yaourt.")).toEqual([]);
    expect(d("Elle voit l'homme.")).toEqual([]);
    expect(d("J'aime le thé.")).toEqual([]);

    expect(d("Il voit l'héros.")).not.toEqual([]); // aspirated h must not elide
    expect(d("Il voit le homme.")).not.toEqual([]); // mute h must elide
    expect(d("Elle mange de l'yaourt.")).not.toEqual([]);
    expect(d("Elle mange de la eau.")).not.toEqual([]);
    expect(d("Je aime le thé.")).not.toEqual([]);
    expect(d("J'mange le thé.")).not.toEqual([]);
    expect(d("Elle voit la handball.")).toEqual([]);
  });

  it("flags a word starting with h, y or w that nobody has classified", () => {
    expect(frDefects("Il voit le hibou.", new Map())).not.toEqual([]);
  });
});

describe("frDefects: contractions", () => {
  it("requires au / aux / du / des and allows them before aspirated h", () => {
    expect(d("Elle va au marché.")).toEqual([]);
    expect(d("Elle va au héros.")).toEqual([]);
    expect(d("Elles viennent du marché.")).toEqual([]);
    expect(d("Elle parle aux haricots.")).toEqual([]);
    expect(d("Elle va à l'hôtel.")).toEqual([]);
    expect(d("Elle va à la maison.")).toEqual([]);

    expect(d("Elle va à le marché.")).not.toEqual([]);
    expect(d("Elle va à les marchés.")).not.toEqual([]);
    expect(d("Elle vient de le marché.")).not.toEqual([]);
    expect(d("Elle va à l'héros.")).not.toEqual([]);
    expect(d("Elle va au hôtel.")).not.toEqual([]); // au + mute h needs à l'
  });
});

describe("frDefects: typography", () => {
  it("rejects double spaces, a space before the full stop, no full stop, lower case start", () => {
    expect(d("Il  aime le thé.")).not.toEqual([]);
    expect(d("Il aime le thé .")).not.toEqual([]);
    expect(d("Il aime le thé")).not.toEqual([]);
    expect(d("il aime le thé.")).not.toEqual([]);
    expect(d("Il aime -- le thé.")).not.toEqual([]);
    expect(d("Il aime ___ thé.")).not.toEqual([]);
  });
});

describe("the lexicon's own flags", () => {
  it("start empty because no shipped noun or verb begins with an unflagged h, y or w", () => {
    expect([...FR_H_FLAGS.keys()]).toEqual([]);
  });
});

describe("esDefects", () => {
  it("requires the al / del contractions and plain statements", () => {
    expect(esDefects("Ella va al mercado.")).toEqual([]);
    expect(esDefects("Ella viene del mercado.")).toEqual([]);
    expect(esDefects("Él come pan.")).toEqual([]);
    expect(esDefects("Ella va a el mercado.")).not.toEqual([]);
    expect(esDefects("Ella viene de el mercado.")).not.toEqual([]);
    expect(esDefects("¿Ella come pan?")).not.toEqual([]);
    expect(esDefects("Ella come  pan.")).not.toEqual([]);
  });
});
