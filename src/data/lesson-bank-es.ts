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
  {
    id: "esa1p6",
    title: "Days & Time Expressions",
    subtitle: "Talking about when",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Days of the week and common time words.",
    data: `Monday|lunes
Tuesday|martes
Wednesday|miércoles
Thursday|jueves
Friday|viernes
Saturday|sábado
Sunday|domingo
today|hoy
tomorrow|mañana
yesterday|ayer
now|ahora
later|luego
week|semana
month|mes
year|año
in the morning|por la mañana
in the afternoon|por la tarde
at night|por la noche
early|temprano
late|tarde`,
  },
  {
    id: "esa1p7",
    title: "Household Objects",
    subtitle: "Around the house",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common household nouns.",
    data: `house|casa
room|habitación
kitchen|cocina
bathroom|baño
bedroom|dormitorio
table|mesa
chair|silla
bed|cama
door|puerta
window|ventana
key|llave
lamp|lámpara
mirror|espejo
clock|reloj
television|televisor
telephone|teléfono
book|libro
pen|bolígrafo
paper|papel
bag|bolsa`,
  },
  {
    id: "esa1p8",
    title: "Body Parts",
    subtitle: "The human body",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Basic body-part vocabulary.",
    data: `head|cabeza
hair|pelo
eye|ojo
ear|oreja
nose|nariz
mouth|boca
tooth|diente
neck|cuello
shoulder|hombro
arm|brazo
hand|mano
finger|dedo
leg|pierna
knee|rodilla
foot|pie
back|espalda
stomach|estómago
heart|corazón
skin|piel
face|cara`,
  },
  {
    id: "esa1p9",
    title: "Numbers 21-100",
    subtitle: "Bigger numbers",
    kind: "pair",
    prompt: 'How do you say the number "%s" in Spanish?',
    note: "Numbers by tens from twenty-one to one hundred.",
    data: `twenty-one|veintiuno
twenty-five|veinticinco
thirty|treinta
thirty-five|treinta y cinco
forty|cuarenta
forty-five|cuarenta y cinco
fifty|cincuenta
sixty|sesenta
seventy|setenta
eighty|ochenta
ninety|noventa
one hundred|cien
two hundred|doscientos
five hundred|quinientos
one thousand|mil`,
  },
  {
    id: "esa1p10",
    title: "Animals",
    subtitle: "Pets and wildlife",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common pets and wild animals.",
    data: `dog|perro
cat|gato
bird|pájaro
fish|pez
horse|caballo
cow|vaca
pig|cerdo
sheep|oveja
lion|león
tiger|tigre
bear|oso
elephant|elefante
monkey|mono
rabbit|conejo
mouse|ratón
snake|serpiente
frog|rana
turtle|tortuga
duck|pato
wolf|lobo`,
  },
  {
    id: "esa1p11",
    title: "Weather",
    subtitle: "Talking about the weather",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Weather-related vocabulary.",
    data: `sun|sol
rain|lluvia
snow|nieve
wind|viento
cloud|nube
storm|tormenta
fog|niebla
ice|hielo
heat|calor
cold|frío
humidity|humedad
rainbow|arcoíris
thunder|trueno
lightning|relámpago
temperature|temperatura`,
  },
  {
    id: "esa1p12",
    title: "Clothing",
    subtitle: "What are you wearing?",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common clothing items.",
    data: `shirt|camisa
t-shirt|camiseta
pants|pantalones
dress|vestido
skirt|falda
jacket|chaqueta
coat|abrigo
shoes|zapatos
socks|calcetines
hat|sombrero
gloves|guantes
scarf|bufanda
belt|cinturón
sweater|suéter
pajamas|pijama`,
  },
  {
    id: "esa1p13",
    title: "School & Classroom",
    subtitle: "In the classroom",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "School and classroom objects.",
    data: `school|escuela
classroom|salón de clase
teacher (primary school)|maestro
student|estudiante
desk|escritorio
notebook|cuaderno
pencil|lápiz
eraser|goma
backpack|mochila
blackboard|pizarra
ruler|regla
scissors|tijeras
glue|pegamento
homework|tarea
exam|examen`,
  },
  {
    id: "esa1p14",
    title: "Professions",
    subtitle: "What do you do?",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common jobs and professions.",
    data: `doctor|médico
nurse|enfermero
teacher|profesor
lawyer|abogado
engineer|ingeniero
chef|cocinero
police officer|policía
firefighter|bombero
farmer|granjero
artist|artista
musician|músico
writer|escritor
driver|conductor
waiter|camarero
scientist|científico`,
  },
  {
    id: "esa1p15",
    title: "Opposites",
    subtitle: "Qualities and textures",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common opposite adjectives.",
    data: `hot|caliente
rough|áspero
sweet|dulce
salty|salado
hard|duro
soft|blando
clean|limpio
dirty|sucio
full|lleno
empty|vacío
open|abierto
closed|cerrado
wet|mojado
dry|seco
heavy|pesado
light (weight)|ligero
strong|fuerte
weak|débil
loud|ruidoso
quiet|silencioso`,
  },
  {
    id: "esa1p16",
    title: "Emotions",
    subtitle: "How do you feel?",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common emotion words.",
    data: `happy (content)|contento
grateful|agradecido
angry|enojado
scared|asustado
surprised|sorprendido
bored|aburrido
excited|emocionado
nervous|nervioso
calm|tranquilo
in love|enamorado
tired|cansado
worried|preocupado
proud|orgulloso
jealous|celoso
confused|confundido`,
  },
  {
    id: "esa1p17",
    title: "Question Words",
    subtitle: "Asking questions",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "The core interrogative words.",
    data: `what|qué
who|quién
when|cuándo
where|dónde
why|por qué
how|cómo
which|cuál
how much|cuánto
how many|cuántos
whose|de quién`,
  },
  {
    id: "esa1p18",
    title: "Telling Time",
    subtitle: "What time is it?",
    kind: "cloze",
    note: "Basic time-telling expressions.",
    data: `¿Qué hora ___?|es
Es la ___ (one o'clock).|una
Son las ___ (two o'clock).|dos
Son las tres y ___ (half).|media
Son las cuatro y ___ (quarter).|cuarto
Es ___ (midnight).|medianoche
Es ___ (noon).|mediodía
Son las cinco en ___ (exactly).|punto
Son las seis menos ___ (quarter).|cuarto
Llego a las siete de la ___ (morning).|mañana
Ceno a las nueve de la ___ (night).|noche
Trabajo por la ___ (afternoon).|tarde
Son las ocho y ___ (ten minutes).|diez
Llega a las once y ___ (twenty).|veinte
El tren sale a la una y ___ (five).|cinco`,
  },
  {
    id: "esa1p19",
    title: "Basic Prepositions",
    subtitle: "Where is it?",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common location prepositions.",
    data: `in|en
on|sobre
under|debajo de
next to|al lado de
between|entre
in front of|delante de
behind|detrás de
near (to)|cerca de
far from|lejos de
inside|dentro de
outside|fuera de
above|encima de
around|alrededor de
through|a través de
against|contra`,
  },
  {
    id: "esa1p20",
    title: "Nature & Outdoors",
    subtitle: "The world outside",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Basic nature vocabulary.",
    data: `coral reef|arrecife de coral
moon|luna
star|estrella
sky|cielo
tree|árbol
flower|flor
grass|hierba
sea|mar
sand|arena
rock|roca
lake|lago
island|isla
leaf|hoja
mountain|montaña
beach|playa`,
  },
  {
    id: "esa1p21",
    title: "Fruits & Vegetables",
    subtitle: "At the market",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common fruits and vegetables.",
    data: `apple|manzana
banana|plátano
orange (fruit)|naranja
strawberry|fresa
grape|uva
watermelon|sandía
pineapple|piña
pear|pera
cherry|cereza
lemon|limón
peach|durazno
mango|mango
coconut|coco
kiwi|kiwi
tomato|tomate
potato|papa
carrot|zanahoria
onion|cebolla
garlic|ajo
lettuce|lechuga
cucumber|pepino
pepper (vegetable)|pimiento
corn|maíz
avocado|aguacate
pumpkin|calabaza`,
  },
  {
    id: "esa1p22",
    title: "Kitchen Verbs",
    subtitle: "Cooking actions",
    kind: "cloze",
    note: 'Present-tense "yo" conjugation of common cooking verbs.',
    data: `Yo ___ (cortar) las verduras.|corto
Yo ___ (mezclar) los ingredientes.|mezclo
Yo ___ (hervir) el agua.|hiervo
Yo ___ (freír) el pescado.|frío
Yo ___ (hornear) un pastel.|horneo
Yo ___ (lavar) los platos.|lavo
Yo ___ (verter) la leche.|vierto
Yo ___ (añadir) sal a la sopa.|añado
Yo ___ (calentar) la comida.|caliento
Yo ___ (servir) la cena.|sirvo
Yo ___ (probar) la salsa.|pruebo
Yo ___ (pelar) las papas.|pelo
Yo ___ (picar) la cebolla.|pico
Yo ___ (batir) los huevos.|bato
Yo ___ (asar) el pollo.|aso
Yo ___ (colar) la pasta.|cuelo
Yo ___ (rallar) el queso.|rallo
Yo ___ (exprimir) un limón.|exprimo
Yo ___ (revolver) el arroz.|revuelvo
Yo ___ (tapar) la olla.|tapo
Yo ___ (encender) la estufa.|enciendo
Yo ___ (apagar) el horno.|apago
Yo ___ (medir) la harina.|mido
Yo ___ (untar) mantequilla en el pan.|unto
Yo ___ (enfriar) el postre.|enfrío`,
  },
  {
    id: "esa1p23",
    title: "Quantifiers",
    subtitle: "How much, how many",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common quantity words.",
    data: `more|más
less|menos
a lot|mucho
a little|poco
several|varios
enough|suficiente
too much|demasiado
each|cada
none|ninguno
half|mitad
some|algunos
many|muchos
few|pocos
most|mayoría
only|solo
almost|casi
nothing|nada
double|doble
triple|triple
single (just one)|único
extra|extra
entire|entero
partial|parcial
approximately|aproximadamente
exactly|exactamente`,
  },
  {
    id: "esa1p24",
    title: "Basic Conversation Phrases",
    subtitle: "Everyday small talk",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common small-talk and reaction phrases.",
    data: `Make yourself at home|Siéntete como en casa
How's it going?|¿Qué tal?
Long time no see|Cuánto tiempo sin verte
See you later|Hasta luego
Take care|Cuídate
Have a good day|Que tengas un buen día
Welcome back|Bienvenido de vuelta
I don't understand|No entiendo
Can you repeat that?|¿Puedes repetirlo?
Speak slowly, please|Habla despacio, por favor
What does that mean?|¿Qué significa eso?
I don't know|No sé
Of course|Claro
No problem|No hay problema
That's okay|Está bien
I agree|Estoy de acuerdo
I disagree|No estoy de acuerdo
Good luck|Buena suerte
Congratulations|Felicidades
I'm sorry|Perdón
Excuse me (getting attention)|Disculpe
It's a pleasure|Es un placer
Same to you|Igualmente
Take it easy|Tómalo con calma
Good job|Buen trabajo`,
  },
  {
    id: "esa1p25",
    title: "Colors & Shapes",
    subtitle: "More colors, and basic shapes",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Additional colors and basic geometric shapes.",
    data: `pink|rosa
purple|morado
gray|gris
brown|marrón
turquoise|turquesa
gold|dorado
silver|plateado
beige|beige
navy blue|azul marino
circle|círculo
square|cuadrado
triangle|triángulo
rectangle|rectángulo
star (shape)|estrella
heart (shape)|corazón
oval|óvalo
diamond (shape)|diamante
line|línea
dot|punto
curve|curva
striped|rayado
spotted|con manchas
light (color shade)|claro
dark (color shade)|oscuro
bright|brillante`,
  },
  {
    id: "esa1p26",
    title: "Directions & Commands",
    subtitle: "Basic instructions",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Basic imperative instructions and directions.",
    data: `turn left|gira a la izquierda
turn right|gira a la derecha
go straight|sigue derecho
stop|para
walk|camina
cross the street|cruza la calle
go up|sube
go down|baja
come here|ven aquí
go there|ve allá
wait here|espera aquí
follow me|sígueme
hurry up|apúrate
be careful|ten cuidado
slow down|más despacio
look here|mira aquí
listen|escucha
sit down|siéntate
stand up|levántate
come in|entra
go out|sal
close the door|cierra la puerta
open the window|abre la ventana
be quiet|cállate
pay attention|presta atención`,
  },
  {
    id: "esa1p29",
    title: "Speaking: Basic Everyday Phrases",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Short everyday greetings and phrases to practise saying.",
    // Each line is the same text twice: what is shown is what must be said.
    // UNVERIFIED AGAINST REAL PRODUCTION TRANSCRIPTS -- see
    // spoken-answer-es.ts's header for the full reasoning. Authored against
    // the real normaliser (every line round-trips through
    // matchesSpokenAnswerEs, and every number word was checked against its
    // digit-rendered STT variant too, per
    // docs/superpowers/specs/2026-09-25-spanish-content-audit-design.md §6.1),
    // not against intuition. Four things are avoided on purpose:
    //   - compound numbers 31+ ("treinta y uno" etc.), which will not
    //     survive smart_format, the same reasoning as English's and
    //     French's own compound-number avoidance
    //   - un/una used as a spoken NUMBER (kept only as the article, which
    //     the normaliser never maps -- see spoken-answer-es.ts's
    //     NUMBER_WORDS comment on this exact bare-word hazard)
    //   - ordinals, for the same smart_format reason English avoids them
    //   - any pair relying on seseo/ceceo, the b/v merger, or yeísmo to be
    //     distinguishable -- these are genuine phonemic mergers for most
    //     speakers, so no minimal pair built on them could ever be graded
    //     reliably from audio alone (see this pack's design doc §6.1)
    data: `Hola, ¿cómo estás?|Hola, ¿cómo estás?
Buenos días.|Buenos días.
Buenas noches.|Buenas noches.
¿Cómo te llamas?|¿Cómo te llamas?
Me llamo Ana.|Me llamo Ana.
Mucho gusto.|Mucho gusto.
¿De dónde eres?|¿De dónde eres?
Soy de España.|Soy de España.
Tengo hambre.|Tengo hambre.
Tengo sed.|Tengo sed.
¿Dónde está el baño?|¿Dónde está el baño?
Muchas gracias.|Muchas gracias.
De nada.|De nada.
Por favor.|Por favor.
Lo siento.|Lo siento.
¿Qué hora es?|¿Qué hora es?
Hasta luego.|Hasta luego.
Hasta mañana.|Hasta mañana.
¿Habla usted inglés?|¿Habla usted inglés?
No entiendo.|No entiendo.
¿Puede repetir, por favor?|¿Puede repetir, por favor?
Tengo dos hermanos.|Tengo dos hermanos.
Tengo tres hermanas.|Tengo tres hermanas.
Son las cinco.|Son las cinco.
Vivo aquí.|Vivo aquí.`,
  },
  {
    id: "esa1p27",
    title: "Write It Yourself: Everyday Needs",
    subtitle: "Say it your own way",
    kind: "translate",
    note: "Greetings, needs and everyday small talk -- more than one wording is right.",
    data: `Ask someone their name.|¿Cómo te llamas?;¿Cuál es tu nombre?;¿Cómo se llama usted?
Say your name is Ana.|Me llamo Ana.;Mi nombre es Ana.;Soy Ana.
Ask how someone is doing.|¿Cómo estás?;¿Qué tal?;¿Cómo te va?
Say you are fine, thanks.|Estoy bien, gracias.;Bien, gracias.;Muy bien, gracias.
Say good morning.|Buenos días.;Buen día.;Muy buenos días.
Ask where the bathroom is.|¿Dónde está el baño?;¿Dónde queda el baño?;¿Dónde puedo encontrar el baño?
Say you don't understand.|No entiendo.;No comprendo.;No te entiendo.
Ask someone to repeat that.|¿Puedes repetir eso?;¿Podrías repetirlo?;¿Me lo repites, por favor?
Say you are hungry.|Tengo hambre.;Estoy hambriento.;Me muero de hambre.
Say you are thirsty.|Tengo sed.;Estoy sediento.;Me muero de sed.
Ask for a coffee.|Quiero un café, por favor.;Me gustaría un café.;¿Me da un café, por favor?
Say thank you very much.|Muchas gracias.;Muchísimas gracias.;Te lo agradezco mucho.
Say you're welcome.|De nada.;No hay de qué.;Con gusto.
Ask what time it is.|¿Qué hora es?;¿Tienes la hora?;¿Me dices qué hora es?
Say it's five o'clock.|Son las cinco.;Son las cinco en punto.;Ya son las cinco.
Ask where someone lives.|¿Dónde vives?;¿Dónde vive usted?;¿En dónde vives?
Say you live in Mexico.|Vivo en México.;Yo vivo en México.;Resido en México.
Ask someone's age.|¿Cuántos años tienes?;¿Qué edad tienes?;¿Cuántos años tiene usted?
Say you are twenty years old.|Tengo veinte años.;Tengo veinte.;Ya tengo veinte años.
Say goodbye to a friend.|Adiós.;Nos vemos.;Chao.
Say see you tomorrow.|Hasta mañana.;Nos vemos mañana.;Te veo mañana.
Ask for the check at a restaurant.|La cuenta, por favor.;¿Me trae la cuenta?;¿Nos puede traer la cuenta, por favor?
Say you like the food.|Me gusta la comida.;La comida me gusta.;Me encanta la comida.
Ask how much something costs.|¿Cuánto cuesta?;¿Cuánto es?;¿Qué precio tiene?
Say good night.|Buenas noches.;Que descanses.;Que duermas bien.`,
  },
  {
    id: "esa1p28",
    title: "Minimal Pairs",
    subtitle: "Listen closely",
    kind: "listening",
    prompt: "¿Qué escuchaste?",
    note: "Sentences built around sounds that merge for most Spanish speakers: seseo (casa/caza), b/v (basto/vasto, botar/votar), yeísmo (pollo/poyo), and h-silent (onda/honda).",
    data: `Hablamos de la casa toda la tarde.|Hablamos de la casa toda la tarde.
Hablamos de la caza toda la tarde.|Hablamos de la caza toda la tarde.
Nunca había visto una casa tan grande.|Nunca había visto una casa tan grande.
Nunca había visto una caza tan grande.|Nunca había visto una caza tan grande.
Vimos la onda desde la playa.|Vimos la onda desde la playa.
Vimos la honda desde la playa.|Vimos la honda desde la playa.
Nadie esperaba una onda tan fuerte.|Nadie esperaba una onda tan fuerte.
Nadie esperaba una honda tan fuerte.|Nadie esperaba una honda tan fuerte.
Vimos el pollo en el patio.|Vimos el pollo en el patio.
Vimos el poyo en el patio.|Vimos el poyo en el patio.
Mi abuela puso el pollo cerca de la puerta.|Mi abuela puso el pollo cerca de la puerta.
Mi abuela puso el poyo cerca de la puerta.|Mi abuela puso el poyo cerca de la puerta.
El paisaje era completamente vasto.|El paisaje era completamente vasto.
El paisaje era completamente basto.|El paisaje era completamente basto.
Todos dijeron que el terreno era muy vasto.|Todos dijeron que el terreno era muy vasto.
Todos dijeron que el terreno era muy basto.|Todos dijeron que el terreno era muy basto.
Todos miraban el cerro con atención.|Todos miraban el cerro con atención.
Todos miraban el cero con atención.|Todos miraban el cero con atención.
Se podía ver el cerro desde la ventana.|Se podía ver el cerro desde la ventana.
Se podía ver el cero desde la ventana.|Se podía ver el cero desde la ventana.
Vamos a votar mañana temprano.|Vamos a votar mañana temprano.
Vamos a botar mañana temprano.|Vamos a botar mañana temprano.
Decidieron votar ayer por la tarde.|Decidieron votar ayer por la tarde.
Decidieron botar ayer por la tarde.|Decidieron botar ayer por la tarde.
Subimos el cerro despacio.|Subimos el cerro despacio.`,
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
fish (as food)|pescado
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
bridge|puente
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
  {
    id: "esa2p6",
    title: "Common Verbs (tú form)",
    subtitle: "Present tense, informal you",
    kind: "cloze",
    note: 'Present-tense "tú" conjugation of common verbs.',
    data: `Tú ___ (hablar) muy bien español.|hablas
Tú ___ (comer) mucha fruta.|comes
Tú ___ (vivir) en Madrid.|vives
Tú ___ (tener) razón.|tienes
Tú ___ (ser) muy amable.|eres
Tú ___ (estar) cansado.|estás
Tú ___ (ir) a la escuela.|vas
Tú ___ (hacer) la tarea.|haces
Tú ___ (querer) un café.|quieres
Tú ___ (poder) ayudarme.|puedes
Tú ___ (saber) la respuesta.|sabes
Tú ___ (tomar) el autobús.|tomas
Tú ___ (ver) la película.|ves
Tú ___ (venir) a la fiesta.|vienes
Tú ___ (decir) la verdad.|dices
Tú ___ (dormir) bien.|duermes
Tú ___ (beber) agua.|bebes
Tú ___ (leer) el periódico.|lees
Tú ___ (escribir) una carta.|escribes
Tú ___ (jugar) al fútbol.|juegas
Tú ___ (trabajar) mucho.|trabajas
Tú ___ (estudiar) español.|estudias
Tú ___ (llegar) tarde.|llegas
Tú ___ (empezar) el proyecto.|empiezas
Tú ___ (pedir) ayuda.|pides`,
  },
  {
    id: "esa2p7",
    title: "Shopping & Money",
    subtitle: "At the store",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Shopping and money vocabulary.",
    data: `money|dinero
price|precio
expensive|caro
cheap|barato
cashier|cajero
to buy|comprar
to sell|vender
cash|efectivo
credit card|tarjeta de crédito
receipt|recibo
discount|descuento
size|talla
change (money)|cambio
wallet|cartera
free (no cost)|gratis
sale|rebaja
to pay|pagar
customer|cliente
bill (invoice)|factura
coin|moneda`,
  },
  {
    id: "esa2p8",
    title: "Hobbies & Free Time",
    subtitle: "What do you like to do?",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Hobbies and leisure-activity vocabulary.",
    data: `to read|leer
to swim|nadar
to dance|bailar
to sing|cantar
to paint|pintar
to cook|cocinar
to travel|viajar
to run|correr
to walk|caminar
to draw|dibujar
music|música
movie|película
game|juego
sport|deporte
soccer|fútbol
guitar|guitarra
photograph|fotografía
garden|jardín
to fish|pescar
to camp|acampar`,
  },
  {
    id: "esa2p9",
    title: "Weather Expressions",
    subtitle: "hacer, estar, and weather",
    kind: "cloze",
    note: "Common weather expressions using hacer/estar/haber.",
    data: `___ calor hoy.|Hace
___ frío en invierno.|Hace
___ mucho viento.|Hace
___ sol esta tarde.|Hace
Está ___ (raining) ahora.|lloviendo
Está ___ (snowing) en las montañas.|nevando
Está muy ___ (cloudy) hoy.|nublado
___ niebla esta mañana.|Hay
___ buen tiempo hoy.|Hace
___ mal tiempo este fin de semana.|Hace
La temperatura ___ (is) de veinte grados.|es
___ humedad hoy.|Hay
En verano ___ mucho calor.|hace
En invierno ___ mucho frío.|hace
A veces ___ tormentas fuertes.|hay`,
  },
  {
    id: "esa2p10",
    title: "Restaurant Phrases",
    subtitle: "Ordering food",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common restaurant phrases.",
    data: `I would like...|Quisiera...
Could I have the menu?|¿Me da el menú?
What do you recommend?|¿Qué me recomienda?
I'm allergic to...|Soy alérgico a...
The check, please|La cuenta, por favor
Is service included?|¿Está incluido el servicio?
Table for two, please|Mesa para dos, por favor
I'll have the same|Yo quiero lo mismo
It was delicious|Estaba delicioso
Can I get this to go?|¿Me lo da para llevar?
Do you have vegetarian options?|¿Tienen opciones vegetarianas?
Enjoy your meal|Buen provecho
Is this dish spicy?|¿Este plato es picante?
Water, please|Agua, por favor
Nothing else, thanks|Nada más, gracias`,
  },
  {
    id: "esa2p11",
    title: "At the Doctor",
    subtitle: "Health and illness",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Health and doctor's-visit vocabulary.",
    data: `doctor's office|consultorio
appointment|cita
symptom|síntoma
fever|fiebre
headache|dolor de cabeza
cough|tos
medicine|medicina
prescription (informal)|receta
pharmacy|farmacia
sick|enfermo
healthy|sano
injury|lesión
allergy|alergia
nurse (female)|enfermera
patient|paciente`,
  },
  {
    id: "esa2p12",
    title: "Clothing & Shopping",
    subtitle: "Trying things on",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Clothes-shopping phrases and vocabulary.",
    data: `fitting room|probador
Can I try this on?|¿Puedo probarme esto?
Do you have a smaller size?|¿Tiene una talla más pequeña?
Do you have a bigger size?|¿Tiene una talla más grande?
It fits well|Me queda bien
It's too tight|Me queda apretado
It's too loose|Me queda flojo
What size are you?|¿Qué talla usa?
I'm just looking|Solo estoy mirando
Where are the fitting rooms?|¿Dónde están los probadores?
Does it come in another color?|¿Viene en otro color?
I'll take it|Me lo llevo
How much does it cost?|¿Cuánto cuesta?
It's on sale|Está de rebaja
Do you accept cards?|¿Aceptan tarjetas?`,
  },
  {
    id: "esa2p13",
    title: "Places in the City II",
    subtitle: "More around town",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "More places found around a city.",
    data: `post office|oficina de correos
clinic|clínica
supermarket|supermercado
library|biblioteca
museum|museo
theater|teatro
gym|gimnasio
hotel|hotel
restaurant|restaurante
bakery|panadería
bookstore|librería
gas station|gasolinera
police station|comisaría
town hall|ayuntamiento
courthouse|palacio de justicia`,
  },
  {
    id: "esa2p14",
    title: "Technology & Devices",
    subtitle: "Everyday tech vocabulary",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common technology vocabulary.",
    data: `phone|teléfono
computer|computadora
internet|internet
email|correo electrónico
password|contraseña
screen|pantalla
keyboard|teclado
mouse (device)|ratón
application|aplicación
charger|cargador
battery|batería
wifi|wifi
file|archivo
video call|videollamada
download|descarga`,
  },
  {
    id: "esa2p15",
    title: "Frequency Adverbs",
    subtitle: "How often?",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Adverbs of frequency for describing routines.",
    data: `always|siempre
usually|generalmente
often|a menudo
sometimes|a veces
rarely|raramente
never|nunca
every day|todos los días
once a week|una vez a la semana
from time to time|de vez en cuando
again|otra vez`,
  },
  {
    id: "esa2p16",
    title: "Ir a + Infinitive",
    subtitle: "Near future tense",
    kind: "cloze",
    note: '"Ir a + infinitive" for talking about the near future.',
    data: `Yo ___ (ir) a estudiar esta noche.|voy
Tú ___ (ir) a llamar a tu madre.|vas
Ella ___ (ir) a viajar mañana.|va
Nosotros ___ (ir) a comer pronto.|vamos
Ellos ___ (ir) a llegar tarde.|van
Yo voy a ___ (comprar) un regalo.|comprar
Tú vas a ___ (visitar) a tus abuelos.|visitar
Ella va a ___ (empezar) un nuevo trabajo.|empezar
Nosotros vamos a ___ (ver) una película.|ver
Ellos van a ___ (hacer) una fiesta.|hacer
¿___ (ir) tú a venir con nosotros?|Vas
Yo no ___ (ir) a poder ir.|voy
Nosotros vamos a ___ (salir) temprano.|salir
Ella va a ___ (llamar) más tarde.|llamar
Ellos van a ___ (estudiar) juntos.|estudiar`,
  },
  {
    id: "esa2p17",
    title: "Possessive Adjectives",
    subtitle: "my, your, his, her...",
    kind: "cloze",
    note: "Possessive adjectives agreeing with the noun they modify.",
    data: `Este es ___ (my) libro.|mi
Esta es ___ (your, informal) casa.|tu
Ese es ___ (his) coche.|su
Esa es ___ (her) mochila.|su
Estos son ___ (our) amigos.|nuestros
Esas son ___ (their) ideas.|sus
___ (my) padres viven aquí.|Mis
¿Dónde está ___ (your, formal) oficina?|su
___ (our) casa es grande.|Nuestra
Ellos perdieron ___ (their) llaves.|sus
Ella olvidó ___ (her) teléfono.|su
Nosotros amamos ___ (our) ciudad.|nuestra
¿Son ___ (your, informal) estas llaves?|tuyas
Ese perro es ___ (mine).|mío
Esa idea fue ___ (his).|suya`,
  },
  {
    id: "esa2p18",
    title: "Common Irregular Verbs",
    subtitle: "Yo-form irregulars",
    kind: "cloze",
    note: 'Verbs with an irregular "yo" form in the present tense.',
    data: `Yo ___ (poner) la mesa todos los días.|pongo
Yo ___ (salir) de casa a las ocho.|salgo
Yo ___ (traer) el postre a la fiesta.|traigo
Yo ___ (conducir) al trabajo.|conduzco
Yo ___ (conocer) a mucha gente aquí.|conozco
Yo ___ (caer) bien a mis compañeros.|caigo
Yo ___ (valer) la pena para este equipo.|valgo
Yo ___ (hacer) ejercicio cada mañana.|hago
Yo ___ (dar) consejos a mis amigos.|doy
Yo ___ (ver) las noticias por la noche.|veo`,
  },
  {
    id: "esa2p19",
    title: "Months & Seasons",
    subtitle: "The calendar",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Months of the year and the four seasons.",
    data: `January|enero
February|febrero
March|marzo
April|abril
May|mayo
June|junio
July|julio
August|agosto
September|septiembre
October|octubre
November|noviembre
December|diciembre
spring|primavera
summer|verano
autumn|otoño
winter|invierno
season|estación
calendar|calendario
century|siglo
decade|década`,
  },
  {
    id: "esa2p20",
    title: "Weekend Activities",
    subtitle: "What do you do on weekends?",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common weekend and leisure activities.",
    data: `to relax|relajarse
to sleep in|dormir hasta tarde
to go shopping|ir de compras
to visit friends|visitar a amigos
to watch a movie|ver una película
to go for a walk|dar un paseo
to clean the house|limpiar la casa
to go to the gym|ir al gimnasio
to have a picnic|hacer un picnic
to go out to eat|salir a comer
to sleep late|acostarse tarde
to do nothing|no hacer nada
to read a book|leer un libro
to cook a big meal|cocinar una gran comida
to go to the beach|ir a la playa`,
  },
  {
    id: "esa2p21",
    title: "Household Appliances",
    subtitle: "Around the house",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Home appliances and cleaning tools.",
    data: `refrigerator|refrigerador
stove|estufa
oven|horno
microwave|microondas
washing machine|lavadora
dryer|secadora
dishwasher|lavavajillas
vacuum cleaner|aspiradora
iron|plancha
blender|licuadora
toaster|tostadora
fan|ventilador
air conditioner|aire acondicionado
heater|calefactor
coffee maker|cafetera
mop|trapeador
broom|escoba
bucket|cubo
sponge|esponja
detergent|detergente
hanger|percha
drawer|cajón
shelf|estante
closet|armario
curtain|cortina`,
  },
  {
    id: "esa2p22",
    title: "Emotions & Feelings",
    subtitle: "ponerse / sentirse + adjective",
    kind: "cloze",
    note: '"Ponerse" and "sentirse" with emotion adjectives.',
    data: `Ella se pone ___ (nervous) antes de un examen.|nerviosa
Yo me siento ___ (happy) hoy.|feliz
Nos ponemos ___ (sad) cuando llueve.|tristes
Él se siente ___ (tired) después del trabajo.|cansado
Te pones ___ (angry) fácilmente.|enojado
Me siento ___ (confused) con esta pregunta.|confundido
Se ponen ___ (excited) antes del viaje.|emocionados
Nos sentimos ___ (proud) de nuestro equipo.|orgullosos
Te sientes ___ (nervous) por la entrevista.|nervioso
Se pone ___ (worried) cuando no llamas.|preocupada
Me siento ___ (relaxed) en la playa.|relajado
Se sienten ___ (surprised) por la noticia.|sorprendidos
Te pones ___ (sad) cuando pierdes.|triste
Nos ponemos ___ (happy) en las fiestas.|felices
Se siente ___ (bored) los domingos.|aburrido
Me pongo ___ (embarrassed) fácilmente.|avergonzado
Él se siente ___ (calm) antes de dormir.|tranquilo
Ellas se ponen ___ (excited) con la música.|emocionadas
Te sientes ___ (confident) hoy.|seguro
Nos sentimos ___ (grateful) por su ayuda.|agradecidos
Se pone ___ (impatient) en las filas.|impaciente
Me siento ___ (curious) sobre esto.|curioso
Se sienten ___ (disappointed) con el resultado.|decepcionados
Te pones ___ (jealous) a veces.|celoso
Nos sentimos ___ (motivated) para empezar.|motivados`,
  },
  {
    id: "esa2p23",
    title: "Banking & Post Office",
    subtitle: "Money and mail",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Banking and post-office vocabulary.",
    data: `bank account|cuenta bancaria
ATM|cajero automático
deposit|depósito
withdrawal|retiro
savings|ahorros
loan|préstamo
interest rate|tasa de interés
balance|saldo
envelope|sobre
stamp|estampilla
package|paquete
mailbox|buzón
address|dirección
zip code|código postal
to send|enviar
to mail|enviar por correo
signature|firma
form (document)|formulario
identification|identificación
teller|cajero
branch (bank)|sucursal
transfer|transferencia
currency|moneda
exchange rate|tipo de cambio
safe (deposit box)|caja fuerte`,
  },
  {
    id: "esa2p24",
    title: "Common Adverbs",
    subtitle: "Describing how",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common manner and degree adverbs.",
    data: `quickly|rápidamente
slowly|lentamente
well|bien
badly|mal
easily|fácilmente
carefully|cuidadosamente
suddenly|de repente
finally|finalmente
immediately|inmediatamente
especially|especialmente
probably|probablemente
certainly|ciertamente
unfortunately|desafortunadamente
fortunately|afortunadamente
obviously|obviamente
simply|simplemente
completely|completamente
totally|totalmente
generally|generalmente
personally|personalmente
seriously|en serio
actually|en realidad
apparently|aparentemente
clearly|claramente
directly|directamente`,
  },
  {
    id: "esa2p25",
    title: "Prepositions of Time",
    subtitle: "When things happen",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Prepositions and expressions for talking about time.",
    data: `before|antes de
after|después de
during|durante
since|desde
until|hasta
for (duration)|por
at (time)|a las
on (day)|el
in (month/year)|en
within|dentro de
throughout|a lo largo de
by (deadline)|para
from...to|desde...hasta
ago|hace
soon|pronto
meanwhile|mientras tanto
eventually|con el tiempo
nowadays|hoy en día
previously|anteriormente
subsequently|posteriormente
briefly|brevemente
frequently|frecuentemente
occasionally|ocasionalmente
right now|ahora mismo
from now on|de ahora en adelante`,
  },
  {
    id: "esa2p26",
    title: "Common Verbs (nosotros form)",
    subtitle: "Present tense, we form",
    kind: "cloze",
    note: 'Present-tense "nosotros" conjugation, including stem-changing and irregular verbs.',
    data: `Nosotros ___ (empezar) el proyecto mañana.|empezamos
Nosotros ___ (terminar) el trabajo a las cinco.|terminamos
Nosotros ___ (entender) la lección.|entendemos
Nosotros ___ (pensar) viajar pronto.|pensamos
Nosotros ___ (perder) el autobús a veces.|perdemos
Nosotros ___ (encontrar) las llaves.|encontramos
Nosotros ___ (dormir) ocho horas.|dormimos
Nosotros ___ (pedir) ayuda cuando la necesitamos.|pedimos
Nosotros ___ (seguir) las instrucciones.|seguimos
Nosotros ___ (repetir) la pregunta.|repetimos
Nosotros ___ (preferir) el té al café.|preferimos
Nosotros ___ (cerrar) la tienda a las nueve.|cerramos
Nosotros ___ (mostrar) el camino a los turistas.|mostramos
Nosotros ___ (recordar) su cumpleaños.|recordamos
Nosotros ___ (volver) a casa tarde.|volvemos
Nosotros ___ (conseguir) boletos para el concierto.|conseguimos
Nosotros ___ (elegir) el mejor restaurante.|elegimos
Nosotros ___ (construir) una casa nueva.|construimos
Nosotros ___ (destruir) los documentos viejos.|destruimos
Nosotros ___ (incluir) a todos en el plan.|incluimos
Nosotros ___ (huir) del peligro.|huimos
Nosotros ___ (concluir) la reunión temprano.|concluimos
Nosotros ___ (sonreír) mucho.|sonreímos
Nosotros ___ (reír) con sus chistes.|reímos
Nosotros ___ (freír) las papas.|freímos`,
  },
  {
    id: "esa2p29",
    title: "Speaking: Daily Routine & Plans",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Everyday routine and near-future plans to practise saying.",
    // See esa1p29's comment for the full authoring rationale (round-tripped
    // against the real normaliser, same hazards avoided).
    data: `Me levanto a las siete.|Me levanto a las siete.
Desayuno a las ocho.|Desayuno a las ocho.
Voy al trabajo en autobús.|Voy al trabajo en autobús.
Trabajo hasta las cinco.|Trabajo hasta las cinco.
Vuelvo a casa cansado.|Vuelvo a casa cansado.
Ceno con mi familia.|Ceno con mi familia.
Veo la televisión un rato.|Veo la televisión un rato.
Me acuesto a las diez.|Me acuesto a las diez.
Los fines de semana descanso.|Los fines de semana descanso.
A veces voy al cine.|A veces voy al cine.
Me gusta cocinar los domingos.|Me gusta cocinar los domingos.
Prefiero el té al café.|Prefiero el té al café.
Necesito comprar leche.|Necesito comprar leche.
Voy al mercado los sábados.|Voy al mercado los sábados.
Hoy hace mucho calor.|Hoy hace mucho calor.
Mañana va a llover.|Mañana va a llover.
El invierno aquí es frío.|El invierno aquí es frío.
Me encanta la primavera.|Me encanta la primavera.
Tengo una reunión a las nueve.|Tengo una reunión a las nueve.
Llego tarde a veces.|Llego tarde a veces.
Estudio español todos los días.|Estudio español todos los días.
Practico con mis amigos.|Practico con mis amigos.
Quiero viajar el próximo año.|Quiero viajar el próximo año.
Voy a visitar a mis abuelos.|Voy a visitar a mis abuelos.
Espero verte pronto.|Espero verte pronto.`,
  },
  {
    id: "esa2p27",
    title: "Write It Yourself: Asking and Arranging",
    subtitle: "Say it your own way",
    kind: "translate",
    note: "Asking, arranging and explaining -- more than one wording is right.",
    data: `Ask someone if they are free tonight.|¿Estás libre esta noche?;¿Tienes tiempo esta noche?;¿Puedes esta noche?
Suggest meeting tomorrow.|¿Nos vemos mañana?;¿Quedamos mañana?;Podríamos vernos mañana.
Say you have to leave now.|Tengo que irme ahora.;Debo irme ya.;Ya me tengo que ir.
Ask for directions to the station.|¿Cómo llego a la estación?;¿Dónde queda la estación?;¿Por dónde se va a la estación?
Say turn left at the corner.|Gira a la izquierda en la esquina.;Dobla a la izquierda en la esquina.;En la esquina, gira a la izquierda.
Ask if the store is open.|¿Está abierta la tienda?;¿La tienda está abierta?;¿Abrió ya la tienda?
Say you would like to reserve a table.|Quisiera reservar una mesa.;Me gustaría reservar una mesa.;Quiero hacer una reservación.
Ask if there is a room available.|¿Hay una habitación disponible?;¿Tienen alguna habitación libre?;¿Queda alguna habitación?
Ask what time the train leaves.|¿A qué hora sale el tren?;¿Cuándo sale el tren?;¿A qué hora parte el tren?
Say you need to see a doctor.|Necesito ver a un médico.;Necesito un doctor.;Tengo que consultar a un médico.
Say you don't feel well.|No me siento bien.;Me siento mal.;No me encuentro bien.
Ask what someone is doing this weekend.|¿Qué vas a hacer este fin de semana?;¿Qué haces este fin de semana?;¿Tienes planes para el fin de semana?
Say you work in an office.|Trabajo en una oficina.;Yo trabajo en una oficina.;Mi trabajo es en una oficina.
Say you have been studying Spanish for two years.|Llevo dos años estudiando español.;Estudio español desde hace dos años.;Hace dos años que estudio español.
Say you have lived here for a long time.|Vivo aquí desde hace mucho tiempo.;Llevo mucho tiempo viviendo aquí.;Hace mucho tiempo que vivo aquí.
Say she arrives in ten minutes.|Ella llega en diez minutos.;Llega en diez minutos.;En diez minutos, ella llega.
Say he left last night.|Él se fue anoche.;Se fue anoche.;Anoche, él se fue.
Ask if someone can come with us.|¿Puedes venir con nosotros?;¿Quieres venir con nosotros?;¿Te gustaría acompañarnos?
Say that's a good idea.|Es una buena idea.;Buena idea.;Me parece una buena idea.
Say you agree with someone.|Estoy de acuerdo contigo.;Estoy de acuerdo.;Concuerdo contigo.
Say you don't agree.|No estoy de acuerdo.;No estoy de acuerdo contigo.;Yo no pienso lo mismo.
Suggest meeting in front of the station.|Nos vemos frente a la estación.;Quedamos delante de la estación.;Encontrémonos frente a la estación.
Ask someone to call you back.|Llámame, por favor.;¿Me puedes llamar luego?;Devuélveme la llamada, por favor.
Say you'll be there in five minutes.|Llego en cinco minutos.;Estaré ahí en cinco minutos.;En cinco minutos estoy ahí.
Ask someone to speak more slowly.|¿Puedes hablar más despacio?;Habla más despacio, por favor.;¿Podrías hablar más lento?`,
  },
  {
    id: "esa2p28",
    title: "Minimal Pairs",
    subtitle: "Listen closely",
    kind: "listening",
    prompt: "¿Qué escuchaste?",
    note: "Sentences built around sounds that merge for most Spanish speakers: seseo (taza/tasa), b/v (cocer/coser, rebelarse/revelarse), and yeísmo (pulla/puya, ojear/hojear, rallar/rayar).",
    data: `Mi madre me enseñó a cocer bien.|Mi madre me enseñó a cocer bien.
Mi madre me enseñó a coser bien.|Mi madre me enseñó a coser bien.
Nunca aprendí a cocer rápido.|Nunca aprendí a cocer rápido.
Nunca aprendí a coser rápido.|Nunca aprendí a coser rápido.
Decidió rebelarse ante todos.|Decidió rebelarse ante todos.
Decidió revelarse ante todos.|Decidió revelarse ante todos.
Nadie esperaba que fuera a rebelarse.|Nadie esperaba que fuera a rebelarse.
Nadie esperaba que fuera a revelarse.|Nadie esperaba que fuera a revelarse.
Le lanzó una pulla sin piedad.|Le lanzó una pulla sin piedad.
Le lanzó una puya sin piedad.|Le lanzó una puya sin piedad.
Todos notaron la pulla en su comentario.|Todos notaron la pulla en su comentario.
Todos notaron la puya en su comentario.|Todos notaron la puya en su comentario.
Se puso a hojear el periódico.|Se puso a hojear el periódico.
Se puso a ojear el periódico.|Se puso a ojear el periódico.
Prefería hojear la revista antes de comprarla.|Prefería hojear la revista antes de comprarla.
Prefería ojear la revista antes de comprarla.|Prefería ojear la revista antes de comprarla.
El niño no debía rayar eso.|El niño no debía rayar eso.
El niño no debía rallar eso.|El niño no debía rallar eso.
Le pedí que no rayara la mesa.|Le pedí que no rayara la mesa.
Le pedí que no rallara la mesa.|Le pedí que no rallara la mesa.
No encontraba la taza en la mesa.|No encontraba la taza en la mesa.
No encontraba la tasa en la mesa.|No encontraba la tasa en la mesa.
Alguien había dejado la taza en la cocina.|Alguien había dejado la taza en la cocina.
Alguien había dejado la tasa en la cocina.|Alguien había dejado la tasa en la cocina.
Guardé la taza favorita en el estante.|Guardé la taza favorita en el estante.`,
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
otherwise|de lo contrario
likewise|asimismo
in fact|de hecho
as soon as|tan pronto como
unless|a menos que
even though (formal)|aun cuando
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
  {
    id: "esb1p6",
    title: "Present Perfect",
    subtitle: "haber + past participle",
    kind: "cloze",
    note: "Present perfect tense across several subjects.",
    data: `Yo ___ (comer) ya.|he comido
Tú ___ (terminar) el trabajo.|has terminado
Ella ___ (llegar) tarde.|ha llegado
Nosotros ___ (viajar) mucho.|hemos viajado
Ellos ___ (ver) esa película.|han visto
Yo ya ___ (hacer) mi tarea.|he hecho
Tú ___ (escribir) la carta.|has escrito
Él ___ (abrir) la puerta.|ha abierto
Nosotras ___ (decir) la verdad.|hemos dicho
Ellas ___ (poner) la mesa.|han puesto
Yo nunca ___ (estar) en España.|he estado
Tú ___ (romper) el vaso.|has roto
Ella ___ (volver) a casa.|ha vuelto
Nosotros ___ (resolver) el problema.|hemos resuelto
Ellos ___ (descubrir) la verdad.|han descubierto
Yo ___ (vivir) aquí diez años.|he vivido
Tú ___ (leer) ese libro.|has leído
Él ___ (cubrir) la mesa.|ha cubierto
Nosotras ___ (freír) el pollo.|hemos freído
Ellos ___ (imprimir) el documento.|han impreso
Yo ___ (ganar) el partido.|he ganado
Tú ___ (perder) las llaves.|has perdido
Ella ___ (aprender) mucho.|ha aprendido
Nosotros ___ (comprar) una casa.|hemos comprado
Ellos ___ (llegar) temprano.|han llegado`,
  },
  {
    id: "esb1p7",
    title: "Ser vs. Estar",
    subtitle: "Two verbs for 'to be'",
    kind: "cloze",
    note: "Ser (identity/traits) vs. estar (state/location), present tense.",
    data: `Ella ___ (ser) doctora.|es
Él ___ (estar) enfermo hoy.|está
Nosotros ___ (ser) de México.|somos
Ellos ___ (estar) en la playa.|están
Yo ___ (ser) alto.|soy
Tú ___ (estar) muy feliz.|estás
El café ___ (estar) caliente.|está
La casa ___ (ser) grande.|es
Nosotras ___ (estar) cansadas.|estamos
Ellas ___ (ser) profesoras.|son
Yo ___ (estar) en casa.|estoy
Tú ___ (ser) muy inteligente.|eres
El cielo ___ (estar) nublado.|está
La fiesta ___ (ser) el sábado.|es
Nosotros ___ (estar) listos.|estamos
Ellos ___ (ser) argentinos.|son
Yo ___ (ser) profesor.|soy
Tú ___ (estar) preocupado.|estás
El libro ___ (ser) interesante.|es
La sopa ___ (estar) fría.|está
Nosotras ___ (ser) hermanas.|somos
Ellas ___ (estar) ocupadas.|están
Yo ___ (estar) aburrido.|estoy
Tú ___ (ser) muy simpático.|eres
El examen ___ (ser) difícil.|es`,
  },
  {
    id: "esb1p8",
    title: "Travel & Transportation",
    subtitle: "Getting from A to B",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Travel and transportation vocabulary.",
    data: `airplane|avión
train|tren
bus|autobús
car|coche
ship|barco
bicycle|bicicleta
ticket|boleto
passport|pasaporte
suitcase|maleta
trip|viaje
to fly|volar
to arrive|llegar
to depart|partir
schedule|horario
platform|andén
seat|asiento
luggage|equipaje
customs|aduana
tourist|turista
map|mapa`,
  },
  {
    id: "esb1p9",
    title: "Commands",
    subtitle: "Affirmative and negative tú commands",
    kind: "cloze",
    note: "Informal (tú) imperative mood, affirmative and negative.",
    data: `¡___ (hablar) más despacio!|Habla
¡No ___ (hablar) tan rápido!|hables
¡___ (comer) tus verduras!|Come
¡No ___ (comer) tanto azúcar!|comas
¡___ (abrir) la ventana!|Abre
¡No ___ (abrir) la puerta!|abras
¡___ (venir) aquí!|Ven
¡No ___ (venir) tarde!|vengas
¡___ (hacer) tu tarea!|Haz
¡No ___ (hacer) ruido!|hagas
¡___ (salir) de aquí!|Sal
¡No ___ (salir) sin abrigo!|salgas
¡___ (ser) paciente!|Sé
¡No ___ (ser) grosero!|seas
¡___ (poner) la mesa!|Pon
¡No ___ (poner) los pies en la mesa!|pongas
¡___ (decir) la verdad!|Di
¡No ___ (decir) mentiras!|digas
¡___ (ir) a tu cuarto!|Ve
¡No ___ (ir) solo!|vayas`,
  },
  {
    id: "esb1p10",
    title: "Direct Object Pronouns",
    subtitle: "lo, la, los, las",
    kind: "cloze",
    note: "Direct object pronouns replacing a previously mentioned noun.",
    data: `¿Compraste el pan? Sí, ___ compré.|lo
¿Viste la película? Sí, ___ vi.|la
¿Tienes los boletos? Sí, ___ tengo.|los
¿Leíste las noticias? Sí, ___ leí.|las
¿Quieres el café? Sí, ___ quiero.|lo
¿Conoces a María? Sí, ___ conozco.|la
¿Compraste los zapatos? No, no ___ compré.|los
¿Escribiste las cartas? No, no ___ escribí.|las
¿Puedes ayudarme? Sí, puedo ayudar___.|te
¿Me llamas mañana? Sí, ___ llamo.|te
¿Nos ves el sábado? Sí, ___ veo.|los
¿Me esperas aquí? Sí, ___ espero.|te
¿Trajiste las llaves? Sí, ___ traje.|las
¿Compraste el regalo? No, no ___ compré.|lo
¿Terminaste la tarea? Sí, ya ___ terminé.|la`,
  },
  {
    id: "esb1p11",
    title: "Gustar & Indirect Object Pronouns",
    subtitle: "me/te/le/nos/les gusta",
    kind: "cloze",
    note: '"Gustar" and similar verbs (encantar, molestar, interesar) with indirect object pronouns.',
    data: `A mí ___ gusta el chocolate.|me
A ti ___ gusta bailar.|te
A ella ___ gusta leer.|le
A nosotros ___ gusta viajar.|nos
A ellos ___ gustan los deportes.|les
A mí ___ encanta esta canción.|me
A ti ___ molesta el ruido.|te
A él ___ interesa la historia.|le
A nosotras ___ gustan las películas.|nos
A ustedes ___ importa el medio ambiente.|les
A mí me ___ (gustar) mucho los perros.|gustan
A ella le ___ (encantar) la música clásica.|encanta
A nosotros nos ___ (faltar) tiempo.|falta
A ellos les ___ (quedar) poco dinero.|queda
A ti te ___ (doler) la cabeza.|duele`,
  },
  {
    id: "esb1p12",
    title: "Preterite vs. Imperfect",
    subtitle: "Choosing the right past tense",
    kind: "cloze",
    note: "Preterite (completed action) vs. imperfect (ongoing/habitual past).",
    data: `Cuando era niño, ___ (jugar) todos los días.|jugaba
Ayer ___ (jugar) al fútbol con mis amigos.|jugué
Mientras yo ___ (cocinar), sonó el teléfono.|cocinaba
Ella ___ (llamar) a las tres en punto.|llamó
De pequeño, nosotros ___ (vivir) en el campo.|vivíamos
El año pasado, nosotros ___ (mudarnos) a la ciudad.|nos mudamos
Todos los veranos, ellos ___ (visitar) a sus abuelos.|visitaban
El verano pasado, ellos ___ (viajar) a Perú.|viajaron
Hacía sol cuando ___ (salir) de casa.|salí
Eran las diez cuando ___ (empezar) la película.|empezó
Yo ___ (tener) diez años en esa foto.|tenía
De repente, ___ (escuchar) un ruido extraño.|escuché
Todos los días ella ___ (caminar) al trabajo.|caminaba
Anoche nosotros ___ (cenar) en un restaurante nuevo.|cenamos
Mientras ellos ___ (hablar), yo escribía notas.|hablaban`,
  },
  {
    id: "esb1p13",
    title: "Work & Professions",
    subtitle: "Talking about your job",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Workplace and profession-related vocabulary.",
    data: `job|trabajo
career|carrera
company|empresa
office|oficina
boss|jefe
colleague|colega
salary|salario
meeting|reunión
overtime|horas extra
resume|currículum
interview|entrevista
contract|contrato
promotion|ascenso
deadline|fecha límite
to hire|contratar`,
  },
  {
    id: "esb1p14",
    title: "Expressions with Tener",
    subtitle: "tener que, tener ganas de...",
    kind: "cloze",
    note: '"Tener" idiomatic expressions common in everyday Spanish.',
    data: `Yo ___ (tener) que estudiar hoy.|tengo
Ella ___ (tener) ganas de bailar.|tiene
Nosotros ___ (tener) miedo de las alturas.|tenemos
Ellos ___ (tener) prisa esta mañana.|tienen
Tú ___ (tener) razón, como siempre.|tienes
Yo ___ (tener) sueño después de comer.|tengo
Él ___ (tener) éxito en su trabajo.|tiene
Nosotras ___ (tener) suerte hoy.|tenemos
Ellas ___ (tener) cuidado con el perro.|tienen
Yo ___ (tener) veinte años.|tengo
Tú ___ (tener) que llegar a tiempo.|tienes
Ella ___ (tener) ganas de un café.|tiene
Nosotros ___ (tener) que salir ya.|tenemos
Ellos ___ (tener) frío en invierno.|tienen
Yo ___ (tener) calor en verano.|tengo`,
  },
  {
    id: "esb1p15",
    title: "Technology Verbs",
    subtitle: "Using devices and the internet",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Verbs for using technology and the internet.",
    data: `to upload|subir
to download|descargar
to browse|navegar
to search|buscar
to click|hacer clic
to save (a file)|guardar
to delete|eliminar
to share|compartir
to install|instalar
to update|actualizar
to connect|conectar
to log in|iniciar sesión
to log out|cerrar sesión
to charge (a device)|cargar
to back up (data)|respaldar`,
  },
  {
    id: "esb1p16",
    title: "Household Chores",
    subtitle: "hay que / se debe",
    kind: "cloze",
    note: "Impersonal expressions of obligation for household tasks.",
    data: `___ que lavar los platos.|Hay
___ que limpiar la casa.|Hay
Se ___ (deber) sacar la basura.|debe
Se ___ (deber) barrer el piso.|debe
Hay que ___ (planchar) la ropa.|planchar
Hay que ___ (pasar) la aspiradora.|pasar
Se debe ___ (ordenar) el cuarto.|ordenar
Hay que ___ (lavar) la ropa hoy.|lavar
Se debe ___ (regar) las plantas.|regar
Hay que ___ (hacer) las camas.|hacer
Se debe ___ (sacudir) los muebles.|sacudir
Hay que ___ (fregar) el baño.|fregar
Hay que ___ (organizar) el armario.|organizar
Se debe ___ (limpiar) las ventanas.|limpiar
Hay que ___ (tender) la ropa.|tender`,
  },
  {
    id: "esb1p17",
    title: "Sports & Competition",
    subtitle: "Games and matches",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Sports and competition vocabulary.",
    data: `team|equipo
match|partido
champion|campeón
championship|campeonato
score|marcador
goal|gol
referee|árbitro
coach|entrenador
victory|victoria
defeat|derrota
tie|empate
stadium|estadio
uniform|uniforme
medal|medalla
tournament|torneo`,
  },
  {
    id: "esb1p18",
    title: "Making Plans & Invitations",
    subtitle: "Suggesting and agreeing",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Phrases for making plans and invitations.",
    data: `Do you want to go out?|¿Quieres salir?
What are you doing this weekend?|¿Qué haces este fin de semana?
Want to grab a coffee?|¿Quieres tomar un café?
I'm free on Saturday|Estoy libre el sábado
Sounds good|Suena bien
I can't, I'm busy|No puedo, estoy ocupado
Maybe another time|Quizás otro día
Let's meet at eight|Nos vemos a las ocho
Where should we meet?|¿Dónde nos encontramos?
I'll pick you up|Paso por ti
Count me in|Cuenta conmigo
I'll think about it|Lo voy a pensar
See you then|Nos vemos entonces
I'll text you|Te escribo un mensaje
Let's do it another day|Lo hacemos otro día`,
  },
  {
    id: "esb1p19",
    title: "Life Events",
    subtitle: "Milestones",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Vocabulary for major life events.",
    data: `birth|nacimiento
childhood|infancia
graduation|graduación
wedding|boda
engagement|compromiso
divorce|divorcio
retirement|jubilación
funeral|funeral
anniversary|aniversario
pregnancy|embarazo
in-laws|suegros
stepmother|madrastra
stepfather|padrastro
widow|viuda
adulthood|adultez`,
  },
  {
    id: "esb1p20",
    title: "Emotional Reactions",
    subtitle: "Reacting to news",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Phrases for reacting emotionally to news or events.",
    data: `What great news!|¡Qué buena noticia!
I'm so sorry|Lo siento mucho
Congratulations!|¡Felicidades!
That's terrible|Eso es terrible
I can't believe it|No puedo creerlo
How exciting!|¡Qué emoción!
That's a relief|Qué alivio
I'm speechless|Me quedé sin palabras
What a shame|Qué lástima
I'm thrilled for you|Estoy feliz por ti
That worries me|Eso me preocupa
It doesn't matter|No importa
That makes sense|Eso tiene sentido
I'm proud of you|Estoy orgulloso de ti
What a surprise!|¡Qué sorpresa!`,
  },
  {
    id: "esb1p21",
    title: "Furniture & Home Structure",
    subtitle: "Around the house, part 2",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Furniture and parts of a house.",
    data: `sofa|sofá
cushion|cojín
rug|alfombra
doorbell|timbre
windowsill|alféizar
fireplace|chimenea
wardrobe|armario
nightstand|mesita de noche
mattress|colchón
blanket|manta
pillow|almohada
towel|toalla
sink|fregadero
faucet|grifo
stairs|escalera
ceiling|techo
floor|suelo
wall|pared
roof|tejado
fence|cerca
garage|garaje
balcony|balcón
elevator|ascensor
basement|sótano
attic|ático`,
  },
  {
    id: "esb1p22",
    title: "Emotion Reflexive Verbs",
    subtitle: "More reflexive verbs of feeling",
    kind: "cloze",
    note: "Reflexive verbs describing emotional reactions.",
    data: `Yo me ___ (enamorarse) fácilmente.|enamoro
Tú te ___ (frustrarse) cuando algo no funciona.|frustras
Ella se ___ (calmarse) después de respirar.|calma
Nosotros nos ___ (emocionarse) con las buenas noticias.|emocionamos
Ellos se ___ (aburrirse) en clases largas.|aburren
Yo me ___ (preocuparse) por mi familia.|preocupo
Tú te ___ (sorprenderse) con los regalos.|sorprendes
Ella se ___ (entristecerse) con las despedidas.|entristece
Nosotros nos ___ (alegrarse) de verte.|alegramos
Ellos se ___ (enojarse) por pequeñas cosas.|enojan
Yo me ___ (sentirse) mejor ahora.|siento
Tú te ___ (relajarse) los fines de semana.|relajas
Ella se ___ (avergonzarse) fácilmente.|avergüenza
Nosotros nos ___ (divertirse) en las fiestas.|divertimos
Ellos se ___ (cansarse) rápido.|cansan
Yo me ___ (estresarse) antes de los exámenes.|estreso
Tú te ___ (acostumbrarse) a la rutina.|acostumbras
Ella se ___ (interesarse) por el arte.|interesa
Nosotros nos ___ (arrepentirse) de nada.|arrepentimos
Ellos se ___ (quejarse) del clima.|quejan
Yo me ___ (impacientarse) en las filas.|impaciento
Tú te ___ (asustarse) con las películas de terror.|asustas
Ella se ___ (concentrarse) al estudiar.|concentra
Nosotros nos ___ (esforzarse) para mejorar.|esforzamos
Ellos se ___ (motivarse) antes del partido.|motivan`,
  },
  {
    id: "esb1p23",
    title: "Nature & Landscape",
    subtitle: "Geographic features",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Landscape and geography vocabulary.",
    data: `valley|valle
cliff|acantilado
cave|cueva
waterfall|cascada
volcano|volcán
desert|desierto
jungle|selva
swamp|pantano
glacier|glaciar
canyon|cañón
plain|llanura
hill|colina
peninsula|península
bay|bahía
coast|costa
cape (geography)|cabo
reef|arrecife
dune|duna
meadow|prado
stream|arroyo
pond|estanque
plateau|meseta
archipelago|archipiélago
delta|delta
tundra|tundra`,
  },
  {
    id: "esb1p24",
    title: "Common Reactions",
    subtitle: "Interjections and exclamations",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common interjections and reaction phrases.",
    data: `Wow!|¡Guau!
Ouch!|¡Ay!
Oh no!|¡Oh no!
Really?|¿En serio?
No way!|¡No puede ser!
Come on!|¡Vamos!
Watch out!|¡Cuidado!
Hurry!|¡Rápido!
Wait!|¡Espera!
Help!|¡Ayuda!
Cheers! (toast)|¡Salud!
Bless you! (sneeze)|¡Salud!
Good grief!|¡Vaya!
That's enough!|¡Ya basta!
Of course!|¡Claro!
Exactly!|¡Exacto!
Not again!|¡Otra vez no!
Finally!|¡Por fin!
Look out!|¡Ojo!
What a mess!|¡Qué desastre!
Poor thing!|¡Pobrecito!
Yikes!|¡Uy!
Bravo!|¡Bravo!
Enough already!|¡Basta ya!
No kidding!|¡No me digas!`,
  },
  {
    id: "esb1p25",
    title: "Cooking & Recipes",
    subtitle: "Kitchen vocabulary, advanced",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Vocabulary for recipes and cooking technique.",
    data: `recipe|receta
ingredient|ingrediente
portion|porción
teaspoon|cucharadita
tablespoon|cucharada
cup (measure)|taza
oven-safe|apto para horno
boil (noun/point)|ebullición
simmer|fuego lento
marinate|marinar
season (verb)|sazonar
garnish|decorar
dough|masa
broth|caldo
sauce|salsa
spice|especia
herb|hierba
flavor|sabor
texture|textura
crispy|crujiente
tender|tierno
well-done (meat)|bien cocido
rare (meat)|poco cocido
medium (meat)|término medio
leftover|sobras`,
  },
  {
    id: "esb1p26",
    title: "Adjective + Preposition Combos",
    subtitle: "Fixed adjective-preposition pairings",
    kind: "cloze",
    note: "Common adjectives paired with a specific preposition.",
    data: `Estoy interesado ___ (in) la música.|en
Estoy cansado ___ (of) trabajar tanto.|de
Estoy contento ___ (with) los resultados.|con
Ella está enamorada ___ (of) él.|de
Estamos preocupados ___ (about) el examen.|por
Él es responsable ___ (for) el proyecto.|de
Estoy seguro ___ (of) mi decisión.|de
Ella está orgullosa ___ (of) su hijo.|de
Estamos listos ___ (for) el viaje.|para
Él es bueno ___ (at) matemáticas.|en
Estoy acostumbrado ___ (to) este clima.|a
Ella es diferente ___ (from) su hermana.|de
Estamos emocionados ___ (about) las vacaciones.|por
Él es amable ___ (with) todos.|con
Estoy harto ___ (of) esperar.|de
Ella es capaz ___ (of) hacerlo sola.|de
Estamos agradecidos ___ (for) su ayuda.|por
Él es fiel ___ (to) sus principios.|a
Estoy dispuesto ___ (to) ayudar.|a
Ella es similar ___ (to) su madre.|a
Estamos ansiosos ___ (about) los resultados.|por
Él es alérgico ___ (to) los gatos.|a
Estoy libre ___ (of) compromisos.|de
Ella es amable ___ (with) los niños.|con
Estamos satisfechos ___ (with) el servicio.|con`,
  },
  {
    id: "esb1p29",
    title: "Speaking: Opinions & Feelings",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Opinions, feelings, and hypotheticals to practise saying.",
    // See esa1p29's comment for the full authoring rationale (round-tripped
    // against the real normaliser, same hazards avoided).
    data: `Creo que tienes razón.|Creo que tienes razón.
En mi opinión, es una buena idea.|En mi opinión, es una buena idea.
Me parece interesante.|Me parece interesante.
No estoy de acuerdo contigo.|No estoy de acuerdo contigo.
Depende de la situación.|Depende de la situación.
Me siento un poco cansado hoy.|Me siento un poco cansado hoy.
Estoy muy contento con los resultados.|Estoy muy contento con los resultados.
Me preocupa el examen de mañana.|Me preocupa el examen de mañana.
Espero que todo salga bien.|Espero que todo salga bien.
Ojalá pudiera ayudarte.|Ojalá pudiera ayudarte.
Es posible que llueva esta tarde.|Es posible que llueva esta tarde.
Dudo que llegue a tiempo.|Dudo que llegue a tiempo.
Prefiero quedarme en casa.|Prefiero quedarme en casa.
Me gustaría aprender a tocar la guitarra.|Me gustaría aprender a tocar la guitarra.
Si tuviera tiempo, viajaría más.|Si tuviera tiempo, viajaría más.
Cuando era niño, vivía en el campo.|Cuando era niño, vivía en el campo.
Antes trabajaba en una oficina.|Antes trabajaba en una oficina.
Ahora trabajo desde casa.|Ahora trabajo desde casa.
He decidido cambiar de trabajo.|He decidido cambiar de trabajo.
Todavía no he terminado el proyecto.|Todavía no he terminado el proyecto.
Ya he leído ese libro.|Ya he leído ese libro.
Nunca he estado en Argentina.|Nunca he estado en Argentina.
Siempre digo la verdad.|Siempre digo la verdad.
A veces me equivoco.|A veces me equivoco.
Al final, todo salió bien.|Al final, todo salió bien.`,
  },
  {
    id: "esb1p27",
    title: "Write It Yourself: Opinions and Reasons",
    subtitle: "Say it your own way",
    kind: "translate",
    note: "Opinions, reasons and comparisons -- more than one wording is right.",
    data: `Say you think it's a good idea.|Creo que es una buena idea.;Pienso que es una buena idea.;Me parece una buena idea.
Say in your opinion, he is right.|En mi opinión, él tiene razón.;A mi parecer, él tiene razón.;Yo creo que él tiene razón.
Say you are not convinced by that argument.|No estoy convencido por ese argumento.;Ese argumento no me convence.;No me convence ese argumento.
Say this movie is more interesting than the other one.|Esta película es más interesante que la otra.;Esta película es más interesante que la otra película.;La otra película es menos interesante que esta.
Say you prefer coffee to tea.|Prefiero el café al té.;Prefiero el café en vez del té.;Me gusta más el café que el té.
Say it's better to leave early.|Es mejor salir temprano.;Más vale salir temprano.;Conviene salir temprano.
Say that in your opinion, it's too expensive.|Según yo, es demasiado caro.;A mi juicio, es demasiado caro.;Me parece demasiado caro.
Say you find this book boring.|Me parece aburrido este libro.;Encuentro este libro aburrido.;Este libro me aburre.
Say she is probably right.|Ella probablemente tiene razón.;Es probable que ella tenga razón.;Seguramente ella tiene razón.
Say it's important to eat well.|Es importante comer bien.;Importa comer bien.;Es necesario comer bien.
Say it's necessary to book in advance.|Es necesario reservar con anticipación.;Hay que reservar con anticipación.;Hace falta reservar con anticipación.
Say you are happy with your results.|Estoy contento con mis resultados.;Estoy satisfecho con mis resultados.;Me siento contento con mis resultados.
Say we are proud of our work.|Estamos orgullosos de nuestro trabajo.;Nos sentimos orgullosos de nuestro trabajo.;Es un orgullo nuestro trabajo.
Say it's difficult to explain.|Es difícil de explicar.;Es complicado explicarlo.;Cuesta explicarlo.
Say it's not that simple.|No es tan simple.;No es tan sencillo.;No es así de simple.
Say you would like to change your mind.|Me gustaría cambiar de opinión.;Quisiera cambiar de opinión.;Quiero cambiar de parecer.
Say everything depends on the situation.|Todo depende de la situación.;Todo depende de las circunstancias.;Depende de la situación.
Say that seems reasonable to you.|Eso me parece razonable.;Me parece razonable.;Eso suena razonable.
Say you doubt that's true.|Dudo que eso sea verdad.;No creo que eso sea verdad.;Dudo que eso sea cierto.
Say one must be patient.|Hay que ser paciente.;Uno debe ser paciente.;Es necesario tener paciencia.
Say we must make a decision.|Debemos tomar una decisión.;Tenemos que tomar una decisión.;Hace falta tomar una decisión.
Say this is the best possible solution.|Esta es la mejor solución posible.;Es la mejor solución que hay.;No hay mejor solución que esta.
Say you understand someone's point of view.|Entiendo tu punto de vista.;Comprendo tu punto de vista.;Entiendo cómo ves las cosas.
Say you finally agree.|Finalmente estoy de acuerdo.;Al final estoy de acuerdo.;Por fin estoy de acuerdo.
Say the meeting was very productive.|La reunión fue muy productiva.;La reunión resultó muy productiva.;Fue una reunión muy productiva.`,
  },
  {
    id: "esb1p28",
    title: "Minimal Pairs",
    subtitle: "Listen closely",
    kind: "listening",
    prompt: "¿Qué escuchaste?",
    note: "Sentences built around sounds that merge for most Spanish speakers: seseo (cazo/caso, pozo/poso), b/v (cocido/cosido, grabar/gravar).",
    data: `No sabía qué hacer con el cazo.|No sabía qué hacer con el cazo.
No sabía qué hacer con el caso.|No sabía qué hacer con el caso.
Le devolvieron el cazo al día siguiente.|Le devolvieron el cazo al día siguiente.
Le devolvieron el caso al día siguiente.|Le devolvieron el caso al día siguiente.
Encontraron un pozo al fondo del jardín.|Encontraron un pozo al fondo del jardín.
Encontraron un poso al fondo del jardín.|Encontraron un poso al fondo del jardín.
Nadie sabía que había un pozo ahí.|Nadie sabía que había un pozo ahí.
Nadie sabía que había un poso ahí.|Nadie sabía que había un poso ahí.
Cerca de la granja había un pozo.|Cerca de la granja había un pozo.
Cerca de la granja había un poso.|Cerca de la granja había un poso.
El material estaba bien cocido.|El material estaba bien cocido.
El material estaba bien cosido.|El material estaba bien cosido.
Dijeron que todo estaba perfectamente cocido.|Dijeron que todo estaba perfectamente cocido.
Dijeron que todo estaba perfectamente cosido.|Dijeron que todo estaba perfectamente cosido.
Revisaron si estaba bien cocido.|Revisaron si estaba bien cocido.
Revisaron si estaba bien cosido.|Revisaron si estaba bien cosido.
Decidieron grabar el evento completo.|Decidieron grabar el evento completo.
Decidieron gravar el evento completo.|Decidieron gravar el evento completo.
El equipo tuvo que grabar el evento completo.|El equipo tuvo que grabar el evento completo.
El equipo tuvo que gravar el evento completo.|El equipo tuvo que gravar el evento completo.
Prometieron grabar toda la ceremonia.|Prometieron grabar toda la ceremonia.
Prometieron gravar toda la ceremonia.|Prometieron gravar toda la ceremonia.
El agua brotaba del pozo constantemente.|El agua brotaba del pozo constantemente.
El agua brotaba del poso constantemente.|El agua brotaba del poso constantemente.
El cazo llevaba años guardado en la alacena.|El cazo llevaba años guardado en la alacena.`,
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
    data: `furthermore|además
in this regard|al respecto
with regard to|con respecto a
in conclusion|en conclusión
in summary|en resumen
on the one hand|por una parte
on the other hand (formal)|por otra parte
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
  {
    id: "esb2p6",
    title: "Relative Pronouns",
    subtitle: "que, quien, cuyo",
    kind: "cloze",
    note: "Relative pronouns linking clauses.",
    data: `El libro ___ leí es excelente.|que
La mujer con ___ hablé es mi jefa.|quien
El hombre ___ casa visitamos es mi tío.|cuya
Los amigos ___ conocí son de Chile.|que
La persona a ___ llamé no contestó.|quien
El coche ___ compré es nuevo.|que
La ciudad en ___ vivo es hermosa.|que
El profesor ___ libro leímos es famoso.|cuyo
Las chicas ___ vimos ayer son mis primas.|que
El escritor ___ obras admiro nació en España.|cuyas
La razón por ___ llegué tarde fue el tráfico.|la que
El niño ___ juguete se rompió lloró.|cuyo
Los países ___ visitamos fueron interesantes.|que
La empresa para ___ trabajo es grande.|la que
El equipo ___ ganó celebró mucho.|que
La casa ___ ventanas son azules es mía.|cuyas
Los estudiantes ___ estudian mucho aprueban.|que
La actriz de ___ hablamos ganó un premio.|quien
El parque ___ está cerca es bonito.|que
Las noticias ___ escuché me sorprendieron.|que
El médico ___ consulta visité es excelente.|cuya
La canción ___ cantamos es popular.|que
Los vecinos ___ perro ladra mucho se mudaron.|cuyo
La idea ___ propuso fue aceptada.|que
El amigo con ___ viajé vive en Lima.|quien`,
  },
  {
    id: "esb2p7",
    title: "Environment & Nature",
    subtitle: "The natural world",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Environment and nature vocabulary.",
    data: `environment|medio ambiente
nature|naturaleza
forest|bosque
habitat|hábitat
river|río
ocean|océano
climate|clima
pollution|contaminación
recycling|reciclaje
energy|energía
sustainable|sostenible
species|especie
planet|planeta
resource|recurso
drought|sequía
wildlife|fauna
ecosystem|ecosistema
renewable|renovable
carbon|carbono
biodiversity|biodiversidad`,
  },
  {
    id: "esb2p8",
    title: "Gerund & Present Progressive",
    subtitle: "estar + gerundio",
    kind: "cloze",
    note: "Present progressive constructions with irregular gerunds included.",
    data: `Ella está ___ (hablar) por teléfono.|hablando
Yo estoy ___ (comer) ahora mismo.|comiendo
Nosotros estamos ___ (escribir) un informe.|escribiendo
Ellos están ___ (dormir) todavía.|durmiendo
Tú estás ___ (leer) ese libro.|leyendo
Yo estoy ___ (trabajar) en un proyecto.|trabajando
Ella está ___ (pedir) ayuda.|pidiendo
Nosotros estamos ___ (venir) hacia allá.|viniendo
Ellos están ___ (decir) la verdad.|diciendo
Tú estás ___ (sentir) mucho dolor.|sintiendo
Yo estoy ___ (seguir) las instrucciones.|siguiendo
Ella está ___ (repetir) la pregunta.|repitiendo
Nosotros estamos ___ (construir) una casa.|construyendo
Ellos están ___ (destruir) el edificio viejo.|destruyendo
Tú estás ___ (creer) algo falso.|creyendo
Yo estoy ___ (jugar) al tenis.|jugando
Ella está ___ (estudiar) para el examen.|estudiando
Nosotros estamos ___ (viajar) por Europa.|viajando
Ellos están ___ (correr) en el parque.|corriendo
Tú estás ___ (aprender) mucho.|aprendiendo
Yo estoy ___ (mirar) la televisión.|mirando
Ella está ___ (preparar) la cena.|preparando
Nosotros estamos ___ (esperar) el autobús.|esperando
Ellos están ___ (cantar) una canción.|cantando
Tú estás ___ (bailar) muy bien.|bailando`,
  },
  {
    id: "esb2p9",
    title: "Subjunctive with Impersonal Expressions",
    subtitle: "es posible que, es necesario que...",
    kind: "cloze",
    note: "Subjunctive triggered by impersonal expressions of necessity/possibility.",
    data: `Es posible que ___ (llover) mañana.|llueva
Es necesario que tú ___ (terminar) el informe.|termines
Es probable que nosotros ___ (ganar) el partido.|ganemos
Es probable que ellos ___ (venir) tarde.|vengan
Es raro que ella no ___ (contestar) el teléfono.|conteste
Es mejor que ustedes ___ (descansar) hoy.|descansen
Es dudoso que él ___ (saber) la respuesta.|sepa
Es una lástima que tú no ___ (poder) venir.|puedas
Es fácil que nosotros ___ (perder) el tren.|perdamos
Es urgente que ella ___ (hacer) la llamada.|haga
Es normal que los niños ___ (tener) miedo.|tengan
Es difícil que él ___ (cambiar) de opinión.|cambie
Es esencial que nosotros ___ (revisar) el contrato.|revisemos
Es conveniente que tú ___ (llamar) primero.|llames
Es lógico que ellos ___ (dudar) al principio.|duden`,
  },
  {
    id: "esb2p10",
    title: "Subjunctive with Emotion",
    subtitle: "me alegra que, es una lástima que...",
    kind: "cloze",
    note: "Subjunctive triggered by expressions of emotion.",
    data: `Me alegra que tú ___ (estar) aquí.|estés
Me sorprende que ella ___ (saber) la verdad.|sepa
Siento que ustedes ___ (tener) que esperar.|tengan
Nos encanta que nosotros ___ (poder) viajar juntos.|podamos
Le molesta que él ___ (llegar) tarde siempre.|llegue
Es triste que ellos ___ (irse) tan pronto.|se vayan
Me preocupa que tú no ___ (dormir) bien.|duermas
Me gusta que ella ___ (ser) tan honesta.|sea
Nos alegra que ustedes ___ (venir) a la boda.|vengan
Le sorprende que nosotros ___ (vivir) tan lejos.|vivamos
Siento mucho que tú ___ (perder) tu trabajo.|hayas perdido
Me encanta que ellos ___ (celebrar) juntos.|celebren
Es una pena que ella no ___ (poder) venir.|pueda
Nos molesta que él siempre ___ (llegar) tarde.|llegue
Le alegra que nosotros ___ (estar) bien.|estemos`,
  },
  {
    id: "esb2p11",
    title: "Por vs. Para",
    subtitle: "Two prepositions, different uses",
    kind: "cloze",
    note: '"Por" (cause, exchange, duration, means) vs. "para" (purpose, destination, deadline).',
    data: `Este regalo es ___ ti.|para
Caminamos ___ el parque.|por
Pagué diez dólares ___ el libro.|por
Salimos ___ Madrid mañana.|para
Estudio ___ ser doctor.|para
Gracias ___ tu ayuda.|por
Necesito esto ___ el lunes.|para
Viajamos ___ tren.|por
Trabajó ___ tres horas.|por
Este café es ___ mi madre.|para
Lo hice por amor, no ___ dinero.|por
Llámame ___ teléfono.|por
Estudiamos ___ la noche.|por
Este proyecto es ___ el viernes.|para
Vamos ___ la playa este fin de semana.|para`,
  },
  {
    id: "esb2p12",
    title: "Indefinite & Negative Words",
    subtitle: "algo/nada, alguien/nadie...",
    kind: "cloze",
    note: "Indefinite and negative pronouns/adverbs.",
    data: `¿Hay ___ (something) en la caja? No, no hay nada.|algo
¿Vino ___ (someone) a la fiesta? No, no vino nadie.|alguien
¿Tienes ___ (some) plan para hoy? No tengo ninguno.|algún
Nunca como carne; ella ___ (neither) la come.|tampoco
Yo también voy; ella ___ (also) va.|también
No tengo ningún problema con eso.|ningún
¿___ (always) llegas tarde?|Siempre
No, ___ (never) llego tarde.|nunca
Hay ___ (some) estudiantes en la clase.|algunos
No hay ___ (no) razón para preocuparse.|ninguna
¿Conoces a ___ (someone) aquí?|alguien
No conozco a ___ (no one) en esta ciudad.|nadie
¿Compraste ___ (something) en la tienda?|algo
No compré ___ (nothing) hoy.|nada
¿Tienes ___ (any) pregunta?|alguna`,
  },
  {
    id: "esb2p13",
    title: "Passive 'Se' Constructions",
    subtitle: "se vende, se dice, se necesita",
    kind: "cloze",
    note: "Impersonal/passive 'se' constructions common in signs and announcements.",
    data: `Se ___ (vender) esta casa.|vende
Se ___ (decir) que va a llover.|dice
Se ___ (necesitar) empleados.|necesitan
Se ___ (hablar) español aquí.|habla
Se ___ (prohibir) fumar.|prohíbe
Se ___ (buscar) camarero con experiencia.|busca
Se ___ (alquilar) apartamentos.|alquilan
Se ___ (poder) pagar con tarjeta.|puede
Se ___ (permitir) el acceso solo a socios.|permite
Se ___ (recomendar) llegar temprano.|recomienda
Se ___ (abrir) a las nueve.|abre
Se ___ (cerrar) los domingos.|cierra
Se ___ (aceptar) reservas online.|aceptan
Se ___ (ofrecer) descuentos a estudiantes.|ofrecen
Se ___ (requerir) identificación.|requiere`,
  },
  {
    id: "esb2p14",
    title: "Si-Clauses (Hypothetical Present)",
    subtitle: "If I had..., I would...",
    kind: "cloze",
    note: "Type-2 conditional: si + imperfect subjunctive, + conditional.",
    data: `Si yo ___ (tener) más dinero, viajaría más.|tuviera
Si ella ___ (estudiar) más, aprobaría el examen.|estudiara
Si nosotros ___ (vivir) cerca, nos veríamos más.|viviéramos
Si ellos ___ (saber) la verdad, actuarían diferente.|supieran
Si tú ___ (poder), ¿qué harías?|pudieras
Si yo ___ (ser) rico, ayudaría a más gente.|fuera
Si ella ___ (querer), podría cambiar de trabajo.|quisiera
Si nosotros ___ (tener) tiempo, iríamos contigo.|tuviéramos
Si tú me ___ (decir) la verdad, te ayudaría.|dijeras
Si ellos ___ (venir) antes, verían el atardecer.|vinieran
Si yo ___ (hacer) más ejercicio, me sentiría mejor.|hiciera
Si ella ___ (estar) aquí, todo sería más fácil.|estuviera
Si nosotros ___ (poder), te ayudaríamos ahora mismo.|pudiéramos
Si tú ___ (querer), podríamos hablar hoy.|quisieras
Si ellos ___ (ser) más pacientes, entenderían mejor.|fueran`,
  },
  {
    id: "esb2p15",
    title: "Business & Economy",
    subtitle: "The world of work and money",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Business and economics vocabulary.",
    data: `economy|economía
bankruptcy|bancarrota
investment|inversión
profit|ganancia
loss|pérdida
budget|presupuesto
tax|impuesto
inflation|inflación
export|exportación
import|importación
supply|oferta
demand|demanda
stock (shares)|acción
debt|deuda
subsidy|subsidio`,
  },
  {
    id: "esb2p16",
    title: "Politics & Government",
    subtitle: "Civic vocabulary",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Politics and government vocabulary.",
    data: `government|gobierno
president|presidente
election|elección
vote|voto
citizen|ciudadano
law|ley
congress|congreso
democracy|democracia
policy|política
minister|ministro
campaign|campaña
constitution|constitución
senate|senado
mayor|alcalde
referendum|referéndum`,
  },
  {
    id: "esb2p17",
    title: "Media & Journalism",
    subtitle: "News and reporting",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Media and journalism vocabulary.",
    data: `news|noticias
journalist|periodista
newspaper|periódico
headline|titular
article|artículo
correspondent|corresponsal
broadcast|transmisión
report|reportaje
editor|editor
press conference|rueda de prensa
source (of info)|fuente
censorship|censura
publish|publicar
audience|audiencia
subscription|suscripción`,
  },
  {
    id: "esb2p18",
    title: "Art & Culture",
    subtitle: "The arts",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Art and culture vocabulary.",
    data: `painting|pintura
sculpture|escultura
exhibition|exposición
curator|curador
gallery|galería
portrait|retrato
masterpiece|obra maestra
canvas|lienzo
brush|pincel
tradition|tradición
heritage|patrimonio
festival|festival
performance|actuación
craft|artesanía
sculptor|escultor`,
  },
  {
    id: "esb2p19",
    title: "Health & Medicine (Advanced)",
    subtitle: "Medical vocabulary",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Advanced health and medical vocabulary.",
    data: `diagnosis|diagnóstico
treatment|tratamiento
surgery|cirugía
vaccine|vacuna
infection|infección
chronic|crónico
inflammation|inflamación
recovery|recuperación
specialist|especialista
emergency room|sala de urgencias
blood pressure|presión arterial
side effect|efecto secundario
immune system|sistema inmunológico
prescription|receta médica
anesthesia|anestesia`,
  },
  {
    id: "esb2p20",
    title: "Probability Expressions",
    subtitle: "deber de, poder ser que, a lo mejor",
    kind: "cloze",
    note: "Expressions of probability and conjecture.",
    data: `___ de estar en casa ya.|Debe
A lo ___, llega tarde.|mejor
Puede ___ que no venga.|ser
___ (probably) esté ocupado.|Probablemente
Seguramente ___ (haber) mucho tráfico.|hay
Tal ___ (vez) mañana llueva.|vez
Es posible que ___ (perderse).|se haya perdido
Quizás ella ya lo ___ (saber).|sepa
A lo mejor no ___ (querer) venir.|quiere
Debe de ___ (ser) muy tarde ya.|ser
Igual ___ (llegar) antes que nosotros.|llega
Puede que ___ (tener) razón.|tenga
Lo más seguro es que ___ (estar) en camino.|esté
A lo mejor no ___ (recordar) la cita.|recuerda
Seguro que ya ___ (terminar).|terminó`,
  },
  {
    id: "esb2p21",
    title: "Subjunctive with Doubt & Denial",
    subtitle: "No creo que, dudo que, niego que...",
    kind: "cloze",
    note: "Subjunctive triggered by expressions of doubt or denial.",
    data: `No creo que ella ___ (venir) hoy.|venga
Dudo que ellos ___ (saber) la respuesta.|sepan
No es verdad que él ___ (mentir).|mienta
Niego que nosotros ___ (tener) la culpa.|tengamos
No pienso que tú ___ (estar) equivocado.|estés
No parece que ___ (ir) a llover.|vaya
No es cierto que ella ___ (haber) llegado.|haya
Dudamos que ellos ___ (poder) terminar a tiempo.|puedan
No creemos que él ___ (decir) la verdad.|diga
No es seguro que nosotros ___ (ganar).|ganemos
No confío en que ellos ___ (cumplir) su promesa.|cumplan
No es probable que ___ (nevar) esta semana.|nieve
No creo que tú ___ (querer) hacerlo.|quieras
Niegan que la empresa ___ (perder) dinero.|pierda
No es evidente que ella ___ (saber) nadar.|sepa
Dudo que él ___ (venir) mañana.|venga
No creo que nosotros ___ (necesitar) más tiempo.|necesitemos
No parece justo que ellos ___ (pagar) tanto.|paguen
No es lógico que tú ___ (hacer) eso.|hagas
No creo que ella ___ (poder) sola.|pueda
Dudamos que el plan ___ (funcionar).|funcione
No es verdad que nosotros ___ (mentir).|mintamos
No pienso que ustedes ___ (estar) listos.|estén
No creo que él ___ (ser) el culpable.|sea
No es seguro que ellos ___ (llegar) a tiempo.|lleguen`,
  },
  {
    id: "esb2p22",
    title: "Advanced Personality Adjectives",
    subtitle: "Describing character",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Advanced personality-trait adjectives.",
    data: `ambitious|ambicioso
stubborn|terco
generous|generoso
arrogant|arrogante
humble|humilde
reliable|confiable
cautious|cauteloso
curious|curioso
sincere|sincero
hypocritical|hipócrita
optimistic|optimista
pessimistic|pesimista
sensitive|sensible
tolerant|tolerante
rude|grosero
polite|cortés
honest|honesto
dishonest|deshonesto
loyal|leal
disloyal|desleal
competitive|competitivo
easygoing|relajado
demanding|exigente
resourceful|ingenioso
naive|ingenuo`,
  },
  {
    id: "esb2p23",
    title: "Legal & Civic Rights",
    subtitle: "Rights and civic vocabulary",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Civic rights and legal-process vocabulary.",
    data: `right (entitlement)|derecho
duty|deber
freedom of speech|libertad de expresión
privacy|privacidad
equality|igualdad
discrimination|discriminación
injustice|injusticia
citizenship|ciudadanía
immigration|inmigración
refugee|refugiado
asylum|asilo
human rights|derechos humanos
protest|protesta
petition|petición
jury|jurado
witness|testigo
testimony|testimonio
sentence (legal)|sentencia
appeal|apelación
plaintiff|demandante
defendant|acusado
fine (penalty)|multa
bail|fianza
custody|custodia
verdict|veredicto`,
  },
  {
    id: "esb2p24",
    title: "Emotional Intelligence",
    subtitle: "Communication and self-awareness",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Emotional-intelligence and communication vocabulary.",
    data: `empathy|empatía
self-esteem|autoestima
assertiveness|asertividad
resilience|resiliencia
conflict|conflicto
feedback|retroalimentación
criticism|crítica
praise|elogio
active listening|escucha activa
body language|lenguaje corporal
tone of voice|tono de voz
misunderstanding|malentendido
apology|disculpa
forgiveness|perdón
gratitude|gratitud
vulnerability|vulnerabilidad
boundary|límite
trust|confianza
betrayal|traición
reconciliation|reconciliación
patience|paciencia
mindfulness|atención plena
self-awareness|autoconocimiento
motivation|motivación
compromise|compromiso`,
  },
  {
    id: "esb2p25",
    title: "Housing & Real Estate",
    subtitle: "Renting and buying property",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Housing and real-estate vocabulary.",
    data: `rent|alquiler
mortgage|hipoteca
lease|contrato de arrendamiento
tenant|inquilino
landlord|propietario
inspection|inspección
real estate agent|agente inmobiliario
property|propiedad
neighborhood|vecindario
utilities|servicios públicos
square meters|metros cuadrados
down payment|pago inicial
appraisal|tasación
renovation|renovación
furnished|amueblado
unfurnished|sin amueblar
move in|mudarse
eviction|desalojo
homeowner|propietario de vivienda
condominium|condominio
suburb|suburbio
downtown|centro
lease agreement|contrato de alquiler
security deposit|depósito de seguridad
real estate market|mercado inmobiliario`,
  },
  {
    id: "esb2p26",
    title: "Connectors of Contrast & Concession",
    subtitle: "Advanced contrast connectors",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Advanced connectors expressing contrast or concession.",
    data: `even though|aunque
despite the fact that|a pesar de que
whereas|mientras que
on the contrary|por el contrario
as a result|como resultado
nonetheless|no obstante
regardless of|independientemente de
for this reason|por esta razón
granted that|si bien es cierto que
on the other hand (by contrast)|por otro lado
on top of that|además de eso
all the same|de todas formas
in contrast|en contraste
notwithstanding|pese a
at the same time|al mismo tiempo
yet still|aun así
albeit|si bien
in any case|en todo caso
either way|de cualquier manera
that said|dicho esto
having said that|habiendo dicho esto
on balance|en definitiva
all things considered|considerando todo
in the end|al final
ultimately|en última instancia`,
  },
  {
    id: "esb2p29",
    title: "Speaking: Professional & Abstract Topics",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Professional and abstract topics to practise saying.",
    // See esa1p29's comment for the full authoring rationale (round-tripped
    // against the real normaliser, same hazards avoided). No numbers at all
    // here, so the number-word traps don't apply to this pack.
    data: `El cambio climático afecta a todo el planeta.|El cambio climático afecta a todo el planeta.
La economía global sigue siendo incierta.|La economía global sigue siendo incierta.
Es fundamental proteger el medio ambiente.|Es fundamental proteger el medio ambiente.
La tecnología avanza más rápido que nunca.|La tecnología avanza más rápido que nunca.
Muchas empresas apuestan por el trabajo remoto.|Muchas empresas apuestan por el trabajo remoto.
La educación es la base del desarrollo.|La educación es la base del desarrollo.
El gobierno anunció nuevas medidas económicas.|El gobierno anunció nuevas medidas económicas.
La inflación preocupa a los consumidores.|La inflación preocupa a los consumidores.
Es importante fomentar la igualdad de oportunidades.|Es importante fomentar la igualdad de oportunidades.
La innovación impulsa el crecimiento empresarial.|La innovación impulsa el crecimiento empresarial.
Debemos reducir nuestra huella de carbono.|Debemos reducir nuestra huella de carbono.
La inteligencia artificial cambiará muchos empleos.|La inteligencia artificial cambiará muchos empleos.
Las energías renovables son el futuro.|Las energías renovables son el futuro.
La comunicación efectiva es clave en el trabajo.|La comunicación efectiva es clave en el trabajo.
El liderazgo requiere paciencia y empatía.|El liderazgo requiere paciencia y empatía.
La globalización conecta mercados distintos.|La globalización conecta mercados distintos.
Muchas startups buscan financiación externa.|Muchas startups buscan financiación externa.
Las redes sociales influyen en la opinión pública.|Las redes sociales influyen en la opinión pública.
La salud mental merece más atención.|La salud mental merece más atención.
El teletrabajo cambió nuestra rutina diaria.|El teletrabajo cambió nuestra rutina diaria.
La productividad no depende solo de las horas trabajadas.|La productividad no depende solo de las horas trabajadas.
Las negociaciones comerciales fueron complicadas.|Las negociaciones comerciales fueron complicadas.
Se espera que la economía crezca este año.|Se espera que la economía crezca este año.
La sostenibilidad debe ser una prioridad.|La sostenibilidad debe ser una prioridad.
El acuerdo beneficiará a ambas partes.|El acuerdo beneficiará a ambas partes.`,
  },
  {
    id: "esb2p27",
    title: "Write It Yourself: Multi-Clause Sentences",
    subtitle: "Say it your own way",
    kind: "translate",
    note: "Multi-clause sentences -- more than one wording is right.",
    data: `Say that when you finish work, you'll go for a walk.|Cuando termine el trabajo, iré a caminar.;Cuando acabe el trabajo, saldré a caminar.;Iré a caminar cuando termine el trabajo.
Say that if you have time, you could have lunch together.|Si tienes tiempo, podríamos almorzar juntos.;Si tienes tiempo, podríamos comer juntos.;Podríamos almorzar juntos si tienes tiempo.
Say that although it's difficult, you're going to try.|Aunque es difícil, voy a intentarlo.;Aunque sea difícil, lo voy a intentar.;Voy a intentarlo aunque sea difícil.
Say that since it's raining, you'll stay home.|Como está lloviendo, nos quedaremos en casa.;Ya que está lloviendo, nos quedamos en casa.;Nos quedaremos en casa porque está lloviendo.
Say that when you arrive, you'll call.|Cuando llegue, te llamaré.;Cuando llegue, llamo.;Te llamaré en cuanto llegue.
Say that if we leave now, you think we'll arrive on time.|Creo que si salimos ahora, llegaremos a tiempo.;Pienso que si nos vamos ahora, llegaremos a tiempo.;Si salimos ahora, creo que llegaremos a tiempo.
Say she said she would come, but she didn't come.|Ella dijo que vendría, pero no vino.;Dijo que iba a venir, pero no llegó.;Ella dijo que vendría y no vino.
Say that even if it's expensive, you're going to buy it.|Aunque sea caro, lo voy a comprar.;Incluso si es caro, lo compraré.;Lo voy a comprar aunque sea caro.
Say that as soon as you have news, you'll let me know.|En cuanto tenga noticias, te aviso.;Tan pronto tenga noticias, te avisaré.;Te aviso apenas tenga noticias.
Say it's necessary that you finish before tonight.|Es necesario que termines antes de esta noche.;Hace falta que termines antes de esta noche.;Tienes que terminar antes de esta noche.
Say you would like him to help you with this project.|Quisiera que me ayudara con este proyecto.;Me gustaría que me ayudara con este proyecto.;Quiero que me ayude con este proyecto.
Say you hope everything goes well.|Espero que todo salga bien.;Ojalá que todo salga bien.;Espero que todo vaya bien.
Say that since it was cold, you came home early.|Como hacía frío, volvimos temprano a casa.;Como hacía frío, regresamos temprano.;Volvimos temprano porque hacía frío.
Say that as long as you agree, we can continue.|Mientras estés de acuerdo, podemos continuar.;Siempre que estés de acuerdo, seguimos.;Podemos seguir mientras estés de acuerdo.
Say before leaving, check that everything is closed.|Antes de salir, verifica que todo esté cerrado.;Antes de irte, revisa que todo esté cerrado.;Antes de salir, asegúrate de que todo esté cerrado.
Say that after eating, you went for a walk.|Después de comer, salimos a caminar.;Después de comer, fuimos a caminar.;Salimos a caminar después de comer.
Say that although he is tired, he keeps working.|Aunque está cansado, sigue trabajando.;A pesar de estar cansado, sigue trabajando.;Sigue trabajando aunque esté cansado.
Say since you insist, you accept.|Ya que insistes, acepto.;Puesto que insistes, acepto.;Como insistes, acepto.
Say whatever happens, you'll be there for them.|Pase lo que pase, estaré ahí para ellos.;Ocurra lo que ocurra, estaré con ellos.;Pase lo que pase, los voy a apoyar.
Say if you had known, you wouldn't have come.|Si lo hubiera sabido, no habría venido.;Si lo hubiese sabido, no hubiera venido.;De haberlo sabido, no habría venido.
Say every time you see him, he talks about work.|Cada vez que lo veo, habla del trabajo.;Cada vez que lo veo, me habla de su trabajo.;Siempre que lo veo, habla de trabajo.
Say the more you think about it, the more convinced you are.|Cuanto más lo pienso, más convencido estoy.;Mientras más lo pienso, más me convenzo.;Entre más lo pienso, más seguro estoy.
Say whether you like it or not, it has to be done.|Te guste o no, hay que hacerlo.;Quieras o no, se tiene que hacer.;Aunque no te guste, hay que hacerlo.
Say although you're busy, you're going to help.|Aunque estoy ocupado, voy a ayudar.;Aunque esté ocupado, ayudaré.;Voy a ayudar aunque esté ocupado.
Say once this is finished, we can leave.|Una vez que esto termine, podemos irnos.;En cuanto esto termine, nos podemos ir.;Cuando esto termine, podremos irnos.`,
  },
  {
    id: "esb2p28",
    title: "Minimal Pairs",
    subtitle: "Listen closely",
    kind: "listening",
    prompt: "¿Qué escuchaste?",
    note: "Sentences built around sounds that merge for most Spanish speakers: seseo (cima/sima, concejo/consejo, acechar/asechar), b/v (abrasar/abrazar).",
    data: `Llegaron hasta la cima de la montaña.|Llegaron hasta la cima de la montaña.
Llegaron hasta la sima de la montaña.|Llegaron hasta la sima de la montaña.
Nadie se atrevía a acercarse a la cima.|Nadie se atrevía a acercarse a la cima.
Nadie se atrevía a acercarse a la sima.|Nadie se atrevía a acercarse a la sima.
Desde arriba se veía toda la cima.|Desde arriba se veía toda la cima.
Desde arriba se veía toda la sima.|Desde arriba se veía toda la sima.
El alcalde presentó el concejo a todos.|El alcalde presentó el concejo a todos.
El alcalde presentó el consejo a todos.|El alcalde presentó el consejo a todos.
Todos hablaban sobre el concejo del pueblo.|Todos hablaban sobre el concejo del pueblo.
Todos hablaban sobre el consejo del pueblo.|Todos hablaban sobre el consejo del pueblo.
Nadie esperaba que el concejo cambiara de opinión.|Nadie esperaba que el concejo cambiara de opinión.
Nadie esperaba que el consejo cambiara de opinión.|Nadie esperaba que el consejo cambiara de opinión.
El calor parecía abrasar todo a su paso.|El calor parecía abrasar todo a su paso.
El calor parecía abrazar todo a su paso.|El calor parecía abrazar todo a su paso.
Sintió que el fuego lo iba a abrasar.|Sintió que el fuego lo iba a abrasar.
Sintió que su madre lo iba a abrazar.|Sintió que su madre lo iba a abrazar.
El animal empezó a acechar a su presa.|El animal empezó a acechar a su presa.
El animal empezó a asechar a su presa.|El animal empezó a asechar a su presa.
Nadie sabía que alguien los estaba acechando.|Nadie sabía que alguien los estaba acechando.
Nadie sabía que alguien los estaba asechando.|Nadie sabía que alguien los estaba asechando.
El cazador decidió acechar en silencio.|El cazador decidió acechar en silencio.
El cazador decidió asechar en silencio.|El cazador decidió asechar en silencio.
El consejo escolar se reunió por la tarde.|El consejo escolar se reunió por la tarde.
El concejo escolar se reunió por la tarde.|El concejo escolar se reunió por la tarde.
La sima resultó ser más profunda de lo esperado.|La sima resultó ser más profunda de lo esperado.`,
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
Si ella ___ (saber) conducir, iría en coche.|supiera
Me gustaría que tú ___ (ser) más paciente.|fueras
Si él ___ (querer), podría cambiar de trabajo.|quisiera
Actuaba como si nada ___ (importar).|importara
Ojalá ___ (ganar) nosotros el premio.|ganáramos
Si ustedes ___ (venir) antes, verían el atardecer.|vinieran
Ella dudaba que nosotros ___ (terminar) a tiempo.|termináramos
Si nosotros ___ (ser) más organizados, terminaríamos antes.|fuéramos
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
irse de la lengua|to let something slip
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
    data: `notwithstanding (formal)|no obstante lo anterior
insofar as|en la medida en que
to the extent that|en tanto que
by the same token|de igual manera
conversely|en cambio
that being said|dicho esto
in light of the above|a la luz de lo anterior
all things considered (formal)|considerando todo lo anterior
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
  {
    id: "esc1p6",
    title: "Compound Tenses",
    subtitle: "Pluperfect & future perfect",
    kind: "cloze",
    note: "Pluperfect (had done) and future perfect (will have done) tenses.",
    data: `Cuando llegué, ella ya ___ (salir).|había salido
Para el año próximo, yo ___ (terminar) mis estudios.|habré terminado
Antes de la reunión, nosotros ya ___ (revisar) el informe.|habíamos revisado
Para mañana, ellos ___ (completar) el proyecto.|habrán completado
Cuando llamaste, yo ya ___ (comer).|había comido
Para el viernes, tú ___ (recibir) la respuesta.|habrás recibido
Antes de mudarnos, nosotros ___ (vivir) allí diez años.|habíamos vivido
Cuando desperté, el sol ya ___ (salir).|había salido
Para las ocho, ella ___ (llegar) a casa.|habrá llegado
Antes del examen, yo ya ___ (estudiar) todo.|había estudiado
Para entonces, ellos ya ___ (decidir).|habrán decidido
Cuando abrí la puerta, el perro ya ___ (escapar).|había escapado
Para el próximo mes, nosotros ___ (ahorrar) suficiente.|habremos ahorrado
Antes de esa fecha, tú nunca ___ (viajar) al extranjero.|habías viajado
Cuando volví, ellos ya ___ (limpiar) la casa.|habían limpiado
Para diciembre, yo ___ (publicar) el libro.|habré publicado
Antes de conocerte, yo ya ___ (mudarme) tres veces.|me había mudado
Para esa hora, la tienda ya ___ (cerrar).|habrá cerrado
Cuando llegamos, la película ya ___ (empezar).|había empezado
Para el final del curso, los estudiantes ___ (aprender) mucho.|habrán aprendido
Antes de esta noche, nunca había ___ (probar) ese plato.|probado
Para el lunes, nosotros ___ (firmar) el contrato.|habremos firmado
Cuando te vi, ya ___ (terminar) el trabajo.|había terminado
Para entonces, ella ___ (cumplir) treinta años.|habrá cumplido
Antes de irme, ya ___ (apagar) las luces.|había apagado`,
  },
  {
    id: "esc1p7",
    title: "Legal & Academic Vocabulary",
    subtitle: "Formal institutional terms",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Legal and academic register vocabulary.",
    data: `trial|juicio
guilty|culpable
innocent|inocente
judge|juez
court|tribunal
evidence|prueba
lawsuit|demanda
regulation|reglamento
clause|cláusula
prosecutor|fiscal
research|investigación
thesis|tesis
argument|argumento
hypothesis|hipótesis
methodology|metodología
citation|cita
conclusion|conclusión
peer review|revisión por pares
academic|académico
scholarship|beca`,
  },
  {
    id: "esc1p8",
    title: "Advanced Reported Speech",
    subtitle: "Direct to indirect speech",
    kind: "cloze",
    note: "Tense-shifting when converting direct speech to indirect (reported) speech.",
    data: `Ella dijo: "Voy a venir." → Ella dijo que ___ a venir.|iba
Él dijo: "Tengo hambre." → Él dijo que ___ hambre.|tenía
Ellos dijeron: "Hemos terminado." → Ellos dijeron que ___ terminado.|habían
Ella preguntó: "¿Vendrás mañana?" → Ella preguntó si ___ al día siguiente.|vendría
Él afirmó: "Es la verdad." → Él afirmó que ___ la verdad.|era
Ellos comentaron: "Nos gusta viajar." → Ellos comentaron que les ___ viajar.|gustaba
Ella explicó: "No puedo ir." → Ella explicó que no ___ ir.|podía
Él admitió: "Cometí un error." → Él admitió que ___ un error.|había cometido
Ellos insistieron: "Queremos ayudar." → Ellos insistieron en que ___ ayudar.|querían
Ella señaló: "El plan funcionará." → Ella señaló que el plan ___.|funcionaría
Él prometió: "Volveré pronto." → Él prometió que ___ pronto.|volvería
Ellos negaron: "No sabíamos nada." → Ellos negaron que ___ nada.|supieran
Ella sugirió: "Deberíamos esperar." → Ella sugirió que ___ esperar.|deberían
Él confesó: "Estoy nervioso." → Él confesó que ___ nervioso.|estaba
Ellos anunciaron: "Ganamos el premio." → Ellos anunciaron que ___ el premio.|habían ganado
Ella declaró: "Esto es importante." → Ella declaró que esto ___ importante.|era
Él respondió: "No lo entiendo." → Él respondió que no lo ___.|entendía
Ellos advirtieron: "Habrá problemas." → Ellos advirtieron que ___ problemas.|habría
Ella recordó: "Debemos llegar temprano." → Ella recordó que ___ llegar temprano.|debían
Él reconoció: "Necesito ayuda." → Él reconoció que ___ ayuda.|necesitaba
Ellos concluyeron: "El experimento falló." → Ellos concluyeron que el experimento ___.|había fallado
Ella observó: "Algo cambió." → Ella observó que algo ___.|había cambiado
Él aseguró: "Todo está bien." → Él aseguró que todo ___ bien.|estaba
Ellos repitieron: "No cambiaremos de opinión." → Ellos repitieron que no ___ de opinión.|cambiarían
Ella subrayó: "Este punto es clave." → Ella subrayó que ese punto ___ clave.|era`,
  },
  {
    id: "esc1p9",
    title: "Subjunctive After Conjunctions",
    subtitle: "para que, a menos que, con tal de que",
    kind: "cloze",
    note: "Subjunctive obligatorily triggered by certain conjunctions.",
    data: `Te lo explico para que lo ___ (entender).|entiendas
No saldremos a menos que ___ (dejar) de llover.|deje
Te ayudo con tal de que ___ (terminar) a tiempo.|termines
Estudia mucho antes de que ___ (ser) el examen.|sea
Llámame en cuanto ___ (llegar).|llegues
Iré aunque ___ (llover).|llueva
Trabajamos sin que nadie nos ___ (decir) qué hacer.|diga
Ahorra dinero para que ___ (poder) viajar.|puedas
No firmes hasta que lo ___ (leer) todo.|leas
Vendrá a menos que ___ (surgir) un problema.|surja
Hazlo bien de modo que no ___ (haber) errores.|haya
Espera aquí hasta que yo ___ (volver).|vuelva
No lo firmes sin que un abogado lo ___ (revisar).|revise
Seguiremos adelante siempre que ustedes ___ (estar) de acuerdo.|estén
Avísame cuando ___ (saber) los resultados.|sepas`,
  },
  {
    id: "esc1p10",
    title: "Past Hypotheticals",
    subtitle: "If I had had..., I would have...",
    kind: "cloze",
    note: "Type-3 conditional: si + pluperfect subjunctive, + conditional perfect.",
    data: `Si yo ___ (saber) la verdad, habría actuado diferente.|hubiera sabido
Si ella ___ (estudiar) más, habría aprobado.|hubiera estudiado
Si nosotros ___ (salir) antes, no habríamos llegado tarde.|hubiéramos salido
Si ellos ___ (venir), habrían visto el espectáculo.|hubieran venido
Si tú me lo ___ (decir), te habría ayudado.|hubieras dicho
Si yo ___ (tener) más tiempo, habría terminado el proyecto.|hubiera tenido
Si ella ___ (llamar), habríamos ido a recogerla.|hubiera llamado
Si nosotros lo ___ (saber) antes, habríamos cambiado los planes.|hubiéramos sabido
Si ellos ___ (escuchar), habrían entendido mejor.|hubieran escuchado
Si tú ___ (llegar) a tiempo, no te habrías perdido nada.|hubieras llegado
Si yo ___ (poder), te habría acompañado.|hubiera podido
Si ella ___ (querer), habría venido con nosotros.|hubiera querido
Si nosotros ___ (revisar) el contrato, no habría problemas.|hubiéramos revisado
Si ellos ___ (avisar) antes, habríamos estado listos.|hubieran avisado
Si tú ___ (insistir), habríamos cambiado de plan.|hubieras insistido`,
  },
  {
    id: "esc1p11",
    title: "Confusable Verb Pairs",
    subtitle: "saber/conocer, pedir/preguntar, llevar/traer",
    kind: "pair",
    prompt: 'Which verb best fits "%s"?',
    note: "Classic confusable Spanish verb pairs for English speakers.",
    data: `to know a fact|saber
to know/be familiar with a person or place|conocer
to ask for something|pedir
to ask a question|preguntar
to take/carry something (away)|llevar
to bring something (here)|traer
to leave (depart)|salir
to leave something behind|dejar
to play an instrument|tocar
to play a game/sport|jugar
to look at|mirar
to look for|buscar
to become (permanent change)|convertirse en
to become (temporary/emotional)|ponerse
to realize|darse cuenta de`,
  },
  {
    id: "esc1p12",
    title: "Business & Negotiation",
    subtitle: "Formal negotiation vocabulary",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Business negotiation vocabulary.",
    data: `agreement|acuerdo
proposal|propuesta
counteroffer|contraoferta
stakeholder|parte interesada
merger|fusión
acquisition|adquisición
deadline (contractual)|plazo
terms and conditions|términos y condiciones
liability|responsabilidad
shareholder|accionista
arbitration|arbitraje
negotiation|negociación
partnership|sociedad
revenue|ingresos
breach|incumplimiento`,
  },
  {
    id: "esc1p13",
    title: "Diplomatic Correspondence",
    subtitle: "Formal letter phrases",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Phrases typical of formal/diplomatic written correspondence.",
    data: `Dear Sir or Madam|Estimado señor o señora
I am writing to inform you|Le escribo para informarle
With reference to your letter|En referencia a su carta
Please do not hesitate to contact me|No dude en contactarme
I look forward to hearing from you|Quedo a la espera de su respuesta
Yours faithfully|Le saluda atentamente
Enclosed please find|Adjunto encontrará
We regret to inform you|Lamentamos informarle
Thank you for your attention to this matter|Gracias por su atención a este asunto
It would be greatly appreciated|Se agradecería enormemente
In accordance with|De acuerdo con
On behalf of|En nombre de
Please find attached the requested documents|Adjunto encontrará los documentos solicitados
We would like to schedule a meeting|Nos gustaría programar una reunión
Kind regards|Saludos cordiales`,
  },
  {
    id: "esc1p14",
    title: "Literary & Narrative Devices",
    subtitle: "Talking about storytelling",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Vocabulary for discussing literature and narrative technique.",
    data: `plot|trama
character|personaje
narrator|narrador
setting|ambientación
theme|tema
metaphor|metáfora
symbolism|simbolismo
irony|ironía
foreshadowing|presagio
climax|clímax
protagonist|protagonista
antagonist|antagonista
tone|tono
point of view|punto de vista
flashback|flashback`,
  },
  {
    id: "esc1p15",
    title: "Philosophy & Abstract Concepts",
    subtitle: "Abstract thought vocabulary",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Philosophical and abstract-concept vocabulary.",
    data: `existence|existencia
consciousness|conciencia
truth|verdad
ethics|ética
freedom|libertad
reality|realidad
knowledge|conocimiento
belief|creencia
reason|razón
doubt|duda
identity|identidad
meaning|sentido
virtue|virtud
justice|justicia
morality|moralidad`,
  },
  {
    id: "esc1p16",
    title: "Science & Technology (Advanced)",
    subtitle: "Scientific vocabulary",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Advanced science and technology vocabulary.",
    data: `prototype|prototipo
experiment|experimento
data|datos
algorithm|algoritmo
artificial intelligence|inteligencia artificial
molecule|molécula
gene|gen
theory|teoría
innovation|innovación
sustainability|sostenibilidad
quantum|cuántico
neural network|red neuronal
evidence (scientific)|evidencia
breakthrough|avance
simulation|simulación`,
  },
  {
    id: "esc1p17",
    title: "Word Formation",
    subtitle: "Prefixes and suffixes",
    kind: "pair",
    prompt: 'What does the word "%s" mean?',
    note: "Common Spanish prefixes/suffixes and the words they form.",
    data: `rápidamente|quickly
felizmente|happily
reconstruir|to rebuild
deshacer|to undo
inaceptable|unacceptable
imposible|impossible
educación|education
organización|organization
panadería|bakery
librería|bookstore
inútil|useless
prehistórico|prehistoric
subestimar|to underestimate
sobrevivir|to survive
imposibilidad|impossibility`,
  },
  {
    id: "esc1p18",
    title: "Advanced Idiomatic Expressions II",
    subtitle: "More sophisticated sayings",
    kind: "pair",
    prompt: 'What does "%s" mean?',
    note: "More advanced idiomatic expressions for fluent Spanish.",
    data: `costar Dios y ayuda|to be extremely difficult
no tener nombre|to be outrageous
írsele el santo al cielo|to completely forget something
ponerse las botas|to indulge oneself
estar en su salsa|to be in one's element
no pegar ojo|to not sleep a wink
tomar el toro por los cuernos|to take the bull by the horns
importar un bledo|to not care at all
estar hecho polvo|to be exhausted
dar gato por liebre|to deceive someone with a substitute
no tener abuela|to be shamelessly self-praising
ser el pan de cada día|to be a daily occurrence
hablar por los codos|to talk a mile a minute
írsele la mano|to overdo it
poner los puntos sobre las íes|to spell things out precisely`,
  },
  {
    id: "esc1p19",
    title: "Register Shifting II",
    subtitle: "Colloquial to formal, part 2",
    kind: "pair",
    prompt: 'What is the more formal way to say "%s"?',
    note: "More colloquial-to-formal register pairs.",
    data: `to fix (colloquial: arreglar)|reparar
to buy (colloquial: comprar algo barato)|adquirir
kid (colloquial: chaval)|joven
boss (colloquial: jefe)|superior
to fire someone (colloquial: echar)|despedir
to hire (colloquial: coger a alguien)|contratar
to talk (colloquial: charlar)|conversar
money (colloquial: pasta)|dinero
job (colloquial: curro)|empleo
house (colloquial: casa)|vivienda
car (colloquial: coche viejo)|vehículo
to eat (colloquial: comer rápido)|almorzar
to sleep (colloquial: sobar)|descansar
friend (colloquial: colega)|compañero
to leave (colloquial: pirarse)|marcharse`,
  },
  {
    id: "esc1p20",
    title: "Advanced Discourse Markers II",
    subtitle: "Even more sophisticated connectors",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Further advanced discourse markers for academic/formal Spanish.",
    data: `to that end|con ese fin
in other words (formal)|dicho de otra manera
more specifically|más concretamente
broadly speaking|en términos generales
as previously mentioned|como se mencionó anteriormente
it follows that|de ello se desprende que
against this backdrop|en este contexto
on closer inspection|tras un análisis más detallado
all else being equal|si todo lo demás permanece igual
in the absence of|en ausencia de
as a case in point|como caso ilustrativo
in due course|a su debido tiempo
with this in mind|con esto en mente
insofar as possible|en la medida de lo posible
likewise (by the same token)|de igual modo`,
  },
  {
    id: "esc1p21",
    title: "Subjunctive in Relative Clauses",
    subtitle: "Nonexistent or indefinite antecedents",
    kind: "cloze",
    note: "Subjunctive required when the antecedent is unknown, indefinite, or nonexistent.",
    data: `Busco a alguien que ___ (hablar) tres idiomas.|hable
No hay nadie que ___ (saber) la respuesta.|sepa
Necesito un libro que ___ (explicar) esto bien.|explique
¿Conoces a alguien que ___ (poder) ayudarme?|pueda
No existe ningún método que ___ (garantizar) el éxito.|garantice
Buscamos una casa que ___ (tener) jardín.|tenga
No hay nada que ___ (justificar) su comportamiento.|justifique
Quiero un trabajo que me ___ (permitir) viajar.|permita
No conozco a nadie que ___ (vivir) allí.|viva
Necesitamos alguien que ___ (conocer) el sistema.|conozca
¿Hay algún restaurante que ___ (servir) comida vegana?|sirva
No hay razón que ___ (explicar) su ausencia.|explique
Buscan un candidato que ___ (tener) experiencia.|tenga
No hay nadie aquí que ___ (querer) ese puesto.|quiera
Quiero encontrar algo que me ___ (hacer) feliz.|haga
No existe una solución que ___ (satisfacer) a todos.|satisfaga
Necesito a alguien que ___ (entender) el problema.|entienda
¿Hay alguien que ___ (saber) tocar el piano?|sepa
No hay ningún plan que ___ (funcionar) perfectamente.|funcione
Buscamos empleados que ___ (ser) responsables.|sean
No conozco ningún lugar que ___ (ofrecer) esto.|ofrezca
Quiero un coche que ___ (consumir) poca gasolina.|consuma
No hay evidencia que ___ (probar) su culpabilidad.|pruebe
Necesitamos una estrategia que ___ (resolver) esto.|resuelva
¿Existe algo que ___ (poder) cambiar su decisión?|pueda`,
  },
  {
    id: "esc1p22",
    title: "Nuanced Synonyms II",
    subtitle: "Even more precise vocabulary",
    kind: "pair",
    prompt: 'What is a more precise/formal way to say "%s"?',
    note: "Further advanced vocabulary offering more precise alternatives.",
    data: `to cause (basic: causar)|ocasionar
to reduce (basic: reducir)|disminuir
to increase (basic: aumentar)|incrementar
to reveal (basic: mostrar)|revelar
to demand (basic: exigir)|reclamar
to avoid (basic: evitar)|eludir
to gather (basic: reunir)|congregar
to reject (basic: rechazar)|repudiar
to support (basic: apoyar)|respaldar
to achieve (basic: lograr)|alcanzar
to face (a problem)|afrontar
to solve (basic: resolver)|solucionar
to consider (basic: considerar)|contemplar
to strengthen (basic: fortalecer)|robustecer
to weaken (basic: debilitar)|menoscabar
to emphasize (basic: enfatizar)|recalcar
to clarify (basic: aclarar)|esclarecer
to summarize (basic: resumir)|sintetizar
to expand (basic: expandir)|ampliar
to restrict (basic: restringir)|limitar
to enable (basic: permitir)|posibilitar
to hinder (basic: dificultar)|obstaculizar
to promote (basic: promover)|fomentar
to establish (basic: establecer)|instaurar
to delay (basic: retrasar)|posponer`,
  },
  {
    id: "esc1p23",
    title: "Political & Social Commentary",
    subtitle: "Discussing society",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Vocabulary for political and social commentary.",
    data: `public opinion|opinión pública
social inequality|desigualdad social
grassroots movement|movimiento de base
policy reform|reforma de políticas
civic engagement|participación cívica
socioeconomic status|estatus socioeconómico
marginalized community|comunidad marginada
systemic change|cambio sistémico
collective action|acción colectiva
public discourse|discurso público
social cohesion|cohesión social
economic disparity|disparidad económica
political polarization|polarización política
civil disobedience|desobediencia civil
grassroots activism|activismo de base
social contract|contrato social
common good|bien común
public accountability|rendición de cuentas pública
institutional trust|confianza institucional
social mobility|movilidad social
wealth gap|brecha de riqueza
policy implementation|implementación de políticas
civic duty|deber cívico
public welfare|bienestar público
social justice|justicia social`,
  },
  {
    id: "esc1p24",
    title: "Academic Writing Verbs",
    subtitle: "Verbs for scholarly writing",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Verbs common in academic and scholarly writing.",
    data: `to argue (in writing)|argumentar
to demonstrate|demostrar
to postulate|postular
to critique|criticar
to synthesize|sintetizar
to substantiate|fundamentar
to corroborate|corroborar
to refute|refutar
to elaborate (on)|profundizar en
to delineate|delinear
to formulate|formular
to interpret|interpretar
to derive (a conclusion)|derivar
to validate|validar
to challenge (an idea)|cuestionar
to underscore|subrayar
to juxtapose|yuxtaponer
to contextualize|contextualizar
to problematize|problematizar
to extrapolate|extrapolar
to conceptualize|conceptualizar
to hypothesize|formular una hipótesis
to enumerate|enumerar
to categorize|categorizar
to differentiate|diferenciar`,
  },
  {
    id: "esc1p25",
    title: "Idiomatic Business Expressions",
    subtitle: "English business idioms, in Spanish",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Idiomatic business/formal expressions.",
    data: `to think outside the box|pensar fuera de la caja
to be on the same page|estar en sintonía
to touch base|ponerse en contacto
to keep someone in the loop|mantener a alguien informado
to go the extra mile|dar lo mejor de sí
to hit the ground running|empezar con buen pie
low-hanging fruit|tarea fácil de lograr
to move the needle|generar un impacto real
to circle back|retomar el tema
to be a game changer|cambiar las reglas del juego
to read between the lines|leer entre líneas
to have skin in the game|tener intereses propios en el asunto
to drop the ball|cometer un descuido
to raise the bar|elevar el estándar
to take ownership|asumir la responsabilidad
to be in the pipeline|estar en proceso
to think on one's feet|pensar rápido
to get the ball rolling|poner las cosas en marcha
to cut to the chase|ir al grano
to be on the fence|estar indeciso
to bite the bullet|afrontar lo inevitable
to leave no stone unturned|no dejar piedra sin remover
to weather the storm|superar la crisis
to be at a crossroads|estar en una encrucijada
to turn the tide|cambiar el rumbo`,
  },
  {
    id: "esc1p26",
    title: "Nuanced Discourse Connectors III",
    subtitle: "Further sophisticated connectors",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Further advanced discourse markers.",
    data: `insofar as it concerns|en lo que concierne a
with the exception of|con la excepción de
in the same vein|en la misma línea
for lack of a better term|a falta de un término mejor
in a manner of speaking|por así decirlo
strictly speaking|en sentido estricto
loosely speaking|en sentido amplio
to put it another way|dicho de otro modo
needless to say|huelga decir
suffice it to say|baste decir
be it as it may|sea como fuere
without further ado|sin más preámbulos
that being the case|siendo así
under these circumstances|en estas circunstancias
by virtue of|en virtud de
with a view to|con miras a
in the interest of|en aras de
to the extent possible|en la medida de lo posible
as things stand|tal como están las cosas
in retrospect|en retrospectiva
on second thought|pensándolo bien
all told|en total
by and large|en general
when all is said and done|al fin y al cabo
in the grand scheme of things|en el gran esquema de las cosas`,
  },
  {
    id: "esc1p29",
    title: "Speaking: Idiomatic and Formal Phrasing",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Idiomatic and formal phrasing said aloud.",
    // See esa1p29's comment for the full authoring rationale (round-tripped
    // against the real normaliser, same hazards avoided). No numbers at all
    // here, so the number-word traps don't apply to this pack.
    data: `Huelga decir que este proyecto es fundamental.|Huelga decir que este proyecto es fundamental.
Ni que decir tiene.|Ni que decir tiene.
Le ruego que disculpe las molestias.|Le ruego que disculpe las molestias.
Tenemos el placer de informarle de nuestra decisión.|Tenemos el placer de informarle de nuestra decisión.
Adjunto encontrará el documento solicitado.|Adjunto encontrará el documento solicitado.
En la medida de lo posible, haremos lo necesario.|En la medida de lo posible, haremos lo necesario.
Sea como fuere, debemos avanzar.|Sea como fuere, debemos avanzar.
No cabe duda de ello.|No cabe duda de ello.
No obstante, el problema persiste.|No obstante, el problema persiste.
A decir verdad, no lo sé.|A decir verdad, no lo sé.
En definitiva, fue una buena decisión.|En definitiva, fue una buena decisión.
Al fin y al cabo, eso no importa.|Al fin y al cabo, eso no importa.
Huelga decirlo.|Huelga decirlo.
Le agradezco de antemano su confianza.|Le agradezco de antemano su confianza.
Quedamos a su entera disposición.|Quedamos a su entera disposición.
Es cuestión de sentido común.|Es cuestión de sentido común.
Dicho esto, hay que ser prudentes.|Dicho esto, hay que ser prudentes.
Donde hay humo, hay fuego.|Donde hay humo, hay fuego.
Más vale tarde que nunca.|Más vale tarde que nunca.
Cada cosa a su tiempo.|Cada cosa a su tiempo.
Le agradecería que respondiera con prontitud.|Le agradecería que respondiera con prontitud.
Le pedimos disculpas por las molestias ocasionadas.|Le pedimos disculpas por las molestias ocasionadas.
Es el mundo al revés.|Es el mundo al revés.
En una palabra, todo va bien.|En una palabra, todo va bien.
Sin más preámbulos, comencemos.|Sin más preámbulos, comencemos.`,
  },
  {
    id: "esc1p27",
    title: "Write It Yourself: Idiomatic and Formal Phrasing",
    subtitle: "Say it your own way",
    kind: "translate",
    note: "Idiomatic and formal phrasing -- more than one wording is right.",
    data: `Say it goes without saying that this project is important.|Ni que decir tiene que este proyecto es importante.;Huelga decir que este proyecto es importante.;Sobra decir que este proyecto es importante.
Say that goes without saying.|Eso ni se pregunta.;Eso se sobreentiende.;Ni hace falta decirlo.
Say please excuse this delay.|Le ruego que disculpe este retraso.;Le pido disculpas por este retraso.;Disculpe usted este retraso, por favor.
Say we are pleased to inform you of our decision.|Nos complace informarle de nuestra decisión.;Tenemos el gusto de comunicarle nuestra decisión.;Nos es grato informarle nuestra decisión.
Say please find attached the requested document.|Adjunto encontrará el documento solicitado.;Le envío adjunto el documento solicitado.;Encontrará adjunto el documento que pidió.
Say we will do our best.|Haremos todo lo posible.;Haremos lo que esté a nuestro alcance.;Pondremos todo de nuestra parte.
Say be that as it may, we must move forward.|Sea como sea, debemos avanzar.;Como quiera que sea, tenemos que seguir adelante.;De todos modos, hay que avanzar.
Say there is no doubt about that.|No cabe duda de eso.;No hay ninguna duda al respecto.;Eso está fuera de toda duda.
Say the problem persists nonetheless.|El problema persiste sin embargo.;No obstante, el problema sigue ahí.;A pesar de todo, el problema continúa.
Say to tell the truth, you have no idea.|La verdad, no tengo ni idea.;A decir verdad, no tengo idea.;Para serte sincero, no sé nada.
Say all things considered, it was a good decision.|Considerando todo, fue una buena decisión.;Bien mirado, fue una buena decisión.;En resumidas cuentas, fue una buena decisión.
Say in the end, it doesn't matter.|Al final, no importa.;Al fin y al cabo, no importa.;A fin de cuentas, no importa.
Say you would like to thank someone for their trust.|Quisiera agradecerle su confianza.;Le agradezco mucho su confianza.;Deseo expresarle mi agradecimiento por su confianza.
Say we remain at your entire disposal.|Quedamos a su entera disposición.;Estamos a su disposición para lo que necesite.;Seguimos a su disposición.
Say that's a matter of common sense.|Eso es cuestión de sentido común.;Eso es de sentido común.;Es una cuestión de lógica.
Say that said, you should remain cautious.|Dicho esto, debemos ser cautelosos.;Aun así, conviene ser prudentes.;Dicho lo cual, hay que tener cuidado.
Say there's no smoke without fire.|No hay humo sin fuego.;Cuando el río suena, agua lleva.;Algo de cierto habrá cuando tanto se dice.
Say better late than never.|Más vale tarde que nunca.;Mejor tarde que nunca.;Vale más tarde que nunca.
Say each thing in its own time.|Cada cosa a su tiempo.;Todo a su debido tiempo.;Cada cosa en su momento.
Say things are getting worse.|Las cosas van de mal en peor.;Todo va cada vez peor.;La situación empeora cada vez más.
Say you would be grateful if someone could reply quickly.|Le agradecería que respondiera pronto.;Le quedaría muy agradecido si contesta pronto.;Agradecería una respuesta rápida.
Say we apologize for the inconvenience caused.|Le pedimos disculpas por las molestias ocasionadas.;Lamentamos las molestias que esto haya causado.;Rogamos disculpe las molestias causadas.
Say this is the world turned upside down.|Esto es el mundo al revés.;Este es un mundo al revés.;Aquí todo está al revés.
Say in a word, everything is fine.|En una palabra, todo está bien.;En resumen, todo va bien.;En pocas palabras, todo marcha bien.
Say we look forward to hearing from you.|Quedamos a la espera de su respuesta.;Esperamos su pronta respuesta.;Aguardamos noticias suyas.`,
  },
  {
    id: "esc1p28",
    title: "Minimal Pairs",
    subtitle: "Listen closely",
    kind: "listening",
    prompt: "¿Qué escuchaste?",
    note: "Formal-register sentences built around sounds that merge for most Spanish speakers: seseo (encausar/encauzar, cima/sima, acechar/asechar), b/v (barón/varón).",
    data: `El juez decidió encausar al acusado de inmediato.|El juez decidió encausar al acusado de inmediato.
El juez decidió encauzar al acusado de inmediato.|El juez decidió encauzar al acusado de inmediato.
El comité decidió encausar el problema de raíz.|El comité decidió encausar el problema de raíz.
El comité decidió encauzar el problema de raíz.|El comité decidió encauzar el problema de raíz.
Intentaron encauzar la situación desde el principio.|Intentaron encauzar la situación desde el principio.
Intentaron encausar la situación desde el principio.|Intentaron encausar la situación desde el principio.
En el documento decía que era un varón.|En el documento decía que era un varón.
En el documento decía que era un barón.|En el documento decía que era un barón.
Nadie sabía que el bebé era varón.|Nadie sabía que el bebé era varón.
Nadie sabía que el bebé era barón.|Nadie sabía que el bebé era barón.
El título nobiliario pertenecía a un barón.|El título nobiliario pertenecía a un barón.
El título nobiliario pertenecía a un varón.|El título nobiliario pertenecía a un varón.
Los diplomáticos llegaron hasta la cima de las negociaciones.|Los diplomáticos llegaron hasta la cima de las negociaciones.
Los diplomáticos llegaron hasta la sima de las negociaciones.|Los diplomáticos llegaron hasta la sima de las negociaciones.
El comité reconoció haber alcanzado la cima del proceso.|El comité reconoció haber alcanzado la cima del proceso.
El comité reconoció haber alcanzado la sima del proceso.|El comité reconoció haber alcanzado la sima del proceso.
La expedición alcanzó finalmente la cima más alta.|La expedición alcanzó finalmente la cima más alta.
La expedición alcanzó finalmente la sima más alta.|La expedición alcanzó finalmente la sima más alta.
Los inversionistas decidieron acechar el mercado en silencio.|Los inversionistas decidieron acechar el mercado en silencio.
Los inversionistas decidieron asechar el mercado en silencio.|Los inversionistas decidieron asechar el mercado en silencio.
Nadie sospechaba que el escándalo los estuviera acechando.|Nadie sospechaba que el escándalo los estuviera acechando.
Nadie sospechaba que el escándalo los estuviera asechando.|Nadie sospechaba que el escándalo los estuviera asechando.
El depredador aprendió a acechar pacientemente a su presa.|El depredador aprendió a acechar pacientemente a su presa.
El depredador aprendió a asechar pacientemente a su presa.|El depredador aprendió a asechar pacientemente a su presa.
La comisión decidió encauzar formalmente la investigación.|La comisión decidió encauzar formalmente la investigación.`,
  },
];

export const BANK_ES: Record<Level, Pack[]> = { A1, A2, B1, B2, C1 };

const ZERO_COUNTS: Record<Level, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

/** Spanish course has no hand-authored units, so unit numbering always starts at 0. */
export function generatedUnitsEs(): ReturnType<typeof unitsFromBank> {
  return unitsFromBank(BANK_ES, ZERO_COUNTS);
}
