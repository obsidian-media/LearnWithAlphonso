import type { Pack } from "./bank-engine";
import type { Level } from "./levels";
import { unitsFromBank } from "./bank-engine";

/**
 * Spanish course content, in the same compact Pack format as the
 * English/French lesson banks (see lesson-bank.ts / lesson-bank-fr.ts).
 * Interface language stays English -- these packs teach Spanish
 * vocabulary and grammar to English speakers. Pack ids are prefixed
 * "es" so lesson/question/unit ids never collide with the other banks.
 *
 * Phase 1 (2026-09-21, V4): 5 packs per CEFR level (25 packs, 125
 * lessons) -- deliberately the same starting size French itself shipped
 * with before this session grew it to 100 packs/500 lessons. Intended
 * to grow the same way. Content has not yet had a native-speaker review
 * pass (same open item French's own content still has -- see
 * docs/BACKLOG.md).
 */

const A1: Pack[] = [
  {
    id: "esa1p1",
    title: "Greetings & Everyday Phrases",
    subtitle: "First words in Spanish",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Core greetings and polite phrases.",
    data: `hello|Hola
good morning|Buenos días
good afternoon|Buenas tardes
good evening|Buenas noches
goodbye|Adiós
see you soon|Hasta pronto
see you tomorrow|Hasta mañana
please|Por favor
thank you|Gracias
you're welcome|De nada
excuse me|Perdón
sorry|Lo siento
yes|Sí
no|No
how are you?|¿Cómo estás?
I'm fine, thanks|Estoy bien, gracias
what is your name?|¿Cómo te llamas?
my name is...|Me llamo...
nice to meet you|Mucho gusto
welcome|Bienvenido`,
  },
  {
    id: "esa1p2",
    title: "Numbers 1-20",
    subtitle: "Counting in Spanish",
    kind: "pair",
    prompt: 'How do you say the number "%s" in Spanish?',
    note: "Numbers one through twenty.",
    data: `one|uno
two|dos
three|tres
four|cuatro
five|cinco
six|seis
seven|siete
eight|ocho
nine|nueve
ten|diez
eleven|once
twelve|doce
thirteen|trece
fourteen|catorce
fifteen|quince
sixteen|dieciséis
seventeen|diecisiete
eighteen|dieciocho
nineteen|diecinueve
twenty|veinte`,
  },
  {
    id: "esa1p3",
    title: "Colors & Basic Adjectives",
    subtitle: "Describing things",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common colors and simple descriptive words.",
    data: `red|rojo
blue|azul
green|verde
yellow|amarillo
black|negro
white|blanco
big|grande
small|pequeño
new|nuevo
old|viejo
good|bueno
bad|malo
happy|feliz
sad|triste
beautiful|hermoso
tall|alto
short|bajo
fast|rápido
slow|lento
easy|fácil`,
  },
  {
    id: "esa1p4",
    title: "Family Members",
    subtitle: "Talking about family",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Immediate and extended family vocabulary.",
    data: `mother|madre
father|padre
sister|hermana
brother|hermano
daughter|hija
son|hijo
grandmother|abuela
grandfather|abuelo
aunt|tía
uncle|tío
cousin|primo
wife|esposa
husband|esposo
family|familia
baby|bebé
parents|padres
friend (male)|amigo
friend (female)|amiga
child|niño
grown-up|adulto`,
  },
  {
    id: "esa1p5",
    title: "Common Verbs (yo form)",
    subtitle: "Present tense, first person",
    kind: "cloze",
    note: 'Present-tense "yo" conjugation of common verbs.',
    data: `Yo ___ (hablar) español.|hablo
Yo ___ (comer) una manzana.|como
Yo ___ (tener) un gato.|tengo
Yo ___ (estar) cansado.|estoy
Yo ___ (ser) estudiante.|soy
Yo ___ (ir) al mercado.|voy
Yo ___ (hacer) mi tarea.|hago
Yo ___ (querer) un café.|quiero
Yo ___ (poder) ayudarte.|puedo
Yo ___ (saber) la respuesta.|sé
Yo ___ (tomar) el autobús.|tomo
Yo ___ (ver) el mar.|veo
Yo ___ (venir) mañana.|vengo
Yo ___ (decir) la verdad.|digo
Yo ___ (vivir) en Madrid.|vivo
Yo ___ (dormir) ocho horas.|duermo
Yo ___ (beber) agua.|bebo
Yo ___ (leer) un libro.|leo
Yo ___ (escribir) una carta.|escribo
Yo ___ (abrir) la puerta.|abro
Yo ___ (necesitar) tiempo.|necesito
Yo ___ (trabajar) mucho.|trabajo
Yo ___ (estudiar) español.|estudio
Yo ___ (llegar) tarde.|llego
Yo ___ (empezar) ahora.|empiezo`,
  },
];

