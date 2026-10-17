/**
 * The ONLY place the conjugation libraries are imported inside src/. Tests
 * and scripts use these wrappers as the SECOND source that has to agree with
 * the committed tables. Never import this from application code: the Lefff
 * lexicon is 6 MB of LGPL-LR data (see romance-isolation.test.ts).
 */
import { createRequire } from "node:module";
import * as FrenchVerbs from "french-verbs";
import * as SpanishVerbs from "spanish-verbs";
import type { VerbsInfo } from "french-verbs-lefff";
import type { Person } from "./romance";

const require = createRequire(import.meta.url);
const lefff = require("french-verbs-lefff/dist/conjugations.json") as VerbsInfo;

export function frLibPresent(verb: string, person: Person): string {
  return FrenchVerbs.getConjugation(
    lefff,
    verb,
    "PRESENT",
    person,
    {},
    false,
    undefined,
    undefined,
    "Act",
  );
}

export function frLibPasseCompose(
  verb: string,
  person: Person,
  options: { aux: "AVOIR" | "ETRE"; agreeGender?: "M" | "F"; agreeNumber?: "S" | "P" },
): string {
  return FrenchVerbs.getConjugation(
    lefff,
    verb,
    "PASSE_COMPOSE",
    person,
    options,
    false,
    undefined,
    undefined,
    "Act",
  );
}

export function frLibAlwaysEtre(verb: string): boolean {
  return FrenchVerbs.alwaysAuxEtre(verb);
}

export function frLibGetAux(verb: string): "AVOIR" | "ETRE" {
  return FrenchVerbs.getAux(verb, undefined as never, false);
}

export function esLibPresent(verb: string, person: Person): string {
  return SpanishVerbs.getConjugation(verb, "INDICATIVE_PRESENT", person);
}

export function esLibPreterite(verb: string, person: Person): string {
  return SpanishVerbs.getConjugation(verb, "INDICATIVE_PRETERITE", person);
}
