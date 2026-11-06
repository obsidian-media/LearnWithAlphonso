// Wrong options for the French and Spanish A1/A2 conjugation drills.
//
// Why this exists: a conjugation drill ("Je ___ (parler) français.") took its wrong options from the
// other lines of its pack, and every line of those packs conjugates a different verb. So the options
// for "parler" were "mange / fais / dors": only one option was a form of the bracketed verb, and the
// learner could answer by matching the first letters without knowing any conjugation. The reviewer
// of #391 found this was most of the remaining French and Spanish problems (backlog 0.0-av).
//
// The fix: a drill line's wrong options are other forms of the SAME verb in the same tense (another
// person), which a learner really confuses, and which the sentence's subject rules out
// (docs/distractor-policy.md, rules 1 to 3). The forms come from the paradigms below: the regular
// endings, with every irregular or stem-changing verb the drills use written out in full.
//
// Spanish options leave out the vosotros form: the course teaches Latin American Spanish
// (see HOMOPHONE_GROUPS in romance-options.ts), where it is never used.
//
// A drill line whose verb has no paradigm, or whose paradigm does not contain the line's answer,
// falls back to the pack's other answers and fails romance-conjugation.test.ts.

export type DrillTense = "present" | "preterite";
type Lang = "fr" | "es";

/** The hand-authored A1/A2 packs whose every line conjugates its bracketed verb in one tense. */
export const CONJUGATION_DRILLS: Record<string, { lang: Lang; tense: DrillTense }> = {
  fra2p1: { lang: "fr", tense: "present" },
  fra2p6: { lang: "fr", tense: "present" },
  esa1p5: { lang: "es", tense: "present" },
  esa1p22: { lang: "es", tense: "present" },
  esa2p2: { lang: "es", tense: "preterite" },
  esa2p6: { lang: "es", tense: "present" },
  esa2p18: { lang: "es", tense: "present" },
  esa2p26: { lang: "es", tense: "present" },
};

const split = (s: string) => s.split(",").map((f) => f.trim());

// ---- French present: je, tu, il, nous, vous, ils ----------------------------------------------

const FR_PRESENT_IRREGULAR: Record<string, string> = {
  avoir: "ai,as,a,avons,avez,ont",
  être: "suis,es,est,sommes,êtes,sont",
  aller: "vais,vas,va,allons,allez,vont",
  faire: "fais,fais,fait,faisons,faites,font",
  vouloir: "veux,veux,veut,voulons,voulez,veulent",
  pouvoir: "peux,peux,peut,pouvons,pouvez,peuvent",
  savoir: "sais,sais,sait,savons,savez,savent",
  prendre: "prends,prends,prend,prenons,prenez,prennent",
  comprendre: "comprends,comprends,comprend,comprenons,comprenez,comprennent",
  voir: "vois,vois,voit,voyons,voyez,voient",
  venir: "viens,viens,vient,venons,venez,viennent",
  souvenir: "souviens,souviens,souvient,souvenons,souvenez,souviennent",
  dire: "dis,dis,dit,disons,dites,disent",
  dormir: "dors,dors,dort,dormons,dormez,dorment",
  endormir: "endors,endors,endort,endormons,endormez,endorment",
  boire: "bois,bois,boit,buvons,buvez,boivent",
  lire: "lis,lis,lit,lisons,lisez,lisent",
  écrire: "écris,écris,écrit,écrivons,écrivez,écrivent",
  partir: "pars,pars,part,partons,partez,partent",
  sentir: "sens,sens,sent,sentons,sentez,sentent",
  mettre: "mets,mets,met,mettons,mettez,mettent",
  connaître: "connais,connais,connaît,connaissons,connaissez,connaissent",
  plaindre: "plains,plains,plaint,plaignons,plaignez,plaignent",
};

/** -er verbs whose stem changes in je, tu, il and ils (lève, appelle, ennuie, inquiète). */
const FR_ER_STRONG_STEM: Record<string, string> = {
  lever: "lèv",
  promener: "promèn",
  appeler: "appell",
  ennuyer: "ennui",
  inquiéter: "inquièt",
};

/** -ir verbs conjugated like finir; every other -ir verb is written out above. */
const FR_FINIR = new Set(["finir", "choisir"]);