const A2: Pack[] = [
  {
    id: "esa2p1",
    title: "Food & Dining",
    subtitle: "Ordering and talking about food",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Everyday food and restaurant vocabulary.",
    data: `bread|pan
water|agua
coffee|café
milk|leche
rice|arroz
chicken|pollo
fish|pescado
vegetables|verduras
fruit|fruta
breakfast|desayuno
lunch|almuerzo
dinner|cena
the bill|la cuenta
menu|menú
delicious|delicioso
hungry|hambriento
thirsty|sediento
spoon|cuchara
fork|tenedor
knife|cuchillo`,
  },
  {
    id: "esa2p2",
    title: "Past Tense (yo form)",
    subtitle: "Preterite, first person",
    kind: "cloze",
    note: 'Simple past ("yo" form) of common regular and irregular verbs.',
    data: `Ayer yo ___ (hablar) con mi madre.|hablé
Ayer yo ___ (comer) en un restaurante.|comí
Ayer yo ___ (vivir) una gran aventura.|viví
Ayer yo ___ (ir) al cine.|fui
Ayer yo ___ (ser) muy feliz.|fui
Ayer yo ___ (tener) una reunión.|tuve
Ayer yo ___ (hacer) la cena.|hice
Ayer yo ___ (ver) una película.|vi
Ayer yo ___ (dar) un regalo.|di
Ayer yo ___ (decir) la verdad.|dije
Ayer yo ___ (poder) terminar el trabajo.|pude
Ayer yo ___ (venir) temprano.|vine
Ayer yo ___ (querer) descansar.|quise
Ayer yo ___ (poner) la mesa.|puse
Ayer yo ___ (traer) el postre.|traje
Ayer yo ___ (estar) en casa.|estuve
Ayer yo ___ (llegar) a tiempo.|llegué
Ayer yo ___ (empezar) el proyecto.|empecé
Ayer yo ___ (buscar) mis llaves.|busqué
Ayer yo ___ (leer) el periódico.|leí
Ayer yo ___ (escribir) un correo.|escribí
Ayer yo ___ (dormir) muy bien.|dormí
Ayer yo ___ (pedir) ayuda.|pedí
Ayer yo ___ (viajar) a Madrid.|viajé
Ayer yo ___ (comprar) un regalo.|compré`,
  },
  {
    id: "esa2p3",
    title: "Directions & Places",
    subtitle: "Getting around town",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Places in town and basic direction words.",
    data: `street|calle
city|ciudad
bank|banco
hospital|hospital
school|escuela
store|tienda
market|mercado
park|parque
church|iglesia
station|estación
airport|aeropuerto
left|izquierda
right|derecha
straight ahead|derecho
near|cerca
far|lejos
here|aquí
there|allí
corner|esquina
traffic light|semáforo`,
  },
  {
    id: "esa2p4",
    title: "Adjective Agreement",
    subtitle: "Matching gender and number",
    kind: "cloze",
    note: "Adjectives agree in gender and number with the noun they describe.",
    data: `La casa es muy ___ (bonito).|bonita
El coche es muy ___ (rápido).|rápido
Las flores son muy ___ (bonito).|bonitas
Los libros son muy ___ (interesante).|interesantes
La chica es muy ___ (alto).|alta
El chico es muy ___ (alto).|alto
Las mesas son ___ (nuevo).|nuevas
El problema es ___ (difícil).|difícil
La sopa está ___ (caliente).|caliente
Los perros son ___ (pequeño).|pequeños
La película fue ___ (aburrido).|aburrida
El examen fue ___ (fácil).|fácil
Las camisas son ___ (blanco).|blancas
El agua está ___ (frío).|fría
La ciudad es ___ (grande).|grande
Los estudiantes están ___ (cansado).|cansados
La profesora es ___ (amable).|amable
El edificio es ___ (viejo).|viejo
Las manzanas están ___ (verde).|verdes
El café está ___ (rico).|rico
La habitación es ___ (oscuro).|oscura
Los zapatos son ___ (cómodo).|cómodos
La tarea es ___ (largo).|larga
El cielo está ___ (nublado).|nublado
Las noticias son ___ (importante).|importantes`,
  },
  {
    id: "esa2p5",
    title: "Comparisons",
    subtitle: "más / menos / tan... como",
    kind: "cloze",
    note: "Comparative and superlative structures.",
    data: `Este libro es ___ interesante que ese.|más
Mi hermano es ___ alto que yo.|más
Ella es ___ inteligente como su hermana.|tan
Este coche es ___ caro que aquel.|menos
Juan corre ___ rápido que Pedro.|más
Esta ciudad es la ___ grande del país.|más
Hoy hace ___ calor que ayer.|más
Mi casa es ___ pequeña que la tuya.|más
Ana es ___ paciente como su madre.|tan
Este examen es el ___ difícil de todos.|más
Tu perro es ___ grande que el mío.|más
Este plato es ___ picante que el otro.|menos
Ellos son ___ trabajadores que nosotros.|más
Esta calle es la ___ larga de la ciudad.|más
El tren es ___ rápido que el autobús.|más
Mi café está ___ caliente que el tuyo.|menos
Esta película es la ___ buena del año.|más
Su casa es ___ bonita como la nuestra.|tan
El invierno aquí es ___ frío que allá.|más
Esta tienda es la ___ barata de todas.|más
Mi trabajo es ___ estresante que el tuyo.|menos
Este edificio es el ___ alto de la ciudad.|más
La comida aquí es ___ rica como en casa.|tan
Este camino es ___ corto que el otro.|más
Su idea es la ___ original de todas.|más`,
  },
];

