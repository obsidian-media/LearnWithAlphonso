// The five Spanish "Minimal Pairs" lessons (esa1p28, esa2p28, esb1p28, esb2p28, esc1p28).
//
// Owner decision 2026-11-16: these were plain listening ("¿Qué escuchaste?"), but under seseo, yeísmo and
// b/v the two words of a pair sound the same, so a listening question about them had no answer you could
// hear. They are now SPELLING-CHOICE questions: a sentence with one blank, a short English clue for the
// meaning, and the word's twin among the options. The clue decides which spelling is right.
//
// One source for the pack data and for the authored options (bank-engine reads both through
// ROMANCE_CLOZE, so the wrong options never come from other lines). Lesson ids, question ids and order are
// unchanged: line i is still question i. Row format: "sentence|answer|wrong,wrong,wrong|clue". The FIRST
// wrong option is always the sound-alike twin.

export type MinimalPairRow = {
  sentence: string;
  answer: string;
  wrong: string[];
  clue: string;
};

const parse = (rows: string[]): MinimalPairRow[] =>
  rows.map((r) => {
    const [sentence, answer, wrong, clue] = r.split("|");
    return { sentence: sentence!, answer: answer!, wrong: wrong!.split(","), clue: clue! };
  });

export const MINIMAL_PAIR_ROWS: Record<string, MinimalPairRow[]> = {
  esa1p28: parse([
    "Mi familia vive en una ___ grande.|casa|caza,cosa,masa|house",
    "Mis tíos van de ___ de patos al lago los domingos.|caza|casa,cosa,taza|hunting",
    "Después de la escuela voy a mi ___.|casa|caza,cosa,mesa|home",
    "En esa reserva la ___ de ciervos está prohibida.|caza|casa,masa,taza|hunting",
    "El sonido viaja por el aire como una ___.|onda|honda,ronda,oda|wave (sound wave)",
    "La piscina es muy ___ aquí.|honda|onda,ronda,blanda|deep",
    "La radio emite en una ___ corta.|onda|honda,ronda,oda|wave",
    "La cueva es muy ___ y oscura.|honda|onda,ronda,blanda|deep",
    "Para la cena comimos ___ con arroz.|pollo|poyo,pozo,polvo|chicken (as food)",
    "Nos sentamos en el ___ de piedra del patio.|poyo|pollo,pozo,polvo|stone bench",
    "El ___ picotea el maíz en la granja.|pollo|poyo,pozo,polvo|chicken",
    "El abuelo descansa en el ___ junto a la puerta.|poyo|pollo,pozo,polvo|stone bench",
    "El desierto es muy ___ y no se ve el final.|vasto|basto,justo,nuevo|vast",
    "El tejido de este saco es muy ___ y áspero.|basto|vasto,justo,vacío|coarse",
    "El océano es muy ___ y no tiene fin.|vasto|basto,justo,nuevo|vast, huge",
    "Este paño es demasiado ___ para una camisa.|basto|vasto,justo,nuevo|coarse",
    "Subimos al ___ para ver el pueblo.|cerro|cero,perro,barro|hill",
    "La temperatura bajó a ___ grados.|cero|cerro,cera,cerdo|zero",
    "Desde la ventana se ve un ___ verde.|cerro|cero,perro,barro|hill",
    "El marcador del partido está en ___.|cero|cerro,cera,cerdo|zero",
    "Mañana todos vamos a ___ por el presidente.|votar|botar,notar,montar|to vote",
    "No debes ___ la basura en la calle.|botar|votar,notar,montar|to throw away",
    "Mi abuela quiere ___ en las elecciones.|votar|botar,notar,montar|to vote",
    "Hay que ___ las botellas vacías al contenedor.|botar|votar,notar,montar|to throw away",
    "Mi casa está al pie del ___.|cerro|cero,perro,barro|hill",
  ]),
  esa2p28: parse([
    "Hay que ___ el arroz veinte minutos.|cocer|coser,comer,correr|to boil, to cook",
    "Mi abuela me enseñó a ___ un botón.|coser|cocer,comer,correr|to sew",
    "El pan necesita ___ en el horno una hora.|cocer|coser,comer,correr|to bake",
    "Necesito aguja e hilo para ___ la falda.|coser|cocer,comer,correr|to sew",
    "El agua sale por el ___ de la cocina.|tubo|tuvo,tuno,tuyo|pipe",
    "Ayer mi hermano ___ mucha fiebre.|tuvo|tubo,tuno,tuyo|had",
    "Se rompió el ___ del lavabo.|tubo|tuvo,tuno,tuyo|pipe",
    "Mi madre ___ que trabajar el sábado.|tuvo|tubo,tuno,tuyo|had",
    "Cuando entró, dijo ___ a todos.|hola|ola,sola,cola|hello",
    "Una ___ muy grande llegó a la playa.|ola|hola,sola,cola|wave",
    "Siempre le digo ___ a mi vecina.|hola|ola,sola,cola|hello",
    "Esa ___ nos mojó los pies.|ola|hola,sola,cola|wave",
    "Voy al cine una ___ al mes.|vez|ves,vea,vaya|time, occasion",
    "¿Tú ___ el edificio allá?|ves|vez,ver,vas|you see",
    "Leo la revista una ___ por semana.|vez|ves,vea,vaya|time, occasion",
    "¿Qué ___ por la ventana?|ves|vez,ver,vas|you see",
    "No quiero ___ la pared con el lápiz.|rayar|rallar,rodar,rezar|to scratch, to draw lines on",
    "Hay que ___ el queso para la pasta.|rallar|rayar,rodar,rezar|to grate",
    "El gato puede ___ el sofá con las uñas.|rayar|rallar,rodar,rezar|to scratch",
    "Ayúdame a ___ la zanahoria para la ensalada.|rallar|rayar,rodar,rezar|to grate",
    "Quiero una ___ de café caliente.|taza|tasa,casa,masa|cup",
    "La ___ de desempleo bajó este año.|tasa|taza,casa,masa|rate",
    "Se me cayó la ___ y se rompió.|taza|tasa,casa,masa|cup",
    "El banco subió la ___ de interés.|tasa|taza,casa,masa|rate",
    "Mi abuela me regaló una ___ de porcelana.|taza|tasa,casa,masa|cup",
  ]),
  esb1p28: parse([
    "Revuelve la sopa con el ___.|cazo|caso,pozo,paso|ladle, saucepan",
    "El detective resolvió el ___ en una semana.|caso|cazo,pozo,paso|case",
    "Calenté la leche en un ___ pequeño.|cazo|caso,pozo,paso|small saucepan",
    "En ese ___ no hace falta pagar.|caso|cazo,pozo,paso|case, instance",
    "Sacaron agua fresca del ___ del patio.|pozo|poso,cazo,paso|well",
    "En el fondo de la taza quedó un ___ de café.|poso|pozo,cazo,paso|sediment, dregs",
    "El niño tiró una moneda al ___.|pozo|poso,cazo,paso|well",
    "El vino viejo deja un ___ en la botella.|poso|pozo,cazo,paso|sediment",
    "Cavaron un ___ profundo para buscar agua.|pozo|poso,cazo,paso|well",
    "El huevo está bien ___; ya puedes pelarlo.|cocido|cosido,corrido,comido|boiled",
    "El botón está bien ___ a la camisa.|cosido|cocido,corrido,comido|sewn",
    "Las papas ya están ___ y blandas.|cocidas|cosidas,corridas,comidas|boiled",
    "El doctor dejó la herida bien ___.|cosida|cocida,corrida,comida|stitched up",
    "Prefiero el pescado bien ___.|cocido|cosido,corrido,comido|well cooked",
    "Llevaba un abrigo ___ a mano por su abuela.|cosido|cocido,corrido,comido|sewn",
    "Voy a ___ la canción en mi teléfono.|grabar|gravar,gritar,gastar|to record",
    "El gobierno quiere ___ los productos de lujo con un impuesto.|gravar|grabar,gritar,gastar|to tax",
    "Quiero ___ mi nombre en el anillo.|grabar|gravar,gritar,gastar|to engrave",
    "La ley va a ___ las ventas por internet.|gravar|grabar,gritar,gastar|to impose a tax on",
    "Van a ___ la película en la playa.|grabar|gravar,gritar,gastar|to film",
    "El agua del ___ sabe muy limpia.|pozo|poso,cazo,paso|well",
    "Dejé el ___ sucio dentro del fregadero.|cazo|caso,pozo,paso|saucepan, ladle",
    "La policía cerró el ___ ayer.|caso|cazo,pozo,paso|case",
    "Al final de la copa se notaba el ___.|poso|pozo,cazo,paso|sediment",
    "Puedes ___ la clase si pides permiso.|grabar|gravar,gritar,gastar|to record",
  ]),
  esb2p28: parse([
    "Llegamos a la ___ de la montaña y vimos todo el valle desde arriba.|cima|sima,cinta,rima|summit",
    "Una ___ muy profunda se abría en la cueva.|sima|cima,cinta,rima|chasm, deep pit",
    "Desde la ___ se ve todo el valle.|cima|sima,cinta,rima|summit",
    "El explorador cayó por una ___ en la roca.|sima|cima,cinta,rima|chasm",
    "La ___ del parlamento duró seis horas.|sesión|cesión,pasión,sensación|session, meeting",
    "Firmaron la ___ de los derechos del libro ante notario.|cesión|sesión,pasión,sensación|transfer, handing over",
    "La ___ de terapia empieza a las cinco.|sesión|cesión,pasión,sensación|session",
    "La ___ del terreno al municipio se firmó ayer.|cesión|sesión,pasión,sensación|transfer, handing over",
    "Los diputados abrieron la ___ a las diez.|sesión|cesión,pasión,sensación|session, meeting",
    "La ___ de poderes al nuevo director fue legal.|cesión|sesión,pasión,sensación|transfer, handing over",
    "El gato se agacha para ___ al ratón.|acechar|asechar,achicar,acercar|to stalk, to lie in wait for",
    "Quiso ___ al rival con engaños.|asechar|acechar,achicar,acercar|to set a trap for",
    "El león espera para ___ a la cebra.|acechar|asechar,achicar,acercar|to stalk",
    "Los ladrones querían ___ al guardia con un engaño.|asechar|acechar,achicar,acercar|to lay a trap for",
    "Un peligro nos puede ___ en la oscuridad.|acechar|asechar,achicar,acercar|to lurk",
    "El sol de agosto parece ___ la tierra.|abrasar|abrazar,abrir,abusar|to scorch",
    "Quiero ___ a mi hermana cuando llegue.|abrazar|abrasar,abrir,abusar|to hug",
    "El fuego puede ___ todo el bosque.|abrasar|abrazar,abrir,abusar|to burn up",
    "Corrió a ___ a su padre en el aeropuerto.|abrazar|abrasar,abrir,abusar|to hug",
    "El café hirviendo puede ___ la lengua.|abrasar|abrazar,abrir,abusar|to scald",
    "Plantaron una bandera en la ___.|cima|sima,cinta,rima|summit",
    "Tiraron una piedra y nunca oyeron el fondo de la ___.|sima|cima,cinta,rima|chasm",
    "Cerraron la ___ con un aplauso.|sesión|cesión,pasión,sensación|session, meeting",
    "La ___ de la casa a su hijo se firmó ante notario.|cesión|sesión,pasión,sensación|transfer, handing over",
    "Los lobos suelen ___ a su presa durante horas.|acechar|asechar,achicar,acercar|to stalk",
  ]),
  esc1p28: parse([
    "El fiscal pidió ___ al exministro por corrupción.|encausar|encauzar,encender,encoger|to prosecute",
    "El gobierno quiere ___ el debate hacia soluciones.|encauzar|encausar,encender,encoger|to channel, to direct",
    "El tribunal decidió ___ a los responsables del fraude.|encausar|encauzar,encender,encoger|to put on trial",
    "Hay que ___ el río para evitar inundaciones.|encauzar|encausar,encender,encoger|to channel",
    "La jueza ordenó ___ al director por falsificación.|encausar|encauzar,encender,encoger|to prosecute",
    "Intentó ___ la energía de los jóvenes hacia el deporte.|encauzar|encausar,encender,encoger|to channel",
    "Nació un ___ sano en el hospital.|varón|barón,balón,botón|baby boy, male child",
    "El ___ y la baronesa recibieron a los invitados en el castillo.|barón|varón,balón,botón|baron (noble title)",
    "El formulario pide indicar si eres ___ o mujer.|varón|barón,balón,botón|male",
    "El rey otorgó el título de ___ al comerciante.|barón|varón,balón,botón|baron (noble title)",
    "Solo el hijo ___ de la familia llevaba el apellido.|varón|barón,balón,botón|male",
    "Un ___ del petróleo financió la campaña.|barón|varón,balón,botón|tycoon (a powerful magnate)",
    "Alcanzar la ___ de la carrera exige sacrificio.|cima|sima,cinta,rima|peak, top",
    "El proyecto cayó en una ___ de deudas.|sima|cima,cinta,rima|abyss, chasm",
    "El escalador llegó por fin a la ___ del Aconcagua.|cima|sima,cinta,rima|summit",
    "Los espeleólogos descendieron por la ___ con cuerdas.|sima|cima,cinta,rima|deep chasm in the rock",
    "Los depredadores suelen ___ en silencio.|acechar|asechar,achicar,agachar|to lurk, to lie in wait",
    "El enemigo intentó ___ al comandante con falsas promesas.|asechar|acechar,achicar,agachar|to lay a trap for",
    "La crisis amenaza con ___ a la economía durante años.|acechar|asechar,achicar,agachar|to threaten, to loom over",
    "Sus rivales buscaban ___ al candidato con engaños.|asechar|acechar,achicar,agachar|to entrap",
    "La inflación va a ___ a los mercados todo el año.|acechar|asechar,achicar,agachar|to threaten",
    "La ministra logró ___ la protesta por vías legales.|encauzar|encausar,encender,encoger|to channel",
    "No pudieron ___ al sospechoso sin pruebas.|encausar|encauzar,encender,encoger|to prosecute",
    "En su acta de nacimiento dice sexo: ___.|varón|barón,balón,botón|male",
    "El ___ vendió sus tierras y su título nobiliario para pagar deudas.|barón|varón,balón,botón|baron (noble title)",
  ]),
};

/** The pack's `data` text: "sentence|answer" per line, in question order. */
export function minimalPairData(packId: string): string {
  return MINIMAL_PAIR_ROWS[packId]!.map((r) => `${r.sentence}|${r.answer}`).join("\n");
}

/** The authored options and explanation for bank-engine (ROMANCE_CLOZE shape). */
export function minimalPairCloze(
  packId: string,
): Record<number, { wrong: string[]; hint: string; explanation: string }> {
  const out: Record<number, { wrong: string[]; hint: string; explanation: string }> = {};
  MINIMAL_PAIR_ROWS[packId]!.forEach((r, i) => {
    out[i] = {
      wrong: r.wrong,
      hint: r.clue,
      explanation: `"${r.answer}" is the spelling that means ${r.clue} here. It is easy to mix up with "${r.wrong[0]}", a different word, so the meaning decides the spelling.`,
    };
  });
  return out;
}
