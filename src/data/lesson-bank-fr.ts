import type { Pack } from "./bank-engine";
import type { Level } from "./levels";
import { unitsFromBank } from "./bank-engine";

/**
 * French course content, in the same compact Pack format as the English
 * lesson bank (see lesson-bank.ts). Interface language stays English —
 * these packs teach French vocabulary and grammar to English speakers,
 * the same way lesson-bank.ts teaches English. Pack ids are prefixed
 * "fr" so lesson/question/unit ids never collide with the English bank.
 */

const A1: Pack[] = [
  {
    id: "fra1p1",
    title: "Greetings & Everyday Phrases",
    subtitle: "First words in French",
    kind: "pair",
    prompt: 'How do you say "%s" in French?',
    note: "Core greetings and polite phrases.",
    data: `hello (informal)|Salut
hello (formal)|Bonjour
good evening|Bonsoir
goodbye|Au revoir
see you soon|À bientôt
please|S'il vous plaît
thank you|Merci
you're welcome|De rien
excuse me|Excusez-moi
sorry|Désolé
yes|Oui
no|Non
how are you?|Comment allez-vous ?
I'm fine, thanks|Je vais bien, merci
what is your name?|Comment vous appelez-vous ?
my name is...|Je m'appelle...
nice to meet you|Enchanté
good night|Bonne nuit
see you tomorrow|À demain
welcome|Bienvenue
of course|Bien sûr
I don't understand|Je ne comprends pas
can you repeat, please?|Pouvez-vous répéter, s'il vous plaît ?
do you speak English?|Parlez-vous anglais ?
good luck|Bonne chance`,
  },
  {
    id: "fra1p2",
    title: "Numbers 1–100",
    subtitle: "Counting in French",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Cardinal numbers from one to a hundred.",
    data: `one|un
two|deux
three|trois
four|quatre
five|cinq
six|six
seven|sept
eight|huit
nine|neuf
ten|dix
eleven|onze
twelve|douze
thirteen|treize
fourteen|quatorze
fifteen|quinze
sixteen|seize
seventeen|dix-sept
eighteen|dix-huit
nineteen|dix-neuf
twenty|vingt
twenty-one|vingt et un
thirty|trente
forty|quarante
fifty|cinquante
one hundred|cent`,
  },
  {
    id: "fra1p3",
    title: "Family & People",
    subtitle: "Talking about people you know",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Family members and common people vocabulary.",
    data: `mother|la mère
father|le père
sister|la sœur
brother|le frère
son|le fils
daughter|la fille
grandmother|la grand-mère
grandfather|le grand-père
aunt|la tante
uncle|l'oncle
cousin (male)|le cousin
cousin (female)|la cousine
husband|le mari
wife|l'épouse
friend (male)|l'ami
friend (female)|l'amie
man|l'homme
woman|la femme
child|l'enfant
baby|le bébé
boy|le garçon
neighbour|le voisin
colleague|le collègue
teacher|le professeur
student|l'étudiant`,
  },
  {
    id: "fra1p4",
    title: "Colours & Clothes",
    subtitle: "Describing what people wear",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common colours and clothing items.",
    data: `red|rouge
blue|bleu
green|vert
yellow|jaune
black|noir
white|blanc
grey|gris
brown|marron
pink|rose
purple|violet
shirt|la chemise
t-shirt|le t-shirt
trousers|le pantalon
dress|la robe
skirt|la jupe
shoes|les chaussures
jacket|la veste
coat|le manteau
hat|le chapeau
scarf|l'écharpe
socks|les chaussettes
sweater|le pull
belt|la ceinture
gloves|les gants
boots|les bottes`,
  },
  {
    id: "fra1p5",
    title: "Days, Months & Seasons",
    subtitle: "Talking about time and calendar",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Days of the week, months, and seasons.",
    data: `Monday|lundi
Tuesday|mardi
Wednesday|mercredi
Thursday|jeudi
Friday|vendredi
Saturday|samedi
Sunday|dimanche
January|janvier
February|février
March|mars
April|avril
May|mai
June|juin
July|juillet
August|août
September|septembre
October|octobre
November|novembre
December|décembre
spring|le printemps
summer|l'été
autumn|l'automne
winter|l'hiver
today|aujourd'hui
tomorrow|demain`,
  },
  {
    id: "fra1p6",
    title: "Body Parts",
    subtitle: "Talking about the human body",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common parts of the body.",
    data: `head|la tête
hair|les cheveux
eye|l'œil
eyes|les yeux
ear|l'oreille
nose|le nez
mouth|la bouche
tooth|la dent
neck|le cou
shoulder|l'épaule
arm|le bras
hand|la main
finger|le doigt
chest|la poitrine
back|le dos
stomach|le ventre
leg|la jambe
knee|le genou
foot|le pied
skin|la peau
face|le visage
heart|le cœur
elbow|le coude
wrist|le poignet
chin|le menton`,
  },
  {
    id: "fra1p7",
    title: "House & Rooms",
    subtitle: "Talking about where you live",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Rooms and household vocabulary.",
    data: `house|la maison
apartment|l'appartement
kitchen|la cuisine
bedroom|la chambre
bathroom|la salle de bain
living room|le salon
dining room|la salle à manger
garden|le jardin
door|la porte
window|la fenêtre
wall|le mur
floor|le sol
ceiling|le plafond
stairs|l'escalier
roof|le toit
garage|le garage
table|la table
chair|la chaise
bed|le lit
sofa|le canapé
lamp|la lampe
mirror|le miroir
key|la clé
shelf|l'étagère
carpet|le tapis`,
  },
  {
    id: "fra1p8",
    title: "Common Verbs (infinitives)",
    subtitle: "Everyday actions",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "High-frequency verbs in their infinitive form.",
    data: `to eat|manger
to drink|boire
to speak|parler
to listen|écouter
to read|lire
to write|écrire
to sleep|dormir
to work|travailler
to study|étudier
to play|jouer
to walk|marcher
to run|courir
to swim|nager
to cook|cuisiner
to buy|acheter
to sell|vendre
to open|ouvrir
to close|fermer
to look|regarder
to wait|attendre
to help|aider
to love|aimer
to want|vouloir
to need|avoir besoin de
to live|vivre`,
  },
  {
    id: "fra1p9",
    title: "Animals",
    subtitle: "Common animals",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Everyday animals, pets and wildlife.",
    data: `dog|le chien
cat|le chat
bird|l'oiseau
horse|le cheval
cow|la vache
pig|le cochon
sheep|le mouton
hen (chicken)|la poule
duck|le canard
rabbit|le lapin
mouse|la souris
fish|le poisson
lion|le lion
tiger|le tigre
bear|l'ours
elephant|l'éléphant
monkey|le singe
wolf|le loup
fox|le renard
frog|la grenouille
snake|le serpent
turtle|la tortue
bee|l'abeille
butterfly|le papillon
spider|l'araignée`,
  },
  {
    id: "fra1p10",
    title: "Professions & Jobs",
    subtitle: "Talking about work",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common jobs and professions.",
    data: `doctor|le médecin
nurse|l'infirmier
teacher (profession)|le professeur
engineer|l'ingénieur
lawyer|l'avocat
police officer|le policier
firefighter|le pompier
chef|le cuisinier
waiter|le serveur
farmer|l'agriculteur
driver|le chauffeur
pilot|le pilote
artist|l'artiste
musician|le musicien
writer|l'écrivain
scientist|le scientifique
dentist|le dentiste
accountant|le comptable
electrician|l'électricien
plumber|le plombier
hairdresser|le coiffeur
journalist|le journaliste
architect|l'architecte
soldier|le soldat
secretary|le secrétaire`,
  },
  {
    id: "fra1p11",
    title: "Question Words",
    subtitle: "Asking questions in French",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Core question words and phrases.",
    data: `who|qui
what|quoi
where|où
when|quand
why|pourquoi
how|comment
how much|combien
how many|combien de
which|quel
whose|à qui
what (subject)|qu'est-ce qui
what (object)|qu'est-ce que
is it that…?|est-ce que
how old|quel âge
what time|quelle heure
who is it|qui est-ce
what is it|qu'est-ce que c'est
where is|où est
where are|où sont
how are you (informal)|comment vas-tu
what's your name (informal)|comment tu t'appelles
which one|lequel
which ones|lesquels
why not|pourquoi pas
how far|à quelle distance`,
  },
  {
    id: "fra1p12",
    title: "Prepositions of Place",
    subtitle: "Describing where things are",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common prepositions used to locate things.",
    data: `in|dans
on|sur
under|sous
in front of|devant
behind|derrière
next to|à côté de
between|entre
above|au-dessus de
below|en dessous de
near|près de
far from|loin de
inside|à l'intérieur de
outside|à l'extérieur de
opposite|en face de
around|autour de
against|contre
through|à travers
along|le long de
among|parmi
towards|vers
at (someone's place)|chez
from|de
to (a place)|à
here|ici
there|là`,
  },
  {
    id: "fra1p13",
    title: "Telling Time",
    subtitle: "Talking about the clock",
    kind: "pair",
    prompt: 'The French for "%s" is…',
    note: "Time expressions and everyday time vocabulary.",
    data: `it's one o'clock|il est une heure
it's two o'clock|il est deux heures
it's noon|il est midi
it's midnight|il est minuit
half past two|deux heures et demie
quarter past three|trois heures et quart
quarter to four|quatre heures moins le quart
in the morning|du matin
in the afternoon|de l'après-midi
in the evening|du soir
at night|la nuit
what time is it?|quelle heure est-il ?
an hour|une heure
a minute|une minute
a second|une seconde
early|tôt
late|tard
now|maintenant
soon|bientôt
later|plus tard
always|toujours
never|jamais
sometimes|parfois
often|souvent
rarely|rarement`,
  },
  {
    id: "fra1p14",
    title: "Shopping & Money",
    subtitle: "Buying things in French",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Everyday shopping and money vocabulary.",
    data: `money|l'argent
price|le prix
expensive|cher
cheap|bon marché
to pay|payer
cash|l'argent liquide
credit card|la carte de crédit
receipt|le reçu
shop|le magasin
supermarket|le supermarché
market|le marché
cashier|le caissier
discount|la réduction
sale|les soldes
to buy (shopping)|acheter
to sell (shopping)|vendre
customer|le client
bag|le sac
wallet|le portefeuille
coin|la pièce
banknote|le billet
free (no cost)|gratuit
how much does it cost?|combien ça coûte ?
change (money back)|la monnaie
to cost|coûter`,
  },
  {
    id: "fra1p15",
    title: "At the Restaurant",
    subtitle: "Ordering food in French",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Restaurant vocabulary and useful phrases.",
    data: `menu|le menu
waiter (in a restaurant)|le serveur
waitress|la serveuse
table (restaurant)|la table
reservation|la réservation
starter|l'entrée
main course|le plat principal
dessert|le dessert
the bill|l'addition
tip|le pourboire
fork|la fourchette
knife|le couteau
spoon|la cuillère
plate|l'assiette
glass|le verre
napkin|la serviette
to order|commander
delicious|délicieux
I'm hungry|j'ai faim
I'm thirsty|j'ai soif
the check please|l'addition, s'il vous plaît
a table for two|une table pour deux
enjoy your meal|bon appétit
vegetarian|végétarien
allergy|l'allergie`,
  },
  {
    id: "fra1p16",
    title: "Classroom Objects",
    subtitle: "School vocabulary",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Everyday classroom and school vocabulary.",
    data: `book|le livre
pen|le stylo
pencil|le crayon
notebook|le cahier
eraser|la gomme
ruler|la règle
desk|le bureau
chair (classroom)|la chaise
board|le tableau
chalk|la craie
school bag|le sac
paper|le papier
scissors|les ciseaux
glue|la colle
calculator|la calculatrice
dictionary|le dictionnaire
map|la carte
clock|l'horloge
classroom|la salle de classe
homework|les devoirs
exam|l'examen
question|la question
answer|la réponse
lesson|la leçon
schedule|l'emploi du temps`,
  },
  {
    id: "fra1p17",
    title: "Technology & Devices",
    subtitle: "Everyday tech vocabulary",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common technology and device vocabulary.",
    data: `computer|l'ordinateur
phone|le téléphone
smartphone|le smartphone
screen|l'écran
keyboard|le clavier
mouse (device)|la souris
internet|internet
email|le courriel
password|le mot de passe
application|l'application
website|le site web
camera|l'appareil photo
battery|la batterie
charger|le chargeur
headphones|les écouteurs
printer|l'imprimante
tablet|la tablette
television|la télévision
remote control|la télécommande
wifi|le wifi
message|le message
phone call|l'appel
to download|télécharger
to send|envoyer
to save (a file)|enregistrer`,
  },
  {
    id: "fra1p18",
    title: "Hobbies & Free Time",
    subtitle: "Talking about what you like doing",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common hobbies and leisure vocabulary.",
    data: `to read (for pleasure)|lire
to draw|dessiner
to paint|peindre
to sing|chanter
to dance|danser
to travel|voyager
to cook (a meal)|cuisiner
to fish|pêcher
to garden|jardiner
to sew|coudre
photography|la photographie
music|la musique
cinema|le cinéma
theater|le théâtre
video game|le jeu vidéo
board game|le jeu de société
to collect|collectionner
to knit|tricoter
hiking|la randonnée
camping|le camping
chess|les échecs
puzzle|le puzzle
free time|le temps libre
hobby|le passe-temps
weekend|le week-end`,
  },
  {
    id: "fra1p19",
    title: "Feelings & Emotions",
    subtitle: "Describing how you feel",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common feelings and emotions.",
    data: `happy|heureux
sad|triste
angry|en colère
tired|fatigué
excited|enthousiaste
afraid|effrayé
surprised|surpris
bored|ennuyé
nervous|nerveux
calm|calme
worried|inquiet
proud|fier
jealous|jaloux
confused|confus
embarrassed|gêné
relaxed|détendu
disappointed|déçu
grateful|reconnaissant
lonely|seul
confident|confiant
curious|curieux
frustrated|frustré
hopeful|plein d'espoir
in love|amoureux
comfortable|à l'aise`,
  },
  {
    id: "fra1p20",
    title: "Transportation",
    subtitle: "Getting around",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Transport and travel vocabulary.",
    data: `car|la voiture
bus|le bus
train|le train
plane|l'avion
bicycle|le vélo
motorcycle|la moto
boat|le bateau
taxi|le taxi
subway|le métro
tram|le tramway
truck|le camion
ticket|le billet
station|la gare
airport|l'aéroport
platform|le quai
driver (of a vehicle)|le conducteur
passenger|le passager
to drive|conduire
to fly|voler
to travel (on a trip)|voyager
road|la route
traffic|la circulation
traffic light|le feu
parking|le stationnement
speed|la vitesse`,
  },
];