const B1: Pack[] = [
  {
    id: "esb1p1",
    title: "Future Tense",
    subtitle: "Talking about what will happen",
    kind: "cloze",
    note: "Simple future tense, first person and third person.",
    data: `Mañana yo ___ (viajar) a España.|viajaré
El próximo año ella ___ (graduarse).|se graduará
Nosotros ___ (llegar) a las ocho.|llegaremos
Tú ___ (tener) éxito algún día.|tendrás
Ellos ___ (venir) a la fiesta.|vendrán
Yo ___ (hacer) todo lo posible.|haré
Ella ___ (poder) ayudarte mañana.|podrá
Nosotros ___ (saber) los resultados pronto.|sabremos
Él ___ (decir) la verdad eventualmente.|dirá
Yo ___ (salir) temprano mañana.|saldré
Ellos ___ (querer) verte pronto.|querrán
Tú ___ (poner) la mesa más tarde.|pondrás
Nosotros ___ (ser) felices allí.|seremos
Ella ___ (ir) al médico la próxima semana.|irá
Yo ___ (estar) listo a tiempo.|estaré
Ellos ___ (tener) que estudiar más.|tendrán
Tú ___ (ver) los resultados mañana.|verás
Nosotros ___ (venir) a visitarte pronto.|vendremos
Él ___ (hacer) la cena esta noche.|hará
Yo ___ (dar) una charla el lunes.|daré
Ella ___ (saber) la respuesta pronto.|sabrá
Nosotros ___ (poder) terminar a tiempo.|podremos
Ellos ___ (llegar) mañana por la tarde.|llegarán
Tú ___ (ser) un gran médico.|serás
Yo ___ (volver) el próximo mes.|volveré`,
  },
  {
    id: "esb1p2",
    title: "Reflexive Verbs",
    subtitle: "Daily routine actions",
    kind: "cloze",
    note: "Reflexive verbs for daily routine, present tense.",
    data: `Yo ___ (levantarse) a las siete.|me levanto
Ella ___ (despertarse) temprano.|se despierta
Nosotros ___ (ducharse) por la mañana.|nos duchamos
Tú ___ (vestirse) rápido.|te vistes
Ellos ___ (acostarse) tarde.|se acuestan
Yo ___ (lavarse) las manos.|me lavo
Él ___ (peinarse) antes de salir.|se peina
Nosotras ___ (sentarse) a la mesa.|nos sentamos
Tú ___ (cepillarse) los dientes.|te cepillas
Ella ___ (maquillarse) para la fiesta.|se maquilla
Yo ___ (bañarse) todos los días.|me baño
Ellos ___ (dormirse) fácilmente.|se duermen
Nosotros ___ (relajarse) los fines de semana.|nos relajamos
Tú ___ (preocuparse) demasiado.|te preocupas
Él ___ (afeitarse) cada mañana.|se afeita
Yo ___ (quedarse) en casa hoy.|me quedo
Ella ___ (sentirse) mejor ahora.|se siente
Nosotros ___ (divertirse) mucho aquí.|nos divertimos
Ellos ___ (mudarse) el próximo mes.|se mudan
Tú ___ (equivocarse) a veces.|te equivocas
Yo ___ (cansarse) rápido.|me canso
Ella ___ (enojarse) fácilmente.|se enoja
Nosotros ___ (aburrirse) sin planes.|nos aburrimos
Ellos ___ (casarse) en junio.|se casan
Yo ___ (olvidarse) las llaves a veces.|me olvido`,
  },
  {
    id: "esb1p3",
    title: "Subjunctive Basics",
    subtitle: "Wishes, doubts, and recommendations",
    kind: "cloze",
    note: "Present subjunctive after expressions of wish, doubt, or recommendation.",
    data: `Espero que tú ___ (venir) mañana.|vengas
Dudo que ella ___ (saber) la verdad.|sepa
Es importante que nosotros ___ (llegar) a tiempo.|lleguemos
Quiero que tú ___ (ser) feliz.|seas
Recomiendo que usted ___ (descansar) más.|descanse
Ojalá que ellos ___ (ganar) el partido.|ganen
Es necesario que yo ___ (estudiar) más.|estudie
No creo que él ___ (tener) razón.|tenga
Espero que ustedes ___ (disfrutar) el viaje.|disfruten
Es posible que ella ___ (venir) hoy.|venga
Prefiero que tú ___ (hacer) la tarea ahora.|hagas
Es raro que él no ___ (contestar).|conteste
Sugiero que nosotros ___ (esperar) un poco.|esperemos
Ojalá que tú ___ (poder) venir.|puedas
Dudo que ellos ___ (decir) la verdad.|digan
Es bueno que ustedes ___ (aprender) español.|aprendan
Espero que ella ___ (estar) bien.|esté
Es una lástima que tú no ___ (ir).|vayas
Quiero que ellos ___ (ser) puntuales.|sean
Es probable que nosotros ___ (perder) el tren.|perdamos
Recomiendo que tú ___ (leer) ese libro.|leas
Espero que él ___ (recuperarse) pronto.|se recupere
No pienso que ella ___ (mentir).|mienta
Es mejor que ustedes ___ (salir) temprano.|salgan
Ojalá que nosotros ___ (encontrar) una solución.|encontremos`,
  },
  {
    id: "esb1p4",
    title: "Connectors & Conjunctions",
    subtitle: "Linking ideas",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common linking words for more complex sentences.",
    data: `however|sin embargo
although|aunque
because|porque
therefore|por lo tanto
since (cause)|ya que
in spite of|a pesar de
on the other hand|por otro lado
in addition|además
for example|por ejemplo
in other words|es decir
finally|finalmente
meanwhile|mientras tanto
in fact|de hecho
as soon as|tan pronto como
unless|a menos que
even though|aun cuando
so that|para que
as long as|siempre que
consequently|en consecuencia
nevertheless|no obstante`,
  },
  {
    id: "esb1p5",
    title: "Idiomatic Expressions",
    subtitle: "Everyday sayings",
    kind: "pair",
    prompt: 'What does "%s" mean?',
    note: "Common idiomatic expressions used in everyday Spanish.",
    data: `tener hambre|to be hungry
tener sueño|to be sleepy
tener prisa|to be in a hurry
tener razón|to be right
echar de menos|to miss (someone)
darse cuenta|to realize
hacer caso|to pay attention
tomar el pelo|to tease someone
costar un ojo de la cara|to cost a fortune
estar en las nubes|to be daydreaming
meter la pata|to make a mistake
no tener pelos en la lengua|to speak bluntly
ser pan comido|to be very easy
tirar la toalla|to give up
ponerse las pilas|to get one's act together
más vale tarde que nunca|better late than never
dar en el clavo|to hit the nail on the head
estar como pez en el agua|to feel right at home
no dar pie con bola|to keep getting it wrong
tomar cartas en el asunto|to take action`,
  },
];

