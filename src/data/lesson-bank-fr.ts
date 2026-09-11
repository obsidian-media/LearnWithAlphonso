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
fish|le poisson
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
Je ___ (aller) au marché.|suis allé
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
    data: `happy|content
sad|triste
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
];

export const BANK_FR: Record<Level, Pack[]> = { A1, A2, B1, B2, C1 };

const ZERO_COUNTS: Record<Level, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

/** French course has no hand-authored units, so unit numbering always starts at 0. */
export function generatedUnitsFr(): ReturnType<typeof unitsFromBank> {
  return unitsFromBank(BANK_FR, ZERO_COUNTS);
}