const A2: Pack[] = [
  {
    id: "fra2p1",
    title: "Common Verbs (je form)",
    subtitle: "Present tense, first person",
    kind: "cloze",
    note: 'Present-tense "je" conjugation of common verbs.',
    data: `Je ___ (parler) français.|parle
Je ___ (manger) une pomme.|mange
Je ___ (avoir) un chat.|ai
Je ___ (être) fatigué.|suis
Je ___ (aller) au marché.|vais
Je ___ (faire) mes devoirs.|fais
Je ___ (vouloir) un café.|veux
Je ___ (pouvoir) t'aider.|peux
Je ___ (savoir) la réponse.|sais
Je ___ (prendre) le bus.|prends
Je ___ (voir) la mer.|vois
Je ___ (venir) demain.|viens
Je ___ (dire) la vérité.|dis
Je ___ (finir) mon travail.|finis
Je ___ (dormir) huit heures.|dors
Je ___ (boire) de l'eau.|bois
Je ___ (lire) un livre.|lis
Je ___ (écrire) une lettre.|écris
Je ___ (partir) à midi.|pars
Je ___ (mettre) la table.|mets
Je ___ (attendre) le train.|attends
Je ___ (vendre) ma voiture.|vends
Je ___ (choisir) le rouge.|choisis
Je ___ (comprendre) la question.|comprends
Je ___ (connaître) Paris.|connais`,
  },
  {
    id: "fra2p2",
    title: "Food & Drink",
    subtitle: "Ordering and shopping for food",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Everyday food and drink vocabulary.",
    data: `bread|le pain
cheese|le fromage
water|l'eau
wine|le vin
coffee|le café
tea|le thé
milk|le lait
egg|l'œuf
butter|le beurre
sugar|le sucre
salt|le sel
meat|la viande
chicken|le poulet
fish (to eat)|le poisson
vegetable|le légume
fruit|le fruit
apple|la pomme
orange|l'orange
banana|la banane
potato|la pomme de terre
rice|le riz
soup|la soupe
cake|le gâteau
juice|le jus
breakfast|le petit-déjeuner`,
  },
  {
    id: "fra2p3",
    title: "Directions & Places",
    subtitle: "Finding your way in French",
    kind: "cloze",
    note: "Everyday vocabulary for asking and giving directions.",
    data: `Tournez à ___ au feu.|droite
Tournez à ___ après la banque.|gauche
Continuez tout ___ jusqu'au bout.|droit
Le café est en ___ de la poste.|face
L'hôtel est tout ___ d'ici.|près
La plage est très ___ d'ici.|loin
Excusez-moi, où est la ___ ?|gare
L'___ de bus est au coin de la rue.|arrêt
La pharmacie est à ___ de la boulangerie.|côté
Le musée est ___ l'église.|derrière
Le parc est juste ___ la mairie.|devant
Traversez la ___ prudemment.|rue
Au ___, tournez à gauche.|carrefour
Attendez que le ___ passe au vert.|feu
Traversez le ___ pour arriver au centre-ville.|pont
Prenez la deuxième sortie au ___.|rond-point
La ___ principale est très animée le samedi.|place
L'___ du bâtiment est fermée.|entrée
Utilisez la ___ de secours en cas d'urgence.|sortie
Le magasin est juste au ___ de la rue.|coin
Regarde la ___ pour trouver le chemin.|carte
Je suis complètement ___ dans cette ville.|perdu
Quelle est votre ___ exacte ?|adresse
J'habite dans un ___ très calme.|quartier
Dans quelle ___ dois-je aller ?|direction`,
  },
  {
    id: "fra2p4",
    title: "Weather & Seasons",
    subtitle: "Talking about the weather",
    kind: "cloze",
    note: "Everyday weather vocabulary and expressions.",
    data: `Il fait beau ___.|aujourd'hui
Il pleut souvent en ___.|automne
Il fait très ___ en été.|chaud
Il fait ___ en hiver.|froid
Le ciel est ___ aujourd'hui.|nuageux
Il y a du ___ ce matin.|vent
Il neige beaucoup en ___.|hiver
Le ___ annonce de la pluie demain.|bulletin
Il fait un temps ___ aujourd'hui.|magnifique
La température est de vingt ___.|degrés
Il y a du ___ sur la route.|brouillard
Prends un parapluie, il va ___.|pleuvoir
Le soleil ___ tôt en été.|se lève
Il fait un ___ épouvantable dehors.|temps
Le ciel est ___ ce soir.|dégagé
Il y a eu un orage avec des ___.|éclairs
La météo prévoit une ___ de chaleur.|vague
En automne, les feuilles ___.|tombent
Le vent souffle très ___ aujourd'hui.|fort
Il fait un froid ___ ce matin.|glacial
Le ciel est couvert de ___.|nuages
Il fait doux pour un jour de ___.|printemps
La pluie a duré toute la ___.|journée
Il gèle souvent en ___.|janvier
Le climat ici est très ___.|humide`,
  },
  {
    id: "fra2p5",
    title: "Opposites",
    subtitle: "Common adjective pairs",
    kind: "pair",
    prompt: 'The opposite of "%s" in French is…',
    note: "Common adjective opposites.",
    data: `grand|petit
chaud|froid
rapide|lent
facile|difficile
propre|sale
plein|vide
riche|pauvre
jeune|vieux
fort|faible
heureux|triste
beau|laid
ouvert|fermé
haut|bas
long|court
cher|bon marché
lourd|léger
dur|mou
clair|foncé
calme|bruyant
gentil|méchant
poli|impoli
gros|mince
sec|mouillé
tôt|tard
neuf|usé`,
  },
  {
    id: "fra2p6",
    title: "Reflexive Verbs & Daily Routine",
    subtitle: "Talking about your day",
    kind: "cloze",
    note: "Present-tense reflexive verbs for daily routines.",
    data: `Je ___ (se réveiller) à sept heures.|me réveille
Tu ___ (se lever) tôt le matin.|te lèves
Il ___ (se laver) avant le petit-déjeuner.|se lave
Nous ___ (s'habiller) rapidement.|nous habillons
Vous ___ (se brosser) les dents.|vous brossez
Elles ___ (se coiffer) devant le miroir.|se coiffent
Je ___ (se doucher) le matin.|me douche
Tu ___ (se raser) tous les jours.|te rases
Il ___ (se reposer) après le travail.|se repose
Nous ___ (se promener) dans le parc.|nous promenons
Vous ___ (se dépêcher) pour ne pas être en retard.|vous dépêchez
Elles ___ (se coucher) tard le week-end.|se couchent
Je ___ (s'habituer) à ce nouveau travail.|m'habitue
Tu ___ (se souvenir) de son nom ?|te souviens
Il ___ (s'appeler) Marc.|s'appelle
Nous ___ (s'ennuyer) sans internet.|nous ennuyons
Vous ___ (se sentir) mieux aujourd'hui ?|vous sentez
Elles ___ (se disputer) souvent.|se disputent
Je ___ (s'occuper) de mon petit frère.|m'occupe
Tu ___ (se maquiller) avant de sortir.|te maquilles
Il ___ (se plaindre) tout le temps.|se plaint
Nous ___ (s'amuser) beaucoup ce soir.|nous amusons
Vous ___ (s'inquiéter) pour rien.|vous inquiétez
Elles ___ (s'endormir) devant la télé.|s'endorment
Je ___ (se détendre) le dimanche.|me détends`,
  },
  {
    id: "fra2p7",
    title: "Aller + Infinitive (Near Future)",
    subtitle: "Talking about what's about to happen",
    kind: "cloze",
    note: "Futur proche: aller + infinitive.",
    data: `Je ___ (aller) manger bientôt.|vais
Tu ___ (aller) partir demain.|vas
Il ___ (aller) étudier ce soir.|va
Nous ___ (aller) voyager cet été.|allons
Vous ___ (aller) arriver à quelle heure ?|allez
Elles ___ (aller) venir demain.|vont
Je ___ (aller) acheter du pain.|vais
Tu ___ (aller) regarder ce film.|vas
Il ___ (aller) finir son travail.|va
Nous ___ (aller) déjeuner ensemble.|allons
Vous ___ (aller) prendre le train ?|allez
Elles ___ (aller) rester chez elles.|vont
Je ___ (aller) appeler mon ami.|vais
Tu ___ (aller) faire les courses.|vas
Il ___ (aller) dormir tôt ce soir.|va
Nous ___ (aller) visiter le musée.|allons
Vous ___ (aller) commencer bientôt ?|allez
Elles ___ (aller) chanter au concert.|vont
Je ___ (aller) écrire une lettre.|vais
Tu ___ (aller) lire ce livre.|vas
Il ___ (aller) jouer au foot.|va
Nous ___ (aller) sortir ce soir.|allons
Vous ___ (aller) répondre au message ?|allez
Elles ___ (aller) apprendre le français.|vont
Je ___ (aller) essayer une nouvelle recette.|vais`,
  },
  {
    id: "fra2p8",
    title: "Health & the Body",
    subtitle: "At the doctor's",
    kind: "cloze",
    note: "Health, symptoms, and visiting the doctor.",
    data: `J'ai mal à la ___.|tête
J'ai mal au ___.|ventre
Le médecin m'a donné une ___.|ordonnance
Je dois prendre ce ___ trois fois par jour.|médicament
J'ai de la ___ depuis hier.|fièvre
Elle a un gros ___.|rhume
Il tousse et a mal à la ___.|gorge
Le docteur va m'___.|ausculter
J'ai pris rendez-vous chez le ___.|dentiste
L'infirmière m'a fait une ___.|piqûre
Il s'est cassé le ___.|bras
Elle s'est fait mal au ___.|dos
J'ai besoin d'un ___ pour la douleur.|antidouleur
Le patient attend dans la salle d'___.|attente
Je me sens ___ aujourd'hui.|malade
Il faut que tu ailles voir un ___.|spécialiste
L'assurance ___ couvre les frais médicaux.|maladie
Elle a pris sa ___ ce matin.|température
Il a une allergie aux ___.|cacahuètes
J'ai besoin de ___ après cette opération.|repos
Le pharmacien m'a conseillé ce ___.|sirop
J'ai des douleurs dans les ___.|articulations
Elle doit porter des ___ pour voir clair.|lunettes
Le médecin a recommandé plus d'___.|exercice
Il faut se reposer pour guérir plus ___.|vite`,
  },
  {
    id: "fra2p9",
    title: "Shopping for Clothes",
    subtitle: "Trying things on",
    kind: "cloze",
    note: "Shopping for clothes and asking for sizes.",
    data: `Je cherche une ___ de ma taille.|robe
Cette chemise est trop ___ pour moi.|grande
Avez-vous cette veste en taille ___ ?|moyenne
Je voudrais ___ ce pantalon.|essayer
La cabine d'___ est là-bas.|essayage
Ce pull est en ___.|solde
Quelle est votre ___ de chaussures ?|pointure
Ces chaussures sont trop ___.|petites
Je préfère la couleur ___.|bleue
Ce tissu est très ___.|doux
Avez-vous la même chose en ___ ?|noir
Cette jupe me va très ___.|bien
Le vendeur m'a donné une ___.|réduction
Je vais ___ cette écharpe.|acheter
Ce manteau est parfait pour l'___.|hiver
Puis-je ___ un remboursement ?|obtenir
Le magasin ferme à quelle ___ ?|heure
J'aime beaucoup ce ___ de robe.|style
Cette matière est cent pour cent ___.|coton
Le prix affiché est-il ___ ?|final
Je porte généralement du ___.|noir
Cette taille ne me va pas, avez-vous plus ___ ?|grand
Le rayon femme est au premier ___.|étage
Je voudrais échanger cet ___.|article
Les soldes commencent la semaine ___.|prochaine`,
  },
  {
    id: "fra2p10",
    title: "Making Plans & Invitations",
    subtitle: "Arranging to meet up",
    kind: "cloze",
    note: "Making plans, invitations, and arrangements.",
    data: `Tu es ___ ce soir ?|libre
On se ___ à quelle heure ?|voit
Je t'___ à dîner vendredi.|invite
Ça te ___ d'aller au cinéma ?|dit
On pourrait se ___ au café.|retrouver
J'aimerais t'___ à ma fête.|inviter
Est-ce que tu es ___ samedi ?|disponible
On se retrouve devant le ___.|cinéma
Je propose qu'on se voie ___.|demain
Malheureusement, je ne peux pas ___.|venir
Je dois ___ mes plans.|annuler
On remet ça à ___ ?|plus tard
Ça marche pour ___ ?|toi
D'accord, à ___ !|bientôt
Je confirme notre ___ de demain.|rendez-vous
Peux-tu ___ l'heure ?|confirmer
On se donne ___ à midi.|rendez-vous
J'ai déjà quelque chose de ___.|prévu
Avec ___, je viendrai volontiers.|plaisir
Je te ___ un message plus tard.|enverrai
On peut se voir un autre ___ ?|jour
Je suis ___ toute la semaine.|occupé
Est-ce que ça te va comme ___ ?|horaire
On se retrouve à la ___ du métro.|sortie
Merci pour l'___ !|invitation`,
  },
  {
    id: "fra2p11",
    title: "At the Bank & Post Office",
    subtitle: "Everyday errands",
    kind: "cloze",
    note: "Banking and postal errands.",
    data: `Je voudrais ouvrir un ___ bancaire.|compte
Je dois ___ de l'argent.|retirer
Le ___ automatique est en panne.|distributeur
J'aimerais ___ un chèque.|encaisser
Quel est le ___ de mon compte ?|solde
Je voudrais ___ cette lettre.|envoyer
Combien coûte un ___ pour l'international ?|timbre
Je voudrais envoyer ce ___ en recommandé.|colis
Où est la ___ la plus proche ?|poste
J'ai besoin d'une nouvelle carte ___.|bancaire
Le ___ d'intérêt a augmenté.|taux
Je voudrais faire un ___ bancaire.|virement
Ma carte a été ___.|bloquée
Il faut remplir ce ___.|formulaire
Le guichet ___ à dix-sept heures.|ferme
J'ai oublié mon code ___.|secret
Je voudrais ___ un prêt.|demander
Combien de temps prend la ___ ?|livraison
Le facteur passe tous les ___.|matins
J'ai reçu un ___ ce matin.|colis
Il faut signer ce ___.|document
Je voudrais changer de la ___ étrangère.|monnaie
Ma carte de crédit a été ___.|refusée
J'ai perdu mon ___ d'identité.|carte
Le conseiller bancaire m'a bien ___.|conseillé`,
  },
  {
    id: "fra2p12",
    title: "Household Chores",
    subtitle: "Cleaning and tidying up",
    kind: "cloze",
    note: "Everyday household chores.",
    data: `Je dois ___ la vaisselle.|faire
Il faut ___ le sol.|balayer
Elle va ___ les vitres.|laver
Nous devons ___ la poubelle.|sortir
Tu peux ___ ton lit ?|faire
Je vais ___ l'aspirateur.|passer
Il faut ___ le linge.|laver
Elle doit ___ les vêtements.|repasser
Nous allons ___ la cuisine.|nettoyer
Peux-tu ___ la table ?|débarrasser
Je dois ___ les courses.|ranger
Il faut ___ les meubles.|dépoussiérer
Elle va ___ le jardin.|arroser
Nous devons ___ la salle de bain.|nettoyer
Tu peux ___ les draps ?|changer
Je vais ___ le linge sale.|trier
Il faut ___ la vaisselle propre.|ranger
Elle doit ___ le frigo.|nettoyer
Nous allons ___ les plantes.|arroser
Peux-tu ___ le chat ?|nourrir
Je dois ___ mes affaires.|ranger
Il faut ___ la lessive.|faire
Elle va ___ les toilettes.|nettoyer
Nous devons ___ le tapis.|aspirer
Tu peux m'aider à ___ le ménage ?|faire`,
  },
  {
    id: "fra2p13",
    title: "Prepositions of Time",
    subtitle: "Talking about when things happen",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common prepositions used to talk about time.",
    data: `before|avant
after|après
during|pendant
since|depuis
until|jusqu'à
for (a duration)|pendant
in (a month/year)|en
on (a day)|le
at (a time)|à
from…to|de…à
within|dans
ago|il y a
already|déjà
still|encore
not yet|pas encore
soon|bientôt
recently|récemment
lately|dernièrement
at the same time|en même temps
at first|d'abord
finally|enfin
meanwhile|pendant ce temps
throughout|tout au long de
by (a deadline)|avant
around (an approximate time)|vers`,
  },
  {
    id: "fra2p14",
    title: "Possessive Adjectives",
    subtitle: "Saying what belongs to whom",
    kind: "cloze",
    note: "Possessive adjectives agreeing with the noun they modify.",
    data: `C'est ___ livre (à moi).|mon
C'est ___ voiture (à moi).|ma
Ce sont ___ amis (à moi).|mes
C'est ___ sac (à toi).|ton
C'est ___ maison (à toi).|ta
Ce sont ___ enfants (à toi).|tes
C'est ___ téléphone (à lui/elle).|son
C'est ___ chambre (à lui/elle).|sa
Ce sont ___ affaires (à lui/elle).|ses
C'est ___ appartement (à nous).|notre
Ce sont ___ voisins (à nous).|nos
C'est ___ jardin (à vous).|votre
Ce sont ___ enfants (à vous).|vos
C'est ___ bureau (à eux/elles).|leur
Ce sont ___ voitures (à eux/elles).|leurs
J'ai perdu ___ clés.|mes
Elle adore ___ chat.|son
Nous aimons ___ ville.|notre
Ils ont vendu ___ maison.|leur
Tu as oublié ___ parapluie.|ton
Vous avez ___ propre bureau ?|votre
Il a rangé ___ chambre.|sa
Elles ont fini ___ devoirs.|leurs
J'adore passer du temps avec ___ famille.|ma
Nous invitons ___ amis ce soir.|nos`,
  },
  {
    id: "fra2p15",
    title: "Negation",
    subtitle: "Saying what isn't so",
    kind: "cloze",
    note: "Common negative structures beyond ne...pas.",
    data: `Je ne comprends ___.|pas
Il ne mange ___ de viande.|jamais
Elle ne travaille ___ ici.|plus
Nous ne voyons ___.|rien
Tu ne connais ___ ici.|personne
Il n'a ___ d'argent.|plus
Je n'ai ___ vu ce film.|jamais
Elle ne veut ___ sortir.|pas
Nous n'avons ___ le temps.|plus
Ils ne font ___ le week-end.|rien
Je ne vais ___ au cinéma.|jamais
Tu ne dis ___ la vérité.|pas
Il n'y a ___ dans la salle.|personne
Elle n'aime ___ le café.|pas
Nous ne mangeons ___ de sucre.|plus
Vous ne savez ___.|rien
Elles ne viennent ___ le lundi.|jamais
Je ne fais ___ de sport.|pas
Il n'a ___ compris.|rien
Nous n'irons ___ là-bas.|jamais
Tu n'as ___ raison.|pas
Elle ne mange ___.|rien
Ils n'ont ___ d'amis ici.|pas
Je ne bois ___ d'alcool.|jamais
Nous ne faisons ___ ça.|plus`,
  },
  {
    id: "fra2p16",
    title: "Question Formation",
    subtitle: "Est-ce que and inversion",
    kind: "cloze",
    note: "Forming questions with est-ce que and inversion.",
    data: `___-ce que tu aimes le café ?|Est
Est-ce ___ vous êtes prêts ?|que
Comment ___-vous ?|allez
Où ___-il ?|va
Que ___-vous faire ?|voulez
Quand ___-elle arriver ?|va
Pourquoi ___-tu triste ?|es
Qui ___-ce ?|est
Est-ce que tu ___ le film ?|as vu
Avez-___ compris ?|vous
Est-ce qu'il ___ ici ?|habite
Puis-___ vous aider ?|je
Voulez-___ un café ?|vous
Est-ce que nous ___ en retard ?|sommes
Sais-___ où il est ?|tu
Est-ce qu'elles ___ demain ?|viennent
Combien ___-ça ?|coûte
Quelle heure ___-il ?|est
Est-ce que je peux ___ maintenant ?|partir
Avez-vous ___ ce livre ?|lu
Est-ce que ça te ___ ?|plaît
Où ___-vous né ?|êtes
Que ___-t-il dit ?|a
Est-ce que tu ___ prêt ?|es
Aimez-___ voyager ?|vous`,
  },
  {
    id: "fra2p17",
    title: "Adverbs of Frequency",
    subtitle: "Saying how often",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Adverbs and expressions of frequency.",
    data: `always|toujours
usually|généralement
often|souvent
sometimes|parfois
occasionally|de temps en temps
rarely|rarement
never|jamais
every day|tous les jours
every week|toutes les semaines
every month|tous les mois
once|une fois
twice|deux fois
several times|plusieurs fois
from time to time|de temps à autre
constantly|constamment
regularly|régulièrement
frequently|fréquemment
seldom|peu souvent
every year|chaque année
daily|quotidiennement
weekly|chaque semaine
monthly|chaque mois
almost never|presque jamais
almost always|presque toujours
once a week|une fois par semaine`,
  },
  {
    id: "fra2p18",
    title: "Sports & Leisure Activities",
    subtitle: "Talking about sport",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common sports and leisure vocabulary.",
    data: `football|le football
basketball|le basketball
tennis|le tennis
swimming|la natation
running|la course
cycling|le cyclisme
skiing|le ski
golf|le golf
volleyball|le volleyball
boxing|la boxe
gymnastics|la gymnastique
yoga|le yoga
climbing|l'escalade
surfing|le surf
rugby|le rugby
handball|le handball
athletics|l'athlétisme
team|l'équipe
match|le match
coach|l'entraîneur
stadium|le stade
gym|la salle de sport
to train|s'entraîner
to win|gagner
to lose|perdre`,
  },
  {
    id: "fra2p19",
    title: "At Work / Office Vocabulary",
    subtitle: "Talking about your job",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Everyday office and workplace vocabulary.",
    data: `office|le bureau
meeting|la réunion
colleague (at work)|le collègue
boss|le patron
employee|l'employé
salary|le salaire
schedule (work hours)|l'horaire
deadline|la date limite
project|le projet
email (at work)|le courriel
report|le rapport
contract|le contrat
interview|l'entretien
resume/CV|le CV
promotion|la promotion
vacation|les vacances
break|la pause
task|la tâche
team (at work)|l'équipe
client|le client
presentation|la présentation
computer (at the office)|l'ordinateur
printer (at the office)|l'imprimante
to hire|embaucher
to resign|démissionner`,
  },
  {
    id: "fra2p20",
    title: "City & Public Transport",
    subtitle: "Getting around town",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "City and public-transport vocabulary.",
    data: `city|la ville
street|la rue
avenue|l'avenue
square|la place
bridge|le pont
building|le bâtiment
neighbourhood|le quartier
sidewalk|le trottoir
traffic light (in the city)|le feu
roundabout|le rond-point
bus stop|l'arrêt de bus
subway station|la station de métro
ticket machine|le distributeur de billets
map (street plan)|le plan
town hall|la mairie
park|le parc
library|la bibliothèque
church|l'église
market (marketplace)|le marché
suburb|la banlieue
downtown|le centre-ville
traffic jam|l'embouteillage
pedestrian|le piéton
crosswalk|le passage piéton
one-way street|le sens unique`,
  },
];