const B2: Pack[] = [
  {
    id: "esb2p1",
    title: "Conditional Mood",
    subtitle: "Hypothetical situations",
    kind: "cloze",
    note: "Simple conditional for hypothetical statements and polite requests.",
    data: `Yo ___ (viajar) por el mundo si tuviera dinero.|viajaría
Ella ___ (comprar) esa casa si pudiera.|compraría
Nosotros ___ (ir) contigo si tuviéramos tiempo.|iríamos
¿___ (poder) usted ayudarme, por favor?|Podría
Tú ___ (deber) descansar más.|deberías
Ellos ___ (querer) verte si estuvieran aquí.|querrían
Yo ___ (decir) la verdad en tu lugar.|diría
Él ___ (hacer) lo mismo en esa situación.|haría
Nosotros ___ (ser) más felices con más tiempo libre.|seríamos
¿___ (gustar) a usted un café?|Le gustaría
Ella ___ (saber) qué hacer si lo pensara.|sabría
Yo ___ (poder) terminarlo con más ayuda.|podría
Ellos ___ (venir) si los invitáramos.|vendrían
Tú ___ (tener) más éxito con más práctica.|tendrías
Nosotros ___ (salir) antes si fuera posible.|saldríamos
Yo ___ (vivir) en otro país si pudiera.|viviría
Ella ___ (estudiar) medicina si tuviera la oportunidad.|estudiaría
¿___ (poder) darme más información?|Podrías
Ellos ___ (preferir) quedarse en casa.|preferirían
Nosotros ___ (necesitar) más tiempo para decidir.|necesitaríamos
Yo ___ (cambiar) de trabajo si encontrara algo mejor.|cambiaría
Él ___ (aceptar) la oferta sin dudarlo.|aceptaría
Tú ___ (disfrutar) mucho ese viaje.|disfrutarías
Ella ___ (poner) más esfuerzo si le importara.|pondría
Nosotros ___ (celebrar) si ganáramos.|celebraríamos`,
  },
  {
    id: "esb2p2",
    title: "Passive Voice",
    subtitle: "ser + past participle",
    kind: "cloze",
    note: "Passive voice constructions common in formal/written Spanish.",
    data: `El libro ___ (escribir) por un autor famoso.|fue escrito
La casa ___ (construir) en 1990.|fue construida
Las decisiones ___ (tomar) por el comité.|fueron tomadas
El puente ___ (diseñar) por un ingeniero español.|fue diseñado
Los documentos ___ (firmar) ayer.|fueron firmados
La ciudad ___ (fundar) hace siglos.|fue fundada
El premio ___ (otorgar) al mejor estudiante.|fue otorgado
Las reglas ___ (establecer) por el gobierno.|fueron establecidas
El proyecto ___ (aprobar) por unanimidad.|fue aprobado
La carta ___ (enviar) la semana pasada.|fue enviada
Los resultados ___ (anunciar) esta mañana.|fueron anunciados
El edificio ___ (renovar) el año pasado.|fue renovado
La novela ___ (traducir) a varios idiomas.|fue traducida
Los errores ___ (corregir) a tiempo.|fueron corregidos
El evento ___ (organizar) por la universidad.|fue organizado
Las obras ___ (exhibir) en el museo.|fueron exhibidas
El contrato ___ (firmar) por ambas partes.|fue firmado
La medicina ___ (descubrir) por accidente.|fue descubierta
Los estudiantes ___ (seleccionar) cuidadosamente.|fueron seleccionados
El informe ___ (publicar) el mes pasado.|fue publicado
La ley ___ (aprobar) por el parlamento.|fue aprobada
Los daños ___ (reparar) rápidamente.|fueron reparados
El plan ___ (rechazar) por el consejo.|fue rechazado
Las cartas ___ (leer) en voz alta.|fueron leídas
El museo ___ (visitar) por miles de personas.|fue visitado`,
  },
  {
    id: "esb2p3",
    title: "Formal vs. Informal Register",
    subtitle: "usted vs. tú",
    kind: "pair",
    prompt: 'What is the formal ("usted") way to say "%s"?',
    note: "Formal register expressions, contrasted with informal equivalents.",
    data: `how are you (informal: ¿cómo estás?)|¿cómo está usted?
what do you want (informal: ¿qué quieres?)|¿qué desea usted?
can you help me (informal: ¿puedes ayudarme?)|¿podría ayudarme?
your (informal: tu)|su
you (informal: tú)|usted
sit down please (informal: siéntate)|siéntese, por favor
come in (informal: entra)|pase usted
excuse me, sir/madam|disculpe, señor/señora
it's a pleasure to meet you|es un placer conocerle
how may I help you?|¿en qué puedo servirle?
please wait a moment|espere un momento, por favor
would you like anything else?|¿desea algo más?
I would appreciate your response|agradecería su respuesta
please find attached|adjunto encontrará
sincerely (formal letter closing)|atentamente
dear sir or madam|estimado señor o señora
at your service|a su disposición
thank you for your time|gracias por su tiempo
I look forward to your reply|quedo a la espera de su respuesta
best regards|un cordial saludo`,
  },
  {
    id: "esb2p4",
    title: "Advanced Connectors",
    subtitle: "Formal written Spanish",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Connectors typical of formal writing and argumentation.",
    data: `nevertheless|no obstante
in this regard|al respecto
with regard to|con respecto a
in conclusion|en conclusión
in summary|en resumen
on the one hand|por una parte
on the other hand|por otra parte
given that|dado que
provided that|siempre y cuando
in view of|en vista de
as a result of|como resultado de
in relation to|en relación con
without a doubt|sin lugar a dudas
first of all|en primer lugar
last but not least|por último pero no menos importante
above all|sobre todo
in other terms|dicho de otro modo
it is worth noting that|cabe destacar que
taking into account|tomando en cuenta
in the same way|del mismo modo`,
  },
  {
    id: "esb2p5",
    title: "Complex Prepositions",
    subtitle: "Multi-word prepositional phrases",
    kind: "cloze",
    note: "Compound prepositional phrases common in intermediate-advanced Spanish.",
    data: `Vamos a hablar acerca ___ este tema.|de
El regalo es ___ parte de todo el equipo.|de
A pesar ___ la lluvia, salimos a caminar.|de
Ella vive cerca ___ la estación.|de
El banco está enfrente ___ la farmacia.|de
Trabajamos junto ___ el nuevo equipo.|con
Lo hice a través ___ un amigo.|de
Él llegó antes ___ que empezara la reunión.|de
Nos vemos después ___ la clase.|de
Ella se sienta al lado ___ la ventana.|de
El parque está detrás ___ mi casa.|de
En cuanto ___ tu pregunta, no estoy seguro.|a
Con respecto ___ eso, hablaremos mañana.|a
Debido ___ el tráfico, llegamos tarde.|a
Todo salió bien gracias ___ tu ayuda.|a
En lugar ___ quejarte, busca una solución.|de
A causa ___ el mal tiempo, cancelaron el vuelo.|de
Además ___ ser inteligente, es muy amable.|de
Frente ___ la casa hay un jardín grande.|a
Antes ___ salir, cierra la puerta con llave.|de`,
  },
];