function frPresent(verb: string): string[] | null {
  const irregular = FR_PRESENT_IRREGULAR[verb];
  if (irregular) return split(irregular);
  if (verb.endsWith("er")) {
    const stem = verb.slice(0, -2);
    const strong = FR_ER_STRONG_STEM[verb] ?? stem;
    // manger -> mangeons: a soft g keeps its e before o.
    const nousStem = stem.endsWith("g") ? `${stem}e` : stem;
    return [
      `${strong}e`,
      `${strong}es`,
      `${strong}e`,
      `${nousStem}ons`,
      `${stem}ez`,
      `${strong}ent`,
    ];
  }
  if (FR_FINIR.has(verb)) {
    const stem = verb.slice(0, -2);
    return [
      `${stem}is`,
      `${stem}is`,
      `${stem}it`,
      `${stem}issons`,
      `${stem}issez`,
      `${stem}issent`,
    ];
  }
  if (verb.endsWith("dre") && !verb.endsWith("indre") && !verb.endsWith("prendre")) {
    const stem = verb.slice(0, -2);
    return [`${stem}s`, `${stem}s`, stem, `${stem}ons`, `${stem}ez`, `${stem}ent`];
  }
  return null;
}

const FR_CLITICS = ["me", "te", "se", "nous", "vous", "se"];
const startsWithVowel = (w: string) => /^[aeiouyhâàéèêëîïôûù]/i.test(w);