const B1: Pack[] = [
  {
    id: "frb1p1",
    title: "Passé Composé",
    subtitle: "Talking about the past",
    kind: "cloze",
    note: "Passé composé with both avoir and être auxiliaries.",
    data: `J'___ (manger) une pizza hier.|ai mangé
Tu ___ (regarder) un film.|as regardé
Il ___ (parler) avec son ami.|a parlé
Nous ___ (finir) le projet.|avons fini
Vous ___ (choisir) le menu.|avez choisi
Elles ___ (vendre) leur maison.|ont vendu
Hier, je ___ (aller) au marché.|suis allé
Tu ___ (venir) chez moi hier soir.|es venu
Il ___ (partir) tôt ce matin.|est parti
Nous ___ (arriver) en retard.|sommes arrivés
Elle ___ (naître) à Paris.|est née
Ils ___ (rester) à la maison.|sont restés
J'___ (avoir) une bonne idée.|ai eu
Tu ___ (être) malade la semaine dernière.|as été
Il ___ (faire) ses devoirs.|a fait
Nous ___ (voir) un bon film.|avons vu
Vous ___ (prendre) le train.|avez pris
Elles ___ (dire) la vérité.|ont dit
J'___ (écrire) une lettre.|ai écrit
Tu ___ (lire) ce livre ?|as lu
Il ___ (boire) trop de café.|a bu
Nous ___ (comprendre) la leçon.|avons compris
Vous ___ (mettre) la table.|avez mis
Elles ___ (descendre) les escaliers.|sont descendues
J'___ (perdre) mes clés.|ai perdu`,
  },
  {
    id: "frb1p2",
    title: "Adjectives & Descriptions",
    subtitle: "Describing people and things",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Common descriptive adjectives (masculine form).",
    data: `happy (satisfied)|content
sad (feeling)|triste
tall|grand
short|petit
beautiful (feminine)|belle
ugly|laid
young|jeune
old|vieux
strong|fort
weak|faible
intelligent|intelligent
funny|drôle
serious|sérieux
kind (feminine)|gentille
generous|généreux
shy|timide
brave|courageux
lazy|paresseux
hardworking|travailleur
rich|riche
poor|pauvre
easy|facile
difficult|difficile
interesting|intéressant
boring|ennuyeux`,
  },
  {
    id: "frb1p3",
    title: "Travel Phrases",
    subtitle: "Getting around abroad in French",
    kind: "cloze",
    note: "Everyday travel vocabulary for airports, trains, and hotels.",
    data: `Je voudrais ___ un billet, s'il vous plaît.|réserver
Où est la salle d'___ ?|attente
Le vol est ___ de deux heures.|retardé
J'ai perdu mon ___.|passeport
Avez-vous une chambre ___ disponible ?|libre
Combien coûte un ___ pour Paris ?|billet
Le train part du ___ numéro trois.|quai
J'ai besoin d'un ___ pour recharger mon téléphone.|adaptateur
La ___ est-elle incluse dans le prix ?|taxe
Pouvez-vous appeler un ___ ?|taxi
Nous devons ___ avant le vol.|embarquer
Le ___ a trente minutes de retard.|bus
J'ai oublié ma carte d'___.|identité
Où puis-je changer de la ___ ?|monnaie
Le ___ de bagages est là-bas.|dépôt
Avez-vous une carte de la ___ ?|région
Je voudrais un siège côté ___.|fenêtre
Le personnel de bord nous a donné des ___.|instructions
Nous avons raté notre ___.|correspondance
L'hôtel offre un ___ gratuit.|petit-déjeuner
Le ___ est à dix minutes à pied.|centre-ville
Avez-vous besoin d'un ___ pour ce pays ?|visa
Notre vol a été ___ à cause de la météo.|annulé
Le douanier a vérifié mes ___.|bagages
Je cherche l'___ principale de l'aéroport.|entrée`,
  },
  {
    id: "frb1p4",
    title: "Futur Simple",
    subtitle: "Talking about the future",
    kind: "cloze",
    note: "Futur simple conjugation of common verbs.",
    data: `Demain, je ___ (parler) à mon patron.|parlerai
Tu ___ (finir) tes devoirs ce soir.|finiras
Il ___ (partir) en vacances la semaine prochaine.|partira
Nous ___ (voyager) en France l'année prochaine.|voyagerons
Vous ___ (arriver) à quelle heure ?|arriverez
Elles ___ (venir) nous voir demain.|viendront
Je ___ (être) en retard, je pense.|serai
Tu ___ (avoir) trente ans cette année.|auras
Il ___ (faire) beau ce week-end.|fera
Nous ___ (aller) au cinéma vendredi.|irons
Vous ___ (pouvoir) m'aider demain ?|pourrez
Elles ___ (vouloir) sûrement venir.|voudront
Je ___ (savoir) la réponse bientôt.|saurai
Tu ___ (voir) le résultat demain.|verras
Il ___ (envoyer) le colis lundi.|enverra
Nous ___ (devoir) partir tôt.|devrons
Vous ___ (recevoir) la lettre bientôt.|recevrez
Elles ___ (tenir) leur promesse.|tiendront
Je ___ (courir) le marathon en mai.|courrai
Tu ___ (mourir) de rire en voyant ça.|mourras
Il ___ (venir) nous rendre visite bientôt.|viendra
Nous ___ (finir) le projet à temps.|finirons
Vous ___ (choisir) un nouveau modèle.|choisirez
Elles ___ (réussir) leur examen.|réussiront
Je ___ (acheter) une nouvelle voiture bientôt.|achèterai`,
  },
  {
    id: "frb1p5",
    title: "Imparfait",
    subtitle: "Describing the past",
    kind: "cloze",
    note: "Imperfect tense for past habits and descriptions.",
    data: `Quand j'étais petit, je ___ (jouer) souvent dehors.|jouais
Tu ___ (habiter) à Paris avant, non ?|habitais
Il ___ (être) très timide à l'école.|était
Nous ___ (avoir) un chien quand nous étions jeunes.|avions
Vous ___ (aller) souvent à la plage en été.|alliez
Elles ___ (manger) toujours ensemble le dimanche.|mangeaient
Je ___ (faire) du vélo tous les jours.|faisais
Tu ___ (venir) nous voir chaque été.|venais
Il ___ (parler) très doucement.|parlait
Nous ___ (finir) toujours nos devoirs avant le dîner.|finissions
Vous ___ (savoir) déjà nager à cet âge.|saviez
Elles ___ (vouloir) toujours sortir le soir.|voulaient
Quand il pleuvait, nous ___ (rester) à la maison.|restions
Autrefois, elle ___ (chanter) dans une chorale.|chantait
Il ___ (croire) encore au père Noël à six ans.|croyait
Nous ___ (vivre) à la campagne à cette époque.|vivions
Tu ___ (lire) beaucoup quand tu étais jeune.|lisais
Elles ___ (dormir) toujours tard le week-end.|dormaient
Je ___ (prendre) le bus tous les matins.|prenais
Il ___ (écrire) des lettres à ses amis.|écrivait
Vous ___ (boire) du lait chaud avant de dormir.|buviez
Nous ___ (attendre) le bus ensemble chaque jour.|attendions
Elle ___ (rire) beaucoup à cette époque.|riait
Ils ___ (connaître) bien le quartier.|connaissaient
La vie ___ (sembler) plus simple à cette époque.|semblait`,
  },
  {
    id: "frb1p6",
    title: "Conditionnel Présent",
    subtitle: "Being polite and hypothetical",
    kind: "cloze",
    note: "Present conditional for polite requests and hypotheticals.",
    data: `Je ___ (vouloir) un café, s'il vous plaît.|voudrais
Tu ___ (aimer) venir avec nous ?|aimerais
Il ___ (pouvoir) nous aider.|pourrait
Nous ___ (devoir) partir maintenant.|devrions
Vous ___ (savoir) où il est ?|sauriez
Elles ___ (venir) si elles pouvaient.|viendraient
Je ___ (prendre) bien un dessert.|prendrais
Tu ___ (faire) quoi à ma place ?|ferais
Il ___ (être) content de te voir.|serait
Nous ___ (avoir) besoin d'aide.|aurions
Vous ___ (pouvoir) répéter, s'il vous plaît ?|pourriez
Elles ___ (vouloir) partir tôt.|voudraient
Je ___ (aller) bien si j'avais le temps.|irais
Tu ___ (dire) la même chose ?|dirais
Il ___ (voir) les choses différemment.|verrait
Nous ___ (venir) volontiers.|viendrions
Vous ___ (aimer) essayer ce plat ?|aimeriez
Elles ___ (savoir) quoi faire.|sauraient
Je ___ (préférer) rester ici.|préférerais
Tu ___ (devoir) te reposer.|devrais
Il ___ (falloir) partir bientôt.|faudrait
Nous ___ (souhaiter) vous remercier.|souhaiterions
Vous ___ (être) intéressé par ce poste ?|seriez
Elles ___ (adorer) visiter Paris.|adoreraient
Je ___ (boire) volontiers un thé.|boirais`,
  },
  {
    id: "frb1p7",
    title: "Relative Pronouns",
    subtitle: "Qui, que, où, dont",
    kind: "cloze",
    note: "Relative pronouns linking two ideas into one sentence.",
    data: `Voici la femme ___ habite à côté.|qui
C'est le livre ___ je lis en ce moment.|que
C'est la ville ___ je suis né.|où
Voici l'homme ___ je t'ai parlé.|dont
La personne ___ m'a aidé est partie.|qui
Le film ___ nous avons vu était génial.|que
C'est le jour ___ tout a changé.|où
C'est le sujet ___ elle a peur.|dont
Le chien ___ aboie appartient au voisin.|qui
La voiture ___ il a achetée est rouge.|qu'
C'est la raison pour ___ il est parti.|laquelle
Voici les amis ___ je passe mes vacances.|avec qui
C'est le restaurant ___ nous avons dîné.|où
Le livre ___ la couverture est bleue est à moi.|dont
La fille ___ chante est ma sœur.|qui
Les vacances ___ nous rêvons approchent.|dont
C'est quelque chose ___ je ne comprends pas.|que
Le quartier ___ j'habite est calme.|où
La personne à ___ j'ai parlé était gentille.|qui
C'est un projet ___ nous sommes fiers.|dont
Voilà la maison ___ appartient à mes grands-parents.|qui
Le sac ___ tu cherches est sous la table.|que
C'est l'année ___ nous nous sommes rencontrés.|où
Le collègue ___ le bureau est là-bas m'a aidé.|dont
C'est une histoire ___ je me souviens bien.|dont`,
  },
  {
    id: "frb1p8",
    title: "Object Pronouns",
    subtitle: "Le, la, les, lui, leur",
    kind: "cloze",
    note: "Direct and indirect object pronouns.",
    data: `Je ___ vois tous les jours (mon frère).|le
Je ___ vois tous les jours (ma sœur).|la
Je ___ vois chaque jour (mes amis).|les
Il ___ parle souvent (à moi).|me
Il ___ parle souvent (à toi).|te
Il ___ parle souvent (à son collègue).|lui
Il ___ parle souvent (à ma sœur et moi).|nous
Il ___ parle souvent (à eux/elles).|leur
Je ___ aime beaucoup (ce livre).|l'
Je ___ ai vu hier (mes parents).|les
Tu ___ as dit la vérité (à moi) ?|m'
Nous ___ avons offert un cadeau (à elle).|lui
Vous ___ avez appelé (ma sœur et moi) hier.|nous
Elle ___ a envoyé une lettre (à eux).|leur
Je vais ___ acheter (ce pull).|l'
Il va ___ inviter (ses amis).|les
Peux-tu ___ aider (moi) ?|m'
Je ___ ai donné mon numéro (à toi).|t'
Elle ___ a présenté son projet (à mes collègues et moi).|nous
Ils ___ ont remercié (moi) chaleureusement.|m'
Je ___ trouve intéressant (ce sujet).|le
Nous ___ avons rencontrée hier (elle).|l'
Vous ___ avez écrit (à eux) ?|leur
Il ___ a expliqué la situation (à elle).|lui
Je ne ___ connais pas (cet homme).|le`,
  },
  {
    id: "frb1p9",
    title: "Y and En",
    subtitle: "Two small but essential pronouns",
    kind: "cloze",
    note: "The pronouns y (place/idea) and en (quantity/of it).",
    data: `Tu vas à Paris ? Oui, j'___ vais demain.|y
Il pense à son avenir ? Oui, il ___ pense souvent.|y
Elle a des enfants ? Oui, elle ___ a deux.|en
Tu veux du café ? Oui, j'___ veux bien.|en
Vous allez à la fête ? Oui, nous ___ allons.|y
Il parle de son travail ? Oui, il ___ parle beaucoup.|en
Tu crois à cette histoire ? Oui, j'___ crois.|y
Elle a besoin d'aide ? Oui, elle ___ a besoin.|en
Nous répondons à la question ? Oui, nous ___ répondons.|y
Ils ont peur des araignées ? Oui, ils ___ ont peur.|en
Tu penses souvent à elle ? Oui, j'___ pense souvent.|y
Vous voulez des fruits ? Oui, nous ___ voulons.|en
Il habite à Lyon ? Oui, il ___ habite.|y
Elle revient de vacances ? Oui, elle ___ revient.|en
Nous nous intéressons à l'art ? Oui, nous ___ intéressons.|y
Tu as combien de livres ? J'___ ai dix.|en
Il va souvent au cinéma ? Oui, il ___ va souvent.|y
Vous avez assez de temps ? Oui, nous ___ avons assez.|en
Elle s'habitue à sa nouvelle vie ? Oui, elle ___ habitue.|s'y
Tu te souviens de ce jour ? Oui, je m'___ souviens.|en
Il tient à son travail ? Oui, il ___ tient beaucoup.|y
Nous avons besoin de conseils ? Oui, nous ___ avons besoin.|en
Elle réfléchit à la question ? Oui, elle ___ réfléchit.|y
Tu manges des légumes ? Oui, j'___ mange tous les jours.|en
Il croit encore au succès ? Oui, il ___ croit toujours.|y`,
  },
  {
    id: "frb1p10",
    title: "Environment & Nature",
    subtitle: "Talking about the natural world",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Nature and environment vocabulary.",
    data: `nature|la nature
forest|la forêt
mountain|la montagne
river|la rivière
lake|le lac
sea|la mer
ocean|l'océan
sky|le ciel
sun|le soleil
moon|la lune
star|l'étoile
tree|l'arbre
flower|la fleur
grass|l'herbe
stone|la pierre
sand|le sable
earth|la terre
air|l'air
pollution|la pollution
recycling|le recyclage
environment|l'environnement
climate|le climat
energy|l'énergie
renewable|renouvelable
sustainable|durable`,
  },
  {
    id: "frb1p11",
    title: "Technology & the Internet",
    subtitle: "Talking about being online",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Internet and computing vocabulary.",
    data: `network|le réseau
connection|la connexion
software|le logiciel
hardware|le matériel
file|le fichier
folder|le dossier
data|les données
cloud (storage)|le nuage
server|le serveur
browser|le navigateur
search engine|le moteur de recherche
social media|les réseaux sociaux
account|le compte
profile|le profil
update|la mise à jour
notification|la notification
link|le lien
attachment|la pièce jointe
computer virus|le virus
security|la sécurité
backup|la sauvegarde
device|l'appareil
screen (display)|l'écran
app|l'application
setting|le paramètre`,
  },
  {
    id: "frb1p12",
    title: "Emotions & Feelings, In Depth",
    subtitle: "Describing subtler feelings",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "More nuanced emotion vocabulary.",
    data: `relief|le soulagement
gratitude|la gratitude
regret|le regret
hope|l'espoir
despair|le désespoir
enthusiasm|l'enthousiasme
anxiety|l'anxiété
satisfaction|la satisfaction
disappointment|la déception
pride|la fierté
shame|la honte
guilt|la culpabilité
compassion|la compassion
envy|l'envie
admiration|l'admiration
trust|la confiance
doubt|le doute
courage|le courage
patience|la patience
tenderness|la tendresse
nostalgia|la nostalgie
serenity|la sérénité
irritation|l'irritation
melancholy|la mélancolie
contentment|le contentement`,
  },
  {
    id: "frb1p13",
    title: "Media & News",
    subtitle: "Talking about the press",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Media and journalism vocabulary.",
    data: `news|les nouvelles
newspaper|le journal
magazine|le magazine
article|l'article
journalist (media)|le journaliste
headline|le titre
report (news)|le reportage
interview (media)|l'interview
broadcast|la diffusion
channel|la chaîne
radio|la radio
podcast|le podcast
advertisement|la publicité
subscription|l'abonnement
audience|le public
editor|le rédacteur
press|la presse
breaking news|les dernières nouvelles
opinion|l'opinion
censorship|la censure
freedom of speech|la liberté d'expression
source|la source
rumor|la rumeur
headline story|le gros titre
live broadcast|le direct`,
  },
  {
    id: "frb1p14",
    title: "Education System",
    subtitle: "Talking about school and university",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Education vocabulary from school to university.",
    data: `school|l'école
high school|le lycée
university|l'université
degree|le diplôme
course|le cours
subject|la matière
grade|la note
exam (education system)|l'examen
homework (education system)|les devoirs
teacher (in the education system)|l'enseignant
student (university)|l'étudiant
classroom (education system)|la salle de classe
scholarship|la bourse
curriculum|le programme
semester|le semestre
lecture|le cours magistral
tuition|les frais de scolarité
graduation|la remise des diplômes
library (education system)|la bibliothèque
research|la recherche
thesis|la thèse
literacy|l'alphabétisation
kindergarten|la maternelle
principal|le directeur
report card|le bulletin`,
  },
  {
    id: "frb1p15",
    title: "Health & Wellness",
    subtitle: "Talking about staying healthy",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Health and wellness vocabulary.",
    data: `health|la santé
wellness|le bien-être
exercise|l'exercice
diet|le régime
sleep|le sommeil
stress|le stress
relaxation|la relaxation
nutrition|la nutrition
vitamin|la vitamine
immune system|le système immunitaire
mental health|la santé mentale
therapy|la thérapie
meditation|la méditation
fitness|la forme physique
balanced diet|une alimentation équilibrée
hydration|l'hydratation
recovery|la guérison
prevention|la prévention
checkup|le bilan de santé
symptom|le symptôme
treatment|le traitement
vaccine|le vaccin
addiction|la dépendance
habit|l'habitude
lifestyle|le mode de vie`,
  },
  {
    id: "frb1p16",
    title: "Housing & Renting",
    subtitle: "Finding a place to live",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Renting and housing vocabulary.",
    data: `rent|le loyer
lease|le bail
landlord|le propriétaire
tenant|le locataire
deposit|la caution
utilities|les charges
furnished|meublé
unfurnished|non meublé
studio apartment|le studio
roommate|le colocataire
to move (relocate)|déménager
neighbourhood (housing)|le quartier
real estate agency|l'agence immobilière
mortgage|le prêt immobilier
insurance|l'assurance
maintenance|l'entretien
renovation|la rénovation
balcony|le balcon
elevator|l'ascenseur
floor (level)|l'étage
lease agreement|le contrat de location
notice (to vacate)|le préavis
property|la propriété
square meter|le mètre carré
storage|le rangement`,
  },
  {
    id: "frb1p17",
    title: "Verbs + Prepositions (à/de)",
    subtitle: "Verbs that need à or de",
    kind: "cloze",
    note: "Common verbs requiring à or de before an infinitive or noun.",
    data: `Je pense ___ mes vacances.|à
J'ai besoin ___ ton aide.|de
Il continue ___ travailler.|à
Elle a décidé ___ partir.|de
Nous commençons ___ comprendre.|à
Vous avez oublié ___ fermer la porte.|de
Ils réussissent ___ finir dans les délais.|à
Je rêve ___ voyager un jour.|de
Tu apprends ___ conduire.|à
Elle a peur ___ échouer.|de
Nous nous intéressons ___ l'art.|à
Il vient ___ finir son travail.|de
Je m'habitue ___ ce nouveau rythme.|à
Elle essaie ___ comprendre la situation.|de
Nous hésitons ___ accepter cette offre.|à
Vous avez arrêté ___ fumer.|de
Ils cherchent ___ résoudre le problème.|à
Je te remercie ___ ton aide.|de
Elle s'est mise ___ pleurer.|à
Nous avons envie ___ sortir ce soir.|de
Il refuse ___ répondre.|de
Tu tiens ___ ce projet.|à
Elle a choisi ___ rester.|de
Nous invitons nos amis ___ dîner.|à
Ils sont fiers ___ leur travail.|de`,
  },
  {
    id: "frb1p18",
    title: "Passive Voice",
    subtitle: "Être + past participle",
    kind: "cloze",
    note: "The passive voice with être and a past participle.",
    data: `La lettre ___ (écrire) par Marie.|est écrite
Le livre ___ (publier) l'année dernière.|a été publié
La maison ___ (construire) en 1990.|a été construite
Les fenêtres ___ (nettoyer) hier.|ont été nettoyées
Le film ___ (réaliser) par un jeune cinéaste.|a été réalisé
Cette chanson ___ (chanter) par une star.|est chantée
Le pont ___ (réparer) le mois dernier.|a été réparé
Les documents ___ (signer) ce matin.|ont été signés
La décision ___ (prendre) hier soir.|a été prise
Le repas ___ (préparer) par le chef.|est préparé
Les résultats ___ (annoncer) demain.|seront annoncés
La ville ___ (fonder) au moyen âge.|a été fondée
Le projet ___ (approuver) par le directeur.|a été approuvé
Les invités ___ (accueillir) chaleureusement.|ont été accueillis
Le tableau ___ (peindre) par un artiste célèbre.|a été peint
La réunion ___ (annuler) à cause de la pluie.|a été annulée
Ce roman ___ (traduire) en plusieurs langues.|a été traduit
Les billets ___ (vendre) en une heure.|ont été vendus
Le prix ___ (remettre) au gagnant.|a été remis
Cette règle ___ (respecter) par tout le monde.|est respectée
Le colis ___ (livrer) hier matin.|a été livré
Les enfants ___ (surveiller) par leurs parents.|sont surveillés
Le budget ___ (réduire) cette année.|a été réduit
La nouvelle ___ (confirmer) ce matin.|a été confirmée
Ce quartier ___ (rénover) récemment.|a été rénové`,
  },
  {
    id: "frb1p19",
    title: "Time Expressions",
    subtitle: "Depuis, pendant, il y a",
    kind: "cloze",
    note: "Depuis, pendant, and il y a for talking about time.",
    data: `J'habite ici ___ cinq ans.|depuis
Nous avons voyagé ___ deux semaines.|pendant
Il est parti ___ une heure.|il y a
Elle étudie le français ___ 2020.|depuis
J'ai attendu ___ une heure entière.|pendant
Ils se sont mariés ___ dix ans.|il y a
Je travaille ici ___ le mois de mars.|depuis
Nous avons vécu à Paris ___ trois ans.|pendant
Elle a déménagé ___ six mois.|il y a
Tu apprends l'espagnol ___ combien de temps ?|depuis
Il a plu ___ toute la journée.|pendant
J'ai vu ce film ___ longtemps.|il y a
Nous nous connaissons ___ l'université.|depuis
Elle a dormi ___ dix heures.|pendant
Ils ont déménagé ___ deux ans.|il y a
Je fais du sport ___ un an maintenant.|depuis
Nous avons discuté ___ des heures.|pendant
Il a appelé ___ cinq minutes.|il y a
Elle attend ce moment ___ toujours.|depuis
Vous avez travaillé ___ tout l'été.|pendant
J'ai fini mes études ___ deux ans.|il y a
Nous habitons ici ___ notre mariage.|depuis
Il a couru ___ une heure sans s'arrêter.|pendant
Elle a quitté son emploi ___ un mois.|il y a
Je le connais ___ mon enfance.|depuis`,
  },
  {
    id: "frb1p20",
    title: "Making Suggestions & Giving Advice",
    subtitle: "Recommending and advising",
    kind: "cloze",
    note: "Common structures for suggestions and advice.",
    data: `Tu ___ (devoir) te reposer un peu.|devrais
Si j'étais toi, je ___ (partir) tôt.|partirais
On ___ (pouvoir) aller au cinéma ce soir.|pourrait
Pourquoi ne pas ___ (to take) un peu de repos ?|prendre
Il vaudrait mieux ___ (to leave) maintenant.|partir
Je te conseille de ___ (to stay) prudent.|rester
Tu devrais ___ (to see) un médecin.|consulter
Ça vaudrait la peine d'___ (to try).|essayer
À ta place, je ne ___ (dire) rien.|dirais
Il serait sage de ___ (to save) des économies.|faire
Tu ferais mieux de ___ (to sleep) tôt ce soir.|dormir
Je te suggère de ___ (to take) une pause.|prendre
Et si on ___ (essayer) autre chose ?|essayait
Il faudrait ___ (to be) plus attentif.|être
Tu devrais vraiment ___ (to read) ce livre.|lire
Pourquoi ne pas ___ (to leave) un peu plus tôt ?|partir
Je te recommande de ___ (to try) ce restaurant.|essayer
Il serait préférable de ___ (to wait until) demain.|attendre
On devrait ___ (to make) une décision rapidement.|prendre
Ça serait une bonne idée de ___ (to make) un plan.|faire
Tu pourrais ___ (to ask) à quelqu'un d'autre.|demander
Si j'étais à ta place, je ___ (accepter) cette offre.|accepterais
Il vaut mieux ___ (to prevent) que guérir.|prévenir
Je te conseille vivement de ___ (to take) ce cours.|suivre
Tu devrais peut-être ___ (to take) un peu de repos.|prendre`,
  },
];