const C1: Pack[] = [
  {
    id: "esc1p1",
    title: "Past Subjunctive",
    subtitle: "Imperfect subjunctive mood",
    kind: "cloze",
    note: "Imperfect subjunctive, used for hypotheticals and past wishes/doubts.",
    data: `Si yo ___ (tener) más tiempo, viajaría más.|tuviera
Ella actuó como si ___ (saber) todo.|supiera
Ojalá ___ (llover) mañana.|lloviera
Si tú ___ (estudiar) más, aprobarías el examen.|estudiaras
Nos pidió que ___ (llegar) temprano.|llegáramos
Dudaba que él ___ (decir) la verdad.|dijera
Si nosotros ___ (poder), te ayudaríamos.|pudiéramos
Ella esperaba que yo ___ (venir) a la fiesta.|viniera
Si ellos ___ (saber) la verdad, actuarían diferente.|supieran
Me gustaría que tú ___ (ser) más paciente.|fueras
Si él ___ (querer), podría cambiar de trabajo.|quisiera
Actuaba como si nada ___ (importar).|importara
Ojalá ___ (ganar) nosotros el premio.|ganáramos
Si ustedes ___ (venir) antes, verían el atardecer.|vinieran
Ella dudaba que nosotros ___ (terminar) a tiempo.|termináramos
Si yo ___ (ser) rico, ayudaría a más gente.|fuera
Nos habría gustado que tú ___ (quedarte).|te quedaras
Si ella ___ (hacer) más ejercicio, se sentiría mejor.|hiciera
Esperábamos que ellos ___ (llegar) sin problemas.|llegaran
Si nosotros ___ (vivir) más cerca, nos veríamos más.|viviéramos
Actuó como si ___ (tener) miedo.|tuviera
Si tú ___ (poder) elegir, ¿qué harías?|pudieras
Me sorprendió que ella ___ (decir) eso.|dijera
Si ellos ___ (estar) aquí, todo sería más fácil.|estuvieran
Ojalá ___ (poder) yo cambiar el pasado.|pudiera`,
  },
  {
    id: "esc1p2",
    title: "Nuanced Vocabulary",
    subtitle: "Precise synonyms and register",
    kind: "pair",
    prompt: 'What is a more precise/formal way to say "%s"?',
    note: "Advanced vocabulary offering more precise alternatives to common words.",
    data: `to think (basic: pensar)|reflexionar
to say (basic: decir)|manifestar
to show (basic: mostrar)|evidenciar
to get (basic: conseguir)|obtener
to help (basic: ayudar)|colaborar
to want (basic: querer)|desear
big (basic: grande)|considerable
important (basic: importante)|trascendental
to look at (basic: mirar)|observar
to talk about (basic: hablar de)|abordar
to make better (basic: mejorar)|perfeccionar
to end (basic: terminar)|concluir
to begin (basic: empezar)|iniciar
problem (basic: problema)|inconveniente
change (basic: cambio)|transformación
to understand (basic: entender)|comprender
to explain (basic: explicar)|esclarecer
result (basic: resultado)|consecuencia
to try (basic: intentar)|procurar
opinion (basic: opinión)|criterio`,
  },
  {
    id: "esc1p3",
    title: "Advanced Idiomatic Expressions",
    subtitle: "Sophisticated sayings",
    kind: "pair",
    prompt: 'What does "%s" mean?',
    note: "More advanced idiomatic expressions used in fluent, natural Spanish.",
    data: `andarse por las ramas|to beat around the bush
poner el dedo en la llaga|to hit a sore spot
ser la gota que colma el vaso|to be the last straw
llevar la voz cantante|to be the one in charge
no tener pelos en la lengua|to not mince words
estar entre la espada y la pared|to be between a rock and a hard place
dorar la píldora|to sugarcoat something
irse por las nubes|for prices to skyrocket
ver los toros desde la barrera|to watch from the sidelines
poner las cartas sobre la mesa|to lay one's cards on the table
salirse con la suya|to get one's own way
tirar la casa por la ventana|to spare no expense
hacer oídos sordos|to turn a deaf ear
no dar el brazo a torcer|to refuse to back down
írsele a alguien la mano|to overdo something
quedarse de piedra|to be dumbfounded
tener la sartén por el mango|to be in control
pasar factura|to take its toll
estar en el ajo|to be in on something
dar la cara|to face the consequences`,
  },
  {
    id: "esc1p4",
    title: "Formal & Literary Register",
    subtitle: "Written and academic Spanish",
    kind: "cloze",
    note: "Formal/literary sentence structures typical of academic or professional writing.",
    data: `Cabe ___ (señalar) que los resultados fueron positivos.|señalar
Es menester ___ (considerar) todos los factores.|considerar
Huelga ___ (decir) que el proyecto fue un éxito.|decir
Conviene ___ (destacar) la importancia del estudio.|destacar
No cabe ___ (duda) de que el plan funcionará.|duda
Es preciso ___ (analizar) la situación con cuidado.|analizar
Resulta ___ (evidente) que se necesita más inversión.|evidente
Se hace ___ (necesario) revisar la propuesta.|necesario
Cabe ___ (mencionar) que hubo cambios recientes.|mencionar
Es de ___ (suponer) que llegará una respuesta pronto.|suponer
Vale la ___ (pena) reconsiderar la estrategia.|pena
No es de ___ (extrañar) que el proyecto tardara tanto.|extrañar
Es dable ___ (afirmar) que el mercado ha cambiado.|afirmar
Conviene ___ (subrayar) los puntos más relevantes.|subrayar
Cabe ___ (recalcar) la relevancia de este hallazgo.|recalcar
Es oportuno ___ (mencionar) las limitaciones del estudio.|mencionar
Huelga ___ (añadir) que se requiere más investigación.|añadir
Resulta ___ (pertinente) revisar los datos disponibles.|pertinente
Es menester ___ (aclarar) los términos del acuerdo.|aclarar
Cabe ___ (concluir) que los objetivos se cumplieron.|concluir`,
  },
  {
    id: "esc1p5",
    title: "Complex Sentence Connectors",
    subtitle: "Advanced discourse markers",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Discourse markers for sophisticated argumentation and academic writing.",
    data: `notwithstanding|no obstante lo anterior
insofar as|en la medida en que
to the extent that|en tanto que
by the same token|de igual manera
conversely|en cambio
that being said|dicho esto
in light of the above|a la luz de lo anterior
all things considered|considerando todo lo anterior
be that as it may|sea como sea
with that in mind|teniendo esto en cuenta
in the final analysis|en última instancia
notwithstanding the foregoing|sin perjuicio de lo anterior
along the same lines|en esta misma línea
for all intents and purposes|a todos los efectos
as a corollary|como corolario
by way of contrast|a modo de contraste
in the strictest sense|en el sentido más estricto
paradoxically|paradójicamente
by extension|por extensión
in essence|en esencia`,
  },
];

export const BANK_ES: Record<Level, Pack[]> = { A1, A2, B1, B2, C1 };

const ZERO_COUNTS: Record<Level, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

/** Spanish course has no hand-authored units, so unit numbering always starts at 0. */
export function generatedUnitsEs(): ReturnType<typeof unitsFromBank> {
  return unitsFromBank(BANK_ES, ZERO_COUNTS);
}