/** French present, reflexives with their pronoun ("se lever" -> me lève, ..., nous levons). */
function frenchPresent(infinitive: string): string[] | null {
  const m = infinitive.match(/^(?:se\s+|s['’])(.+)$/);
  if (!m) return frPresent(infinitive);
  const forms = frPresent(m[1]!);
  if (!forms) return null;
  return forms.map((f, i) => {
    const c = FR_CLITICS[i]!;
    // The answers of fra2p6 hold the pronoun and the verb, never the subject: "nous habillons".
    if (c === "nous" || c === "vous") return `${c} ${f}`;
    return startsWithVowel(f) ? `${c[0]}'${f}` : `${c} ${f}`;
  });
}

// ---- Spanish: yo, tú, él, nosotros, ellos (no vosotros) ----------------------------------------

const ES_PRESENT_IRREGULAR: Record<string, string> = {
  ser: "soy,eres,es,somos,son",
  estar: "estoy,estás,está,estamos,están",
  ir: "voy,vas,va,vamos,van",
  tener: "tengo,tienes,tiene,tenemos,tienen",
  venir: "vengo,vienes,viene,venimos,vienen",
  hacer: "hago,haces,hace,hacemos,hacen",
  decir: "digo,dices,dice,decimos,dicen",
  saber: "sé,sabes,sabe,sabemos,saben",
  ver: "veo,ves,ve,vemos,ven",
  dar: "doy,das,da,damos,dan",
  poner: "pongo,pones,pone,ponemos,ponen",
  salir: "salgo,sales,sale,salimos,salen",
  traer: "traigo,traes,trae,traemos,traen",
  caer: "caigo,caes,cae,caemos,caen",
  valer: "valgo,vales,vale,valemos,valen",
  conducir: "conduzco,conduces,conduce,conducimos,conducen",
  conocer: "conozco,conoces,conoce,conocemos,conocen",
  seguir: "sigo,sigues,sigue,seguimos,siguen",
  conseguir: "consigo,consigues,consigue,conseguimos,consiguen",
  elegir: "elijo,eliges,elige,elegimos,eligen",
  jugar: "juego,juegas,juega,jugamos,juegan",
  freír: "frío,fríes,fríe,freímos,fríen",
  reír: "río,ríes,ríe,reímos,ríen",
  sonreír: "sonrío,sonríes,sonríe,sonreímos,sonríen",
  enfriar: "enfrío,enfrías,enfría,enfriamos,enfrían",
  construir: "construyo,construyes,construye,construimos,construyen",
  destruir: "destruyo,destruyes,destruye,destruimos,destruyen",
  incluir: "incluyo,incluyes,incluye,incluimos,incluyen",
  concluir: "concluyo,concluyes,concluye,concluimos,concluyen",
  huir: "huyo,huyes,huye,huimos,huyen",
};

/** Stem-changing verbs: the stem used in yo, tú, él and ellos (nosotros keeps the infinitive's). */
const ES_STRONG_STEM: Record<string, string> = {
  querer: "quier",
  empezar: "empiez",
  pensar: "piens",
  cerrar: "cierr",
  calentar: "calient",
  entender: "entiend",
  perder: "pierd",
  encender: "enciend",
  verter: "viert",
  preferir: "prefier",
  hervir: "hierv",
  poder: "pued",
  dormir: "duerm",
  encontrar: "encuentr",
  mostrar: "muestr",
  recordar: "recuerd",
  probar: "prueb",
  colar: "cuel",
  volver: "vuelv",
  revolver: "revuelv",
  pedir: "pid",
  servir: "sirv",
  repetir: "repit",
  medir: "mid",
};

function esPresent(verb: string): string[] | null {
  const irregular = ES_PRESENT_IRREGULAR[verb];
  if (irregular) return split(irregular);
  const m = verb.match(/^(.+)(ar|er|ir)$/);
  if (!m) return null;
  const [, stem, ending] = m as unknown as [string, string, "ar" | "er" | "ir"];
  const strong = ES_STRONG_STEM[verb] ?? stem;
  const v = ending === "ar" ? "a" : "e";
  const nos = ending === "ar" ? "amos" : ending === "er" ? "emos" : "imos";
  return [`${strong}o`, `${strong}${v}s`, `${strong}${v}`, `${stem}${nos}`, `${strong}${v}n`];
}

const ES_PRETERITE_IRREGULAR: Record<string, string> = {
  ser: "fui,fuiste,fue,fuimos,fueron",
  ir: "fui,fuiste,fue,fuimos,fueron",
  tener: "tuve,tuviste,tuvo,tuvimos,tuvieron",
  estar: "estuve,estuviste,estuvo,estuvimos,estuvieron",
  hacer: "hice,hiciste,hizo,hicimos,hicieron",
  ver: "vi,viste,vio,vimos,vieron",
  dar: "di,diste,dio,dimos,dieron",
  decir: "dije,dijiste,dijo,dijimos,dijeron",
  traer: "traje,trajiste,trajo,trajimos,trajeron",
  poder: "pude,pudiste,pudo,pudimos,pudieron",
  poner: "puse,pusiste,puso,pusimos,pusieron",
  venir: "vine,viniste,vino,vinimos,vinieron",
  querer: "quise,quisiste,quiso,quisimos,quisieron",
  leer: "leí,leíste,leyó,leímos,leyeron",
  dormir: "dormí,dormiste,durmió,dormimos,durmieron",
  pedir: "pedí,pediste,pidió,pedimos,pidieron",
};

function esPreterite(verb: string): string[] | null {
  const irregular = ES_PRETERITE_IRREGULAR[verb];
  if (irregular) return split(irregular);
  const m = verb.match(/^(.+)(ar|er|ir)$/);
  if (!m) return null;
  const [, stem, ending] = m as unknown as [string, string, "ar" | "er" | "ir"];
  if (ending === "ar") {
    // The yo form keeps the stem's sound: llegué, busqué, empecé.
    const yo = stem.endsWith("g")
      ? `${stem}u`
      : stem.endsWith("c")
        ? `${stem.slice(0, -1)}qu`
        : stem.endsWith("z")
          ? `${stem.slice(0, -1)}c`
          : stem;
    return [`${yo}é`, `${stem}aste`, `${stem}ó`, `${stem}amos`, `${stem}aron`];
  }
  return [`${stem}í`, `${stem}iste`, `${stem}ió`, `${stem}imos`, `${stem}ieron`];
}

/** Every form of the verb in the tense, one per person; null when the verb is not covered. */
export function paradigm(lang: Lang, tense: DrillTense, infinitive: string): string[] | null {
  const verb = infinitive.trim().toLowerCase();
  if (lang === "fr") return tense === "present" ? frenchPresent(verb) : null;
  return tense === "present" ? esPresent(verb) : esPreterite(verb);
}

/** The bracketed infinitive of a drill line: "Je ___ (se lever) tôt." -> "se lever". */
export function bracketedVerb(sentence: string): string | null {
  return sentence.match(/\(([^)]+)\)/)?.[1]?.trim() ?? null;
}

/**
 * Three other forms of the line's verb, in a seeded order, none equal to the answer. Null when the
 * verb has no paradigm or the paradigm does not contain the answer (the gate then fails).
 */
export function conjugationOptions(
  packId: string,
  sentence: string,
  answer: string,
  order: <T>(xs: T[]) => T[],
): string[] | null {
  const drill = CONJUGATION_DRILLS[packId];
  const verb = bracketedVerb(sentence);
  if (!drill || !verb) return null;
  const forms = paradigm(drill.lang, drill.tense, verb);
  const key = answer.toLowerCase();
  if (!forms || !forms.some((f) => f.toLowerCase() === key)) return null;
  const seen = new Set([key]);
  const others = forms.filter((f) => {
    const k = f.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return others.length >= 3 ? order(others).slice(0, 3) : null;
}