const B2: Pack[] = [
  {
    id: "frb2p1",
    title: "Subjunctive Mood",
    subtitle: "Expressing necessity, doubt, and wish",
    kind: "cloze",
    note: 'Present subjunctive after common triggers like "il faut que".',
    data: `Il faut que je ___ (faire) mes devoirs.|fasse
Il faut que tu ___ (être) à l'heure.|sois
Il faut qu'il ___ (avoir) de la patience.|ait
Il faut que nous ___ (aller) au rendez-vous.|allions
Il faut que vous ___ (finir) le rapport.|finissiez
Il faut qu'elles ___ (venir) demain.|viennent
Je doute qu'il ___ (savoir) la vérité.|sache
Je veux que tu ___ (comprendre) la situation.|comprennes
Il est important que nous ___ (prendre) une décision.|prenions
Je suis content que vous ___ (pouvoir) venir.|puissiez
Il faut qu'elle ___ (dire) la vérité.|dise
Il est possible qu'ils ___ (partir) tôt.|partent
Il faut que ce ___ (être) fini avant midi.|soit
Bien qu'il ne ___ (vouloir) pas, il doit venir.|veuille
Il faut qu'ils ___ (faire) attention.|fassent
Il est essentiel que nous ___ (savoir) la réponse.|sachions
Je ne crois pas que tu ___ (aller) réussir sans effort.|ailles
Il faut qu'elle ___ (venir) avec nous.|vienne
Il faut qu'ils ___ (dire) toute la vérité.|disent
Il faut qu'ils ___ (prendre) leurs médicaments.|prennent
Il faut que tu ___ (finir) avant ce soir.|finisse
Il est possible que j'___ (aller) à Paris l'année prochaine.|aille
Il faut que tu ___ (avoir) plus confiance en toi.|aies
Il faut que nous ___ (être) prêts à temps.|soyons
Je doute qu'elle ___ (comprendre) le problème.|comprenne`,
  },
  {
    id: "frb2p2",
    title: "Idiomatic Expressions",
    subtitle: "Meaning match",
    kind: "pair",
    prompt: 'The idiom "%s" means…',
    note: "Common French idioms beyond literal translation.",
    data: `avoir le cafard|to feel down or depressed
poser un lapin à quelqu'un|to stand someone up
coûter les yeux de la tête|to be very expensive
avoir un chat dans la gorge|to have a frog in one's throat
tomber dans les pommes|to faint
casser les pieds à quelqu'un|to annoy someone
avoir le coup de foudre|to fall in love at first sight
mettre la charrue avant les bœufs|to put the cart before the horse
appeler un chat un chat|to call a spade a spade
être dans la lune|to be daydreaming
avoir la pêche|to feel great and energetic
faire la grasse matinée|to sleep in
avoir un poil dans la main|to be very lazy
raconter des salades|to tell tall tales or lies
c'est la fin des haricots|it's all over, hopeless
donner sa langue au chat|to give up guessing
avoir d'autres chats à fouetter|to have other things to worry about
être au bout du rouleau|to be exhausted, at the end of one's rope
prendre ses jambes à son cou|to run away quickly
avoir la tête dans les nuages|to be absent-minded
faire d'une pierre deux coups|to kill two birds with one stone
mettre son grain de sel|to give an unsolicited opinion
avoir le bras long|to have influence or connections
tourner autour du pot|to beat around the bush
il pleut des cordes|it's raining heavily`,
  },
  {
    id: "frb2p3",
    title: "Business & Formal French",
    subtitle: "Professional written French",
    kind: "cloze",
    note: "Formal phrases for business correspondence and meetings.",
    data: `Je vous prie de bien vouloir ___ ma demande.|considérer
Veuillez trouver ci-joint mon ___.|CV
Nous avons le plaisir de vous ___ à la réunion.|inviter
Je me permets de vous ___ concernant notre projet.|contacter
Dans l'attente de votre ___, je vous prie d'agréer mes salutations.|réponse
La réunion aura ___ lundi prochain.|lieu
Nous devons ___ le budget avant vendredi.|finaliser
Le contrat a été ___ par les deux parties.|signé
Il est nécessaire de ___ les objectifs de l'équipe.|clarifier
Nous cherchons à ___ nos parts de marché.|augmenter
Veuillez ___ un rendez-vous avec le directeur.|fixer
La décision sera ___ après délibération.|prise
Nous devons ___ nos priorités ce trimestre.|revoir
L'entreprise a connu une forte ___ cette année.|croissance
Le rapport doit être ___ avant la fin du mois.|soumis
Nous sommes ___ de vous informer de ce changement.|ravis
Merci de bien vouloir ___ cette information.|diffuser
Le projet a été ___ en raison du budget.|annulé
Notre équipe a ___ un excellent travail.|accompli
Il faut ___ les risques avant de décider.|évaluer
Le client a exprimé sa ___ envers nos services.|satisfaction
Nous devons ___ les coûts de production.|réduire
La proposition a été ___ à l'unanimité.|acceptée
Nous vous remercions pour votre ___.|collaboration
Veuillez ___ les documents joints.|consulter`,
  },
  {
    id: "frb2p4",
    title: "Comparatives & Superlatives",
    subtitle: "Comparing people and things",
    kind: "cloze",
    note: "Comparative and superlative structures.",
    data: `Elle est plus ___ que son frère.|grande
Il est aussi ___ que moi.|intelligent
Cette voiture est moins ___ que l'autre.|chère
C'est le meilleur ___ de la ville.|restaurant
C'est la pire journée de ma ___.|vie
Il court plus ___ que son ami.|vite
Elle chante aussi ___ que sa sœur.|bien
Ce livre est moins ___ que le film.|intéressant
C'est le plus haut ___ de Paris.|bâtiment
Cette solution est la meilleure de ___.|toutes
Il travaille plus ___ que les autres.|dur
Ma maison est aussi ___ que la tienne.|spacieuse
Ce plat est moins ___ que je pensais.|épicé
C'est le film le plus ___ que j'ai vu.|triste
Elle est la meilleure de la ___.|classe
Il est aussi ___ que le champion.|rapide
Ce quartier est moins ___ que le centre-ville.|cher
C'est la pire ___ de l'année.|nouvelle
Il parle plus ___ que moi.|couramment
Cette région est la plus ___ du pays.|belle
Elle est moins ___ que son collègue.|patiente
C'est le pire résultat de tous les ___.|temps
Ce trajet est plus ___ que prévu.|long
Il est le meilleur ___ de l'équipe.|joueur
Cette histoire est plus ___ que l'autre.|drôle`,
  },
  {
    id: "frb2p5",
    title: "Reported Speech",
    subtitle: "Le discours indirect",
    kind: "cloze",
    note: "Reported speech with tense and pronoun shifts.",
    data: `Il a dit qu'il ___ (être) fatigué.|était
Elle a dit qu'elle ___ (venir) demain.|viendrait
Il a expliqué qu'il ___ (avoir) besoin d'aide.|avait
Elle a annoncé qu'elle ___ (partir) bientôt.|partirait
Il m'a dit qu'il ___ (finir) le travail hier.|avait fini
Elle a demandé si je ___ (pouvoir) l'aider.|pouvais
Il a répondu qu'il ne ___ (savoir) pas.|savait
Elle a expliqué qu'elle ___ (aller) au marché.|allait
Il a dit qu'il ___ (vouloir) partir tôt.|voulait
Elle m'a demandé où j'___ (habiter).|habitais
Il a affirmé qu'il ___ (dire) la vérité.|disait
Elle a précisé qu'elle ___ (manger) déjà.|avait mangé
Il a demandé quand nous ___ (arriver).|arriverions
Elle a dit qu'elle ___ (être) très contente du résultat.|était très
Il a expliqué pourquoi il ___ (être) toujours en retard.|était toujours
Elle a promis qu'elle ___ (appeler) plus tard.|appellerait
Il a affirmé que le projet ___ (être) enfin terminé.|était enfin
Elle a demandé si nous ___ (avoir) fini.|avions
Il a dit qu'il ___ (faire) beau la veille.|avait fait
Elle a précisé qu'elle ___ (revenir) bientôt.|reviendrait
Il a expliqué que la réunion ___ (commencer) à midi.|commençait
Elle a dit qu'elle ne ___ (comprendre) pas.|comprenait
Il a demandé combien cela ___ (coûter).|coûtait
Elle a affirmé qu'elle ___ (avoir) toujours raison.|avait toujours
Il a dit qu'il ___ (essayer) de son mieux.|essayait`,
  },
  {
    id: "frb2p6",
    title: "Plus-que-parfait",
    subtitle: "The pluperfect",
    kind: "cloze",
    note: "Pluperfect: what had already happened before another past action.",
    data: `Quand je suis arrivé, il ___ (partir) déjà.|était déjà parti
Elle ___ (finir) son travail avant midi.|avait fini
Nous ___ (manger) avant leur arrivée.|avions mangé
Tu ___ (voir) ce film avant moi.|avais vu
Ils ___ (arriver) déjà quand le film a commencé.|étaient déjà arrivés
J'___ (oublier) mon parapluie chez moi.|avais oublié
Elle ___ (perdre) ses clés avant de partir.|avait perdu
Nous ___ (visiter) déjà ce musée.|avions déjà visité
Vous ___ (terminer) vos études avant de déménager.|aviez terminé
Il ___ (préparer) le dîner avant que nous arrivions.|avait préparé
J'___ (lire) ce livre avant l'examen.|avais lu
Elle ___ (partir) avant que je puisse la remercier.|était partie
Nous ___ (voir) jamais une telle chose.|n'avions jamais vu
Ils ___ (décider) déjà avant la réunion.|avaient déjà décidé
Tu ___ (comprendre) la leçon avant le cours suivant.|avais compris
Il ___ (écrire) la lettre avant de partir.|avait écrit
Elle ___ (manger) déjà quand nous sommes arrivés.|avait déjà mangé
Nous ___ (finir) nos devoirs avant le dîner.|avions fini
J'___ (appeler) avant de venir.|avais appelé
Ils ___ (vendre) la maison avant de déménager.|avaient vendu
Vous ___ (faire) une erreur sans le savoir.|aviez fait
Elle ___ (retourner) chez elle avant la tempête.|était retournée
Nous ___ (choisir) ce restaurant avant de réserver.|avions choisi
Il ___ (dire) la vérité depuis le début.|avait dit
J'___ (finir) mon travail avant la pause.|avais fini`,
  },
  {
    id: "frb2p7",
    title: "Conditionnel Passé",
    subtitle: "The past conditional",
    kind: "cloze",
    note: "Past conditional: what would have happened.",
    data: `Si j'avais su, je ___ (venir) plus tôt.|serais venu
Elle ___ (partir) si elle avait eu le temps.|serait partie
Nous ___ (aider) si tu nous avais demandé.|aurions aidé
Tu ___ (réussir) avec plus d'efforts.|aurais réussi
Ils ___ (venir) s'ils avaient été invités.|seraient venus
J'___ (aimer) le voir avant son départ.|aurais aimé
Elle ___ (devoir) nous prévenir plus tôt.|aurait dû
Nous ___ (pouvoir) faire mieux.|aurions pu
Vous ___ (dire) la même chose à ma place.|auriez dit
Il ___ (choisir) une autre solution.|aurait choisi
J'___ (vouloir) t'aider davantage.|aurais voulu
Elle ___ (rester) si elle avait pu.|serait restée
Nous ___ (faire) un autre choix.|aurions fait
Tu ___ (devoir) l'écouter attentivement.|aurais dû
Ils ___ (arriver) à l'heure sans la panne.|seraient arrivés
J'___ (préférer) rester à la maison.|aurais préféré
Elle ___ (pouvoir) réussir avec un peu de chance.|aurait pu
Nous ___ (aimer) participer à cet événement.|aurions aimé
Vous ___ (accepter) cette offre, je pense.|auriez accepté
Il ___ (partir) sans dire au revoir.|serait parti
J'___ (faire) la même erreur.|aurais fait
Elle ___ (vouloir) tout changer.|aurait voulu
Nous ___ (devoir) réfléchir davantage.|aurions dû
Ils ___ (pouvoir) éviter ce problème.|auraient pu
Tu ___ (être) surpris par sa réaction.|aurais été`,
  },
  {
    id: "frb2p8",
    title: "Gerund & Present Participle",
    subtitle: "En + -ant for simultaneous actions",
    kind: "cloze",
    note: "The gerund (en + present participle) for simultaneous actions.",
    data: `Il mange ___ (regarder) la télévision.|en regardant
Elle chante ___ (faire) la vaisselle.|en faisant
J'ai appris le français ___ (voyager) en France.|en voyageant
Nous parlons ___ (marcher) dans le parc.|en marchant
Tu apprends beaucoup ___ (lire) chaque jour.|en lisant
Il s'est blessé ___ (courir) dans la rue.|en courant
Elle a trouvé du travail ___ (chercher) sur internet.|en cherchant
Nous économisons de l'argent ___ (cuisiner) à la maison.|en cuisinant
J'écoute de la musique ___ (travailler).|en travaillant
Il a réussi ___ (persévérer).|en persévérant
Elle s'est endormie ___ (regarder) un film.|en regardant
Nous avons discuté ___ (attendre) le bus.|en attendant
Tu peux apprendre beaucoup ___ (voyager).|en voyageant
Il a perdu du poids ___ (faire) plus de sport.|en faisant
Elle a amélioré son français ___ (pratiquer) tous les jours.|en pratiquant
Nous avons économisé du temps ___ (planifier) à l'avance.|en planifiant
J'ai rencontré mon ami ___ (étudier) à l'université.|en étudiant
Il s'est amusé ___ (jouer) avec ses amis.|en jouant
Elle a compris ___ (poser) des questions.|en posant
Nous avons progressé ___ (s'entraîner) régulièrement.|en nous entraînant
Tu réussiras ___ (essayer) encore une fois.|en essayant
Il a tout perdu ___ (jouer) au casino.|en jouant
Elle s'est fait des amis ___ (participer) au club.|en participant
Nous avons économisé ___ (acheter) en gros.|en achetant
J'ai découvert cette recette ___ (chercher) sur internet.|en cherchant`,
  },
  {
    id: "frb2p9",
    title: "Concession & Contrast Connectors",
    subtitle: "Signalling contrast",
    kind: "pair",
    prompt: 'The connector "%s" is used to…',
    note: "Connectors for concession and contrast.",
    data: `but|mais
however|cependant
nevertheless|néanmoins
although|bien que
even though|même si
despite|malgré
on the other hand|en revanche
whereas|alors que
yet|pourtant
in spite of|malgré
on the contrary|au contraire
while (contrast)|tandis que
still (nonetheless)|quand même
even so|tout de même
regardless|peu importe
conversely|inversement
by contrast|par contraste
notwithstanding|nonobstant
all the same|tout de même
in contrast to|contrairement à
though|quoique
despite the fact that|bien que
however that may be|quoi qu'il en soit
be that as it may|quoi qu'il en soit
unlike|à la différence de`,
  },
  {
    id: "frb2p10",
    title: "Cause & Consequence Connectors",
    subtitle: "Explaining why and what follows",
    kind: "pair",
    prompt: 'The connector "%s" is used to…',
    note: "Connectors for cause and consequence.",
    data: `because|parce que
since (cause)|puisque
as (cause)|comme
so|donc
thus|ainsi
therefore|par conséquent
so that|de sorte que
because of|à cause de
due to|en raison de
thanks to|grâce à
as a result|de ce fait
consequently|par conséquent
hence|d'où
that's why|c'est pourquoi
given that|étant donné que
for this reason|pour cette raison
as a consequence|en conséquence
owing to|en raison de
so much so that|si bien que
in order to|afin de
in order that|afin que
leading to|menant à
resulting in|entraînant
which is why|raison pour laquelle
accordingly|en conséquence`,
  },
  {
    id: "frb2p11",
    title: "Politics & Society",
    subtitle: "Talking about current affairs",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Politics and society vocabulary.",
    data: `government|le gouvernement
president|le président
election|l'élection
vote|le vote
citizen|le citoyen
law|la loi
democracy|la démocratie
parliament|le parlement
minister|le ministre
policy|la politique
constitution|la constitution
rights|les droits
justice|la justice
equality|l'égalité
freedom|la liberté
society|la société
immigration|l'immigration
poverty|la pauvreté
inequality|l'inégalité
protest|la manifestation
reform|la réforme
tax|l'impôt
public opinion|l'opinion publique
diplomacy|la diplomatie
sovereignty|la souveraineté`,
  },
  {
    id: "frb2p12",
    title: "Environment & Climate Change",
    subtitle: "Talking about the planet",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Climate and environmental vocabulary.",
    data: `climate change|le changement climatique
global warming|le réchauffement climatique
greenhouse gas|le gaz à effet de serre
carbon footprint|l'empreinte carbone
deforestation|la déforestation
biodiversity|la biodiversité
ecosystem|l'écosystème
renewable energy|l'énergie renouvelable
solar panel|le panneau solaire
wind turbine|l'éolienne
sustainability|la durabilité
emissions|les émissions
drought|la sécheresse
flood|l'inondation
extinction|l'extinction
conservation|la conservation
recycling (waste)|le recyclage
plastic waste|les déchets plastiques
endangered species|l'espèce en voie de disparition
natural resource|la ressource naturelle
pollution (climate)|la pollution
ecology|l'écologie
ozone layer|la couche d'ozone
sea level|le niveau de la mer
carbon neutral|neutre en carbone`,
  },
  {
    id: "frb2p13",
    title: "Law & Justice",
    subtitle: "Talking about the legal system",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Law and justice vocabulary.",
    data: `law (legal)|la loi
court|le tribunal
judge|le juge
lawyer (in court)|l'avocat
trial|le procès
crime|le crime
witness|le témoin
jury|le jury
evidence|la preuve
sentence (verdict)|la peine
prison|la prison
verdict|le verdict
lawsuit|le procès
contract (legal)|le contrat
rights (legal)|les droits
justice (legal)|la justice
guilty|coupable
innocent|innocent
appeal|l'appel
fine (penalty)|l'amende
police|la police
arrest|l'arrestation
suspect|le suspect
victim|la victime
legislation|la législation`,
  },
  {
    id: "frb2p14",
    title: "Economy & Finance",
    subtitle: "Talking about money and markets",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Economics and finance vocabulary.",
    data: `economy|l'économie
inflation|l'inflation
market (economic)|le marché
investment|l'investissement
stock|l'action
budget|le budget
debt|la dette
income|le revenu
tax (on income)|l'impôt
growth|la croissance
recession|la récession
unemployment|le chômage
currency|la devise
trade|le commerce
bank|la banque
loan|le prêt
interest rate|le taux d'intérêt
profit|le profit
salary (wages)|le salaire
consumer|le consommateur
supply and demand|l'offre et la demande
shares (stocks)|les actions
GDP|le PIB
savings|l'épargne
stock market|la bourse`,
  },
  {
    id: "frb2p15",
    title: "Arts & Culture",
    subtitle: "Talking about the arts",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Arts and culture vocabulary.",
    data: `art|l'art
painting|la peinture
sculpture|la sculpture
museum|le musée
exhibition|l'exposition
artist (performing arts)|l'artiste
masterpiece|le chef-d'œuvre
literature|la littérature
poetry|la poésie
novel|le roman
theater (performing arts)|le théâtre
play (theater)|la pièce
cinema (arts)|le cinéma
film director|le réalisateur
music (as an art form)|la musique
composer|le compositeur
dance|la danse
architecture|l'architecture
heritage|le patrimoine
tradition|la tradition
festival|le festival
gallery|la galerie
critic|le critique
performance|la représentation
creativity|la créativité`,
  },
  {
    id: "frb2p16",
    title: "Advanced Idioms II",
    subtitle: "Meaning match",
    kind: "pair",
    prompt: 'The idiom "%s" means…',
    note: "More common French idioms.",
    data: `avoir le cœur sur la main|to be very generous
mettre la clé sous la porte|to shut down (a business)
avoir une araignée au plafond|to be a bit crazy
chercher midi à quatorze heures|to overcomplicate things
avoir un cœur d'artichaut|to fall in love easily
avoir le nez creux|to have good instincts
tomber des nues|to be utterly astonished
avoir la frite|to feel great (informal)
mettre les pieds dans le plat|to say something tactless
avoir la main verte|to have a green thumb
casser du sucre sur le dos de quelqu'un|to badmouth someone behind their back
mettre quelqu'un au pied du mur|to corner someone into deciding
avoir le trac|to have stage fright
faire la tête|to sulk
avoir des fourmis dans les jambes|to have restless legs
mettre les bouchées doubles|to work twice as hard
avoir le cœur gros|to feel heavy-hearted
tomber à l'eau|to fall through (a plan)
avoir la tête sur les épaules|to be level-headed
faire le pont|to take a long weekend around a holiday
mettre du sien|to make an effort, pitch in
avoir la puce à l'oreille|to become suspicious
être haut comme trois pommes|to be very small (a child)
avoir un verre dans le nez|to be a bit tipsy
mettre la puce à l'oreille de quelqu'un|to make someone suspicious`,
  },
  {
    id: "frb2p17",
    title: "Emphatic Structures",
    subtitle: "C'est...qui/que",
    kind: "cloze",
    note: "Emphasizing part of a sentence with c'est...qui/que.",
    data: `___ Marie qui a téléphoné.|C'est
C'est ce livre ___ je cherche.|que
Ce sont mes amis ___ sont arrivés.|qui
___ toi que je pensais.|C'est
C'est demain ___ nous partons.|que
Ce sont eux ___ ont gagné.|qui
C'est à Paris ___ j'habite.|que
___ lui qui a raison.|C'est
C'est ce film ___ j'ai préféré.|que
Ce sont ces documents ___ manquent.|qui
___ elle qui a organisé la fête.|C'est
C'est cette maison ___ nous voulons acheter.|que
Ce sont ses parents ___ l'ont aidé.|qui
___ ce soir que je pars.|C'est
C'est mon frère ___ conduit.|qui
Ce sont ces mots ___ m'ont blessé.|qui
___ pour cette raison que je suis venu.|C'est
C'est ainsi ___ tout a commencé.|que
Ce sont nos voisins ___ ont appelé.|qui
___ toi qui décides.|C'est
C'est cette idée ___ je préfère.|que
Ce sont les enfants ___ jouent dehors.|qui
___ maintenant que ça compte.|C'est
C'est ce professeur ___ enseigne le mieux.|qui
Ce sont ces raisons ___ expliquent son départ.|qui`,
  },
  {
    id: "frb2p18",
    title: "Double Object Pronouns",
    subtitle: "Combining two pronouns",
    kind: "cloze",
    note: "Combining two object pronouns in one sentence.",
    data: `Je te ___ donne (ce livre).|le
Il me ___ envoie (la lettre).|l'
Nous vous ___ offrons (ces fleurs).|les
Elle nous ___ a montré (la photo).|l'
Je le ___ ai déjà dit (à mon collègue).|lui
Tu me l'___ (dire) hier.|as dit
Il nous les ___ (envoyer) hier.|a envoyés
Je te la ___ (donner) demain.|donnerai
Elle le leur ___ (expliquer) clairement.|a expliqué
Nous vous l'___ (envoyer) ce matin.|avons envoyé
Il me les ___ (rendre) hier soir.|a rendus
Je vous la ___ (recommander) vivement.|recommande
Tu nous l'___ (dire) trop tard.|as dit
Elle te le ___ (prêter) volontiers.|prêtera
Ils nous en ___ (parler) souvent.|parlent
Je le lui ___ (rendre) demain.|rendrai
Nous te la ___ (montrer) bientôt.|montrerons
Il vous les ___ (apporter) ce soir.|apportera
Elle me l'___ (offrir) pour mon anniversaire.|a offert
Tu le leur ___ (expliquer) clairement.|expliques
Je te l'___ (promettre).|ai promis
Nous le lui ___ (souhaiter) sincèrement.|souhaitons
Ils me la ___ (rendre) la semaine dernière.|ont rendue
Elle nous les ___ (envoyer) chaque mois.|envoie
Je vous le ___ (confirmer) par écrit.|confirme`,
  },
  {
    id: "frb2p19",
    title: "Faire Causatif",
    subtitle: "Faire + infinitive",
    kind: "cloze",
    note: "The causative construction: faire + infinitive.",
    data: `Je fais ___ (to repair) ma voiture.|réparer
Elle fait ___ (to build) une maison.|construire
Il fait ___ (to clean) son costume.|nettoyer
Nous faisons ___ (to deliver) les meubles.|livrer
Vous faites ___ (to cut) vos cheveux.|couper
Ils font ___ (to paint) leur maison.|peindre
Je me fais ___ (to cut) les cheveux.|couper
Elle se fait ___ (to have done) une manucure.|faire
Il fait ___ (to install) une nouvelle cuisine.|installer
Nous faisons ___ (to translate) ce document.|traduire
Vous faites ___ (to service) votre voiture.|réviser
Ils font ___ (to deliver) le colis.|livrer
Je fais ___ (to have done) mes devoirs par mon frère.|faire
Elle fait ___ (to send) un cadeau à sa mère.|envoyer
Il fait ___ (to let know) la nouvelle à tout le monde.|savoir
Nous faisons ___ (to repair) le toit.|réparer
Vous faites ___ (to print) les documents.|imprimer
Ils font ___ (to enlarge) leur maison.|agrandir
Je fais ___ (to send for) le plombier.|venir
Elle fait ___ (to tour) la ville à ses invités.|visiter
Il fait ___ (to laugh) tout le monde.|rire
Nous faisons ___ (to understand) la situation.|comprendre
Vous faites ___ (to notice) le problème.|remarquer
Ils font ___ (to pay) la note à leur client.|payer
Je fais ___ (to wait) mes amis.|attendre`,
  },
  {
    id: "frb2p20",
    title: "Formal Letter Writing Phrases",
    subtitle: "Professional correspondence",
    kind: "pair",
    prompt: 'The French for "%s" is…',
    note: "Set phrases for formal letters and emails.",
    data: `Dear Sir or Madam|Madame, Monsieur
Yours sincerely|Veuillez agréer mes salutations distinguées
I am writing to inform you|Je vous écris pour vous informer
please find attached|veuillez trouver ci-joint
I look forward to hearing from you|dans l'attente de votre réponse
best regards|cordialement
with reference to|en référence à
I would be grateful if|je vous serais reconnaissant de
please do not hesitate to contact me|n'hésitez pas à me contacter
I apologize for the inconvenience|je m'excuse pour la gêne occasionnée
following our conversation|suite à notre conversation
enclosed you will find|vous trouverez ci-joint
thank you for your understanding|merci de votre compréhension
I remain at your disposal|je reste à votre disposition
kindly note that|veuillez noter que
as per your request|conformément à votre demande
in the meantime|dans l'intervalle
should you have any questions|si vous avez des questions
I would like to draw your attention to|je souhaite attirer votre attention sur
respectfully|respectueusement
subject (of a letter)|objet
recipient|le destinataire
sender|l'expéditeur
attachment|la pièce jointe
signature|la signature`,
  },
];

const C1: Pack[] = [
  {
    id: "frc1p1",
    title: "Advanced Idioms & Nuance",
    subtitle: "Meaning match",
    kind: "pair",
    prompt: 'The idiom "%s" roughly means…',
    note: "C1-level idioms for nuanced, natural French.",
    data: `mettre les points sur les i|to clarify things precisely
avoir maille à partir avec quelqu'un|to have a dispute with someone
ne pas y aller par quatre chemins|to get straight to the point
être pris la main dans le sac|to be caught red-handed
jeter l'éponge|to give up, throw in the towel
avoir le vent en poupe|to be thriving, have momentum
mettre du beurre dans les épinards|to improve one's financial situation slightly
ne pas être dans son assiette|to not feel well
filer à l'anglaise|to leave without saying goodbye
tirer les ficelles|to pull the strings behind the scenes
avoir la langue bien pendue|to be very talkative
mettre la main à la pâte|to get involved and help
avoir des atomes crochus avec quelqu'un|to hit it off with someone
ne pas mâcher ses mots|to speak bluntly
être sur la même longueur d'onde|to be on the same wavelength
avoir un poids sur la conscience|to feel guilty about something
prendre le taureau par les cornes|to tackle a problem head-on
en faire tout un fromage|to make a big deal out of nothing
avoir le dernier mot|to have the last word
mettre tous ses œufs dans le même panier|to put all one's eggs in one basket
c'est la goutte d'eau qui fait déborder le vase|it's the last straw
avoir une dent contre quelqu'un|to hold a grudge against someone
passer du coq à l'âne|to jump from one topic to another
se serrer les coudes|to support each other, stick together
avoir carte blanche|to have full freedom to act`,
  },
  {
    id: "frc1p2",
    title: "Formal & Literary Register",
    subtitle: "High-register written French",
    kind: "cloze",
    note: "C1-level formal and literary phrasing.",
    data: `Nonobstant les difficultés, il a ___ son objectif.|atteint
Il convient de ___ que la situation est complexe.|souligner
Force est de ___ que les résultats sont décevants.|constater
Il n'en demeure pas moins que la question reste ___.|ouverte
En dépit des efforts consentis, le projet a ___.|échoué
Il s'agit là d'une problématique qui mérite d'être ___.|approfondie
Loin de moi l'idée de ___ vos compétences.|remettre en question
Quoi qu'il en soit, la décision a été ___.|prise
Il importe de ___ les enjeux avant d'agir.|cerner
Cela étant dit, il convient de ___ prudemment.|procéder
Il n'est pas anodin de ___ que ce phénomène persiste.|noter
On ne saurait ___ l'importance de ce facteur.|sous-estimer
Il paraît opportun de ___ cette hypothèse.|explorer
Tout porte à croire que la tendance va se ___.|poursuivre
Il serait présomptueux d'en ___ davantage.|affirmer
Ceci étant, il convient de ___ nos attentes.|revoir
Il va sans dire que cette approche ___ ses limites.|comporte
Il est indéniable que ce constat ___ réflexion.|suscite
Rien ne permet d'___ une telle conclusion.|étayer
Il conviendrait de ___ cette question plus avant.|examiner
Nul ne saurait ___ la portée de cet événement.|nier
Il est à ___ que peu de mesures ont été prises.|déplorer
Ainsi qu'il a été ___ précédemment, les résultats varient.|mentionné
Il demeure difficile de ___ avec certitude.|conclure
Toute chose étant égale par ailleurs, la situation devrait s'___.|améliorer`,
  },
  {
    id: "frc1p3",
    title: "Nuanced Connectors",
    subtitle: "Advanced discourse markers",
    kind: "pair",
    prompt: 'The connector "%s" is used to…',
    note: "C1-level connectors for formal spoken and written French.",
    data: `néanmoins|introduce a contrast, similar to "nevertheless"
toutefois|introduce a formal contrast, "however"
cela dit|concede a point before continuing, "that said"
en revanche|mark a strong contrast between two ideas
or|introduce a logical turning point in an argument
du reste|add a supporting remark, "moreover"
qui plus est|add emphasis to a preceding point
en outre|add formal additional information
de surcroît|add extra formal emphasis
par ailleurs|introduce a separate but related point
dans la mesure où|explain a reason or condition, "insofar as"
étant donné que|introduce a cause, "given that"
de sorte que|express a result, "so that"
quoique|introduce a concession in a more literary register, "although" (+ subjunctive)
bien que|introduce a concession in everyday formal speech, "although" (+ subjunctive)
à moins que|introduce an exception, "unless" (+ subjunctive)
pourvu que|express a condition, "provided that"
de peur que|express a fear-based reason, "for fear that"
si bien que|show a natural consequence
faute de quoi|state a negative consequence, "failing which"
quant à|introduce a new topic in relation to, "as for"
au demeurant|add a nuanced final remark, "moreover, besides"
qui pis est|introduce a worse consequence, "what is worse"
il n'empêche que|concede despite an obstacle, "the fact remains that"
tant et si bien que|emphasize an extreme resulting consequence`,
  },
  {
    id: "frc1p4",
    title: "Nominalisation",
    subtitle: "Turning verbs into abstract nouns",
    kind: "pair",
    prompt: 'The noun form of "%s" is…',
    note: "C1-level nominalisation, common in formal French writing.",
    data: `décider|la décision
analyser|l'analyse
conclure|la conclusion
proposer|la proposition
réduire|la réduction
améliorer|l'amélioration
développer|le développement
exiger|l'exigence
échouer|l'échec
réussir|la réussite
produire|la production
reconnaître|la reconnaissance
résoudre|la résolution
interpréter|l'interprétation
justifier|la justification
maintenir|le maintien
établir|l'établissement
expliquer|l'explication
suggérer|la suggestion
découvrir|la découverte
augmenter|l'augmentation
diminuer|la diminution
créer|la création
transformer|la transformation
choisir|le choix`,
  },
  {
    id: "frc1p5",
    title: "Precision Vocabulary for Debate",
    subtitle: "Arguing and persuading in French",
    kind: "cloze",
    note: "C1-level vocabulary for structured argument and debate.",
    data: `Il convient de ___ plusieurs points avant de conclure.|nuancer
Cet argument repose sur une ___ erronée.|prémisse
Il serait ___ de ne pas tenir compte de ce facteur.|réducteur
Cette affirmation mérite d'être ___.|relativisée
Il faut ___ les avantages et les inconvénients.|peser
Son raisonnement manque de ___.|rigueur
Il est essentiel de ___ les faits des opinions.|distinguer
Cette thèse est difficile à ___.|réfuter
Il convient de ___ cette hypothèse avec prudence.|aborder
Son argumentation repose sur des ___ solides.|preuves
Il faut ___ la portée de cette déclaration.|évaluer
Cette position est difficile à ___.|défendre
Il est nécessaire de ___ les contre-arguments.|anticiper
Son discours manque de ___.|nuance
Il convient de ___ les implications de cette décision.|considérer
Cette conclusion découle logiquement des ___.|prémisses
Il faut ___ les biais possibles dans cette étude.|identifier
Son point de vue mérite d'être ___.|entendu
Il est important de ___ les sources utilisées.|vérifier
Cette critique semble ___.|infondée
Il convient de ___ la validité de cet argument.|questionner
Son raisonnement est ___ mais contestable.|cohérent
Il faut ___ les faits avant de juger.|examiner
Cette hypothèse reste à ___.|démontrer
Il est essentiel de ___ un débat constructif.|favoriser`,
  },
  {
    id: "frc1p6",
    title: "Subjunctive Past",
    subtitle: "Le subjonctif passé",
    kind: "cloze",
    note: "Past subjunctive after emotion, doubt, or judgment.",
    data: `Je suis content qu'il ___ (réussir) son examen.|ait réussi
Il est possible qu'elle ___ (partir) déjà.|soit déjà partie
Je doute qu'ils ___ (finir) à temps.|aient fini
Il est dommage que tu ne ___ (pas venir) hier.|sois pas venu
Nous sommes surpris qu'elle ___ (accepter) cette offre.|ait accepté
Bien qu'il ___ (essayer), il n'a pas réussi.|ait essayé
Je regrette que vous ___ (ne pas pouvoir) venir.|n'ayez pas pu
Il est étonnant qu'elles ___ (arriver) si tôt.|soient arrivées
Je suis heureux que tu ___ (obtenir) ce poste.|aies obtenu
Il se peut qu'il ___ (oublier) son rendez-vous.|ait oublié
Nous sommes déçus qu'ils ___ (annuler) la réunion.|aient annulé
C'est le meilleur film que j'___ (voir).|aie vu
C'est la personne la plus gentille que je ___ (connaître).|connaisse
Je suis surpris qu'elle n'___ (rien dire).|ait rien dit
Il est possible que nous ___ (se tromper).|nous soyons trompés
Je suis désolé que tu ___ (perdre) ton travail.|aies perdu
Il est rare qu'il ___ (arriver) en retard.|soit arrivé
Je ne pense pas qu'elle ___ (mentir).|ait menti
C'est dommage qu'ils ne ___ (pas venir) à la fête.|soient pas venus
Je suis ravi que vous ___ (réussir) votre projet.|ayez réussi
Il est possible que je me ___ (tromper) de date.|sois trompé
Nous sommes contents qu'elle ___ (guérir) rapidement.|ait guéri
Il est peu probable qu'ils ___ (partir) sans nous prévenir.|soient partis
Je suis étonné que tu ___ (finir) si vite.|aies fini
C'est la première fois qu'il ___ (voyager) seul.|ait voyagé`,
  },
  {
    id: "frc1p7",
    title: "Literary Tenses",
    subtitle: "Recognizing the passé simple",
    kind: "pair",
    prompt: 'The passé simple form "%s" means…',
    note: "Passé simple recognition -- used in literature and formal narration, not spoken French.",
    data: `il fut|he was
il eut|he had
il fit|he did/made
il alla|he went
il vint|he came
il dit|he said
il vit|he saw
il prit|he took
il put|he could
il voulut|he wanted
il sut|he knew
il crut|he believed
il naquit|he was born
il mourut|he died
il devint|he became
il tint|he held
il écrivit|he wrote
il vécut|he lived
il partit|he left
il sortit|he went out
il répondit|he answered
il perdit|he lost
il comprit|he understood
il reçut|he received
il connut|he knew/met`,
  },
  {
    id: "frc1p8",
    title: "Philosophy & Abstract Concepts",
    subtitle: "Discussing abstract ideas",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Vocabulary for philosophical and abstract discussion.",
    data: `truth|la vérité
knowledge|la connaissance
existence|l'existence
consciousness|la conscience
reality|la réalité
ethics|l'éthique
morality|la morale
freedom (philosophical)|la liberté
identity|l'identité
meaning|le sens
reason|la raison
logic|la logique
belief|la croyance
doubt (philosophical)|le doute
perception|la perception
wisdom|la sagesse
virtue|la vertu
justice (as a concept)|la justice
the absolute|l'absolu
the relative|le relatif
paradox|le paradoxe
concept|le concept
argument (reasoning)|l'argument
hypothesis|l'hypothèse
contradiction|la contradiction`,
  },
  {
    id: "frc1p9",
    title: "Science & Technology, Advanced",
    subtitle: "Discussing research and innovation",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Advanced science and technology vocabulary.",
    data: `artificial intelligence|l'intelligence artificielle
algorithm|l'algorithme
data (research)|les données
research (scientific)|la recherche
innovation|l'innovation
experiment|l'expérience
hypothesis (scientific)|l'hypothèse
molecule|la molécule
gene|le gène
laboratory|le laboratoire
discovery|la découverte
robotics|la robotique
quantum|quantique
biotechnology|la biotechnologie
nanotechnology|la nanotechnologie
sustainability (economic)|la durabilité
innovation hub|le pôle d'innovation
patent|le brevet
prototype|le prototype
simulation|la simulation
automation|l'automatisation
encryption|le chiffrement
neural network|le réseau de neurones
breakthrough|la percée
scalability|l'évolutivité`,
  },
  {
    id: "frc1p10",
    title: "Legal & Administrative French",
    subtitle: "Formal legal language",
    kind: "cloze",
    note: "Legal and administrative vocabulary in context.",
    data: `Le demandeur a déposé une ___ auprès du tribunal.|plainte
Le contrat entre en ___ dès sa signature.|vigueur
Il incombe à l'accusé de ___ son innocence.|prouver
Cette loi est en ___ depuis janvier.|vigueur
Le tribunal a rendu son ___ hier.|jugement
Les parties ont signé un ___ à l'amiable.|accord
Le notaire a authentifié le ___.|document
Il convient de respecter les ___ légales.|obligations
Le dossier a été soumis à l'___ du juge.|examen
La procédure ___ plusieurs mois.|dure
Le prévenu a fait ___ de la décision.|appel
Cette clause est ___ dans le contrat.|stipulée
Le ministère public a requis une ___ sévère.|peine
Le tribunal administratif a statué en ___ instance.|première
Les héritiers doivent régler les droits de ___.|succession
Le juge a prononcé un ___.|non-lieu
Cette loi ___ les droits des consommateurs.|protège
L'avocat a plaidé la ___ de son client.|défense
Le contrat doit être ___ par les deux parties.|signé
La cour a annulé le ___ précédent.|jugement
Le fonctionnaire a délivré le ___ requis.|certificat
La demande a été ___ pour vice de forme.|rejetée
Le litige a été réglé à l'___.|amiable
Les témoins ont été ___ à comparaître.|convoqués
Le texte de loi a été ___ au parlement.|adopté`,
  },
  {
    id: "frc1p11",
    title: "Diplomatic & Political Register",
    subtitle: "International relations vocabulary",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Diplomacy and international relations vocabulary.",
    data: `treaty|le traité
negotiation|la négociation
summit|le sommet
ambassador|l'ambassadeur
embassy|l'ambassade
alliance|l'alliance
sanctions|les sanctions
ceasefire|le cessez-le-feu
diplomacy (in political discourse)|la diplomatie
resolution|la résolution
delegation|la délégation
summit meeting|la réunion au sommet
bilateral|bilatéral
multilateral|multilatéral
accord|l'accord
mediation|la médiation
sovereignty (in political discourse)|la souveraineté
territorial integrity|l'intégrité territoriale
international law|le droit international
diplomatic relations|les relations diplomatiques
consensus|le consensus
veto|le veto
envoy|l'envoyé
protocol|le protocole
communiqué|le communiqué`,
  },
  {
    id: "frc1p12",
    title: "Rhetorical Devices & Style",
    subtitle: "Analyzing how texts are written",
    kind: "pair",
    prompt: 'The French word for "%s" is…',
    note: "Vocabulary for literary and rhetorical analysis.",
    data: `metaphor|la métaphore
simile|la comparaison
irony|l'ironie
hyperbole|l'hyperbole
euphemism|l'euphémisme
alliteration|l'allitération
rhetorical question|la question rhétorique
paradox (rhetorical)|le paradoxe
personification|la personnification
antithesis|l'antithèse
allegory|l'allégorie
tone|le ton
register (of speech)|le registre
symbolism|le symbolisme
repetition|la répétition
understatement|la litote
oxymoron|l'oxymore
analogy|l'analogie
imagery|les images
narrative|le récit
rhythm (of prose)|le rythme
emphasis|l'emphase
digression|la digression
foreshadowing|l'annonce
climax (of a story)|le point culminant`,
  },
  {
    id: "frc1p13",
    title: "Register Shifts",
    subtitle: "Familiar vs formal French",
    kind: "pair",
    prompt: 'The formal equivalent of the familiar word "%s" is…',
    note: "Everyday familiar register vs. its formal equivalent.",
    data: `bagnole|voiture
bouffer|manger
fric|argent
mec|homme
bosser|travailler
gosse|enfant
bagarre|dispute
flic|policier
bouquin|livre
piaule|chambre
taf|travail
gars|homme
truc|chose
sympa|agréable
nul|médiocre
paumé|perdu
crevé|épuisé
chouette|excellent
foutre le camp|partir
gueuler|crier
rigoler|rire
bête|stupide
dingue|fou
fauché|sans le sou
la flemme|le manque d'énergie`,
  },
  {
    id: "frc1p14",
    title: "Advanced Collocations",
    subtitle: "Natural word combinations",
    kind: "pair",
    prompt: 'The expression "%s" means…',
    note: "Fixed verb-noun collocations common in formal French.",
    data: `tenir compte de|to take into account
porter atteinte à|to undermine/harm
faire face à|to face up to
mettre en œuvre|to implement
prendre conscience de|to become aware of
tirer parti de|to take advantage of
donner lieu à|to give rise to
avoir recours à|to resort to
faire preuve de|to demonstrate/show
rendre compte de|to account for
porter ses fruits|to bear fruit
jouer un rôle|to play a role
susciter l'intérêt|to spark interest
soulever une question|to raise a question
remettre en cause|to call into question
mettre l'accent sur|to emphasize
prendre en compte|to take into account
faire l'objet de|to be the subject of
avoir tendance à|to tend to
donner suite à|to follow up on
tirer des conclusions|to draw conclusions
exercer une influence|to exert an influence
susciter la controverse|to spark controversy
faire figure de|to be seen as
laisser entendre|to imply`,
  },
  {
    id: "frc1p15",
    title: "False Friends",
    subtitle: "Faux amis",
    kind: "pair",
    prompt: 'The French word "%s" (a false friend) actually means…',
    note: "Common French/English false friends.",
    data: `librairie|bookshop, not "library"
attendre|to wait, not "to attend"
actuellement|currently, not "actually"
éventuellement|possibly, not "eventually"
sensible|sensitive, not "sensible"
rester|to stay, not "to rest"
blesser|to injure, not "to bless"
demander|to ask, not "to demand"
assister à|to attend, not "to assist"
ignorer|to not know, not "to ignore"
prétendre|to claim, not "to pretend"
introduire|to insert, not just "to introduce" a person
large|wide, not "large" in general size
journée|day, not "journey"
figure|face, not "figure/number"
monnaie|change/currency, not "money" in general
préservatif|condom, not "preservative"
crayon|pencil, not "crayon"
raisin|grape, not "raisin"
coin|corner, not "coin"
location|rental, not "location/place"
formidable|great/wonderful, not "formidable"
apologie|defense of an idea, not "apology"
déception|disappointment, not "deception"
achever|to finish/complete, not "to achieve"`,
  },
  {
    id: "frc1p16",
    title: "Advanced Idioms III",
    subtitle: "Meaning match",
    kind: "pair",
    prompt: 'The idiom "%s" means…',
    note: "More C1-level idioms.",
    data: `mettre les voiles|to leave abruptly
avoir du pain sur la planche|to have a lot of work to do
être sur des charbons ardents|to be on tenterhooks
avoir un pépin|to have a small problem
tourner la page|to move on from something
avoir le compas dans l'œil|to have a good eye for judging distances
mettre de l'eau dans son vin|to tone down one's demands
avoir des vues sur quelque chose|to have designs on something
tirer son épingle du jeu|to come out ahead skillfully
avoir le champ libre|to have a clear field, free rein
mettre à l'épreuve|to put to the test
jouer à pile ou face|to leave something to chance
avoir la main heureuse|to have a lucky touch
mettre les pieds quelque part|to set foot somewhere
avoir voix au chapitre|to have a say in the matter
tomber sous le sens|to be obvious
avoir le sens des affaires|to have a good business sense
mettre en veilleuse|to put on the back burner
avoir des hauts et des bas|to have ups and downs
tenir le coup|to hold on, cope
avoir la tête froide|to keep a cool head
mettre en garde|to warn
avoir un a priori|to have a preconception
tirer le diable par la queue|to struggle to make ends meet
avoir pignon sur rue|to be well-established (a business)`,
  },
  {
    id: "frc1p17",
    title: "Nuanced Modal Expressions",
    subtitle: "Devoir and pouvoir beyond the basics",
    kind: "cloze",
    note: "Nuances of devoir, pouvoir, and other modal verbs.",
    data: `Il ___ (devoir) être malade, il n'est pas venu.|doit
Elle ___ (devoir) avoir environ trente ans.|doit
Tu ___ (devoir) partir maintenant, sinon tu seras en retard.|dois
Il ___ (pouvoir) pleuvoir plus tard.|peut
Elle ___ (pouvoir) très bien réussir si elle essaie.|peut
Ça ___ (pouvoir) attendre demain.|peut
Il aurait ___ (devoir) nous prévenir.|dû
Tu n'aurais pas ___ (devoir) faire ça.|dû
Il se ___ (pouvoir) qu'il ait raison.|peut
Elle ___ (devoir) sûrement le savoir déjà.|doit
Vous ___ (devoir) avoir des questions.|devez
Il ne ___ (pouvoir) pas avoir menti.|peut
Elle ___ (devoir) partir tôt demain matin.|doit
Nous ___ (devoir) respecter les règles.|devons
Cela ___ (pouvoir) sembler étrange, mais c'est vrai.|peut
Il ___ (falloir) qu'il vienne absolument.|faut
Il se ___ (pouvoir) bien qu'il ait oublié.|peut
Tu ___ (devoir) te tromper.|dois
Elle n'aurait pas ___ (pouvoir) faire mieux.|pu
Il ___ (devoir) avoir ses raisons.|doit
Nous ___ (pouvoir) toujours essayer.|pouvons
Cela n'aurait pas ___ (devoir) arriver.|dû
Il ___ (devoir) être fatigué après ce voyage.|doit
Elle ___ (pouvoir) avoir raison, après tout.|peut
Vous n'auriez pas ___ (devoir) partir sans prévenir.|dû`,
  },
  {
    id: "frc1p18",
    title: "Etymology & Word Formation",
    subtitle: "Prefixes and suffixes",
    kind: "pair",
    prompt: 'The prefix/suffix "%s" typically means…',
    note: "Common French prefixes and suffixes and what they signal.",
    data: `re-|again, back
dé-/dés-|reversal, removal
in-/im-|not, opposite of
anti-|against
pré-|before
post-|after
sur-|over, above
sous-|under, below
co-|together, jointly
inter-|between
trans-|across
auto-|self
bi-|two
mono-|one, single
multi-|many
extra-|beyond, extremely
-tion|forms a noun of action or result
-ment|forms an adverb, or a noun of action
-eur/-euse|forms a noun for a person who does something
-able/-ible|capable of being
-ique|relating to, forming an adjective
-ité|forms an abstract noun of quality
-if/-ive|forms an adjective
-iser|forms a verb meaning "to make"
-age|forms a noun of action or result`,
  },
  {
    id: "frc1p19",
    title: "Academic Writing Phrases",
    subtitle: "Structuring an academic essay",
    kind: "cloze",
    note: "Set phrases for academic essays and structured argument.",
    data: `Cet essai a pour ___ d'examiner ce phénomène.|objectif
Il convient tout d'abord de ___ le contexte.|situer
Dans un premier temps, nous allons ___ les causes.|analyser
Cette étude s'appuie sur des ___ empiriques.|données
Il est important de ___ ces résultats avec prudence.|interpréter
Nous nous proposons d'___ cette question sous un nouvel angle.|aborder
En ___ de cette analyse, plusieurs conclusions se dégagent.|conclusion
Il convient de ___ que ces résultats restent limités.|noter
Cette recherche vise à ___ un vide dans la littérature.|combler
Les données ___ une tendance claire.|révèlent
Il est essentiel de ___ ces variables séparément.|considérer
Cette hypothèse reste à ___ empiriquement.|vérifier
Le présent travail s'inscrit dans la ___ de recherches antérieures.|continuité
Il convient de ___ les limites de cette étude.|souligner
Ces résultats ___ largement avec la littérature existante.|corroborent
Nous allons à présent ___ les implications pratiques.|examiner
Cette section a pour but de ___ le cadre théorique.|présenter
Il ressort de cette analyse que plusieurs facteurs ___ en jeu.|entrent
Ces travaux ont grandement ___ à notre compréhension du sujet.|contribué
En définitive, cette étude ___ que d'autres recherches sont nécessaires.|suggère
Il convient de ___ ces résultats à un échantillon plus large.|généraliser
Cette méthode présente plusieurs ___ par rapport aux approches précédentes.|avantages
Les résultats obtenus ___ notre hypothèse de départ.|confirment
Il est nécessaire de ___ ces conclusions dans un contexte plus large.|replacer
Pour conclure, cette étude ___ un éclairage nouveau sur la question.|apporte`,
  },
  {
    id: "frc1p20",
    title: "Nuanced Time & Aspect Expressions",
    subtitle: "Être en train de, venir de, être sur le point de",
    kind: "cloze",
    note: "Aspectual expressions for ongoing, just-finished, and about-to-happen actions.",
    data: `Je ___ (être) en train de préparer le dîner.|suis
Il ___ (venir) de partir.|vient
Nous ___ (être) sur le point de commencer.|sommes
Elle ___ (être) en train de lire.|est
Ils ___ (venir) d'arriver.|viennent
Tu ___ (être) sur le point de comprendre.|es
Je ___ (venir) de finir mon travail.|viens
Elle ___ (être) en train de se préparer.|est
Nous ___ (venir) de recevoir la nouvelle.|venons
Vous ___ (être) sur le point de partir ?|êtes
Il ___ (être) en train de dormir.|est
Elles ___ (venir) de sortir.|viennent
Je ___ (être) sur le point de m'endormir.|suis
Tu ___ (venir) de rater ton bus.|viens
Nous ___ (être) en train de discuter.|sommes
Il ___ (être) sur le point de pleuvoir.|est
Elle ___ (venir) de terminer ses études.|vient
Ils ___ (être) en train de manger.|sont
Vous ___ (venir) de manquer une bonne occasion.|venez
Je ___ (être) en train d'apprendre le français.|suis
Nous ___ (être) sur le point de signer le contrat.|sommes
Elle ___ (venir) de recevoir un appel.|vient
Il ___ (être) en train de travailler dur.|est
Tu ___ (être) sur le point de réussir.|es
Ils ___ (venir) de gagner le match.|viennent`,
  },
];

export const BANK_FR: Record<Level, Pack[]> = { A1, A2, B1, B2, C1 };

const ZERO_COUNTS: Record<Level, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

/** French course has no hand-authored units, so unit numbering always starts at 0. */
export function generatedUnitsFr(): ReturnType<typeof unitsFromBank> {
  return unitsFromBank(BANK_FR, ZERO_COUNTS);
}
