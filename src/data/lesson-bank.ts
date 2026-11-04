import type { Lesson, Question, Unit } from "./curriculum";
import type { Level } from "./levels";
import {
  orderByLexicalSimilarity,
  orderDistractorCandidates,
  packAnswerPos,
} from "@/lib/distractor-affinity";
import { alsoCorrectReason, clearlyWrongFor, isTwinSpelling, slotClassOf } from "./also-correct";

/**
 * Compact content bank. Each pack holds 25 items written as terse lines
 * (pair and cloze lines may carry an optional third and fourth `|` field, the
 * authored word-card meaning and example -- see packQuestions);
 * the generator below expands them into 5-question lessons and groups
 * lessons into units, giving 30 generated lessons per CEFR band.
 */

type Pack = {
  id: string;
  title: string;
  subtitle: string;
  note: string;
  /**
   * "pair" lines: "left|right" — prompt asks for the right side.
   * "cloze" lines: the left side carries the "___" blank.
   * "listening" lines: "audioText|answer" — the left side is spoken aloud and
   * the pack's own `prompt` is the stem shown after playback.
   * "speak" lines: "phrase|phrase" — the same text twice, because what is
   * shown is exactly what the learner must say. The pack's `prompt` is the
   * instruction ("Say this aloud:").
   * "translate" lines: "idea|phrasing;phrasing;phrasing" — the left side
   * describes what to express WITHOUT giving the sentence away, and the right
   * side is the semicolon-separated list of wordings that count, most
   * canonical first. Two is the enforced minimum (see
   * curriculum-consistency.test.ts); three or more is the intent, because
   * every wording the list misses costs an AI call to accept.
   */
  kind: "pair" | "cloze" | "listening" | "speak" | "translate";
  /**
   * Pair packs whose answer (right side) is a definition: the word-card term is the
   * left side instead, carried on each question as `term`. Moves no ids, options or answers.
   */
  termFromLeft?: boolean;
  /** prompt template for pair packs, `%s` is the left side. */
  prompt?: string;
  data: string;
};

const A1: Pack[] = [
  {
    id: "a1p1",
    title: "Plurals",
    subtitle: "Singular → plural",
    kind: "pair",
    prompt: 'Plural of "%s":',
    note: "Irregular and spelling-change plurals must be memorised.",
    data: `child|children|more than one child|The children play in the park.
man|men|more than one man|Two men are at the door.
woman|women|more than one woman|The women talk after class.
person|people|more than one person; many men and women|Many people live in this town.
foot|feet|the parts of your body you walk on|My feet are very tired.
tooth|teeth|the hard white parts in your mouth|Brush your teeth every night.
mouse|mice|more than one mouse; small animals|Mice eat cheese in the story.
goose|geese|more than one goose; big water birds|The geese swim on the lake.
knife|knives|more than one knife; tools for cutting|Put the knives on the table.
leaf|leaves|the green parts of a tree|The leaves fall in autumn.
wife|wives|more than one wife|Both wives came to the party.
shelf|shelves|flat boards on a wall for books|The shelves are full of books.
city|cities|big places where many people live|London and Paris are big cities.
baby|babies|very young children|The babies sleep all day.
party|parties|times when friends meet to have fun|There are two parties this weekend.
box|boxes|containers for storing or carrying things|The boxes are under the bed.
watch|watches|small clocks you wear on your wrist|Her watches are on the shelf.
bus|buses|big vehicles that carry many people|Two buses stop here every hour.
dish|dishes|plates and bowls for food|Please wash the dishes after dinner.
potato|potatoes|round brown vegetables that grow under the ground|We cook potatoes for dinner.
photo|photos|pictures made with a camera|Look at my holiday photos.
sheep|sheep|woolly farm animals; one word for many|The sheep eat grass on the hill.
fish|fish|water animals; the same for one or many|Fish live in the sea.
half|halves|two equal parts of one thing|Cut the apple into two halves.
life|lives|the time that people are alive|Doctors work to save lives.`,
  },
  {
    id: "a1p2",
    title: "To Be & Present Simple",
    subtitle: "Core verb forms",
    kind: "cloze",
    note: "Match the verb form to the subject.",
    data: `I ___ a student.|am|the verb be, used with I
She ___ my sister.|is|the verb be, used with he or she
They ___ at home.|are|the verb be, used with they or we
He ___ to work by bus.|goes|moves or travels; used with he or she
We ___ English every day.|study|to learn about something
It ___ cold today.|is|the verb be; tells about the weather
My parents ___ teachers.|are|be, used with more than one person
She ___ coffee in the morning.|drinks|takes liquid into the mouth
I ___ like spicy food.|don't|short for do not; makes a negative
He ___ not live here.|does|helps make a negative with he or she
___ you from Spain?|Are|starts a question with you
___ she speak French?|Does|starts a question with he or she
The keys ___ on the table.|are
Tom ___ football on Sundays.|plays|takes part in a game or sport
I ___ two brothers.|have|shows what or who someone has
She ___ a car.|has|shows what he, she or it owns
We ___ not ready.|are|the verb be, used with we
___ it your birthday?|Is|starts a question with it
They ___ breakfast at seven.|have|to eat or drink a meal
He ___ up at six.|gets|"gets up" means to leave your bed
The shop ___ at nine.|opens|becomes ready for people to come in
Birds ___ south in winter.|fly|to move through the air
My phone ___ working.|isn't|short for is not
You ___ right.|are|the verb be, used with you
She ___ in London.|lives|has a home in a place`,
  },
  {
    id: "a1p3",
    title: "Opposites",
    subtitle: "Everyday adjectives",
    kind: "pair",
    prompt: 'Opposite of "%s":',
    note: "Learning adjectives in pairs doubles your vocabulary.",
    data: `big|small|little in size|My room is small but nice.
hot|cold|not hot; with a low temperature|The water is cold today.
old|young|not old; having lived a short time|My sister is very young.
fast|slow|not fast; taking a long time|The bus is very slow today.
happy|sad|unhappy; feeling bad|He is sad about his lost dog.
easy|difficult|not easy; hard to do|This test is difficult for me.
cheap|expensive|costing a lot of money|That coat is too expensive.
early|late|after the right time|I am late for school.
open|closed|not open; shut|The shop is closed on Sundays.
clean|dirty|not clean; covered with dirt|Your shoes are dirty.
full|empty|with nothing inside|The box is empty.
light|heavy|weighing a lot; hard to lift|This bag is very heavy.
near|far|a long way away|The beach is far from here.
strong|weak|not strong; without much power|She felt weak after the long illness.
long|short|not long; small in length|My hair is short.
wet|dry|with no water on it|The towel is dry now.
loud|quiet|making very little noise|Please be quiet in the library.
right|wrong|not correct|Your answer is wrong.
rich|poor|having very little money|The poor man has no home.
soft|hard|not soft; firm|This bed is too hard.
new|old|not new; used for many years|This house is very old.
high|low|not high; near the ground|The table is low.
safe|dangerous|not safe; able to hurt you|The road is dangerous at night.
same|different|not the same|My shoes are different from yours.
first|last|coming after all the others|He was the last person here.`,
  },
  {
    id: "a1p4",
    title: "Time & Place",
    subtitle: "Basic prepositions",
    kind: "cloze",
    note: "Use in for months/years, on for days/dates, at for clock times.",
    data: `The exam is ___ 15 March.|on|used with days and dates
I was born ___ 1998.|in|used with years, months and seasons
We eat ___ seven o'clock.|at|used with exact times
The cat is ___ the table.|under|in a lower place than something
She lives ___ Paris.|in
Put the book ___ the shelf.|on|touching the top of something
I'll see you ___ the weekend.|at|used with the weekend and holidays
The shop is ___ the bank.|next to|very close to the side of
He arrives ___ May.|in|used with months
We meet ___ Friday evening.|on
The bus stops ___ the corner.|at|shows an exact place
There is a picture ___ the wall.|on|touching a wall or other surface
The keys are ___ my bag.|in|inside something
She sits ___ me in class.|beside|at the side of someone
The plane flies ___ the clouds.|above|higher than something
Walk ___ the bridge.|across|from one side to the other
The dog is ___ the door.|behind|at the back of something
Come ___ the room.|into|moving to the inside of a place
We travel ___ train.|by|shows how you travel
The party is ___ midnight.|at|used before a clock time|The class starts at nine.
I study ___ the morning.|in|used with parts of the day
The cafe is ___ the station.|opposite|facing something on the other side
He is ___ holiday.|on|used in the phrase "on holiday"
The ball rolled ___ the hill.|down|from a high place to a low place
She waited ___ the rain.|in`,
  },
  {
    id: "a1p5",
    title: "Everyday Verbs",
    subtitle: "Verb + noun pairs",
    kind: "pair",
    prompt: 'Which verb goes with "%s"?',
    note: "English fixes certain verbs to certain nouns.",
    data: `a shower|take|to have; used in "take a shower"|I take a shower every morning.
breakfast|have|to eat; used in "have breakfast"|We have breakfast at eight.
homework|do|to carry out a task or activity|I do my homework after school.
a photo|take
a mistake|make|to create or cause something|Everyone can make a mistake.
the bus|catch|to get on a bus or train|I catch the bus at seven.
music|listen to|to hear something carefully|I listen to music on the bus.
TV|watch|to look at something moving|We watch TV after dinner.
a question|ask|to say something to get an answer|May I ask a question?
money|spend|to pay money for things|He likes to spend money on games.
friends|make|to start a friendship with people|She makes friends very easily.
a bike|ride|to sit on a bike and move|I ride my bike to school.
the dishes|wash|to clean with water|I wash the dishes after dinner.
your teeth|brush|to clean or tidy teeth or hair|Brush your teeth twice a day.
a nap|take|to have; used in "take a nap"|I take a nap after lunch.
a decision|make|used with "decision"; means to choose|You must make a decision today.
the shopping|do|used with "the shopping"; to buy things|I do the shopping on Saturdays.
a language|speak|to say words aloud; to talk|She can speak three languages.
a letter|write|to put words on paper|I write a letter to my friend.
the piano|play|to make music on an instrument|He plays the piano well.
a bed|make|to tidy the sheets on a bed|I make my bed every morning.
a cold|catch|to get an illness|Wear a coat or you will catch a cold.
a party|throw|to hold or give a party|They throw a big party every year.
attention|pay|to give, as in "pay attention"|Please pay attention to the teacher.
care|take|used in "take care"; to be careful|Take care when you cross the road.`,
  },
  {
    id: "a1p6",
    title: "Questions",
    subtitle: "Question words",
    kind: "cloze",
    note: "Choose the question word that matches the answer you want.",
    data: `___ is your name?|What|asks about a thing
___ do you live?|Where|asks about a place
___ are you late?|Why|asks for a reason
___ does the film start?|When|asks about a time
___ is that woman?|Who|asks about a person
___ much is the ticket?|How|asks about price, way or amount
___ book is this?|Whose|asks who owns something
___ colour do you like?|Which|asks you to choose from a group
___ old are you?|How
___ are you going?|Where|asks about a place
___ many people came?|How|used in "how many" to ask about number
___ is your favourite singer?|Who|asks about a person|Who is your best friend?
___ time is it?|What|used in "what time" to ask the hour
___ often do you exercise?|How
___ do you get to work?|How
___ is the meeting about?|What|asks about the topic of something
___ did you choose that one?|Why|asks for a reason
___ one is cheaper?|Which|asks about one thing among others
___ far is the beach?|How|used in "how far" to ask distance
___ are you free?|When|asks about a time or day
___ told you that?|Who|asks about a person
___ is the problem?|What|asks about a thing or problem
___ long does it take?|How|used in "how long" to ask about time
___ bag is on the chair?|Whose|asks who owns something
___ do we start?|When|asks about a time`,
  },
  {
    id: "a1p7",
    title: "Family & People",
    subtitle: "Male → female counterparts",
    kind: "pair",
    prompt: 'Female form of "%s":',
    note: "Many family and role words change form by gender in English.",
    data: `father|mother|your female parent|My mother works at a school.
brother|sister|a girl with the same parents|My sister is older than me.
son|daughter|your female child|Their daughter is ten years old.
husband|wife|a woman who is married|His wife is a nurse.
uncle|aunt|the sister of your mother or father|My aunt lives in Spain.
nephew|niece|the daughter of your brother or sister|My niece is five years old.
grandfather|grandmother|the mother of your mother or father|My grandmother makes great soup.
boy|girl|a young female person|The girl is reading a book.
man|woman|an adult female person|That woman is my teacher.
king|queen|a woman who rules a country|The queen lives in a big palace.
prince|princess|the daughter of a king or queen|The princess wore a gold crown.
actor|actress|a woman who acts in films|The actress won a big prize.
waiter|waitress|a woman who brings food in a restaurant|The waitress brought our soup.
host|hostess|a woman who invites guests to her home|The hostess welcomed every guest.
hero|heroine|a brave woman in a story|The heroine saves the village.
groom|bride|a woman on her wedding day|The bride wore a white dress.
gentleman|lady|a polite word for a woman|That lady helped me find the bus.
godfather|godmother|a special woman friend of a child's family|My godmother sends me a gift each year.
grandson|granddaughter|the daughter of your son or daughter|Her granddaughter visits every Sunday.
stepfather|stepmother|your father's new wife|My stepmother cooks very well.
father-in-law|mother-in-law|the mother of your husband or wife|My mother-in-law lives nearby.
landlord|landlady|a woman who owns the house you rent|The landlady fixed the broken door.
widower|widow|a woman whose husband has died|The widow lives alone.
duke|duchess|a woman with a very high title|The duchess opened the new library.
salesman|saleswoman|a woman who sells things for work|The saleswoman showed me a new phone.`,
  },
  {
    id: "a1p8",
    title: "Food & Drink",
    subtitle: "Everyday meals",
    kind: "cloze",
    note: "High-frequency food vocabulary used in daily conversation.",
    data: `I'd like a cup of ___, please.|coffee|a hot brown drink
Can I have some ___ with my tea?|milk|a white drink from cows
We had ___ and eggs for breakfast.|bacon|salty meat from a pig
She ordered a bowl of ___ soup.|tomato|a round red vegetable
Pass the ___ and pepper, please.|salt|white powder you put on food
I'll have a slice of ___ bread.|brown|the colour of wood or mud
Would you like some ___ on your salad?|dressing|sauce you put on a salad
He always has ___ for dessert.|cake|a sweet food baked in an oven
Can we get the ___ for the table?|menu|a list of food you can order
I'm allergic to ___.|peanuts|small nuts that grow in the ground
She drinks ___ juice every morning.|orange|a sweet round fruit
We need more ___ for the sandwiches.|cheese|a food made from milk
Could you pass the ___ for my tea?|sugar|sweet white powder for food and drinks
Let's order a ___ of pizza to share.|slice|a thin piece cut from food
He spread some ___ on his toast.|jam|a sweet food made from fruit
I prefer ___ tea to green tea.|black|very dark; tea with no milk
Could I have the bill, or the ___?|check|the bill you pay in a restaurant
This restaurant is famous for its ___.|steak|a thick piece of cooked beef
She's a vegetarian, so no ___ for her.|meat|food that comes from animals
We ran out of ___ for breakfast.|bread|a food baked from flour
This dish needs a squeeze of ___.|lemon|a sour yellow fruit
He always orders his steak ___.|rare|cooked a little, still red inside
Could we split the ___ between us?|bill|the paper that shows what you must pay
This cake is made with real ___.|butter|soft yellow food made from milk
Would you like ___ or sparkling water?|still|water without bubbles`,
  },
  {
    id: "a1p9",
    title: "Clothes & Colours",
    subtitle: "What people wear",
    kind: "cloze",
    note: "Common clothing vocabulary with colour adjectives.",
    data: `She's wearing a red ___.|dress|clothing with a top and skirt in one
He always wears a black ___.|jacket|a short coat
I need new ___ for winter.|boots|strong shoes that cover your ankles
Put on your ___ before you go out.|coat|warm clothing you wear outside
These ___ are too tight.|jeans|strong blue trousers
She bought a blue ___ for work.|shirt|clothing for the top of your body
He wears ___ to bed.|pyjamas|clothes you wear in bed
I can't find my left ___.|sock|a soft cover for your foot
It's cold — wear a ___.|scarf|cloth you wear around your neck
She never leaves home without her ___.|sunglasses|dark glasses that protect your eyes from sun
He wore a ___ to the wedding.|suit|a jacket and trousers that match
These shoes have a broken ___.|lace|a string you tie on a shoe
I like your green ___.|sweater|warm clothing made of wool
She wears a ___ on her wrist.|watch|a small clock you wear on your wrist
He always carries a leather ___.|bag|a container you carry things in
Take your ___ — it might rain.|umbrella|something that keeps the rain off you
She wore a yellow ___ to the party.|hat|a covering for your head
He loosened his ___ after a long day.|tie|a long cloth worn around the neck
I need to buy new ___ for the gym.|shorts|trousers that end above the knee
She wore a white ___ under her jacket.|blouse|a light shirt for women
He put on his ___ before the run.|trainers|soft shoes for sport
These ___ don't match my shoes.|socks|soft coverings for your feet
She tied her hair back with a ___.|ribbon|a thin strip of cloth for tying
He rolled up his ___.|sleeves|the parts of clothes for your arms
I ironed my ___ this morning.|trousers|clothing for your legs`,
  },
  {
    id: "a1p10",
    title: "Weather & Seasons",
    subtitle: "Talking about the sky",
    kind: "cloze",
    note: "Basic weather vocabulary and seasonal expressions.",
    data: `It's very ___ today — take an umbrella.|rainy|with a lot of rain
The sky is ___ and blue.|clear|with no clouds
It's ___ outside, so wear a coat.|cold|low in temperature
There's a strong ___ blowing today.|wind|air that moves fast
It ___ heavily all night.|rained|water fell from the sky
The forecast says it will ___ tomorrow.|snow|soft white ice that falls from the sky
Summer is the ___ season of the year.|hottest|more hot than all the others
In autumn, the leaves turn ___.|brown|the colour of wood or mud
It's very ___ today — over thirty degrees.|hot|very warm
The ___ is out, so let's go to the beach.|sun|the big star that gives us light
There was a loud ___ during the storm.|thunder|the loud noise in a storm|We heard thunder during the storm.
It's ___ this morning — I can barely see.|foggy|with thick cloud near the ground
Winter in this city is very ___.|harsh|very cold and difficult to bear
The temperature dropped ___ overnight.|suddenly|very quickly, without warning
Spring brings warmer ___ and flowers.|weather|the rain, wind and sun outside
It's ___ outside — the ground is icy.|freezing|very, very cold
A ___ crossed the sky before the rain.|cloud|a white or grey shape in the sky
We had a picnic on a ___ day.|sunny|bright with sun
The ___ made it hard to drive.|fog|thick cloud near the ground
The sky turned dark before the ___ began.|storm|very bad weather with wind and rain
It's too ___ to go swimming today.|windy|with a lot of wind
The ___ melted quickly in the sun.|ice|frozen water
Autumn is also called ___ in American English.|fall|American word for autumn
It's a ___ day, perfect for a walk.|mild|not too hot and not too cold
Bring a jacket — it's ___ this evening.|chilly|a little cold`,
  },
  {
    id: "a1p11",
    title: "Numbers & Money",
    subtitle: "Prices and quantities",
    kind: "cloze",
    note: "Everyday number and money vocabulary.",
    data: `This shirt costs ___ dollars.|twenty|the number 20
I keep a jar of one-pound ___ on the shelf.|coins|small round pieces of metal money|I keep some coins in a jar.
I'd like to ___ some money from the machine.|withdraw|to take money out of a bank
The bill comes to ___ euros.|fifteen|the number 15
Could you ___ this twenty-pound note for smaller ones?|change|to swap money for other money
I need to ___ some money for the trip.|save|to keep money for later
She ___ ten dollars on the gift.|spent|paid money for something
He asked for a ___ on the price.|discount|a lower price
This costs ___ than I expected.|more|a bigger amount
Do you have ___ change for a ten?|exact|just right, not more or less
The total is ___ pounds and fifty pence.|three|the number 3
I paid by ___, not cash.|card|a plastic way to pay
Could I get a ___ for this purchase?|receipt|a paper that shows you paid
The price includes ___.|tax|money you pay to the government
She counted the ___ carefully.|money|coins and notes you use to buy things
I only have a few ___ left.|notes|paper money
He borrowed ___ dollars from his brother.|fifty|the number 50
The shop only accepts ___ payments.|contactless|paying by touching your card
We split the bill ___.|equally|in the same amount for everyone
I forgot my ___ at home.|wallet|a small case for money and cards
The item is on ___ this week.|sale|a time when shops lower prices
She saved ___ money for college.|enough|as much as you need
The price went ___ last month.|up|to a higher level
He paid the ___ in full.|amount|how much of something there is
I need to check my bank ___.|balance|the money you have in the bank`,
  },
  {
    id: "a1p12",
    title: "Jobs & Occupations",
    subtitle: "What people do",
    kind: "pair",
    prompt: 'Someone who "%s" is a…',
    note: "Common job titles matched to their main duty.",
    data: `teaches students|teacher|a person who helps students learn|My teacher is very kind.
treats sick people|doctor|a person who helps sick people|The doctor gave me some medicine.
cooks food in a restaurant|chef|a person who cooks in a restaurant|The chef makes great soup.
flies a plane|pilot|a person who flies a plane|The pilot spoke to the passengers.
fixes cars|mechanic|a person who fixes cars|The mechanic fixed our car.
delivers letters|postman|a person who brings letters to homes|The postman comes at nine.
puts out fires|firefighter|a person who puts out fires|The firefighter climbed the ladder.
defends the law|lawyer|a person who works with the law|My aunt is a lawyer.
builds houses|builder|a person who makes houses|The builder is building a new house.
cuts hair|hairdresser|a person who cuts your hair|I go to the hairdresser every month.
serves food in a restaurant|waiter|a man who brings food to tables|The waiter brought our drinks.
designs buildings|architect|a person who plans new buildings|The architect drew a plan for the school.
grows crops|farmer|a person who grows food on a farm|The farmer has fifty cows.
sells goods in a shop|shopkeeper|a person who runs a small shop|The shopkeeper opens at nine.
catches criminals|police officer|a person who stops crime|The police officer helped us.
writes news stories|journalist|a person who writes the news|The journalist wrote a story about our town.
looks after teeth|dentist|a person who looks after your teeth|I go to the dentist twice a year.
drives a taxi|taxi driver|a person who drives people in a taxi|The taxi driver took us to the hotel.
takes care of patients|nurse|a person who helps sick people in hospital|The nurse took my temperature.
paints houses|painter|a person who paints walls or pictures|The painter painted our kitchen blue.
manages a company|manager|a person in charge of a team|The manager has a meeting at ten.
repairs pipes|plumber|a person who fixes water pipes|The plumber fixed the sink.
programs computers|programmer|a person who writes computer programs|My brother is a programmer.
cleans buildings|cleaner|a person who cleans rooms and buildings|The cleaner comes every morning.
delivers babies|midwife|a person who helps mothers have babies|The midwife helped the baby arrive.`,
  },
  {
    id: "a1p13",
    title: "Animals",
    subtitle: "Pets and wild animals",
    kind: "pair",
    prompt: 'An animal that "%s" is a…',
    note: "Common animals, from pets to farm and wild species.",
    data: `barks and wags its tail|dog|a pet that barks|My dog likes to run.
says meow|cat|a small pet that says meow|The cat sleeps on my bed.
gives us milk|cow|a farm animal that gives milk|The cow eats grass all day.
lays eggs and clucks|hen|a female bird that lays eggs|The hen laid three eggs.
hops and has long ears|rabbit|a small animal with long ears|The rabbit eats a carrot.
is the king of the jungle|lion|a big wild cat; the king of animals|The lion sleeps in the shade.
has a long trunk|elephant|a very big animal with a long nose|An elephant drinks with its trunk.
is very tall with a long neck|giraffe|a very tall animal with a long neck|The giraffe eats leaves from trees.
lives in water and has fins|fish|an animal that lives in water|He caught a big fish.
can fly and has feathers|bird|an animal with wings and feathers|A bird sings in the tree.
is slow and carries a shell|turtle|a slow animal with a hard shell|The turtle walks very slowly.
says quack|duck|a water bird that says quack|The duck swims on the pond.
is pink and says oink|pig|a pink farm animal|The pig is playing in the mud.
has stripes like a cat|tiger|a big wild cat with stripes|The tiger lives in the forest.
climbs trees and eats bananas|monkey|an animal that climbs trees|The monkey eats a banana.
is black and white and eats bamboo|panda|a black and white bear|The panda eats bamboo all day.
hops on strong back legs|kangaroo|an Australian animal that hops|The kangaroo jumps very high.
is a large sea animal with tusks and whiskers|walrus|a big sea animal with long teeth|The walrus lies on the ice.
lives in a hive and makes honey|bee|a small flying insect that makes honey|A bee sat on the flower.
spins a web|spider|a small animal with eight legs|The spider made a web.
is a fast desert animal with a hump|camel|an animal with humps that lives in deserts|The camel walked across the desert.
swims and is the largest animal|whale|a very big animal living in the sea|The whale is bigger than a bus.
is a small garden creature that leaves a slimy trail|snail|a small animal with a shell|The snail moves very slowly.
barks like a dog but is wild|fox|a wild animal like a small dog|The fox ran into the forest.
flies at night and sleeps upside down|bat|a small animal that flies at night|A bat flew out of the cave.`,
  },
  {
    id: "a1p14",
    title: "Days, Months & Time",
    subtitle: "Everyday time expressions",
    kind: "cloze",
    note: "Days of the week, months, and simple time phrases.",
    data: `The first day of the school week is ___.|Monday|the first day of the school week
The last day of the weekend is ___.|Sunday|the day after Saturday
Christmas is in the month of ___.|December|the last month of the year
The shortest month of the year is ___.|February|the second month of the year
We eat lunch in the ___.|afternoon|the time between noon and evening
We usually sleep at ___.|night|the dark time when we sleep
There are seven days in a ___.|week|a period of seven days
There are twelve ___ in a year.|months|periods of about thirty days
My birthday is in the month of ___.|July|a summer month, after June
The clock shows what ___ it is.|time|what a clock shows
I wake up early in the ___.|morning|the first part of the day
The first month of the year is ___.|January|the first month of the year
Halloween is celebrated in ___.|October|the tenth month of the year
We go to work on weekday ___, not weekends.|mornings|the early parts of days
A year has three hundred and sixty-five ___.|days|periods of twenty-four hours
The day after Friday is ___.|Saturday|the day before Sunday
Summer holidays often start in ___.|June|the month after May
The day before Wednesday is ___.|Tuesday|the day after Monday
New Year's Eve is on the last day of the ___.|year|a period of twelve months|A year has twelve months.
There are sixty minutes in an ___.|hour|a period of sixty minutes
There are sixty seconds in a ___.|minute|a period of sixty seconds
The middle day of the week is ___.|Wednesday|the day after Tuesday
Twelve o'clock in the middle of the day is called ___.|noon|twelve o'clock in the day|We eat lunch at noon.
We often relax on the ___.|weekend|Saturday and Sunday
The day after Thursday is ___.|Friday|the day before Saturday`,
  },
  {
    id: "a1p15",
    title: "Shapes & Sizes",
    subtitle: "Describing objects",
    kind: "pair",
    prompt: 'Something that "%s" is…',
    note: "Basic shapes and size adjectives.",
    data: `has three sides|triangle|a shape with three sides|The road sign is a triangle.
has four equal sides|square|a shape with four equal sides|The window is a square.
is perfectly round|circle|a perfectly round shape|Draw a circle on the paper.
has four sides, two longer than the others|rectangle|a shape with four sides, two long|The door is shaped like a rectangle.
has five sides|pentagon|a shape with five sides|A pentagon has five sides.
has six sides|hexagon|a shape with six sides|A hexagon has six sides.
is shaped like an egg|oval|a shape like an egg|The mirror has an oval shape.
has eight sides|octagon|a shape with eight sides|A stop sign is an octagon.
is very big|huge|very, very big|The elephant is huge.
is very small|tiny|very small|The ant is tiny.
is not thick|thin|not thick|This book is thin.
is not thin|thick|not thin|The wall is very thick.
is longer than usual|long|measuring a lot from end to end|The river is very long.
is not long|short|not long|She has short black hair.
is very tall|towering|very tall and high|The towering tree touched the clouds.
is not wide|narrow|not wide|The street is narrow.
is very wide|broad|wide from side to side|He has broad shoulders.
is not heavy|light|not heavy|This bag is light.
is very heavy|heavy|weighing a lot|The suitcase is heavy.
is a perfect cube shape|cube|a solid shape with six equal sides|Ice cubes float in my drink.
is round like a ball|sphere|a round shape like a ball|The Earth is a sphere.
has a pointed top|cone|a round base and a pointed top|The ice cream is in a cone.
is shaped like a tube|cylinder|a shape like a tube|The can is a cylinder.
is medium, not big or small|average|normal; not big or small|He is of average height.
is bigger than expected|oversized|too big; bigger than normal|He wore an oversized coat.`,
  },
  {
    id: "a1p16",
    title: "Daily Routine",
    subtitle: "Everyday actions in order",
    kind: "cloze",
    note: "Simple present tense sentences describing a typical day.",
    data: `I ___ up at seven o'clock every morning.|wake|to stop sleeping
She ___ a shower before breakfast.|takes|to have; used in "takes a shower"
She ___ her hair before she goes out.|brushes|makes hair tidy with a tool
We ___ breakfast together as a family.|eat|to put food in your mouth
I ___ dressed before I leave the house.|get|to become; used in "get dressed"
She ___ to work by bus.|travels|goes from one place to another
He ___ his email first thing at the office.|checks|looks to see what is new
We ___ lunch at around one o'clock.|have|to eat a meal
I ___ home from work at six.|come|to move towards a place
She ___ dinner for the family.|cooks|makes food hot to eat
He ___ the dishes after dinner.|washes|cleans with water
We ___ television in the evening.|watch|to look at something moving
I ___ a book before bed.|read|to look at words and understand
She ___ to bed at eleven o'clock.|goes|moves to a place
He ___ his phone one last time before sleeping.|glances at|looks quickly at
We ___ the house before we leave in the morning.|tidy|to make a place neat
I ___ my bag the night before.|pack|to put things in a bag
She ___ the kids to school every day.|drives|takes people by car
He ___ out three times a week.|works|"works out" means to exercise
We ___ the dog every evening.|walk|to take a dog outside
I ___ my clothes for the next day.|choose|to pick one thing
She ___ up early on weekdays.|gets|"gets up" means to leave bed
He ___ home late on Fridays.|arrives|reaches a place
We ___ the weekend relaxing at home.|spend|to pass time doing something
I always ___ my alarm before I sleep.|set|to get a clock ready to ring`,
  },
  {
    id: "a1p17",
    title: "In the Classroom",
    subtitle: "School objects and language",
    kind: "cloze",
    note: "Common classroom vocabulary for beginners.",
    data: `Open your ___ to page ten.|book|pages of words to read
Please write on the ___.|whiteboard|a large smooth surface you write on
I need a ___ to write my answer.|pen|a tool for writing with ink
Can I borrow your ___ to draw a line?|ruler|a tool for measuring and drawing lines
The ___ sits at the front of the class.|teacher|a person who helps students learn
Please put your hand ___ if you know the answer.|up|towards a higher place
We do our homework in a ___.|notebook|a book with empty pages to write in
The students sit at their ___.|desks|tables where students sit and work
Please ___ your books before the test.|close|to shut
The teacher gave us a new ___ today.|worksheet|a paper with questions to answer
I forgot my ___, so I can't do the maths today.|calculator|a small machine for maths|May I use a calculator in the test?
Please ___ to the teacher carefully.|listen|to hear carefully
The ___ rings at the end of the lesson.|bell|something that rings to tell the time
We use a ___ to erase mistakes.|rubber|a tool for erasing pencil marks
Please sit ___ and be quiet.|down|towards a lower place
The teacher asked us to ___ our hands.|raise|to lift up
I need to ___ my pencil, it's too short.|sharpen|to make a point on a pencil
Our classroom has a big ___ on the wall.|map|a picture of land and places
Please hand in your ___ at the end of class.|homework|schoolwork you do at home
The students are reading their ___ quietly.|textbooks|school books for learning a subject
We have a test ___ Friday.|on|used with days of the week
Please turn to the next ___.|page|one side of a sheet in a book
The teacher wrote the date on the ___.|board|a big flat surface you write on
I keep my pens in a ___.|pencil case|a small bag for pens and pencils
Please be ___ during the exam.|quiet|making no noise`,
  },
  {
    id: "a1p18",
    title: "Describing Things",
    subtitle: "Adjective + noun matches",
    kind: "pair",
    prompt: 'Which noun goes with "%s"?',
    note: "Common adjectives matched to a noun they naturally describe.",
    data: `sharp|knife|a tool for cutting|The knife is very sharp.
soft|pillow|a soft bag for your head in bed|This pillow is soft.
hard|rock|a hard piece of stone|The rock is hard.
bright|light|what lets you see in the dark|The light is very bright.
loud|noise|a sound that is loud or unwanted|The noise was too loud.
quiet|library|a place where you borrow books|The library is quiet.
fast|car|a vehicle with four wheels|The car is fast.
slow|turtle|a slow animal with a hard shell|The turtle is very slow.
heavy|suitcase|a big bag for travelling|My suitcase is heavy.
light|feather|a light part of a bird|A feather is very light.
hot|fire|flames that give heat and light|The fire is hot.
cold|ice|frozen water|The ice is very cold.
sweet|sugar|sweet white powder for food|Sugar is sweet.
sour|lemon|a sour yellow fruit|A lemon tastes sour.
tall|building|a place with walls and a roof|That building is very tall.
short|pencil|a thin tool for writing|This pencil is too short.
wide|road|a wide path for cars|The road is wide.
narrow|path|a narrow way for walking|The path is narrow.
clean|kitchen|the room where you cook|The kitchen is clean.
dirty|shoes|things you wear on your feet|My shoes are dirty.
full|glass|a container you drink from|The glass is full.
empty|bottle|a container for water or milk|The bottle is empty.
new|phone|a device for calling people|I have a new phone.
old|book|pages of words in a cover|This book is very old.
wet|towel|a cloth for drying yourself|The towel is wet.`,
  },
  {
    id: "a1p19",
    title: "At the Supermarket",
    subtitle: "Shopping for groceries",
    kind: "cloze",
    note: "Everyday vocabulary for grocery shopping.",
    data: `I need to buy some ___ for dinner tonight.|food|things you eat
Can you push the ___ while I shop?|trolley|a cart you push in a shop
Put the apples in the ___.|basket|a small container for shopping
We're out of ___, so I need to buy more bread.|bread|a food baked from flour|We need bread to make toast.
Please check the ___ before you buy the milk.|date|the day, month and year
The ___ is at the front of the shop.|checkout|the place where you pay
I forgot my shopping ___ at home.|list|things written down one by one
This ___ is on sale this week.|item|one thing in a group
Could you weigh these ___ for me?|vegetables|plants you eat, like carrots
I paid with my ___ card.|debit|a card that takes money from your bank
The ___ scanned each item quickly.|cashier|a person who takes your money
We need to buy more ___ for breakfast.|eggs|oval food from hens
The ___ are in aisle five.|snacks|small food between meals
I always bring my own shopping ___.|bag|a container to carry shopping
Could you tell me where the ___ is?|dairy section|where a shop keeps milk and cheese
This shop has a big ___ this week.|discount|a lower price
I need to buy some ___ for cooking.|oil|a liquid used for cooking
The queue at the ___ was very long.|till|the machine that holds a shop's money
Please put the frozen food in the ___.|freezer|a very cold box for frozen food
I always check the ___ before I buy something.|price|how much something costs
We ran out of ___, so buy some soap.|soap|something you use to wash|I use soap to wash my hands.
The shop closes at ___ o'clock.|nine|the number 9
I need a ___ to carry all these bags.|bag for life|a strong bag you use many times|I bring a bag for life to the shop.
Could you get some ___ for the salad?|lettuce|a green leaf for salads
The receipt shows the total ___.|amount|how much there is of something`,
  },
  {
    id: "a1p20",
    title: "Transport & Travel Basics",
    subtitle: "Getting from A to B",
    kind: "cloze",
    note: "Basic transport vocabulary for beginners.",
    data: `I go to work by ___ every day.|bus|a big vehicle that carries many people
The ___ leaves from platform three.|train|a long vehicle that runs on rails
We need to catch a ___ to the airport.|taxi|a car you pay to ride in
I ride my ___ to school.|bike|a two-wheeled vehicle you pedal
The ___ takes off in an hour.|plane|a vehicle that flies
Could you tell me where the ___ stop is?|coach|a comfortable bus for long trips
I usually ___ to work, it's not far.|walk|to travel on foot
The ___ station is near my house.|metro|a train system in a big city
We need to buy a ___ before we board.|ticket|a paper that lets you travel
The ___ was late this morning.|tram|a vehicle on rails in city streets
I left my ___ at home, so I can't drive.|keys|metal things that start a car
The ___ takes you across the river.|ferry|a boat that carries people across water
Please fasten your ___ before we take off.|seatbelt|a strap that keeps you safe
The ___ is the fastest way to travel abroad.|jet|a very fast plane
I usually take the ___ to avoid traffic.|underground|a train system below the city
Our ___ leaves at six in the morning.|flight|a trip in a plane
The ___ dropped us right outside the hotel.|cab|another word for taxi
I need to ___ my ticket before boarding.|show|to let someone see
The road was closed, so we took a ___.|detour|a longer way around a problem
We waited at the ___ for twenty minutes.|station|a place where trains or buses stop
The ___ was full, so we had to stand.|carriage|one section of a train
I always check the ___ before I travel.|timetable|a list of times for buses or trains
The car needs more ___ before the trip.|petrol|fuel for a car
We arrived at the ___ two hours early.|airport|a place where planes arrive and leave
The ___ takes you underground across the city.|subway|a train system under a city`,
  },
  {
    id: "a1p21",
    title: "Parts of the Body",
    subtitle: "Naming body parts",
    kind: "pair",
    prompt: 'The body part "%s" is your…',
    note: "Basic body part vocabulary.",
    data: `you see with these|eyes|the parts of your face you see with|My eyes are brown.
you hear with these|ears|the parts of your head you hear with|Her ears are cold.
you smell with this|nose|the part of your face you smell with|My nose is red from the cold.
you speak with this|mouth|the part of your face you speak with|Open your mouth wide.
you chew with these|teeth|the hard white parts in your mouth|I brush my teeth twice a day.
this is on top of your neck|head|the top part of your body|She has a hat on her head.
these help you walk|legs|the long parts you walk on|My legs hurt after the run.
these help you hold things|hands|the parts at the end of your arms|Wash your hands before eating.
you bend this in the middle of your arm|elbow|the bend in the middle of your arm|He hurt his elbow.
you bend this in the middle of your leg|knee|the bend in the middle of your leg|My knee hurts when I run.
these are at the end of your legs|feet|the parts at the end of your legs|My feet are cold.
these are at the end of your hands|fingers|the thin parts of your hand|She has long fingers.
this connects your head to your body|neck|the part between your head and body|He wears a scarf on his neck.
this is in the middle of your body|stomach|the part of your body where food goes|My stomach hurts.
these are at the end of your feet|toes|the five small parts on your feet|I can touch my toes.
this pumps blood around your body|heart|the part inside you that pumps blood|Your heart beats fast when you run.
you use these to breathe|lungs|the parts inside you for breathing|Your lungs help you breathe.
this covers your whole body|skin|the outside covering of your body|The sun burns my skin.
these grow on your head|hair|the thin threads that grow on your head|She has long black hair.
this is above your eyes|eyebrow|the line of hair above your eye|He lifted one eyebrow.
these are on the sides of your face|cheeks|the soft sides of your face|The baby has round cheeks.
this is at the front of your leg, below the knee|shin|the front of your leg below the knee|The ball hit my shin.
these connect your hands to your arms|wrists|the thin parts between hand and arm|I wear a watch on my wrist.
this connects your feet to your legs|ankle|the joint between your foot and leg|I hurt my ankle playing football.
this is the largest bone in your face|jaw|the bone that holds your teeth|The dentist checked my jaw.`,
  },
  {
    id: "a1p22",
    title: "Hobbies & Free Time",
    subtitle: "What people enjoy doing",
    kind: "pair",
    prompt: 'This hobby involves "%s"…',
    note: "Common free-time activities.",
    data: `reading|books|pages of writing you read|I read books before bed.
watching|films|stories you watch on a screen|We watch films on Friday night.
listening to|music|sounds made by singing or playing|My brother loves rock music.
playing|video games|games you play on a screen|He plays video games after school.
taking|photographs|pictures made with a camera|She takes photographs of flowers.
drawing|pictures|drawings or paintings|The children draw pictures of animals.
painting|art|paintings and drawings|My sister loves art.
dancing|to music|following the sound of a song|They dance to music all night.
singing|songs|words and music that people sing|We sing songs in class.
collecting|stamps|small paper pictures for letters|He collects old stamps.
gardening|plants|living things that grow in the ground|She grows plants on the balcony.
baking|cakes|sweet foods baked in an oven|We bake cakes on Sundays.
writing|stories|tales about people and events|She writes stories for children.
traveling|new places|towns and countries you have not seen|I love visiting new places.
camping|outdoors|outside, not in a house|We like to camp outdoors.
fishing|by the river|next to a river|He fishes by the river.
cycling|on a bike|sitting on a bicycle|She goes to school on a bike.
running|for exercise|to keep your body strong|I run for exercise.
swimming|in a pool|in water made for swimming|We swim in a pool.
knitting|with wool|using soft thread from sheep|She knits a hat with wool.
enjoying|board games|games played on a flat board|We play board games on rainy days.
following|sports on TV|games you watch on television|Dad watches sports on TV.
volunteering|in the community|with the people near your home|She helps in the community.
learning|a new language|words and rules you have not learned|I am learning a new language.
meditating|for relaxation|to feel calm and rested|Many people walk for relaxation.`,
  },
  {
    id: "a1p23",
    title: "Listening: Everyday Sentences",
    subtitle: "Everyday statements",
    kind: "listening",
    prompt: "What did you hear?",
    note: "Short statements at natural speed, in near-identical pairs.",
    // Every line is a short statement of similar length and register, so
    // neither sentence length nor tone gives the answer away -- the learner
    // has to actually listen. Distractors are the other sentences in this
    // pack, which is what keeps them plausible.
    data: `She's a doctor.|She's a doctor.
She's a teacher.|She's a teacher.
He's a bus driver.|He's a bus driver.
He works at the airport.|He works at the airport.
He works at the hospital.|He works at the hospital.
They live near the park.|They live near the park.
They live near the station.|They live near the station.
I've got two brothers.|I've got two brothers.
I've got two sisters.|I've got two sisters.
We eat dinner at seven.|We eat dinner at seven.
We eat lunch at seven.|We eat lunch at seven.
We eat dinner at eight.|We eat dinner at eight.
The train leaves at nine.|The train leaves at nine.
The train leaves at five.|The train leaves at five.
The bus leaves at nine.|The bus leaves at nine.
She doesn't drink coffee.|She doesn't drink coffee.
He doesn't drink tea.|He doesn't drink tea.
My sister plays the piano.|My sister plays the piano.
My brother plays the guitar.|My brother plays the guitar.
It's very cold today.|It's very cold today.
It's very hot today.|It's very hot today.
The shop opens on Monday.|The shop opens on Monday.
The shop closes on Sunday.|The shop closes on Sunday.
I can't find my keys.|I can't find my keys.
I can't find my phone.|I can't find my phone.`,
  },
  {
    id: "a1p24",
    title: "Speaking: Everyday Phrases",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Short everyday phrases to practise saying.",
    // Each line is the same text twice: what is shown is what must be said.
    // Kept to one breath, and to phrasing the normaliser can actually reconcile
    // with a transcript (see spoken-answer.ts). Five things are avoided on
    // purpose, each of which marked a PERFECT utterance wrong when it slipped
    // through:
    //   - compound numbers and currency ("twenty one" vs smart_format's "21")
    //   - ordinals, for the same reason ("second" vs "2nd")
    //   - a contracted "has" ("He has finished" said as "He's finished", which
    //     normalises to "he is")
    //   - possessive 's ("devil's" normalises to "devil is")
    //   - names and homophones with no disambiguating context ("Sara"/"Sarah")
    data: `Good morning.|Good morning.
Nice to meet you.|Nice to meet you.
How are you today?|How are you today?
My name is Anna.|My name is Anna.
I would like a coffee.|I would like a coffee.
Where is the station?|Where is the station?
Thank you very much.|Thank you very much.
Can you help me?|Can you help me?
I am from Spain.|I am from Spain.
See you tomorrow.|See you tomorrow.
The weather is lovely.|The weather is lovely.
I have two brothers.|I have two brothers.
What time is it?|What time is it?
Excuse me, please.|Excuse me, please.
I work in a bank.|I work in a bank.
She is my sister.|She is my sister.
We live in London.|We live in London.
I do not understand.|I do not understand.
Could you repeat that?|Could you repeat that?
Please open the window.|Please open the window.
I am very hungry.|I am very hungry.
He plays the guitar.|He plays the guitar.
Have a good evening.|Have a good evening.
I am learning English.|I am learning English.
See you next week.|See you next week.`,
  },
  {
    id: "a1p25",
    title: "Say It Your Way",
    subtitle: "Write the idea in English",
    kind: "translate",
    prompt: "Write this in English:",
    note: "Everyday ideas, and more than one wording is right.",
    // The left side describes the idea rather than giving the sentence away --
    // otherwise this is a copying exercise, not a producing one. Each line
    // lists three wordings a learner plausibly reaches for; anything else
    // valid is caught by the AI grader, which is the fallback, not the plan.
    // Avoids the traps the speaking packs documented (compound numbers,
    // ordinals, contracted "has", possessive 's, undisambiguated names),
    // because the same normaliser runs underneath.
    data: `Greet someone in the morning.|Good morning.;Morning.;Good morning to you.
Ask someone their name.|What is your name?;May I ask your name?;Could you tell me your name?
Say you do not understand.|I do not understand.;Sorry, I don't understand.;I am afraid I do not follow.
Ask where the station is.|Where is the station?;Could you tell me where the station is?;How do I get to the station?
Thank someone warmly.|Thank you very much.;Thanks a lot.;Thank you so much.
Ask someone to repeat something.|Could you repeat that?;Can you say that again?;Please say that again.
Say you come from Spain.|I am from Spain.;I come from Spain.;My home country is Spain.
Order a coffee politely.|I would like a coffee, please.;Can I have a coffee, please?;A coffee, please.
Ask how someone is.|How are you?;How are you today?;How are you doing?
Say goodbye until tomorrow.|See you tomorrow.;Goodbye, see you tomorrow.;Until tomorrow.
Ask what the time is.|What time is it?;Do you have the time?;Could you tell me the time?
Say you are hungry.|I am hungry.;I am very hungry.;I could eat something.
Ask someone for help.|Can you help me?;Could you help me?;I need some help, please.
Say you live in London.|I live in London.;I'm living in London.;My home is in London.
Ask the price of something.|How much is it?;How much does it cost?;What does it cost?
Say you are learning English.|I am learning English.;I study English.;I am taking English lessons.
Apologise for arriving late.|I am sorry I am late.;Sorry for being late.;My apologies for the delay.
Ask where the toilet is.|Where is the toilet?;Could you tell me where the toilet is?;Is there a toilet nearby?
Say you do not eat meat.|I do not eat meat.;I never eat meat.;I am vegetarian.
Introduce your sister to someone.|This is my sister.;She is my sister.;Let me introduce my sister.
Say the weather is pleasant.|The weather is nice.;It is nice weather.;It's lovely weather.
Ask someone to speak more slowly.|Could you speak slowly?;Please speak more slowly.;Can you speak slower?
Say you work in a bank.|I work in a bank.;I work at a bank.;My job is in a bank.
Wish someone a good evening.|Have a good evening.;Good evening.;Have a nice evening.
Say you are tired.|I am tired.;I feel tired.;I am exhausted.`,
  },
];

const A2: Pack[] = [
  {
    id: "a2p1",
    title: "Irregular Past",
    subtitle: "Base → past simple",
    kind: "pair",
    prompt: 'Past simple of "%s":',
    note: "Irregular verbs don't take -ed.",
    data: `go|went|the past of "go"|We went to the beach on Sunday.
eat|ate|the past of "eat"|I ate rice for lunch.
buy|bought|the past of "buy"|She bought a new bag.
bring|brought|the past of "bring"|He brought his book to class.
think|thought|the past of "think"|I thought about it all night.
teach|taught|the past of "teach"|She taught us how to swim.
catch|caught|the past of "catch"|He caught the ball with one hand.
see|saw|the past of "see"|We saw a good film last night.
take|took|the past of "take"|I took the bus to work.
give|gave|the past of "give"|My dad gave me a watch.
write|wrote|the past of "write"|She wrote a letter to her friend.
drive|drove|the past of "drive"|He drove to the city.
speak|spoke|the past of "speak"|We spoke on the phone.
break|broke|the past of "break"|I broke a cup this morning.
choose|chose|the past of "choose"|She chose the blue shirt.
know|knew|the past of "know"|I knew the answer.
grow|grew|the past of "grow"|The tree grew very tall.
fly|flew|the past of "fly"|The bird flew over the house.
begin|began|the past of "begin"|The lesson began at nine.
drink|drank|the past of "drink"|He drank a glass of water.
swim|swam|the past of "swim"|We swam in the sea.
run|ran|the past of "run"|She ran to the station.
sit|sat|the past of "sit"|They sat on the grass.
win|won|the past of "win"|Our team won the match.
leave|left|the past of "leave"|He left home at seven.`,
  },
  {
    id: "a2p2",
    title: "Talking About the Past",
    subtitle: "Past tenses in use",
    kind: "cloze",
    note: "Past simple for finished events; past continuous for background action.",
    data: `I ___ to the cinema yesterday.|went|the past of "go"
She ___ cooking when I arrived.|was|the past of "is", used with she
They ___ not come to the party.|did|helps make a past negative
While we ___ , the phone rang.|were talking|shows what was happening at a time
He ___ his keys last night.|lost|no longer had something
___ you enjoy the concert?|Did|starts a question about the past
We ___ living in Rome then.|were|the past of "are", used with we
The film ___ at eight.|started|began
I ___ tired, so I left.|was|the past of "am", used with I
She ___ used to smoke.|didn't|short for did not|She didn't call me last year.
It ___ raining all morning.|was|the past of "is", used with it
They ___ married in 2015.|got|the past of "get"; became
He ___ never late before.|was
I ___ my homework before dinner.|finished|came to the end of
The children ___ in the garden.|were playing|shows what was happening in the past|The children were playing in the garden.
We ___ hear anything.|didn't|short for did not
She ___ the door quietly.|closed|the past of "close"; shut
What ___ you doing at six?|were|the past of "are", used with you
The train ___ on time.|arrived|reached a place
He ___ used to walk to school.|used|"used to" talks about past habits
Nobody ___ what to say.|knew|the past of "know"
I ___ reading when she called.|was|the past of "am", used with I
They ___ a great time.|had|the past of "have"
The lights ___ out suddenly.|went|stopped working, as in "went out"
She ___ born in Lisbon.|was`,
  },
  {
    id: "a2p3",
    title: "Comparatives",
    subtitle: "Adjective → comparative",
    kind: "pair",
    prompt: 'Comparative of "%s":',
    note: 'Short adjectives add -er; long ones take "more".',
    data: `big|bigger|larger in size|My room is bigger than yours.
hot|hotter|with a higher temperature|Today is hotter than yesterday.
happy|happier|feeling more joy|She looks happier today.
easy|easier|less difficult|This test is easier than that one.
good|better|of a higher quality|This pizza is better than that one.
bad|worse|not as good|The weather is worse today.
far|further|at a greater distance|The park is further than the shop.
expensive|more expensive|costing more money|This phone is more expensive than that one.
beautiful|more beautiful|nicer to look at|The garden is more beautiful in spring.
thin|thinner|less thick|A pencil is thinner than a pen.
early|earlier|before the usual time|I wake up earlier on Mondays.
busy|busier|with more things to do|The shop is busier on Saturdays.
safe|safer|less dangerous|This street is safer at night.
large|larger|bigger in size|Their house is larger than ours.
simple|simpler|easier to understand|This plan is simpler than the old one.
careful|more careful|taking more care|Be more careful on the stairs.
tired|more tired|needing more rest|I am more tired than you today.
funny|funnier|making you laugh more|This film is funnier than the last one.
heavy|heavier|weighing more|The red box is heavier than the blue one.
modern|more modern|newer in style|This phone looks more modern than mine.
narrow|narrower|less wide|The road is narrower here.
polite|more polite|showing better manners|He is more polite than his brother.
quiet|quieter|making less noise|The street is quieter at night.
strange|stranger|more unusual or odd|That story is stranger than the first one.
useful|more useful|helping more|A map is more useful than a watch here.`,
  },
  {
    id: "a2p4",
    title: "Out & About",
    subtitle: "Shopping and travel",
    kind: "cloze",
    note: "Fixed travel and shopping phrases.",
    data: `Can I ___ this on?|try|to test clothes by wearing them
I'd like to ___ a room.|book|to reserve a room or seat
Could I have the ___ , please?|bill|the paper that shows what you owe
How much ___ this cost?|does|helps make a question with "it"
Do you ___ by card?|take|to accept; used for payments|Do you take credit cards?
Where do I ___ my luggage?|check in|to register when you arrive
The train ___ from platform 4.|departs|leaves, as a train or plane does
I'd like a ___ ticket, please.|return|a ticket for going and coming back
Is this seat ___ ?|taken|used by someone else; not free
Can you ___ me the way to the museum?|show|to guide someone with your hand or words
I'm just ___ , thanks.|looking|just browsing, not buying yet
Do you have this in a bigger ___ ?|size|how big a piece of clothing is
I'd like to ___ this jacket.|return|to take something back to a shop
What time is ___ out?|check|"check out" means to leave a hotel
Excuse me, is there a ___ near here?|cash machine|a machine that gives you money
The flight has been ___ .|delayed|late; not on time
Could you ___ that down for me?|write|to put words on paper
I'd like to ___ some money.|change|to swap money for another kind
Are you ___ in the queue?|next|coming right after this one
Can I get a ___ to the airport?|taxi|a car you pay to ride in
This shirt doesn't ___ me.|fit|to be the right size
We're ___ of stock.|out|used in "out of stock"; none left
I'll ___ it, thanks.|take|to choose to buy
Where can I ___ the bus?|catch|to get on a bus or train
The price ___ breakfast.|includes|has something as one of its parts|The price includes breakfast.`,
  },
  {
    id: "a2p5",
    title: "How Much, How Many",
    subtitle: "Quantifiers",
    kind: "cloze",
    note: "Countable nouns take many/few; uncountable nouns take much/little.",
    data: `How ___ sugar do you want?|much|a large amount of something
How ___ people came?|many|a large number of things
There isn't ___ milk left.|much
I have a ___ questions.|few|a small number; some
She has ___ money.|little|not much
There are ___ chairs here.|enough|as much as you need
We need ___ more bread.|some|an amount; used in statements
Are there ___ tickets left?|any|used in questions and negative sentences
He drinks too ___ coffee.|much|too big an amount
Only a ___ of us knew.|few|not many
I don't have ___ time.|much|a big amount; used in negatives
There's ___ of space.|plenty|more than enough
___ of the students passed.|Most|almost all
She ate the ___ cake.|whole|all of something; complete
Would you like ___ tea?|some|used in offers and questions
I bought ___ apples.|several|more than two but not many
There's hardly ___ juice.|any|used in questions and with not or hardly|Do you have any juice?
We have ___ homework tonight.|lots of|a large number or amount
He owns ___ books.|many|a large number of things
Add a ___ of salt.|pinch|a small amount you take with two fingers
I need ___ information.|more|a greater amount
There were ___ few chairs.|too|more than is good
Both ___ them agreed.|of|used after "both" and before "them"
Neither ___ us was ready.|of
She has ___ friends here.|no|not any`,
  },
  {
    id: "a2p6",
    title: "Future Forms",
    subtitle: "Will, going to, present continuous",
    kind: "cloze",
    note: '"Will" for decisions now, "going to" for plans, present continuous for arrangements.',
    data: `I think it ___ rain.|will|talks about the future; makes a promise
We ___ going to move house.|are|"are going to" talks about plans
She ___ meeting Tom at six.|is|used for plans already arranged
___ you help me, please?|Will
I'm ___ to study medicine.|going|"going to" talks about plans
The train ___ at ten tomorrow.|leaves|used for fixed timetables
They ___ probably be late.|will|shows a guess about the future|They will probably be late.
Look at those clouds — it's ___ to storm.|going|talks about what will happen soon
I ___ have the soup, please.|will
What ___ you doing tonight?|are|used in a question about plans
He ___ be twenty next month.|will|shows a fact about the future|He will be twenty next month.
We're ___ dinner at eight.|having|used for plans already arranged
I promise I ___ tell anyone.|won't|short for will not
She's ___ to look for a new job.|going|"going to" talks about plans
The film ___ at nine.|starts|begins at a set time
___ we take a taxi?|Shall|used to suggest something to friends
I ___ send it tomorrow, I promise.|will|shows a promise or a sure plan|I will send it tomorrow.
I'm not ___ to argue.|going|used in "not going to" for plans
Perhaps they ___ come later.|will
He's ___ his exam on Friday.|taking|used for plans already arranged
It ___ be easy, I'm afraid.|won't|short for will not
We ___ going to need help.|are|used with "we" in "are going to"
I ___ call you when I arrive.|will|talks about a future action
She ___ flying to Rome tomorrow.|is|used for a plan already made
Nobody ___ notice.|will`,
  },
  {
    id: "a2p7",
    title: "House & Home",
    subtitle: "Rooms and furniture",
    kind: "cloze",
    note: "Everyday vocabulary for describing where you live.",
    data: `We cook dinner in the ___.|kitchen|the room where you cook
I keep my clothes in the ___.|wardrobe|a tall cupboard for clothes
She's watching TV in the ___.|living room|the room for relaxing and TV
He's brushing his teeth in the ___.|bathroom|the room for washing
Put the plates in the ___.|cupboard|a closed space for plates and food
We sleep in the ___.|bedroom|the room where you sleep
There's a nice garden behind the ___.|house|a building where people live
I left my keys on the ___.|table|furniture with a flat top
She sat down on the ___ to relax.|sofa|a long soft seat for several people
Hang your coat on the ___.|hook|a curved piece for hanging things
We eat breakfast in the ___.|dining room|the room where you eat meals
He's fixing a shelf in the ___.|garage|a building or room for a car
The washing machine is in the ___.|laundry room|the room for washing clothes
Open the ___ to let some air in.|window|an opening in a wall with glass
Please close the ___ when you leave.|door|what you open to enter a room
We keep the car in the ___.|driveway|the path where you park at home
The stairs lead up to the ___.|attic|the room under the roof
She's watering the plants in the ___.|garden|a place outside with plants
He's cleaning the ___ before guests arrive.|hallway|a narrow room between other rooms
The bed has a soft ___.|mattress|the soft part of a bed
Turn off the ___ before you sleep.|light|a lamp that lets you see
We're renting a small ___ downtown.|flat|a home on one floor of a building
The ___ needs painting.|ceiling|the top inside surface of a room
I store old boxes in the ___.|basement|the room below the ground floor
Please wipe your feet on the ___.|mat|a small rug for the floor`,
  },
  {
    id: "a2p8",
    title: "Sport & Hobbies",
    subtitle: "Free-time activities",
    kind: "pair",
    prompt: 'Which sport or hobby uses "%s"?',
    note: "Match the equipment or place to the activity.",
    data: `a racket|tennis|a game played with rackets and a ball|I play tennis on Saturdays.
a ball and hoop|basketball|a sport with a ball and a hoop|We play basketball at school.
a board and wheels|skateboarding|riding a board with wheels|He loves skateboarding in the park.
a net and ball|volleyball|a team game over a high net|We play volleyball on the beach.
a pool|swimming|moving through water with your body|Swimming is good exercise.
a track|running|moving fast on foot|Running helps me stay healthy.
a helmet and bike|cycling|riding a bike|Cycling to work saves money.
a bat and ball|cricket|a team game with a bat and ball|They watch cricket on TV.
gloves and a ring|boxing|a sport with gloves in a ring|He trains for boxing every day.
skis and snow|skiing|sliding down snow on long boards|We go skiing in winter.
a rod and hook|fishing|trying to catch animals in water|My grandfather loves fishing.
a needle and thread|sewing|joining cloth with needle and thread|She is good at sewing.
a canvas and brush|painting|making pictures with colours|Painting makes her feel calm.
a camera|photography|taking pictures with a camera|He studies photography at school.
clay and a wheel|pottery|making pots and bowls from clay|We made a bowl in pottery class.
a deck of cards|card games|games played with a deck of cards|We play card games at night.
a chessboard|chess|a board game for two players|He plays chess with his grandfather.
a guitar|music|playing or singing songs|She plays the guitar and loves music.
a needle and yarn|knitting|making clothes from yarn with needles|Knitting keeps her hands busy.
a court and net|badminton|a sport played with rackets and a net|We play badminton in the gym.
a climbing wall|climbing|going up a wall or mountain|Climbing is hard but fun.
a yoga mat|yoga|slow exercise for body and mind|I do yoga every morning.
a set of clubs|golf|a sport with clubs and a small ball|My uncle plays golf on Sundays.
a rowing boat|rowing|moving a boat with oars|Rowing is hard on the arms.
a garden and seeds|gardening|growing flowers and vegetables|Gardening is her favourite hobby.`,
  },
  {
    id: "a2p9",
    title: "Body & Health",
    subtitle: "Illness and doctor visits",
    kind: "cloze",
    note: "Basic health vocabulary for describing how you feel.",
    data: `I have a bad ___ and can't stop coughing.|cold|a common illness with a runny nose
She's got a ___ — take some painkillers.|headache|a pain in your head|I have a headache, so I will rest.
My ___ hurts after running.|leg|the long body part you walk on
He broke his ___ playing football.|arm|the body part between shoulder and hand
I feel ___ — I need to sit down.|dizzy|feeling that the room is moving
She has a ___ — please be quiet.|migraine|a very bad headache
My ___ is sore from shouting.|throat|the passage at the back of your mouth
He's got a high ___.|temperature|how hot your body is
I twisted my ___ on the stairs.|ankle|the joint between foot and leg
She's allergic to ___.|nuts|hard-shelled seeds you eat
The doctor gave me some ___.|medicine|something you take to get better
I need to make a ___ appointment.|dentist|a doctor for your teeth
My ___ hurts when I chew.|tooth|a hard white part in your mouth
He's been ___ since Monday.|sick|ill; not well
She fainted because she felt ___.|faint|weak and about to fall down
I cut my ___ while cooking.|finger|one thin part of your hand
The nurse checked my ___.|pulse|the beat of your heart
He needs to rest his ___ leg.|injured|hurt in an accident
I have an ___ stomach.|upset|not well, as in an upset stomach
She's recovering from a ___ .|fever|a high body temperature when ill
My back ___ after lifting the box.|hurts|feels pain
He's got a nasty ___ on his knee.|bruise|a dark mark on skin after a hit
I should see a doctor about my ___.|cough|a sudden noise from your throat
She sprained her ___ at the gym.|wrist|the joint between your hand and arm
The pharmacist recommended this ___ for allergies.|spray|liquid that comes out in a fine mist`,
  },
  {
    id: "a2p10",
    title: "Superlatives",
    subtitle: "Adjective → superlative",
    kind: "pair",
    prompt: 'Superlative of "%s":',
    note: 'Short adjectives take -est; long ones take "most".',
    data: `big|biggest|larger than all the others|This is the biggest room in the house.
hot|hottest|with the highest temperature|July is the hottest month here.
happy|happiest|feeling the most joy|It was the happiest day of my life.
easy|easiest|the least difficult|This is the easiest question.
good|best|better than all the others|She is the best player on the team.
bad|worst|worse than all the others|That was the worst film I saw.
far|furthest|at the greatest distance|Our house is the furthest from school.
expensive|most expensive|costing more than all the others|That is the most expensive watch here.
beautiful|most beautiful|the nicest to look at|She wore the most beautiful dress.
thin|thinnest|the least thick|This is the thinnest book here.
early|earliest|before all the others|The earliest train leaves at five.
busy|busiest|with the most things to do|Friday is the busiest day at work.
safe|safest|the least dangerous|This is the safest road in town.
large|largest|the biggest in size|Russia is the largest country in the world.
simple|simplest|the easiest to understand|This is the simplest game to learn.
careful|most careful|taking the most care|He is the most careful driver here.
tired|most tired|needing the most rest|I am the most tired today.
funny|funniest|making you laugh the most|He is the funniest boy in class.
heavy|heaviest|weighing the most|This is the heaviest box.
modern|most modern|the newest in style|It is the most modern school in town.
narrow|narrowest|the least wide|This is the narrowest street in the city.
polite|most polite|with the best manners|She is the most polite student.
quiet|quietest|making the least noise|The library is the quietest place here.
strange|strangest|the most unusual|That is the strangest story I know.
useful|most useful|helping the most|A phone is the most useful thing I own.`,
  },
  {
    id: "a2p11",
    title: "At the Restaurant",
    subtitle: "Ordering and dining out",
    kind: "cloze",
    note: "Common phrases for eating out.",
    data: `Could I see the ___, please?|menu|a list of food at a restaurant
I'd like to ___ a table for two.|book|to reserve a table in advance
Are you ready to ___?|order|to ask for food and drink
I'll ___ the chicken, please.|have|to choose food; used in "I'll have"
Could we have the ___ when you're ready?|bill|the paper that shows what you owe
Is service ___ in the price?|included|counted as part of the price
Do you have any ___ dishes for people who don't eat meat?|vegetarian|not eating meat|Do you have any vegetarian dishes?
I'm allergic to ___, so no peanuts please.|nuts|hard-shelled seeds you eat
Could I get some tap ___ as well?|water|a clear drink with no colour
The ___ recommended the fish today.|waiter|a man who brings food to tables
We're just ___ a table for now, not ready to order.|looking|reading or checking|We're still looking at the menu.
Could you bring some more ___, please?|bread|food baked from flour
I'd like my steak ___, not too well done.|medium|cooked not too little, not too much
Is there a ___ menu for the children?|kids|children; young people
Can I pay by ___ card?|credit|money you borrow now and pay back later
We'd like to sit by the ___, please.|window|an opening in a wall with glass
This soup is ___ hot, be careful.|very|extremely; to a high degree
Could we get some extra ___ for the fries?|ketchup|a red sauce made from tomatoes
The ___ was excellent tonight, please thank the chef.|meal|the food you eat at one time
I'll have the same ___ as my friend.|dish|food cooked and served in one way
Do you take ___ or only cash?|cards|plastic things used for paying
Could you box this up, we'd like a ___ bag?|doggy|used in "doggy bag" for leftover food
The restaurant was fully ___, so we waited outside.|booked|reserved ahead of time
Please leave a ___ for the staff if service was good.|tip|extra money for good service|Leave a tip if the service was good.
Enjoy your ___!|dinner|the main meal in the evening`,
  },
  {
    id: "a2p12",
    title: "Adverbs of Frequency",
    subtitle: "How often things happen",
    kind: "pair",
    termFromLeft: true,
    prompt: 'How often does "%s" happen?',
    note: "Frequency adverbs matched to how often they mean.",
    data: `always|every single time, without exception|every time, without exception|I always brush my teeth at night.
usually|the great majority of the time|most of the time|I usually walk to work.
normally|as a rule, under typical conditions|in most normal situations|We normally eat dinner at seven.
generally|in most cases you'll find|in most cases|It is generally quiet here at night.
frequently|on many separate occasions|very often; many times|He frequently visits his grandmother.
often|quite a lot, many times|many times; not rarely|She often calls her mother.
regularly|at fixed, repeated intervals|again and again, at fixed times|I regularly go to the gym.
sometimes|on certain occasions but not most|not every time, but on some days|Sometimes we eat out on Fridays.
occasionally|now and then, but not often|now and then; not often|We occasionally go to the cinema.
periodically|at intervals, coming and going|from time to time, at intervals|I check my email periodically.
now and then|every so often, casually|sometimes, but not often|I call my old friend now and then.
once in a while|not very often, infrequently|not often; a few times a year|We eat out once in a while.
from time to time|at scattered, irregular moments|sometimes; not on a fixed day|He visits us from time to time.
seldom|only rarely, not very often|not often; only a few times|She seldom eats sweets.
rarely|very infrequently indeed|almost never; not often|He rarely watches television.
hardly ever|almost never at all|almost never|They hardly ever eat meat.
scarcely ever|barely ever, close to never|almost never|I scarcely ever see him now.
barely ever|almost not at all|almost never|He barely ever sleeps late.
infrequently|not often, with gaps between|not often; with long gaps|Buses run infrequently on Sundays.
never|not on any occasion, ever|not at any time|I never eat fish.
constantly|without stopping, all the time|all the time; without stopping|The baby cries constantly at night.
continually|again and again over time|again and again over a long time|The phone rings continually all day.
repeatedly|one time after another|many times, one after another|He asked me the same question repeatedly.
routinely|as part of a fixed routine|as a normal, regular habit|She routinely checks her email each morning.
habitually|out of a settled habit|by habit, without thinking|He habitually bites his nails.`,
  },
  {
    id: "a2p13",
    title: "Directions & Places in Town",
    subtitle: "Finding your way around",
    kind: "cloze",
    note: "Everyday vocabulary for giving and following directions.",
    data: `Go ___ at the traffic lights.|straight|without turning
Turn ___ at the next corner.|left|the opposite of right
Turn ___ at the bank.|right|the opposite of left
The supermarket is ___ from the bakery.|opposite|across from something
The park is ___ to the school.|next|beside; used in "next to"
Walk ___ two blocks and you'll see it.|for|used with how long or far you go
The bank is ___ the post office and the cafe.|between|in the middle of two things
Cross the ___ carefully.|road|a hard path for cars
The museum is just ___ the corner.|around|past; used in "around the corner"
Keep walking ___ the river.|along|following the length of
The station is at the ___ of the street.|end|the last part of something
Go ___ the bridge to reach the old town.|over|across the top of something
The hotel is ___ the city centre.|near|not far from
Take the first ___ on your left.|turning|a road that leaves another road
The library is ___ the town hall.|behind|at the back of
Go ___ the stairs to the first floor.|up|towards a higher place
The car park is ___ the shopping centre.|under|in a lower place than
Follow the signs to reach the ___.|exit|the way out
The pharmacy is ___ the corner from here.|round|British way to say "around"
It's about a five-minute ___ from here.|walk|a short trip on foot
The bus stop is ___ the church.|outside|not inside a building
Go ___ this road until you reach the roundabout.|down|along or to a lower place
The café is ___ the corner of Main Street.|on|at the point where two streets meet|Turn left, the bank is on the corner.
The nearest ATM is ___ the entrance.|inside|in the inner part of
You can't miss it, it's ___ the town square.|in|inside a place or area`,
  },
  {
    id: "a2p14",
    title: "Making Plans",
    subtitle: "Invitations and arrangements",
    kind: "cloze",
    note: "Everyday phrases for arranging to meet and making plans.",
    data: `Would you like to ___ out for dinner tonight?|go|to leave home for fun; "go out"
I'm ___ to a party on Saturday, do you want to come?|going|moving to a place; attending|I'm going to a party on Saturday.
Are you ___ this weekend?|free|not busy
Let's ___ up at the cinema at seven.|meet|to come together with someone
I'd love to, but I already have ___.|plans|things you have arranged to do
Could we ___ the meeting to next week?|postpone|to move to a later time
I'm afraid I can't ___, I have other plans.|make it|to be able to come
Shall we ___ a date for the trip?|fix|to decide a date or time
Let's ___ it a rain check and go another time.|call|to name something; used in "call it"
I need to ___ my schedule before I confirm.|check|to look at something to be sure
Can you ___ me know by Friday?|let|to allow; used in "let me know"
We're ___ to have a picnic on Sunday.|planning|getting ready to do something
I'll ___ you up at eight o'clock.|pick|"pick up" means to collect someone
Let's ___ for coffee sometime next week.|arrange|to plan and organise something
I'm really ___ forward to seeing you.|looking|used in "looking forward to"
Could you ___ me an invite for the party?|forward|to send a message on to someone
We should ___ this again sometime.|do|to carry out an activity
I'll ___ you a text to confirm the time.|write|to put words in a message
Let's ___ it for Thursday instead.|keep|to save a time for something
I'm not sure I can ___ that day, I'll let you know.|manage|to be able to do something|I can't manage that day, sorry.
Can we ___ the time to later in the day?|change|to make something different
I'd rather we ___ it for another day.|leave|to put something aside for later
Let's ___ on a place to meet.|agree|to say yes to the same idea
I'll ___ the tickets in advance.|book|to reserve ahead of time
We're all ___ to meet at six sharp.|set|ready; used in "all set"`,
  },
  {
    id: "a2p15",
    title: "Post Office & Bank",
    subtitle: "Everyday errands",
    kind: "cloze",
    note: "A2-level vocabulary for post office and banking errands.",
    data: `I'd like to send this ___ to Spain, please.|parcel|a package sent by post
Could I have a ___ for this letter?|stamp|a small paper label for letters
I need to ___ some money into my account.|deposit|to put money into a bank
Could I ___ some cash from the machine?|withdraw|to take money out of a bank
I'd like to open a new bank ___.|account|a place at a bank to keep money
The parcel should arrive within three working ___.|days|periods of twenty-four hours
Could you weigh this ___ for me?|package|a wrapped box for sending
I need to ___ this form before I send it.|fill in|to write answers on a form|Please fill in this form first.
The ___ is outside the bank.|ATM|a machine that gives you cash
Could I get a ___ for this transaction?|receipt|a paper that shows you paid
I'd like to send this by ___ post.|airmail|post sent by plane
My card was ___ by the machine.|declined|not accepted
I need to ___ my PIN.|change|to replace with a new one
The queue at the ___ was very long today.|post office|where you send letters and parcels
Could you check my account ___, please?|balance|the money in your account
I'd like to ___ a cheque, please.|cash|to swap a cheque for money
The letter needs more ___ to be sent abroad.|stamps|small paper labels for letters
I forgot my ___ for the account.|PIN|a secret number for your bank card
Could I transfer money to another ___?|bank|a place that keeps people's money
The bank ___ closes at five o'clock.|branch|one office of a bank
I need to ___ my bank card, it's expired.|renew|to get a new copy
Could you tell me the ___ to send this parcel?|cost|the price of something
I'd like to set up a standing ___.|order|a regular payment your bank makes for you|I set up a standing order for my rent.
The clerk asked me to ___ the form.|sign|to write your name on
I need to collect a ___ from the post office.|delivery|something brought to your home`,
  },
  {
    id: "a2p16",
    title: "Your Neighbourhood",
    subtitle: "Describing where you live",
    kind: "cloze",
    note: "A2-level vocabulary for describing a local area.",
    data: `My ___ is very quiet and friendly.|neighbourhood|the area around your home
There's a small ___ at the end of my street.|park|a green public place with trees
The ___ next door always says hello.|neighbour|a person who lives next to you
We have a good ___ near our house.|school|a place where children learn
There's a busy ___ close to where I live.|road|a hard path for cars
My area has lots of ___ shops.|local|near your home
The ___ centre is a ten-minute walk away.|shopping|buying things; used in "shopping centre"
I live in a ___ area, not the city.|residential|with houses, not offices or shops
There's a nice ___ where I walk my dog.|field|a large open area of grass
The bus ___ is right outside my house.|stop|a place where buses pick up people
My street is very ___ at night.|quiet|with little noise
We have a great ___ where I can buy fresh food.|market|a place where people sell food outside|I buy fresh food at the market.
The ___ station is a short walk from home.|train|a vehicle on rails; used in "train station"
There's a lovely ___ near my flat.|café|a small place for coffee and snacks
My neighbourhood is close to the city ___.|centre|the middle part of a place
The area has lots of green ___.|space|an open area
There's a friendly ___ atmosphere here.|community|the people living in one place
The ___ near my house has great restaurants.|area|a part of a town
We live in a ___ that's popular with families.|suburb|a quiet area outside the city centre
The streets here are very ___ and safe.|clean|free from dirt
My building is close to the ___ stop.|bus|a big vehicle that carries many people
There's a good ___ centre nearby for sports.|leisure|free time; used in "leisure centre"
The area gets quite ___ during rush hour.|busy|full of people and traffic
My neighbourhood has changed a lot over the ___.|years|periods of twelve months
I really like living in this part of ___.|town|a place smaller than a city`,
  },
  {
    id: "a2p17",
    title: "Prepositions of Place",
    subtitle: "Where things are",
    kind: "cloze",
    note: "A2-level prepositions describing location.",
    data: `The cat is sitting ___ the table.|under|in a lower place than
The book is ___ the shelf.|on|touching the top of
She is standing ___ the door.|behind|at the back of
The keys are ___ the drawer.|in|inside a room or place
The park is ___ the school and the shop.|between|in the middle of two things
He is sitting ___ to his sister.|next|beside; used in "next to"
The picture is hanging ___ the wall.|against|touching and leaning on something|The ladder is leaning against the wall.
The dog is running ___ the garden.|around|moving in a circle or on all sides
The shop is right ___ the corner.|round|another word for "around"
She parked the car ___ the building.|outside|not inside
The ball rolled ___ the stairs.|down|from a high place to a low place
The plane flew ___ the clouds.|above|higher than
The cat hid ___ the sofa cushions.|beneath|under or below
The children are playing ___ the swings.|by|close to the side of
The bridge goes ___ the river.|over|above and across
The bank is ___ from the café.|opposite|across from
He walked ___ the room and sat down.|into|moving to the inside of
The lamp is ___ the desk.|beside|at the side of
She placed the vase ___ the window.|near|not far from
The tunnel goes ___ the mountain.|through|from one end to the other
The cinema is ___ the shopping centre.|inside|in the inner part of
He stood ___ the crowd, watching.|among|in the middle of a group
The car is parked ___ the garage.|alongside|next to and in line with
The plane flew ___ the city.|past|going by something
The path leads ___ the forest.|towards|in the direction of`,
  },
  {
    id: "a2p18",
    title: "Past Continuous",
    subtitle: "Actions in progress in the past",
    kind: "cloze",
    note: "A2-level past continuous tense practice.",
    data: `I was ___ TV when the phone rang.|watching|looking at something moving
They were ___ football when it started to rain.|playing|taking part in a game
She was ___ dinner when I arrived home.|cooking|making food hot to eat
We were ___ when the teacher walked in.|talking|speaking with someone
He was ___ when the alarm went off.|sleeping|resting with your eyes closed
I was ___ a book when you called me.|reading|looking at words and understanding
They were ___ to work when the accident happened.|driving|controlling a car
She was ___ when her friend visited.|studying|learning about a subject
We were ___ in the park when it began to snow.|walking|going on foot|We were walking in the park.
He was ___ when the power went out.|working|doing a job
I was ___ for the bus when it started to rain.|waiting|staying until something comes|I was waiting for the bus in the rain.
They were ___ dinner when the doorbell rang.|having|eating; used in "having dinner"
She was ___ to music when I knocked.|listening|paying attention to a sound
We were ___ when we bumped into an old friend.|shopping|buying things in shops
He was ___ when he twisted his ankle.|jogging|running slowly for exercise
I was ___ an email when the computer crashed.|writing|putting words on paper or a screen
They were ___ when the storm began.|swimming|moving through water
She was ___ when the microphone stopped working.|singing|making music with your voice
We were ___ when the tent collapsed.|camping|sleeping outside in a tent
He was ___ the fence when it started to rain.|painting|covering a surface with colour
I was ___ when the alarm woke me up.|dreaming|seeing pictures in your sleep
They were ___ when their mother walked in.|arguing|talking angrily with someone
She was ___ when she slipped and fell.|dancing|moving to music
We were ___ when the lights suddenly went out.|chatting|talking in a friendly way
He was ___ his bike when he saw the accident.|riding|travelling on a bike or horse`,
  },
  {
    id: "a2p19",
    title: "Modal Verbs — Ability & Permission",
    subtitle: "Can, could, may",
    kind: "cloze",
    note: "A2-level modal verbs for ability and permission.",
    data: `I ___ swim very well when I was younger.|could|the past of "can"; was able to
___ I open the window, please?|may|used to ask permission politely
She ___ speak three languages fluently.|can|is able to
___ you help me carry this bag?|could
We ___ leave early if we finish the work.|can
___ I use your phone for a moment?|may|used to ask permission politely
He ___ ride a bike when he was five.|could|the past of "can"
You ___ park here, it's not allowed.|can't|short for cannot
___ I ask you a question?|may
They ___ not attend the meeting yesterday.|could
She ___ drive, but she doesn't have a car.|can|is able to
___ you pass me the salt, please?|could|used to ask politely
We ___ not enter without a ticket.|can
He ___ not swim before he took lessons.|could
___ I sit here, or is this seat taken?|may|used to ask permission politely
I ___ not hear you, could you speak louder?|can|is able to|I can hear the music from here.
She ___ not come to the party last week.|could|the past of "can"
___ we borrow your umbrella, please?|could
He ___ lift very heavy weights at the gym.|can
___ I leave the room for a moment?|may|used to ask permission politely
They ___ not afford the tickets last year.|could|the past of "can"
We ___ finish the project by Friday.|can|is able to
___ you show me the way to the station?|could
She ___ not attend school due to illness.|could
I ___ help you with your homework if you want.|can`,
  },
  {
    id: "a2p20",
    title: "Comparisons — As...As",
    subtitle: "Equal comparisons",
    kind: "cloze",
    note: "A2-level equal comparison structures.",
    data: `This bag is as ___ as that one.|heavy|weighing a lot
She is as ___ as her sister.|tall|high from bottom to top
The test was as ___ as I expected.|difficult|not easy
His car is as ___ as mine.|fast|moving quickly
This soup is as ___ as the last one.|spicy|with a strong, hot taste
The film was as ___ as the book.|good|of high quality
He runs as ___ as a professional sprinter.|quick|done in a short time|She is as quick as her brother.
This hotel is as ___ as the other one.|expensive|costing a lot
Her English is as ___ as her brother's.|fluent|able to speak easily
The weather today is as ___ as yesterday.|cold|low in temperature
This restaurant is as ___ as the one downtown.|popular|liked by many people
The exam was not as ___ as I thought.|hard|difficult to do
This coffee is as ___ as the one at home.|strong|with a lot of flavour or power
The journey was as ___ as we expected.|long|taking a lot of time
His new phone is as ___ as the old one.|reliable|able to be trusted
This road is as ___ as the motorway.|busy|full of cars or people
The party was as ___ as last year's.|fun|a lot of enjoyment
Her cooking is as ___ as a professional chef's.|delicious|tasting very good
The city is as ___ as the countryside.|peaceful|calm and quiet
This jacket is as ___ as the other colour.|warm|not cold; pleasantly hot
My flat is as ___ as yours.|small|little in size
The lesson was as ___ as the last one.|interesting|not boring
This wine is as ___ as the other bottle.|sweet|tasting of sugar|This tea is as sweet as that juice.
Her plan is as ___ as mine.|simple|easy to understand
The bridge is as ___ as the old one.|sturdy|strong and not easy to break`,
  },
  {
    id: "a2p21",
    title: "Listening: Plans & Past Events",
    subtitle: "Plans and past events",
    kind: "listening",
    prompt: "What did you hear?",
    note: "Past and future statements that differ by a single word.",
    data: `We went to the coast last weekend.|We went to the coast last weekend.
We went to the coast last summer.|We went to the coast last summer.
She's already finished her report.|She's already finished her report.
She hasn't finished her report.|She hasn't finished her report.
He'd already left when I called.|He'd already left when I called.
They were waiting outside the station.|They were waiting outside the station.
They were waiting outside the cinema.|They were waiting outside the cinema.
I'm going to visit my cousin in May.|I'm going to visit my cousin in May.
I'm going to visit my cousin in June.|I'm going to visit my cousin in June.
He bought a second-hand bicycle.|He bought a second-hand bicycle.
He bought a second-hand car.|He bought a second-hand car.
The meeting's been moved to Thursday.|The meeting's been moved to Thursday.
The meeting's been moved to Tuesday.|The meeting's been moved to Tuesday.
We've lived here for six years.|We've lived here for six years.
We've lived here for sixteen years.|We've lived here for sixteen years.
She was reading when the phone rang.|She was reading when the phone rang.
She was cooking when the phone rang.|She was cooking when the phone rang.
They'll arrive before lunch.|They'll arrive before lunch.
They'll arrive after lunch.|They'll arrive after lunch.
I didn't hear the alarm this morning.|I didn't hear the alarm this morning.
I didn't hear the doorbell this morning.|I didn't hear the doorbell this morning.
He used to play rugby at school.|He used to play rugby at school.
He used to play cricket at school.|He used to play cricket at school.
The parcel hasn't arrived yet.|The parcel hasn't arrived yet.
The parcel arrived yesterday.|The parcel arrived yesterday.`,
  },
  {
    id: "a2p22",
    title: "Speaking: Getting Things Done",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Everyday phrases for asking, arranging and explaining.",
    // Each line is the same text twice: what is shown is what must be said.
    // Kept to one breath, and to phrasing the normaliser can actually reconcile
    // with a transcript (see spoken-answer.ts). Five things are avoided on
    // purpose, each of which marked a PERFECT utterance wrong when it slipped
    // through:
    //   - compound numbers and currency ("twenty one" vs smart_format's "21")
    //   - ordinals, for the same reason ("second" vs "2nd")
    //   - a contracted "has" ("He has finished" said as "He's finished", which
    //     normalises to "he is")
    //   - possessive 's ("devil's" normalises to "devil is")
    //   - names and homophones with no disambiguating context ("Sara"/"Sarah")
    data: `I went to the market yesterday.|I went to the market yesterday.
Could you speak a little slower?|Could you speak a little slower?
I am looking for the post office.|I am looking for the post office.
She moved here ten years ago.|She moved here ten years ago.
We are meeting at the cafe later.|We are meeting at the cafe later.
I forgot to bring my umbrella.|I forgot to bring my umbrella.
Do you know when the shop opens?|Do you know when the shop opens?
My flight was delayed by an hour.|My flight was delayed by an hour.
I would rather stay at home tonight.|I would rather stay at home tonight.
He finished his homework already.|He finished his homework already.
Can I pay by card here?|Can I pay by card here?
The film was better than I expected.|The film was better than I expected.
I am trying to eat less sugar.|I am trying to eat less sugar.
We walked all the way to the river.|We walked all the way to the river.
She is studying to be a nurse.|She is studying to be a nurse.
I have never been to Italy.|I have never been to Italy.
Would you like to join us?|Would you like to join us?
The train was completely full.|The train was completely full.
I need to book a room for one night.|I need to book a room for one night.
He works from home on Fridays.|He works from home on Fridays.
We should leave before it gets dark.|We should leave before it gets dark.
I left my bag on the bus.|I left my bag on the bus.
This jacket is a little too small.|This jacket is a little too small.
They are building a new library.|They are building a new library.
I will call you when I arrive.|I will call you when I arrive.`,
  },
  {
    id: "a2p23",
    title: "Say It Your Way: Getting Things Done",
    subtitle: "Write the idea in English",
    kind: "translate",
    prompt: "Write this in English:",
    note: "Everyday errands and arrangements, more than one wording.",
    // The left side describes the idea rather than giving the sentence away --
    // otherwise this is a copying exercise, not a producing one. Each line
    // lists three wordings a learner plausibly reaches for; anything else valid
    // is caught by the AI grader, which is the fallback, not the plan. Avoids
    // the traps the speaking packs documented (compound numbers, ordinals,
    // contracted "has", possessive 's, undisambiguated names), because the same
    // normaliser runs underneath.
    data: `Ask what time a shop opens.|What time does the shop open?;When does the shop open?;Could you tell me what time the shop opens?
Say you went to the market yesterday.|I went to the market yesterday.;Yesterday I went to the market.;I was at the market yesterday.
Ask a neighbour to water your plants while you are away.|Could you water my plants while I am away?;Would you mind watering my plants while I'm away?;Can you look after my plants while I am away?
Say you have never been to Italy.|I have never been to Italy.;I have not been to Italy before.;Italy is somewhere I have yet to visit.
Ask whether you can pay by card.|Can I pay by card?;Do you take cards?;Is it possible to pay by card?
Say your train was delayed.|My train was delayed.;The train was late.;My train ran late.
Offer to help someone with their bags.|Can I help you with your bags?;Would you like some help with your bags?;Let me help you with those bags.
Say you would rather stay at home tonight.|I would rather stay at home tonight.;I'd rather stay in tonight.;I would prefer to stay home tonight.
Ask where you can find a pharmacy.|Where can I find a pharmacy?;Is there a pharmacy near here?;Could you tell me where the pharmacy is?
Say you forgot your umbrella.|I forgot my umbrella.;I left my umbrella behind.;I have forgotten my umbrella.
Ask someone to call you later.|Could you call me later?;Can you ring me later?;Please call me later.
Say the film was better than you expected.|The film was better than I expected.;The film was better than I thought.;I enjoyed the film more than I expected.
Say you are looking for the post office.|I am looking for the post office.;I am trying to find the post office.;Could you point me to the post office?
Ask how long the journey takes.|How long does the journey take?;How long is the journey?;How much time does the trip take?
Say you booked a room for one night.|I booked a room for one night.;I have booked a room for one night.;I reserved a room for one night.
Apologise for missing the meeting.|I am sorry I missed the meeting.;Sorry for missing the meeting.;My apologies for not making the meeting.
Ask whether the seat is free.|Is this seat free?;Is anyone sitting here?;May I sit here?
Say you are trying to eat less sugar.|I am trying to eat less sugar.;I'm trying to cut down on sugar.;I am eating less sugar these days.
Ask someone what they did at the weekend.|What did you do at the weekend?;How was your weekend?;What did you get up to at the weekend?
Say the jacket is a little too small.|This jacket is a little too small.;The jacket is slightly too small.;This jacket is a bit small for me.
Say you will call when you arrive.|I will call you when I arrive.;I'll call when I get there.;I am going to call you when I arrive.
Ask whether breakfast is included.|Is breakfast included?;Does the price include breakfast?;Is breakfast part of the price?
Say the whole journey to the river was on foot.|We walked all the way to the river.;I walked as far as the river.;We went on foot to the river.
Ask someone to repeat the address.|Could you repeat the address?;Can you say the address again?;Please repeat the address.
Say you are studying to be a nurse.|I am studying to be a nurse.;I'm training to be a nurse.;I am studying nursing.`,
  },
];

const B1: Pack[] = [
  {
    id: "b1p1",
    title: "Phrasal Verbs",
    subtitle: "Meaning match",
    kind: "pair",
    termFromLeft: true,
    prompt: '"%s" means:',
    note: "Phrasal verbs rarely mean the sum of their parts.",
    data: `give up|stop trying|stop trying to do something|I never give up on my dreams.
look after|take care of|to take care of someone or something|She looks after her little brother.
put off|postpone|to move something to a later time|We had to put off the meeting.
run out of|have none left|to use all of something|We run out of milk every week.
turn down|reject|to say no to an offer|He turned down the job offer.
find out|discover|to learn a fact you did not know|Please find out the answer.
get on with|have a good relationship with|to be friendly with someone|I get on with my new colleagues.
bring up|raise a topic|to start talking about a subject|Don't bring up that subject again.
call off|cancel|to decide an event will not happen|They called off the match because of rain.
come across|find by chance|to meet or find by chance|You may come across old photos there.
carry on|continue|to keep doing something without stopping|Please carry on with your work.
break down|stop working|to stop working, like a machine|I hope the car won't break down.
look into|investigate|to study a problem to learn the cause|Police will look into the crime.
take over|assume control|to begin to be in charge|She will take over the company next year.
put up with|tolerate|to accept something bad without complaining|I can't put up with this noise.
set up|establish|to start a business or a system|They set up a small shop.
work out|solve or exercise|to find the answer to a problem|I can't work out this puzzle.
turn up|arrive|to come to a place, often late|He turned up an hour late.
let down|disappoint|to make someone feel disappointed|Please don't let me down.
pick up|collect|to go and get someone or something|I'll pick up the children at four.
go over|review|to check something carefully again|Let's go over the plan once more.
hold on|wait|to wait for a short time|Hold on, I'll be right back.
sort out|resolve|to deal with a problem and fix it|We must sort out this mistake.
cut down on|reduce|to use or do less of something|I'm trying to cut down on sugar.
look forward to|anticipate happily|to wait for something with pleasure|I look forward to the holidays.`,
  },
  {
    id: "b1p2",
    title: "Conditionals",
    subtitle: "If-clauses",
    kind: "cloze",
    note: "First conditional: if + present, will. Second: if + past, would.",
    data: `If it rains, we ___ stay home.|will|shows a likely result in the future|If it rains, we will stay home.
If we ___ closer, I'd visit more often.|were|a form of be for unreal situations|If we were closer, I'd visit more.
She'd help if she ___ time.|had|the past of have, used in unreal ifs|She'd help if she had time.
If you heat ice, it ___ .|melts|changes from solid to liquid with heat|If you heat ice, it melts.
I'll call you if I ___ late.|am|a form of be used with I|I'll call you if I am late.
If he studied, he ___ pass.|would|shows an unreal result in the present|If he studied, he would pass.
Unless you hurry, you ___ miss it.|will|shows a result that surely follows|Unless you hurry, you will miss it.
If I ___ you, I'd apologise.|were|a form of be used for advice|If I were you, I'd apologise.
What would you do if you ___ the lottery?|won|got a prize or a game by luck|What would you do if you won the lottery?
If they leave now, they ___ arrive by six.|will|shows a likely future result|If they leave now, they will arrive by six.
I wouldn't do that if I ___ you.|were|a form of be used when giving advice|I wouldn't do that if I were you.
If she ___ harder, she'd succeed.|tried|made an effort to do something|If she tried harder, she'd succeed.
We'll go out if the weather ___ good.|is|a form of be used with weather|We'll go out if the weather is good.
If I had known, I ___ have come.|would|shows a result that did not happen|If I had known, I would have come.
He would be happier if he ___ less.|worked|did a job for money|He would be happier if he worked less.
If you don't water plants, they ___ .|die|stop living; the opposite of live|If you don't water plants, they die.
I'd tell you if I ___ .|knew|had information in your mind|I'd tell you if I knew.
If the shop ___ open, buy milk.|is|a form of be used with a shop|If the shop is open, buy milk.
She'll be angry if you ___ her.|tell|to give information to someone|She'll be angry if you tell her.
If we ___ earlier, we'd have seen it.|had left|the past perfect of leave|If we had left earlier, we'd have seen it.
Provided you pay, we ___ deliver.|will|shows a result that depends on a condition|Provided you pay, we will deliver.
If only I ___ speak Spanish.|could|shows an ability you wish you had|If only I could speak Spanish.
Even if it rains, we ___ go.|will|shows a result that happens in any case|Even if it rains, we will go.
If I ___ time, I'd learn piano.|had|the past of have, for an unreal wish|If I had time, I'd learn piano.
Should you need help, ___ me.|call|to phone someone; used to give advice|Should you need help, call me.`,
  },
  {
    id: "b1p3",
    title: "Modal Verbs",
    subtitle: "Obligation, advice, possibility",
    kind: "cloze",
    note: "Modals express degree of certainty, permission, or obligation.",
    data: `You ___ see a doctor.|should|used to give advice|You should see a doctor.
I ___ speak three languages.|can|shows that you are able to do something|I can speak three languages.
Visitors ___ wear a badge.|must|shows that a rule says you have to|Visitors must wear a badge.
You ___ not smoke here.|must|shows that something is not allowed|You must not smoke here.
She ___ be at work now.|might|shows that something is possible|She might be at work now.
We ___ to leave early.|ought|used to say what is right|We ought to leave early.
He ___ have missed the train.|may|shows that something is possibly true|He may have missed the train.
You ___ have told me!|should|shows a regret about the past|You should have told me!
I ___ swim when I was five.|could|shows an ability in the past|I could swim when I was five.
Students ___ not use phones.|may|shows that something is not allowed|Students may not use phones.
That ___ be John — he's abroad.|can't|shows you are sure it is not true|That can't be John, he's abroad.
You ___ do it if you don't want to.|needn't|shows that something is not necessary|You needn't do it if you don't want to.
It ___ be true; I saw it.|must|shows you are sure something is true|It must be true; I saw it.
___ I open the window?|May|used to ask for permission politely|May I open the window?
We ___ better hurry.|had|used with better to give strong advice|We had better hurry.
She ___ have forgotten.|could|shows a possibility about the past|She could have forgotten.
You ___ to apologise.|need|shows that something is necessary|You need to apologise.
Passengers ___ remain seated.|must|shows that you have to do something|Passengers must remain seated.
He ___ not come after all.|might|shows that something is possible|He might not come after all.
___ you mind helping?|Would|used to ask politely for help|Would you mind helping?
I ___ rather stay home.|would|shows what you prefer to do|I would rather stay home.
They ___ have arrived by now.|should|shows what you expect to be true|They should have arrived by now.
You ___ be joking.|must|shows you are sure something is so|You must be joking.
We ___ not have bothered.|need|shows that something was not necessary|We need not have bothered.
___ you like some tea?|Would|used to offer something politely|Would you like some tea?`,
  },
  {
    id: "b1p4",
    title: "Perfect Tenses",
    subtitle: "Present perfect vs past",
    kind: "cloze",
    note: "Present perfect links past to now; past simple names a finished time.",
    data: `I ___ never been to Japan.|have|a helper verb for experiences up to now|I have never been to Japan.
She ___ here since 2019.|has lived|shows she began living there and still does|She has lived here since 2019.
We ___ the film last night.|saw|the past of see|We saw the film last night.
___ you finished yet?|Have|a helper verb used to ask about now|Have you finished yet?
He ___ just left.|has|a helper verb for something very recent|He has just left.
They ___ in Berlin for years.|have lived|shows they began living there and still do|They have lived in Berlin for years.
I ___ him yesterday.|met|the past of meet|I met him yesterday.
The train ___ already gone.|has|a helper verb for a finished action|The train has already gone.
How long ___ you known her?|have|a helper verb used to ask about time|How long have you known her?
She ___ worked here since May.|has|a helper verb that shows an action till now|She has worked here since May.
We ___ lunch an hour ago.|had|ate a meal at some time|We had lunch an hour ago.
I've ___ that book twice.|read|looked at and understood words|I've read that book twice.
He hasn't called ___ .|yet|up to now; used in negatives|He hasn't called yet.
They've been married ___ ten years.|for|used to say how long something has lasted|They've been married for ten years.
I've known him ___ childhood.|since|from a point in the past until now|I've known him since childhood.
___ ever tried sushi?|Have you|used to ask about your life experience|Have you ever tried sushi?
She ___ finished her degree in 2020.|finished|completed something in the past|She finished her degree in 2020.
We've ___ been to Greece.|never|at no time in your life|We've never been to Greece.
The rain ___ stopped.|has|a helper verb for a recent change|The rain has stopped.
I ___ my keys — I can't find them.|have lost|shows something is lost now|I have lost my keys.
He ___ his keys yesterday.|lost|could not keep or find something|He lost his keys yesterday.
It's the best film I've ___ seen.|ever|at any time up to now|It's the best film I've ever seen.
She's ___ working all day.|been|a helper verb for an action that continues|She's been working all day.
They ___ arrived a moment ago.|arrived|came to a place at a past time|They arrived a moment ago.
I've lived here ___ 2010.|since|from a time in the past until now|I've lived here since 2010.`,
  },
  {
    id: "b1p5",
    title: "Work & Opinions",
    subtitle: "Natural collocations",
    kind: "pair",
    prompt: 'Which word completes "%s"?',
    note: "Collocations make speech sound natural.",
    data: `make an ___ (job application)|application|a formal request for a job|I sent my application yesterday.
take ___ (accept blame)|responsibility|the duty to accept blame or care|He takes full responsibility for the mistake.
meet a ___ (finish on time)|deadline|the time by which work must be done|We must meet the deadline on Friday.
attend a ___|meeting|an event where people talk about work|The meeting starts at ten.
give a ___|presentation|a talk that shows ideas to a group|She gave a clear presentation.
reach an ___|agreement|a decision that people both accept|They reached an agreement last night.
raise an ___|issue|a subject or problem to discuss|He raised an important issue.
solve a ___|problem|something difficult that needs an answer|We solved the problem together.
gain ___ (working knowledge)|experience|knowledge you get from doing something|She has gained a lot of experience.
run a ___|business|a company that sells goods or services|He runs a small business.
apply for a ___|job|work that you do for money|I applied for a job in London.
earn a ___|salary|money you get regularly from your work|She earns a good salary.
keep in ___|touch|contact between people who know each other|Let's keep in touch.
strongly ___ (opinion verb)|agree|to have the same opinion as someone|I strongly agree with you.
express an ___|opinion|what you think about something|Please express your opinion honestly.
change your ___|mind|your thoughts and ideas|She changed her mind about the trip.
make a ___ (choose)|decision|a choice you make after thinking|He made a decision quickly.
draw a ___|conclusion|a final judgement after thinking|We drew a conclusion from the facts.
have a ___ (talk)|conversation|a talk between two or more people|We had a long conversation.
hold a ___ (meeting verb)|meeting|an event where people come together to talk|The manager holds a meeting every Monday.
set a ___ (target)|goal|something you want to achieve|She set a goal for this year.
take a ___ (rest)|break|a short rest from work|Let's take a break now.
share an ___|idea|a thought or plan that you tell others|He shared his idea with us.
build a ___ (working bond)|relationship|the way two people feel and act together|They built a strong relationship.
face a ___ (difficulty)|challenge|a difficult task that tests you|She faced a big challenge.`,
  },
  {
    id: "b1p6",
    title: "Relative Clauses",
    subtitle: "Who, which, that, whose",
    kind: "cloze",
    note: "Use who for people, which for things, whose for possession.",
    data: `The man ___ called is my boss.|who|used for a person you describe|The man who called is my boss.
The book ___ I read was great.|that|used for a thing you describe|The book that I read was great.
She's the woman ___ car broke down.|whose|used to show who owns something|She's the woman whose car broke down.
This is the town ___ I grew up.|where|used for a place you describe|This is the town where I grew up.
That's the reason ___ he left.|why|used to give the cause of something|That's the reason why he left.
The film, ___ won an award, is long.|which|adds extra information about a thing|The film, which won an award, is long.
Anyone ___ wants to join is welcome.|who|used for people in a general group|Anyone who wants to join is welcome.
The house ___ we bought is old.|that|used for a thing you describe|The house that we bought is old.
Do you know the day ___ they arrive?|when|used for a time you describe|Do you know the day when they arrive?
He's the person ___ I trust most.|whom|a formal word for the object person|He's the person whom I trust most.
The company, ___ is based in Oslo, hires.|which|adds extra information about a company|The company, which is based in Oslo, hires.
The students ___ passed celebrated.|who|used for people you describe|The students who passed celebrated.
That's the shop ___ sells guitars.|that|used for a shop or thing you describe|That's the shop that sells guitars.
The room ___ window is broken is locked.|whose|used to show who owns something|The room whose window is broken is locked.
I met a man ___ speaks six languages.|who|used for a person you describe|I met a man who speaks six languages.
The reason ___ she resigned is unclear.|why|used to give the cause of something|The reason why she resigned is unclear.
This is the café ___ we first met.|where|used for a place you describe|This is the cafe where we first met.
The dog ___ barked all night is gone.|that|used for an animal you describe|The dog that barked all night is gone.
My sister, ___ lives in Rome, visits soon.|who|adds extra information about a person|My sister, who lives in Rome, visits soon.
Everything ___ he said was true.|that|used for things in a group|Everything that he said was true.
The bag ___ you found is mine.|that|used for a thing you describe|The bag that you found is mine.
The year ___ we moved was 2012.|when|used for a time you describe|The year when we moved was 2012.
She's someone ___ opinion I respect.|whose|used to show who owns something|She's someone whose opinion I respect.
The road ___ leads to the lake is closed.|which|adds information about a place or thing|The road which leads to the lake is closed.
People ___ exercise sleep better.|who|used for people you describe|People who exercise sleep better.`,
  },
  {
    id: "b1p7",
    title: "Travel & Tourism",
    subtitle: "Getting around abroad",
    kind: "cloze",
    note: "Common vocabulary for booking and navigating trips.",
    data: `We need to ___ our flight before it fills up.|book|to arrange a seat or room in advance|We need to book our flight early.
Our hotel has a great ___ of the sea.|view|what you can see from a place|Our hotel has a great view of the sea.
Could you recommend a good ___ to visit?|attraction|a place that tourists like to visit|Could you recommend a good attraction to visit?
We're planning a two-week ___ around Europe.|trip|a journey to a place and back|We're planning a two-week trip around Europe.
I forgot to pack my ___ before the flight.|passport|an official paper you need to travel abroad|I forgot to pack my passport.
The tour ___ showed us around the old town.|guide|a person who shows visitors around|The tour guide showed us around the old town.
We stayed in a small ___ near the beach.|guesthouse|a small cheap place to stay|We stayed in a small guesthouse near the beach.
Our flight was ___ by two hours.|delayed|made later than planned|Our flight was delayed by two hours.
We need to ___ our luggage before boarding.|check|to hand over bags at the airport|We need to check our luggage in.
The hotel offers a free airport ___.|shuttle|a bus that takes people between two places|The hotel offers a free airport shuttle.
We got lost, so we asked for ___.|directions|information on how to get somewhere|We got lost, so we asked for directions.
This city is famous for its ancient ___.|ruins|the broken remains of old buildings|This city is famous for its ancient ruins.
We booked a ___ tour of the museum.|guided|led by a person who explains things|We booked a guided tour of the museum.
Make sure your ___ hasn't expired.|visa|an official stamp to enter a country|Make sure your visa hasn't expired.
We spent the afternoon ___ around the market.|wandering|walking slowly without a plan|We spent the afternoon wandering around the market.
The ___ desk can help with excursions.|reception|where hotel guests arrive and check in|The reception desk can help with excursions.
We took a scenic ___ along the coast.|route|a way you take to get somewhere|We took a scenic route along the coast.
Our train has a short ___ in Milan.|stopover|a short stop during a long journey|Our train has a short stopover in Milan.
The local ___ was incredibly friendly.|staff|the people who work in a place|The local staff were incredibly friendly.
We need travel ___ in case something goes wrong.|insurance|money paid to cover problems on a trip|We need travel insurance in case something goes wrong.
The ___ office can exchange currency for you.|tourist|connected with people who visit places|The tourist office can exchange currency for you.
We're staying in a ___ apartment downtown.|rental|that you pay to use for a time|We're staying in a rental apartment downtown.
The flight was fully ___, so we waited standby.|booked|having no places left|The flight was fully booked.
We explored the city on a ___ tour bus.|hop-on-hop-off|a bus tour you can leave and rejoin|We explored the city on a hop-on-hop-off bus.
Remember to keep your boarding ___ safe.|pass|a card that lets you board|Keep your boarding pass safe.`,
  },
  {
    id: "b1p8",
    title: "Feelings & Emotions",
    subtitle: "Adjective ↔ noun forms",
    kind: "pair",
    prompt: 'Noun form of "%s":',
    note: "Emotion adjectives and their matching nouns.",
    data: `happy|happiness|the feeling of being happy|Her happiness was clear to everyone.
sad|sadness|the feeling of being unhappy|I felt great sadness at the news.
angry|anger|a strong feeling of being very annoyed|He shouted in anger.
anxious|anxiety|a worried feeling about what may happen|She felt anxiety before the exam.
excited|excitement|the feeling of being happy about something|The children jumped with excitement.
proud|pride|a feeling of being pleased with yourself|He felt pride in his work.
jealous|jealousy|an unhappy feeling about what others have|Her jealousy ruined the friendship.
confident|confidence|belief that you can do something well|She spoke with confidence.
nervous|nervousness|a feeling of being worried and tense|He couldn't hide his nervousness.
curious|curiosity|a strong wish to learn or know|Curiosity made her open the box.
embarrassed|embarrassment|a feeling of being shy or ashamed|He blushed with embarrassment.
grateful|gratitude|a feeling of thanks|She showed her gratitude with a card.
disappointed|disappointment|an unhappy feeling when things go badly|He couldn't hide his disappointment.
confused|confusion|a state of not understanding clearly|There was confusion at the airport.
relieved|relief|a good feeling when worry ends|She felt relief when he called.
frustrated|frustration|an angry feeling when you cannot succeed|His frustration grew as the printer failed.
lonely|loneliness|the sad feeling of being alone|She felt loneliness in the big city.
surprised|surprise|something unexpected, or the feeling of it|The party was a big surprise.
ashamed|shame|a painful feeling about something bad you did|He felt shame for lying.
content|contentment|a quiet feeling of being happy enough|She found contentment in a simple life.
bored|boredom|the feeling of having nothing interesting to do|Boredom made him fall asleep.
hopeful|hope|a wish that good things will happen|She never lost hope.
suspicious|suspicion|a feeling that someone has done wrong|He looked at the stranger with suspicion.
satisfied|satisfaction|the pleasure of getting what you wanted|Customer satisfaction is our goal.
sympathetic|sympathy|a feeling of care for someone who suffers|She showed sympathy for her friend.`,
  },
  {
    id: "b1p9",
    title: "Money & Shopping",
    subtitle: "Banking and budgeting",
    kind: "cloze",
    note: "Intermediate vocabulary for managing money.",
    data: `I need to ___ some money before payday.|budget|to plan how to spend your money|I need to budget my money carefully.
She's saving up to ___ a deposit for a flat.|pay|to give money in exchange for something|She's saving to pay a deposit.
We ___ a loan to buy the car.|took out|borrowed money from a bank|We took out a loan to buy the car.
He's ___ into debt because of his spending.|falling|slowly getting into a bad situation|He's falling into debt.
I set up a standing ___ for my rent.|order|a regular payment set up at your bank|I set up a standing order for my rent.
The bank charges a ___ for overdrafts.|fee|money you pay for a service|The bank charges a fee for overdrafts.
She transferred money ___ her savings account.|to|towards a place, person or account|She transferred money to her savings account.
We compared prices before making a ___.|decision|a choice you make after thinking|We compared prices before making a decision.
He's trying to ___ his monthly expenses.|track|to follow and record something over time|He's trying to track his monthly expenses.
I applied for a credit ___.|card|plastic you use to buy now, pay later|I applied for a credit card.
The store offers a money-back ___.|guarantee|a promise to give your money back|The store offers a money-back guarantee.
She always shops around for the best ___.|deal|an agreement that costs you less|She always looks for the best deal.
We're on a tight ___ this month.|allowance|a fixed amount of money you may spend|I get a small weekly allowance.
He returned the item for a full ___.|refund|money given back for something returned|He returned the item for a full refund.
I prefer to pay in ___ rather than instalments.|full|the whole amount, not in parts|I prefer to pay in full.
The interest ___ on that account is low.|rate|the percentage a bank charges or pays|The interest rate on that account is low.
She's trying to pay off her ___.|debt|money you owe to someone|She's trying to pay off her debt.
We split the cost ___ between us.|evenly|in equal parts|We split the cost evenly between us.
He negotiated better ___ on the loan.|terms|the conditions of an agreement|He negotiated better terms on the loan.
I keep an eye on my bank ___ daily.|balance|the amount of money in an account|I keep an eye on my bank balance daily.
She's saving for a rainy ___.|day|a time when things go badly|She's saving for a rainy day.
The shop was offering a seasonal ___.|discount|a lower price than usual|The shop was offering a seasonal discount.
We opened a joint ___ together.|account|an arrangement at a bank to keep money|We opened a joint account together.
He's careful with his ___.|spending|the money you use to buy things|He's careful with his spending.
I always check the ___ before buying online.|reviews|what customers write about a product|I always check the reviews before buying online.`,
  },
  {
    id: "b1p10",
    title: "Environment",
    subtitle: "Talking about the planet",
    kind: "cloze",
    note: "B1-level environmental vocabulary.",
    data: `We should ___ less plastic to protect the ocean.|use|to take something to do a job|We should use less plastic.
Recycling helps ___ waste going to landfill.|reduce|to make something smaller in amount|Recycling helps reduce waste.
The factory was fined for ___ the river.|polluting|making water, air or land dirty|The factory was fined for polluting the river.
Many species are at risk of ___.|extinction|the death of a whole kind of animal|Many species are at risk of extinction.
We need to ___ energy to fight climate change.|save|to keep and not waste|We need to save energy.
Solar panels use ___ energy from the sun.|renewable|that can be used again and again|Solar panels use renewable energy.
The forest was cut down for ___.|farming|growing crops and keeping animals|The forest was cut down for farming.
Rising temperatures are causing the ice to ___.|melt|to turn from ice to water|Rising temperatures are causing the ice to melt.
We should ___ more trees to help the planet.|plant|to put a seed in the soil|We should plant more trees.
The city introduced a ban on single-use ___.|plastic|a light material for bottles and bags|The city introduced a ban on plastic bags.
Air ___ is a serious problem in big cities.|pollution|dirt and harmful things in air or water|Air pollution is a serious problem.
We can ___ our carbon footprint by cycling.|lower|to make something smaller or less|We can lower our carbon footprint by cycling.
The government promised to cut carbon ___.|emissions|gases that go into the air|The government promised to cut carbon emissions.
Many animals lost their natural ___.|habitat|the natural home of an animal or plant|Many animals lost their natural habitat.
We should ___ water instead of wasting it.|conserve|to use carefully so it lasts|We should conserve water.
The beach was covered in ___ after the storm.|litter|rubbish left on the ground|The beach was covered in litter after the storm.
Electric cars produce ___ pollution than petrol ones.|less|a smaller amount of|Electric cars produce less pollution.
The charity works to protect ___ species.|endangered|in danger of dying out|The charity works to protect endangered species.
We separate our rubbish for ___.|recycling|using waste again to make new things|We separate our rubbish for recycling.
The company switched to ___ packaging.|sustainable|not harming the environment for the future|The company switched to sustainable packaging.
Deforestation is a major cause of climate ___.|change|becoming different over time|Deforestation is a major cause of climate change.
We should walk instead of ___ short distances.|driving|moving a car yourself|We should walk instead of driving short distances.
The river was cleaned up after years of ___.|neglect|not taking care of something|The river was cleaned up after years of neglect.
Wind farms generate clean ___.|energy|power used to make machines work|Wind farms generate clean energy.
Protecting the environment is everyone's ___.|responsibility|a duty to look after something|Protecting nature is everyone's responsibility.`,
  },
  {
    id: "b1p11",
    title: "Education & Learning",
    subtitle: "School, study and exams",
    kind: "cloze",
    note: "B1-level vocabulary for talking about education.",
    data: `She is studying for a ___ in biology at university.|degree|a university title you get after study|She has a degree in biology.
He failed the exam, so he has to ___ it in June.|resit|to take an exam again|He must resit the exam in June.
Students must ___ their assignments by Friday.|submit|to give work to a teacher|Please submit your essay by Friday.
The teacher gave us some homework to ___ overnight.|complete|to finish a task|I must complete this homework tonight.
She got a ___ mark of ninety percent.|top|the best or highest|She got the top mark in class.
He dropped out of school and never got his ___.|diploma|a paper that shows you finished a course|He never got his diploma.
The lecture ___ was very clear and easy to follow.|hall|a large room where a lecture is given|The lecture hall was full.
We have a ___ exam at the end of term.|final|the last one; coming at the end|We have a final exam in June.
She was awarded a ___ to study abroad.|scholarship|money given to a student to study|She won a scholarship to study abroad.
He struggled with maths, so he hired a private ___.|tutor|a teacher who helps one student at home|He hired a private tutor for maths.
The school offers extra ___ classes after hours.|tutoring|extra lessons given to help students|The school offers extra tutoring after class.
Attendance is compulsory for all ___ students.|registered|having your name on an official list|Only registered students may enter.
The professor asked us to ___ our essays in class.|present|to show or give a talk to others|Each student will present an essay.
She is doing a ___ degree in psychology.|master's|a degree you get after a first degree|She is doing a master's in psychology.
He was ___ for cheating during the exam.|caught|found doing something wrong|He was caught cheating in the exam.
The library is a quiet place to ___ for tests.|revise|to study again before a test|I revise in the library every evening.
Class ___ starts at nine every morning.|registration|writing your name on a list to attend|Registration starts at nine.
She earned a ___ grade in her final report.|distinction|a very high mark in a course|She earned a distinction in English.
The teacher marked the essay and gave useful ___.|feedback|comments that help you improve|The teacher gave us useful feedback.
He is ___ to graduate next summer.|due|expected to happen at a certain time|He is due to graduate in July.
The school ___ all students who miss too many classes.|warns|tells someone that something may go wrong|The school warns students about missing classes.
Good study ___ help you remember more information.|habits|things you do regularly without thinking|Good habits help you study.
She took extra ___ classes to improve her English.|evening|in the later part of the day|She takes evening classes.
The university offers many ___ courses online.|distance|from far away, without being in class|He studies a distance course online.
He passed every subject except ___, which he must repeat.|chemistry|the science of what substances are made of|He failed chemistry and must repeat it.`,
  },
  {
    id: "b1p12",
    title: "Describing Trends",
    subtitle: "Talking about graphs and change",
    kind: "cloze",
    note: "B1-level language for describing statistics and change over time.",
    data: `Sales ___ sharply after the new product launched.|increased|became bigger in number or amount|Sales increased sharply last year.
Prices ___ slightly over the last three months.|rose|went up; the past of rise|Prices rose slightly in March.
Unemployment ___ steadily since last year.|fell|went down; the past of fall|Unemployment fell steadily this year.
The graph shows a clear ___ in online shopping.|rise|a movement upward|There was a clear rise in sales.
Profits ___ dramatically after the factory closed.|dropped|went down suddenly|Profits dropped after the factory closed.
The number of visitors ___ constant throughout the year.|remained|stayed in the same state|The number of visitors remained constant.
There was a sudden ___ in demand for masks.|surge|a sudden big increase|There was a surge in demand.
The trend shows a gradual ___ in average income.|increase|a rise in number or amount|We saw a gradual increase in income.
The company's revenue ___ off after a strong start.|levelled|stopped rising or falling|Sales levelled off after a strong start.
House prices have ___ significantly in the city.|risen|gone up; the past participle of rise|House prices have risen in the city.
The population is expected to ___ over the next decade.|grow|to get bigger in size or number|The population will grow over the decade.
Costs ___ slightly before stabilising again.|fluctuated|went up and down often|Costs fluctuated before they stabilised.
The chart shows a steady ___ in pollution levels.|decline|a slow fall in number or quality|There is a steady decline in pollution.
Exports ___ by ten percent last quarter.|shrank|became smaller|Exports shrank by ten percent.
The line on the graph shows a sharp ___ in usage.|peak|the highest point of something|Usage reached its peak in July.
Interest rates have stayed ___ for two years.|stable|not changing much|Interest rates have stayed stable.
The number of students ___ every year since 2020.|increases|goes up in number|The number of students increases each year.
Traffic in the city has ___ noticeably this year.|worsened|became worse|Traffic has worsened this year.
The figures show a slight ___ compared to last month.|dip|a small, short fall|There was a slight dip in sales.
Demand ___ rapidly after the advertising campaign.|grew|became bigger; the past of grow|Demand grew rapidly after the advert.
The report predicts a further ___ in oil prices.|fall|a drop or decrease|Experts predict a fall in oil prices.
Wages have barely ___ despite rising costs.|changed|became different|Wages have barely changed.
The company saw a huge ___ in customer complaints.|drop|a sudden fall|There was a drop in complaints.
Tourism numbers ___ to record levels last summer.|climbed|went up step by step|Tourist numbers climbed to record levels.
Overall, the data shows an upward ___.|trend|the general direction of change|The data shows an upward trend.`,
  },
  {
    id: "b1p13",
    title: "Job Interviews & CVs",
    subtitle: "Applying for work",
    kind: "cloze",
    note: "B1-level vocabulary for job applications and interviews.",
    data: `I'm writing to ___ for the marketing position.|apply|to ask formally for a job|I want to apply for the post.
Please find my ___ attached to this email.|CV|a short paper listing your work and studies|My CV is attached to this email.
I have three years of ___ in customer service.|experience|skill you gain by doing a job|I have three years of experience.
I'm looking for a role with more ___.|responsibility|a duty to take care of something|I want a role with more responsibility.
Could you tell me about your ___ strengths?|main|most important|My main strength is teamwork.
I'm a very ___ team player.|reliable|someone you can trust to do things|I am a reliable team player.
The interviewer asked about my greatest ___.|weakness|a part of you that is not good|He asked about my greatest weakness.
I believe I would be a great ___ for this role.|fit|the right size or type for something|I think I'm a good fit for this role.
I'm available for an ___ any day next week.|interview|a meeting to talk about a job|I'm free for an interview next week.
My current ___ ends next month.|contract|a written agreement to do work|My contract ends next month.
I'm hoping to ___ my career to the next level.|take|to lift something to a new level|I hope to take my career further.
The job ___ mentions strong communication skills.|description|a list of what a job involves|The job description lists the duties.
I have a ___ in business administration.|degree|a university title after three or four years|I have a degree in business.
I worked as an ___ for a local company last summer.|intern|a trainee who works to learn|She worked as an intern last summer.
Could you describe your ___ working style?|typical|usual; normal|Describe your typical working day.
I'm confident I can meet the ___ deadlines.|tight|very close together in time|I can meet tight deadlines.
The company offers a competitive ___ package.|salary|money paid regularly for work|The company offers a good salary.
I would appreciate the chance to ___ my skills.|demonstrate|to show clearly that you can do something|I can demonstrate my skills.
Please let me know if you need any further ___.|information|facts about something|Please send me more information.
I'm currently ___ for new opportunities.|searching|looking carefully for something|I am searching for a new job.
I have excellent ___ skills, both written and spoken.|communication|the ability to share ideas clearly|I have good communication skills.
The recruiter will be in ___ shortly.|touch|in contact|The recruiter will be in touch soon.
I'm keen to ___ more about the role.|learn|to gain knowledge of something|I'd love to learn more about the role.
Thank you for ___ my application.|considering|thinking about something carefully|Thank you for considering my application.
I look forward to ___ from you soon.|hearing|listening to news from someone|I look forward to hearing from you.`,
  },
  {
    id: "b1p14",
    title: "Describing People's Character",
    subtitle: "Personality traits",
    kind: "pair",
    termFromLeft: true,
    prompt: 'Someone who is "%s" tends to…',
    note: "Personality adjectives matched to typical behaviour.",
    data: `generous|share what they have with others|happy to give and share|She is generous with her time.
stubborn|refuse to change their mind|unwilling to change your mind|My dad is very stubborn.
honest|always tell the truth|always telling the truth|He is an honest man.
reliable|always do what they promise|able to be trusted to do things|She is a reliable friend.
ambitious|work hard to achieve big goals|wanting very much to succeed|He is an ambitious student.
patient|stay calm while waiting|able to wait calmly|Be patient, the bus is coming.
curious|ask a lot of questions|wanting to learn and know things|My son is very curious.
confident|believe in their own abilities|sure of your own ability|She feels confident before exams.
shy|feel nervous meeting new people|nervous with new people|He is shy at parties.
outgoing|enjoy meeting new people|friendly and fond of meeting people|She is outgoing and friendly.
careless|make mistakes without noticing|not paying enough attention|A careless driver caused the crash.
organised|keep everything neat and planned|neat and well planned|She is very organised.
lazy|avoid doing work|not wanting to work|He is too lazy to cook.
hardworking|put a lot of effort into tasks|putting a lot of effort in|She is a hardworking student.
selfish|think mainly of themselves|caring only about yourself|Don't be so selfish!
kind|treat others with care|caring and good to others|He is kind to animals.
arrogant|think they are better than others|too proud of yourself|An arrogant boss is hard to like.
modest|not boast about achievements|not boasting about yourself|He is modest about his success.
cheerful|stay happy and positive|happy and positive|She is cheerful every morning.
moody|change mood suddenly and often|often changing mood|My brother is moody today.
loyal|stay faithful to friends|faithful to friends|A loyal friend never leaves you.
jealous|feel envious of others|unhappy about what others have|He gets jealous easily.
sensitive|get upset easily|easily hurt or upset|She is sensitive about her looks.
creative|come up with original ideas|good at making original things|He is a creative designer.
tactless|say things without thinking of others' feelings|careless about others' feelings|His tactless joke upset her.`,
  },
  {
    id: "b1p15",
    title: "Used to & Would",
    subtitle: "Past habits and states",
    kind: "cloze",
    note: "B1-level structures for talking about past habits.",
    data: `I ___ to walk to school every day when I was young.|used|describes a past habit or state that ended|I used to walk to school.
We ___ visit our grandparents every summer.|would|describes something you did again and again|We would visit them every summer.
She ___ to have long hair, but she cut it short.|used|describes a past habit or state that ended|She used to have long hair.
He ___ play football every weekend as a teenager.|would|describes something you did again and again|He would play football every weekend.
I ___ to live in a small village.|used|describes a past habit or state that ended|I used to live in a village.
They ___ argue about everything when they were kids.|would|describes something you did again and again|They would argue about everything.
She ___ to be afraid of the dark.|used|describes a past habit or state that ended|She used to be afraid of the dark.
We ___ spend hours playing outside after school.|would|describes something you did again and again|We would play outside after school.
He ___ to smoke, but he quit years ago.|used|describes a past habit or state that ended|He used to smoke.
I ___ eat sweets every day when I was a child.|would|describes something you did again and again|I would eat sweets every day.
She ___ to work as a teacher before she retired.|used|describes a past habit or state that ended|She used to work as a teacher.
We ___ to have a dog when I was young.|used|describes a past habit or state that ended|We used to have a dog.
They ___ meet at the same café every Friday.|would|describes something you did again and again|They would meet at the same cafe.
He ___ to be much thinner than he is now.|used|describes a past habit or state that ended|He used to be thinner.
I ___ to hate vegetables when I was a kid.|used|describes a past habit or state that ended|I used to hate vegetables.
We ___ stay up late telling stories.|would|describes something you did again and again|We would stay up late telling stories.
She ___ to own a bright red car.|used|describes a past habit or state that ended|She used to own a red car.
He ___ complain about the weather every winter.|would|describes something you did again and again|He would complain about the weather.
I ___ to study French at school.|used|describes a past habit or state that ended|I used to study French.
They ___ to travel a lot before they had children.|used|describes a past habit or state that ended|They used to travel a lot.
We ___ sing songs on long car journeys.|would|describes something you did again and again|We would sing on long journeys.
She ___ to be much more confident as a teenager.|used|describes a past habit or state that ended|She used to be more confident.
He ___ to play the piano every evening.|used|describes a past habit or state that ended|He used to play the piano.
I ___ collect stamps when I was younger.|would|describes something you did again and again|I would collect stamps when younger.
They ___ to live next door to us years ago.|used|describes a past habit or state that ended|They used to live next door.`,
  },
  {
    id: "b1p16",
    title: "Question Tags",
    subtitle: "Confirming and checking information",
    kind: "cloze",
    note: "B1-level question tag practice.",
    data: `You're coming to the party, ___ you?|aren't|the short form of are not|You're coming, aren't you?
She's happy with the result, ___ she?|isn't|the short form of is not|She's happy, isn't she?
He can dance really well, ___ he?|can't|the short form of cannot|He can dance well, can't he?
He can't swim very far, ___ he?|can|used after a negative to check|He can't swim far, can he?
It was sunny yesterday, ___ it?|wasn't|the short form of was not|It was sunny, wasn't it?
It wasn't sunny yesterday, ___ it?|was|the past of be, used to check|It wasn't sunny, was it?
They were at the party, ___ they?|weren't|the short form of were not|They were there, weren't they?
They weren't at home last night, ___ they?|were|the past of be, used to check|They weren't home, were they?
She likes chocolate, ___ she?|doesn't|the short form of does not|She likes chocolate, doesn't she?
She doesn't like tea very much, ___ she?|does|used after a negative to check|She doesn't like tea, does she?
You smoke sometimes, ___ you?|don't|the short form of do not|You smoke sometimes, don't you?
You don't smoke at all, ___ you?|do|used after a negative to check|You don't smoke, do you?
You've seen this film before, ___ you?|haven't|the short form of have not|You've seen it, haven't you?
You haven't seen my keys, ___ you?|have|used after a negative to check|You haven't seen it, have you?
He's finished his homework, ___ he?|hasn't|the short form of has not|He's finished, hasn't he?
He hasn't finished the report yet, ___ he?|has|used after a negative to check|He hasn't finished, has he?
She'll call us later, ___ she?|won't|the short form of will not|She'll call us, won't she?
She won't be late again, ___ she?|will|used after a negative to check|She won't be late, will she?
You'd like some tea, ___ you?|wouldn't|the short form of would not|You'd like tea, wouldn't you?
You wouldn't mind helping, ___ you?|would|used after a negative to check|You wouldn't mind, would you?
He could swim as a child, ___ he?|couldn't|the short form of could not|He could swim, couldn't he?
He couldn't swim before lessons, ___ he?|could|used after a negative to check|He couldn't swim, could he?
We should leave soon, ___ we?|shouldn't|the short form of should not|We should leave, shouldn't we?
We shouldn't be late, ___ we?|should|used after a negative to check|We shouldn't be late, should we?
They didn't call you yesterday, ___ they?|did|the past of do, used to check|They didn't call, did they?`,
  },
  {
    id: "b1p17",
    title: "Giving Opinions & Agreeing",
    subtitle: "Sharing your point of view",
    kind: "cloze",
    note: "B1-level phrases for discussion and debate.",
    data: `In my ___, this is the best option.|opinion|what you think about something|In my opinion, this is best.
I ___ agree with what you're saying.|totally|completely|I totally agree with you.
I'm not really ___ about that idea.|sure|certain; without doubt|I'm not really sure about that.
That's a fair ___, but I see it differently.|point|an idea you give in a discussion|That's a fair point.
I couldn't ___ more with you.|agree|to have the same opinion|I couldn't agree more.
Personally, I ___ that we should wait.|think|to have an idea in your mind|Personally, I think we should wait.
I see what you ___, but I disagree.|mean|to have a certain idea; to intend|I see what you mean.
As ___ as I'm concerned, it's a bad idea.|far|used to say how much something applies|As far as I'm concerned, it's bad.
I'm ___ sure that's correct.|not|used to make a sentence negative|I'm not sure that's right.
I'd have to ___ with you on that one.|disagree|to have a different opinion|I'd have to disagree with you.
From my point of ___, it's a good plan.|view|the way you look at something|From my point of view, it's good.
I ___ your point, but I still disagree.|understand|to know what someone means|I understand your point, but disagree.
Honestly, I don't ___ it that way.|see|to look at an idea in a way|I don't see it that way.
I tend to ___ with the majority here.|side|to support one group in an argument|I tend to side with them.
That's exactly what I was going to ___.|say|to tell your thoughts in words|That's what I was going to say.
I'm ___ convinced by that argument.|hardly|almost not at all|I'm hardly convinced by that.
It seems to ___ that we have no choice.|me|the person speaking, as the object|It seems to me we have no choice.
I have to ___ with you there.|concur|a formal way to say you agree|I concur with your view.
I'm afraid I ___ agree with that.|can't|the short form of cannot|I'm afraid I can't agree.
That's a good ___, actually.|observation|a comment about something you noticed|That's a good observation.
I'm ___ of two minds about this.|kind|rather; to some degree|I'm kind of unsure.
I really don't think that's ___.|true|correct; not false|I don't think that's true.
Let's agree to ___ on this one.|differ|to hold different opinions|Let's agree to differ.
I ___ what you're saying, but I still think I'm right.|hear|to listen and understand the words|I hear you, but I disagree.
To be ___, I hadn't thought of it that way.|honest|truthful; used to admit something|To be honest, I'm not sure.`,
  },
  {
    id: "b1p18",
    title: "Health & Fitness",
    subtitle: "Exercise and healthy living",
    kind: "cloze",
    note: "B1-level vocabulary for talking about fitness and wellbeing.",
    data: `I try to ___ out at the gym three times a week.|work|to do physical exercise|I work out three times a week.
Eating a ___ diet keeps you healthy.|balanced|including all the food groups you need|Eat a balanced diet.
I always ___ up before I start exercising.|warm|to prepare your body for exercise|I warm up before running.
Getting enough ___ is important for your health.|sleep|the natural rest you need every night|Enough sleep is important.
She ___ five kilometres every morning.|runs|moves fast on foot|She runs five kilometres every day.
Drinking plenty of ___ keeps you hydrated.|water|a clear liquid we drink|Drink plenty of water.
He joined a ___ to get fit.|gym|a place with machines for exercise|He joined a gym.
Doing ___ exercise strengthens your heart.|cardio|exercise that makes your heart work harder|Cardio strengthens your heart.
I need to ___ down after my workout.|cool|to let your body relax after exercise|I cool down after a workout.
Lifting ___ builds muscle strength.|weights|heavy objects you lift for strength|Lifting weights builds muscle.
Cutting down on ___ food is good for you.|junk|unhealthy food that is quick to eat|Cut down on junk food.
Stretching helps prevent ___.|injuries|hurt to the body|Stretching helps prevent injuries.
I try to eat five portions of ___ a day.|fruit|sweet food like apples and bananas|Eat five portions of fruit a day.
Getting regular exercise reduces ___.|stress|worry and tension|Exercise reduces stress.
She follows a strict fitness ___.|routine|a regular plan you follow|She follows a strict fitness routine.
He hired a personal ___ to help him train.|trainer|a person who helps you exercise|He hired a personal trainer.
Drinking too much ___ isn't good for you.|alcohol|a drink like beer or wine|Too much alcohol is unhealthy.
Yoga is great for ___ and relaxation.|flexibility|the ability to bend easily|Yoga improves flexibility.
I go ___ every weekend to stay active.|swimming|moving through water as a sport|I go swimming every weekend.
Skipping breakfast isn't a healthy ___.|habit|something you do regularly|Skipping breakfast is a bad habit.
Getting fresh ___ is good for your lungs.|air|the gas we breathe|Fresh air is good for you.
Cycling to work is good ___.|exercise|physical activity that keeps you fit|Cycling is good exercise.
He tracks his ___ intake carefully.|calorie|connected with units of energy in food|He counts his calorie intake.
A good night's ___ helps you recover.|rest|time when you relax or sleep|Good rest helps you recover.
She takes a daily ___ for her health.|vitamin|a pill with substances for health|She takes a vitamin every day.`,
  },
  {
    id: "b1p19",
    title: "Weather & Natural Events",
    subtitle: "Extreme weather vocabulary",
    kind: "cloze",
    note: "B1-level vocabulary for weather and natural events.",
    data: `A strong ___ knocked down several trees.|storm|a violent wind with rain|A strong storm knocked down trees.
The ___ caused severe flooding in the town.|rain|water that falls from clouds|Heavy rain caused flooding.
Scientists are monitoring the approaching ___.|hurricane|a violent storm with strong winds|Scientists track the approaching hurricane.
The ___ shook the entire building.|earthquake|a sudden shaking of the ground|The earthquake shook the building.
Heavy ___ blocked the roads for days.|snow|soft white flakes of frozen water|Heavy snow blocked the roads.
The region suffered a long ___ last summer.|drought|a long time with no rain|A long drought hit the region.
The ___ destroyed several homes near the coast.|flood|a large amount of water covering land|The flood destroyed several homes.
A sudden ___ hit the coastal town.|gale|a very strong wind|A sudden gale hit the town.
The ___ warning was issued early this morning.|weather|connected with rain, sun and wind|The weather warning came this morning.
Thick ___ made driving dangerous.|fog|thick cloud near the ground|Thick fog made driving dangerous.
The ___ caused widespread damage to crops.|hailstorm|a storm with falling balls of ice|The hailstorm damaged the crops.
Firefighters battled a huge ___ in the forest.|wildfire|a big fire in a forest|Firefighters fought a huge wildfire.
The city experienced a rare ___ this winter.|blizzard|a storm with heavy snow and wind|A rare blizzard hit the city.
The ___ swept through the village overnight.|tornado|a violent whirling wind|The tornado swept through the village.
Rising sea levels are linked to climate ___.|change|to become different|Climate change is raising sea levels.
The ___ lasted for nearly three hours.|thunderstorm|a storm with thunder and lightning|The thunderstorm lasted three hours.
The heatwave caused several ___ related illnesses.|heat|the quality of being very hot|Heat caused several illnesses.
The ___ left thousands without electricity.|blackout|a loss of electric power|A blackout left thousands without power.
Meteorologists predicted a severe ___ this weekend.|downpour|a very heavy fall of rain|Forecasters predicted a severe downpour.
The volcano's ___ affected air travel for days.|eruption|when a volcano throws out lava|The eruption closed the airport.
The ___ made the roads extremely slippery.|ice|frozen water; a slippery surface|Ice made the roads slippery.
A powerful ___ hit the island nation.|cyclone|a large storm with circling winds|A powerful cyclone hit the island.
The ___ brought record-breaking temperatures.|heatwave|a long period of very hot weather|The heatwave broke temperature records.
Officials issued a ___ warning for the coast.|tsunami|a huge wave caused by an earthquake|Officials issued a tsunami warning.
The ___ has caused significant coastal erosion.|surge|a sudden rise of sea water|The surge damaged the coast.`,
  },
  {
    id: "b1p20",
    title: "Describing a Process",
    subtitle: "Sequencing and instructions",
    kind: "cloze",
    note: "B1-level sequencing language for describing steps.",
    data: `___ of all, you need to gather the ingredients.|first|before everything else|First of all, gather the ingredients.
The ___ step is to preheat the oven.|next|coming after this one|The next step is to preheat.
After that, you should ___ the flour and sugar.|mix|to put things together into one|Mix the flour and sugar.
Once the mixture is ready, you ___ it into the tin.|pour|to make liquid flow out of a container|Pour it into the tin.
___ this, place the tin in the oven.|following|coming after something|Following this, place the tin inside.
While it bakes, you can ___ the kitchen.|clean|to remove dirt from something|You can clean the kitchen.
After twenty minutes, ___ the cake to check it's done.|check|to look to see if it is right|Check the cake after twenty minutes.
Then, you need to ___ it out to cool.|take|to remove from a place|Take it out to cool.
Finally, you can ___ the cake with icing.|decorate|to add something to make it look nice|Decorate the cake with icing.
The ___ stage involves cutting the pieces.|final|coming at the end|The final stage is cutting.
Before you start, make sure you ___ your hands.|wash|to clean with water and soap|Wash your hands first.
The ___ step is to switch on the machine.|initial|first; at the beginning|The initial step is to switch it on.
Once it's ready, you should ___ off the power.|turn|to switch a machine off or on|Turn off the power.
After the process is finished, ___ everything away.|put|to place in the right place|Put everything away.
The ___ thing you do is check the results.|last|coming at the end|The last thing is to check results.
To begin ___, gather all the necessary tools.|with|part of the phrase "to begin with"|To begin with, gather the tools.
Next, you ___ the pieces together carefully.|fit|to join things so they match|Fit the pieces together carefully.
Once assembled, you need to ___ the screws.|tighten|to make something firmer|Tighten the screws.
After that, ___ the device before use.|test|to try something to see if it works|Test the device before use.
The ___ step is often the most important.|closing|coming at the end|The closing step is important.
Before finishing, you should ___ everything twice.|verify|to make sure something is right|Verify everything twice.
Once complete, you can ___ the finished product.|use|to do something with a tool or thing|You can use the finished product.
The process ___ with a simple inspection.|starts|begins|The process starts with an inspection.
After preparation, the next ___ is mixing.|step|one part of a process|The next step is mixing.
Lastly, allow the mixture to ___ overnight.|rest|to stay still without being touched|Let the mixture rest overnight.`,
  },
  {
    id: "b1p21",
    title: "Listening: Opinions & Explanations",
    subtitle: "Opinions and explanations",
    kind: "listening",
    prompt: "What did you hear?",
    note: "Opinions and explanations in closely-matched pairs.",
    data: `I'd rather work from home on Fridays.|I'd rather work from home on Fridays.
I'd rather work from home on Mondays.|I'd rather work from home on Mondays.
The course was harder than I'd expected.|The course was harder than I'd expected.
The course was easier than I'd expected.|The course was easier than I'd expected.
She turned down the offer because of the hours.|She turned down the offer because of the hours.
She turned down the offer because of the salary.|She turned down the offer because of the salary.
If I'd known, I would've waited.|If I'd known, I would've waited.
If I'd known, I wouldn't have waited.|If I'd known, I wouldn't have waited.
They're considering a move to Manchester.|They're considering a move to Manchester.
They're considering a move to Edinburgh.|They're considering a move to Edinburgh.
He apologised for missing the deadline.|He apologised for missing the deadline.
He apologised for missing the meeting.|He apologised for missing the meeting.
The results were better than last year.|The results were better than last year.
The results were worse than last year.|The results were worse than last year.
I'm not entirely convinced by that argument.|I'm not entirely convinced by that argument.
I'm not entirely convinced by that explanation.|I'm not entirely convinced by that explanation.
She's been learning Japanese since March.|She's been learning Japanese since March.
She's been learning Japanese since May.|She's been learning Japanese since May.
We ought to leave a little earlier.|We ought to leave a little earlier.
We ought to leave a little later.|We ought to leave a little later.
He admitted that he'd made a mistake.|He admitted that he'd made a mistake.
He denied that he'd made a mistake.|He denied that he'd made a mistake.
It depends on how much time we've got.|It depends on how much time we've got.
It depends on how much money we've got.|It depends on how much money we've got.
I found the ending rather disappointing.|I found the ending rather disappointing.`,
  },
  {
    id: "b1p22",
    title: "Speaking: Saying What You Think",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Opinions, reasons and comparisons said out loud.",
    // Each line is the same text twice: what is shown is what must be said.
    // Kept to one breath, and to phrasing the normaliser can actually reconcile
    // with a transcript (see spoken-answer.ts). Five things are avoided on
    // purpose, each of which marked a PERFECT utterance wrong when it slipped
    // through:
    //   - compound numbers and currency ("twenty one" vs smart_format's "21")
    //   - ordinals, for the same reason ("second" vs "2nd")
    //   - a contracted "has" ("He has finished" said as "He's finished", which
    //     normalises to "he is")
    //   - possessive 's ("devil's" normalises to "devil is")
    //   - names and homophones with no disambiguating context ("Sara"/"Sarah")
    data: `I think the other option makes more sense.|I think the other option makes more sense.
Personally, I would handle it differently.|Personally, I would handle it differently.
The main problem is the cost.|The main problem is the cost.
It depends on how much time we have.|It depends on how much time we have.
I am not entirely convinced by that argument.|I am not entirely convinced by that argument.
On the whole, the changes have helped.|On the whole, the changes have helped.
I would rather discuss this in person.|I would rather discuss this in person.
That is a fair point, but I disagree.|That is a fair point, but I disagree.
The results were better than we hoped.|The results were better than we hoped.
I have been thinking about it all week.|I have been thinking about it all week.
There is no easy answer to that.|There is no easy answer to that.
We could try a completely different approach.|We could try a completely different approach.
I am afraid I cannot agree with that.|I am afraid I cannot agree with that.
It would make sense to wait a little.|It would make sense to wait a little.
The sooner we decide, the better.|The sooner we decide, the better.
I used to feel the same way.|I used to feel the same way.
Let me explain what I mean by that.|Let me explain what I mean by that.
I am fairly sure we can manage it.|I am fairly sure we can manage it.
That would take far too long.|That would take far too long.
I would like to hear your opinion on this.|I would like to hear your opinion on this.
The difference is smaller than it looks.|The difference is smaller than it looks.
We need to be realistic about this.|We need to be realistic about this.
I can see why you would think that.|I can see why you would think that.
In my experience, that rarely works.|In my experience, that rarely works.
It is worth trying at least once.|It is worth trying at least once.`,
  },
  {
    id: "b1p23",
    title: "Say It Your Way: Opinions",
    subtitle: "Write the idea in English",
    kind: "translate",
    prompt: "Write this in English:",
    note: "Opinions, reasons and comparisons, written in your own words.",
    // The left side describes the idea rather than giving the sentence away --
    // otherwise this is a copying exercise, not a producing one. Each line
    // lists three wordings a learner plausibly reaches for; anything else valid
    // is caught by the AI grader, which is the fallback, not the plan. Avoids
    // the traps the speaking packs documented (compound numbers, ordinals,
    // contracted "has", possessive 's, undisambiguated names), because the same
    // normaliser runs underneath.
    data: `Name cost as the biggest obstacle.|The main problem is the cost.;The biggest problem is the cost.;Cost is the main issue.
Say the answer depends on the time available.|It depends how much time we have.;It depends on the time available.;That depends how much time there is.
Disagree politely with an argument.|I am afraid I do not agree.;I'm not sure I agree with that.;I see it differently.
Say you would handle it differently.|I would handle it differently.;Personally, I'd do it another way.;I would approach it differently.
Say results exceeded what you hoped for.|The results were better than we hoped.;The results beat our expectations.;The results were better than expected.
Say there is no easy answer.|There is no easy answer to that.;There's no simple answer.;That question has no easy answer.
Suggest trying a different approach.|We could try a different approach.;Perhaps we should try another way.;Let us try a different approach.
Say you have been thinking about it all week.|I have been thinking about it all week.;I've been thinking about this all week.;It has been on my mind all week.
Say it would make sense to wait.|It would make sense to wait.;I think we should wait.;Waiting would make more sense.
Say you used to feel the same way.|I used to feel the same way.;I felt the same way once.;I used to think that too.
Ask someone to explain what they mean.|Could you explain what you mean?;What do you mean by that?;Can you say more about that?
Play down how large a gap appears.|The difference is smaller than it looks.;The gap is smaller than it seems.;It is a smaller difference than it appears.
Urge realism about a plan.|We need to be realistic about this.;Let us be realistic here.;We should be realistic about it.
Say you can see why someone thinks that.|I can see why you think that.;I understand why you would say that.;I can see where you are coming from.
Say that in your experience it rarely works.|In my experience, that rarely works.;From what I have seen, it seldom works.;That has rarely worked in my experience.
Suggest giving something a single try.|It is worth trying at least once.;It's worth a try.;I think it deserves one try.
Say the sooner you decide the better.|The sooner we decide, the better.;It is better to decide soon.;The sooner a decision is made, the better.
Say you would like to hear their opinion.|I would like to hear your opinion.;I'd like to know what you think.;What is your view on it?
Say that would take far too long.|That would take far too long.;That would take too much time.;It would take far too long.
Say you are fairly sure it can be managed.|I am fairly sure we can manage it.;I'm reasonably confident we can do it.;I think we can manage it.
Say on the whole the changes have helped.|On the whole, the changes have helped.;Overall, the changes helped.;By and large the changes have helped.
Say you would rather discuss it in person.|I would rather discuss this in person.;I'd prefer to talk about it face to face.;Let us discuss it in person.
Concede a point while still disagreeing.|That is a fair point, but I still disagree.;You have a point, though I do not agree.;I take your point, but I disagree.
Choose between two options, preferring the second.|The second option makes more sense.;I think the second one is better.;The other option makes more sense.
Say you are not entirely convinced.|I am not entirely convinced.;I'm not completely convinced.;I have my doubts about that.`,
  },
];

const B2: Pack[] = [
  {
    id: "b2p1",
    title: "The Passive",
    subtitle: "Passive structures",
    kind: "cloze",
    note: "Passive = be + past participle; the doer becomes optional.",
    data: `The report ___ written last week.|was|a past form of be for passives|The report was written last week.
The bridge is ___ repaired.|being|shows that a passive action is in progress|The bridge is being repaired.
Nothing ___ been decided yet.|has|a helper verb for a passive perfect action|Nothing has been decided yet.
The letters ___ sent yesterday.|were|the plural past of be, for passives|The letters were sent yesterday.
He ___ given a warning.|was|a helper verb for a past passive|He was given a warning.
The results will ___ announced soon.|be|the plain verb form used after will|The results will be announced soon.
The room ___ cleaned every day.|is|a form of be for habits in passives|The room is cleaned every day.
The car needs ___ .|repairing|the -ing form used after needs|The car needs repairing.
She ___ said to be brilliant.|is|a form of be used to report opinions|She is said to be brilliant.
The house is ___ to have been built in 1820.|thought|believed by many people|The house is thought to date from 1820.
Mistakes ___ made.|were|the plural past of be, used in passives|Mistakes were made.
The film ___ directed by Lean.|was|a past form of be, used in passives|The film was directed by Lean.
The data ___ being analysed now.|is|a form of be used with being|The data is being analysed now.
Tickets can ___ bought online.|be|the plain verb form used after can|Tickets can be bought online.
The law ___ have been changed.|must|shows that you are sure it happened|The law must have been changed.
He got ___ in the accident.|hurt|injured; having a painful body|He got hurt in the accident.
The matter is ___ investigated.|being|shows an action is happening now to something|The matter is being investigated.
The plan ___ approved next month.|will be|shows a passive action in the future|The plan will be approved next month.
It is widely ___ that prices will rise.|believed|thought to be true by many people|It is widely believed that prices will rise.
The rules ___ to be followed.|have|a verb that shows a rule or duty|The rules have to be followed.
The parcel should ___ arrived.|have|shows something probably happened already|The parcel should have arrived.
The offer was ___ down.|turned|refused; rejected|The offer was turned down.
Our flight ___ cancelled.|was|a past form of be in a passive|Our flight was cancelled.
The issue ___ dealt with promptly.|was|a past form of be in a passive|The issue was dealt with promptly.
Nothing ___ be done about it.|can|shows it is possible|Nothing can be done about it.`,
  },
  {
    id: "b2p2",
    title: "Confusable Words",
    subtitle: "Choose precisely",
    kind: "pair",
    prompt: 'Which fits: "%s"?',
    note: "These pairs are frequently mixed up by learners.",
    data: `affect / effect (verb, to influence)|affect|to change or influence something|Stress can affect your sleep.
practice / practise (British verb)|practise|to do something again and again to improve|I practise the piano every day.
principal / principle (a rule)|principle|a basic rule that guides behaviour|I follow the principle of honesty.
lose / loose (opposite of tight)|loose|not fitting tightly|My shoes feel loose today.
its / it's (belonging to it)|its|belonging to a thing or animal|The dog wagged its tail.
advice / advise (noun)|advice|a suggestion about what someone should do|He gave me good advice.
economic / economical (money-saving)|economical|saving money or resources|A small car is more economical.
historic / historical (of the past)|historical|connected with past events|It is a historical building.
sensible / sensitive (easily hurt)|sensitive|easily hurt or upset|She is sensitive about her age.
continual / continuous (unbroken)|continuous|going on without any break|There was continuous noise all night.
few / less (with countable nouns)|few|a small number of; not many|Few people came to the party.
among / between (three or more)|among|in the middle of three or more|She stood among the crowd.
bring / take (movement away)|take|to carry something away from here|Take this to the office.
borrow / lend (give temporarily)|lend|to give something for a short time|Can you lend me a pen?
rise / raise (needs an object)|raise|to lift something up|Please raise your hand.
lie / lay (needs an object)|lay|to put something down flat|Lay the book on the table.
remember / remind (prompt someone)|remind|to make someone think of something|Please remind me to call him.
say / tell (needs a person object)|tell|to give information to someone|Tell me the truth.
travel / trip (a journey noun)|trip|a short journey for a purpose|We took a trip to the coast.
job / work (uncountable)|work|activity done to earn money|I have a lot of work today.
alone / lonely (feeling sad)|lonely|sad because you have no company|He felt lonely in the big city.
classic / classical (music style)|classical|of the traditional style of serious music|She plays classical music.
efficient / effective (achieves the goal)|effective|successful in giving the result you want|This medicine is very effective.
assure / ensure (make certain)|ensure|to make certain that something happens|Please ensure the door is locked.
imply / infer (draw a conclusion)|infer|to reach a conclusion from clues|From his tone, I infer he is upset.`,
  },
  {
    id: "b2p3",
    title: "Linking Ideas",
    subtitle: "Discourse markers",
    kind: "cloze",
    note: "Linkers signal contrast, cause, or addition — choose by logic.",
    data: `It was raining; ___ , we went out.|nevertheless|in spite of what was just said|It rained; nevertheless, we went out.
He was tired. ___ , he kept working.|Even so|used to add a surprising contrast|He was tired. Even so, he kept working.
___ the cost, the project went ahead.|Despite|used to show something happened anyway|Despite the cost, the project went ahead.
She is talented; ___ , she lacks focus.|however|used to add a contrast|She is talented; however, she lacks focus.
___ of the delay, we arrived on time.|In spite|used in the phrase before the delay|In spite of the delay, we arrived on time.
The plan failed ___ poor planning.|due to|because of; caused by|The plan failed due to poor planning.
___ , the results were encouraging.|Overall|used to sum up the main idea|Overall, the results were encouraging.
He studied hard; ___ , he passed.|therefore|used to show a result|He studied hard; therefore, he passed.
___ , let's review the numbers.|Firstly|used to begin a list of points|Firstly, let's review the numbers.
The data is old; ___ , it's still useful.|nonetheless|in spite of that|The data is old; nonetheless, it's useful.
___ addition, costs have risen.|In|used to add another point|In addition, costs have risen.
We must act ___ it's too late.|before|earlier than a stated time|We must act before it's too late.
___ as the report suggests, sales fell.|Just|in the same way|Just as the report suggests, sales fell.
___ , the strategy needs revision.|In short|used to give a brief conclusion|In short, the strategy needs revision.
She left early ___ she felt ill.|because|used to give a reason|She left early because she felt ill.
___ contrast, exports grew.|In|used to show a difference|In contrast, exports grew.
He is, ___ , the best candidate.|arguably|used for a claim that can be argued|He is, arguably, the best candidate.
___ hand, the risks are real.|On the other|used to introduce an opposing point|On the other hand, the risks are real.
The trial failed; ___ , funding stopped.|consequently|as a result|The trial failed; consequently, funding stopped.
___ than complain, act.|Rather|instead of; used before a verb|Rather than complain, act.
___ far, progress is slow.|So|up to this point|So far, progress is slow.
We agreed, ___ with conditions.|albeit|although; even though|We agreed, albeit with conditions.
___ this in mind, we proceeded.|With|keeping something in your thoughts|With this in mind, we proceeded.
___ , nothing has changed.|Meanwhile|at the same time; in the meantime|Meanwhile, nothing has changed.
The claim is, ___ , unproven.|however|used to add a contrast|The claim is, however, unproven.`,
  },
  {
    id: "b2p4",
    title: "Reported Speech",
    subtitle: "Backshift and reporting verbs",
    kind: "cloze",
    note: "Tenses usually shift back one step when reporting.",
    data: `He said he ___ tired.|was|a past form of be in reported speech|He said he was tired.
She told me she ___ finished.|had|a helper verb for reporting past actions|She told me she had finished.
They said they ___ come later.|would|the reported form of will|They said they would come later.
He asked ___ I was free.|if|used to report a yes-or-no question|He asked if I was free.
She asked me where I ___ .|lived|the past tense of live|She asked me where I lived.
He admitted ___ the mistake.|making|the -ing form used after admit|He admitted making the mistake.
She refused ___ comment.|to|used before a verb after refuse|She refused to comment.
They denied ___ involved.|being|the -ing form used after deny|They denied being involved.
He promised ___ help.|to|used before a verb after promise|He promised to help.
She suggested ___ a break.|taking|the -ing form used after suggest|She suggested taking a break.
He warned us ___ to go.|not|used to give a negative warning|He warned us not to go.
She explained that she ___ busy.|was|a past form of be in reported speech|She explained that she was busy.
He insisted ___ paying.|on|a word that follows insist|He insisted on paying.
They announced that prices ___ rise.|would|the reported form of will|They announced that prices would rise.
She apologised ___ being late.|for|a word that follows apologise|She apologised for being late.
He claimed he ___ seen nothing.|had|a helper verb for reporting an earlier action|He claimed he had seen nothing.
She reminded me ___ call.|to|used before a verb after remind|She reminded me to call.
He complained ___ the noise.|about|a word that follows complain|He complained about the noise.
They agreed ___ postpone.|to|used before a verb after agree|They agreed to postpone.
She wondered ___ it was true.|whether|used to report a question with doubt|She wondered whether it was true.
He offered ___ drive us.|to|used before a verb after offer|He offered to drive us.
She accused him ___ lying.|of|a word that follows accuse|She accused him of lying.
He recommended ___ the early train.|taking|the -ing form used after recommend|He recommended taking the early train.
She confirmed that she ___ attend.|would|the reported form of will|She confirmed that she would attend.
He asked what time the meeting ___ .|started|began|He asked what time the meeting started.`,
  },
  {
    id: "b2p5",
    title: "Strong Collocations",
    subtitle: "Natural word partners",
    kind: "pair",
    prompt: 'Which word pairs with "%s"?',
    note: "Advanced fluency lives in collocation.",
    data: `___ rain (very heavy)|heavy|large and strong in amount|Heavy rain fell all night.
___ evidence (convincing)|compelling|so strong that it is hard to doubt|The police found compelling evidence.
___ difference (large)|significant|large enough to be important|There is a significant difference between them.
___ silence (complete)|utter|complete; total|They sat in utter silence.
___ mistake (serious)|grave|very serious and worrying|He made a grave mistake.
___ opportunity (rare)|golden|a chance that is rare and very good|It was a golden opportunity.
___ debate (intense)|heated|full of strong feeling and anger|They had a heated debate.
___ progress (steady)|steady|continuing at a regular rate|She is making steady progress.
___ criticism (strong)|fierce|very strong and angry|The plan met fierce criticism.
___ demand (great)|high|great in amount or level|There is high demand for tickets.
___ impact (large)|profound|having a deep and strong effect|The news had a profound impact.
___ deadline (unmovable)|strict|that must be followed exactly|We have a strict deadline.
___ concern (increasing)|growing|becoming bigger over time|There is growing concern about prices.
___ argument (persuasive)|convincing|able to make you believe it|She made a convincing argument.
___ change (basic)|fundamental|affecting the most basic part|We need a fundamental change.
___ interest (strong)|keen|eager and strongly interested|She takes a keen interest in art.
___ traffic (crowded)|heavy|a lot of vehicles on the road|Heavy traffic delayed us.
___ knowledge (deep)|thorough|complete and careful, with no gaps|He has a thorough knowledge of law.
___ apology (sincere)|heartfelt|showing deep and honest feeling|She offered a heartfelt apology.
___ effort (concentrated)|concerted|done together with great effort|It needs a concerted effort.
___ failure (total)|complete|total; with nothing missing|The plan was a complete failure.
___ increase (sharp)|sharp|sudden and large|There was a sharp increase in prices.
___ resemblance (close)|striking|surprising because things are alike|There is a striking resemblance between them.
___ decision (final)|firm|fixed and not likely to change|He made a firm decision.
___ support (broad)|widespread|shared by many people over a large area|The idea has widespread support.`,
  },
  {
    id: "b2p6",
    title: "Word Formation",
    subtitle: "Verb → noun",
    kind: "pair",
    prompt: 'Noun form of "%s":',
    note: "Suffix patterns are predictable once learned.",
    data: `analyse|analysis|a careful study of something in parts|The analysis took a week.
decide|decision|a choice you make|It was a hard decision.
argue|argument|a discussion where people disagree|They had an argument about money.
achieve|achievement|something you did well with effort|Passing the exam was a big achievement.
succeed|success|doing well and getting what you wanted|The show was a great success.
fail|failure|a lack of success|The experiment ended in failure.
maintain|maintenance|work to keep something in good condition|The car needs regular maintenance.
prove|proof|facts that show something is true|Do you have proof of payment?
choose|choice|the act of picking one thing|You have a choice of three meals.
lose|loss|the state of no longer having something|The loss of the keys was annoying.
believe|belief|something you accept as true|It is my belief that he is honest.
grow|growth|the process of getting bigger|There was strong growth last year.
know|knowledge|facts and skills you have learned|He has great knowledge of history.
solve|solution|an answer to a problem|We found a simple solution.
apply|application|a formal request for a job or place|I sent my application today.
persuade|persuasion|the act of making someone agree|Persuasion is part of selling.
expand|expansion|the process of getting bigger|The company announced its expansion.
respond|response|an answer or reaction|We are waiting for a response.
behave|behaviour|the way a person acts|His behaviour was rude.
survive|survival|staying alive in difficult conditions|The animals fought for survival.
explain|explanation|reasons that make something clear|Her explanation was easy to follow.
assume|assumption|something you accept as true without proof|That is just an assumption.
conclude|conclusion|a final decision or opinion after thought|We came to the same conclusion.
refuse|refusal|saying no to something|The refusal surprised everyone.
depart|departure|the act of leaving a place|Departure is at six.`,
  },
  {
    id: "b2p7",
    title: "Reporting & Hedging",
    subtitle: "Report what was said",
    kind: "cloze",
    note: "Reported speech shifts tense back and changes time and place words.",
    data: `She said she ___ tired.|was|a past form of be in reported speech|She said she was tired.
He told ___ he would call.|me|the word for the speaker, after tell|He told me he would call.
They asked where I ___ from.|came|the past of come|They asked where I came from.
She wondered ___ I had finished.|whether|used to report a question with doubt|She wondered whether I had finished.
He admitted ___ the money.|taking|the -ing form used after admit|He admitted taking the money.
She denied ___ anything wrong.|doing|the -ing form used after deny|She denied doing anything wrong.
He suggested ___ earlier.|leaving|the -ing form used after suggest|He suggested leaving earlier.
They insisted ___ paying the bill.|on|a word that follows insist|They insisted on paying the bill.
She warned us ___ to touch it.|not|used to give a negative warning|She warned us not to touch it.
He apologised ___ being late.|for|a word that follows apologise|He apologised for being late.
She claimed ___ have seen him.|to|used before a verb after claim|She claimed to have seen him.
He refused ___ comment.|to|used before a verb after refuse|He refused to comment.
They announced that the deal ___ off.|was|a past form of be in a passive|They announced that the deal was off.
She explained ___ the system worked.|how|used to report the way something works|She explained how the system worked.
She complained ___ the delay.|about|a word that follows complain|She complained about the delay.
She reminded me ___ lock the door.|to|used before a verb after remind|She reminded me to lock the door.
He accused her ___ lying.|of|a word that follows accuse|He accused her of lying.
They agreed ___ meet on Friday.|to|used before a verb after agree|They agreed to meet on Friday.
She promised she ___ help.|would|the reported form of will|She promised she would help.
He asked me ___ I needed anything.|if|used to report a yes-or-no question|He asked me if I needed anything.
She pointed ___ the flaw in the plan.|out|to show something by talking about it|She pointed out the flaw in the plan.
He implied that something ___ wrong.|was|a past form of be in reported speech|He implied that something was wrong.
They confirmed the flight ___ been delayed.|had|a helper verb for an earlier action|They confirmed the flight had been delayed.
She urged them ___ reconsider.|to|used before a verb after urge|She urged them to reconsider.
He maintained that he ___ innocent.|was|a past form of be in reported speech|He maintained that he was innocent.`,
  },
  {
    id: "b2p8",
    title: "Collocations",
    subtitle: "Words that go together",
    kind: "pair",
    prompt: 'Complete: "%s ___"',
    note: "Natural English depends on the right partner word.",
    data: `make a|decision|a choice you make|You must make a decision today.
take a|risk|a chance of loss or danger|It's worth taking a risk.
pay|attention|careful listening or watching|Please pay attention to the teacher.
draw a|conclusion|a final opinion reached after thought|We drew a conclusion from the facts.
meet a|deadline|the time by which work must be done|We met the deadline.
raise|awareness|knowledge that something exists or matters|The campaign raised awareness of the problem.
break the|news|information about recent events|He had to break the news gently.
keep a|promise|a statement that you will do something|She always keeps a promise.
run a|business|a company that sells goods or services|He runs a small business.
hold a|meeting|an event where people come to talk|The team holds a meeting each week.
reach an|agreement|a decision that people both accept|They reached an agreement last night.
set a|precedent|an earlier event used as an example|The ruling set a precedent.
bear in|mind|in your thoughts; remembered|Bear in mind that it's a long trip.
take|responsibility|the duty to accept blame or care|She takes responsibility for her work.
place an|order|a request to buy goods|We placed an order online.
gain|experience|skill you gain by doing something|He gained experience abroad.
cause|damage|harm that spoils something|The storm caused serious damage.
express|concern|to say that you are worried|She expressed concern about safety.
launch a|campaign|a planned series of actions for a goal|They launched a campaign to save the park.
strike a|balance|to find a fair mix of two things|It's hard to strike a balance between work and rest.
face a|challenge|a difficult task that tests you|She faced a big challenge.
issue a|statement|an official announcement|The company issued a statement.
conduct|research|careful study to find new facts|Scientists conduct research on diseases.
achieve a|goal|something you work to reach|He achieved his goal.
lose|patience|the ability to wait calmly|I lose patience in traffic.`,
  },
  {
    id: "b2p9",
    title: "Health & Medicine",
    subtitle: "Describing symptoms and care",
    kind: "cloze",
    note: "Intermediate-plus vocabulary for talking about health.",
    data: `The doctor ___ a full recovery within weeks.|predicted|said what would happen before it did|The doctor predicted a full recovery.
She's been ___ from a bad cold all week.|suffering|feeling pain or illness|She has been suffering from a cold.
He was ___ to hospital after the accident.|admitted|accepted into hospital as a patient|He was admitted after the accident.
The medicine should ___ the pain quickly.|relieve|to make pain or worry less|This medicine will relieve the pain.
She's ___ to penicillin, so avoid it.|allergic|made ill by something you eat or touch|I'm allergic to nuts.
The nurse took his ___ before the appointment.|temperature|how hot or cold your body is|The nurse took his temperature.
He's on ___ to manage his blood pressure.|medication|medicine that a doctor gives you|He takes medication for blood pressure.
The wound needs to be ___ regularly.|dressed|covered with a clean bandage|The wound was dressed twice a day.
She was ___ with a mild infection.|diagnosed|found to have a particular illness|She was diagnosed with a mild infection.
Rest and fluids should help you ___.|recover|to get well again|You should recover soon.
The clinic offers a free ___ once a year.|check-up|a routine medical examination|I have a check-up every year.
He ___ his ankle playing football.|twisted|turned and hurt by a sudden movement|He twisted his ankle.
The vaccine helps ___ the disease.|prevent|to stop something from happening|The vaccine helps prevent the disease.
She's been feeling ___ since yesterday.|nauseous|feeling that you may be sick|I felt nauseous all morning.
The doctor ___ two weeks of rest.|recommended|advised as a good thing to do|The doctor recommended two weeks of rest.
His symptoms ___ after a few days.|improved|got better|His symptoms improved after a few days.
The hospital ___ him overnight for observation.|kept|made someone stay in a place|The hospital kept him overnight.
She takes a daily ___ for her allergies.|tablet|a small pill of medicine|She takes a tablet every day.
The surgeon ___ the operation successfully.|performed|carried out a task or action|The surgeon performed the operation.
He's ___ to a specialist for further tests.|referred|sent to another doctor or place|He was referred to a specialist.
The patient's condition remained ___.|stable|not changing; not getting worse|The patient's condition stayed stable.
She was given ___ before the procedure.|anaesthesia|drugs that stop you feeling pain|She was given anaesthesia before the operation.
The clinic is fully ___ for emergencies.|equipped|having the tools and supplies needed|The clinic is well equipped.
His recovery has been slow but ___.|steady|continuing at an even, regular rate|His recovery has been steady.
The doctor advised him to ___ smoking.|quit|to stop doing something|He decided to quit smoking.`,
  },
  {
    id: "b2p10",
    title: "Technology & Media",
    subtitle: "Talking about devices and news",
    kind: "cloze",
    note: "Everyday tech and media vocabulary at B2 level.",
    data: `My phone's ___ died, so I couldn't call.|battery|a small device that gives power|My phone's battery died.
The app keeps ___ every time I open it.|crashing|suddenly stopping working|The app keeps crashing.
We need to ___ the software before using it.|update|to change software to the newest version|Please update the software.
The article went ___ within hours.|viral|spreading very fast online|The video went viral.
He ___ his password and got locked out.|forgot|could not remember|He forgot his password.
The company was ___ over a data breach.|criticised|blamed for doing something wrong|The company was criticised over the breach.
Streaming services have ___ how we watch TV.|changed|made something different|Streaming has changed how we watch TV.
She ___ the video before sharing it.|verified|checked that something is true|She verified the video first.
The signal ___ whenever it rains.|drops|gets weaker or lost|The signal drops when it rains.
This site collects your data without ___.|consent|permission to do something|They collect data without consent.
The report was ___ by several news outlets.|shared|passed on to other people|Several outlets shared the report.
He ___ his old laptop for a new one.|upgraded|replaced with a better version|He upgraded his old laptop.
The story was quickly ___ by fact-checkers.|debunked|shown to be false|Fact-checkers debunked the story.
Most people now get news through social ___.|media|websites where people share content|Most people get news through social media.
The website ___ if too many users log in.|crashes|suddenly stops working|The website crashes if too many log in.
She backed up her files to the ___.|cloud|online storage on distant computers|She backed up her files to the cloud.
The headline was clearly ___.|misleading|giving a wrong idea on purpose|The headline was clearly misleading.
He ___ the news alert before reading it.|dismissed|chose to ignore something|He dismissed the alert.
The device connects ___ to your phone.|wirelessly|without any cables|The speaker connects wirelessly to your phone.
Online ___ can spread faster than facts.|misinformation|false information that spreads|Misinformation can spread faster than facts.
The company issued a public ___.|apology|a statement saying you are sorry|The company issued a public apology.
She disabled ___ to save her battery.|notifications|messages from an app on your phone|I turned off notifications.
The article cited an ___ source.|unreliable|that you cannot trust|The article cited an unreliable source.
His account was ___ after suspicious activity.|suspended|stopped for a time|His account was suspended.
The platform introduced stricter privacy ___.|settings|choices that control how an app works|Check your privacy settings.`,
  },
  {
    id: "b2p11",
    title: "Business & Negotiation",
    subtitle: "Deals and workplace talk",
    kind: "cloze",
    note: "B2-level vocabulary for meetings and negotiations.",
    data: `We need to ___ a deal before the deadline.|close|to finish an agreement successfully|We want to close the deal.
Both sides made a ___ to reach agreement.|compromise|an agreement where each side gives something up|Both sides made a compromise.
The company plans to ___ into new markets.|expand|to grow bigger|The firm plans to expand abroad.
We're hoping to ___ a long-term partnership.|build|to create over time|We want to build a partnership.
The talks broke down over pricing ___.|disputes|serious disagreements|Pricing disputes ended the talks.
She was promoted to ___ the new division.|head|to lead a group or department|She was promoted to head the division.
The merger was finally ___ this week.|approved|officially accepted|The merger was approved this week.
We need to ___ the terms before signing.|finalise|to agree the last details|We need to finalise the terms.
His proposal was ___ by the board.|rejected|refused to accept|The board rejected his proposal.
The company had to ___ several employees.|lay off|to stop employing workers|The company had to lay off staff.
We're aiming to ___ costs by ten percent.|cut|to make smaller|We aim to cut costs.
The client asked for a better ___.|quote|a price a seller says they will charge|The client asked for a better quote.
They reached a ___ after hours of talks.|deal|an agreement in business|They struck a deal.
The firm plans to ___ with a rival company.|merge|to join to form one company|The firm plans to merge with a rival.
We need more data before we can ___.|decide|to choose after thinking|We need more data to decide.
The negotiation ___ down to price alone.|came|reached the main point|It came down to price.
She's known for driving a hard ___.|bargain|an agreement where both sides argue for terms|She drives a hard bargain.
The board will ___ on the proposal tomorrow.|vote|to choose by raising a hand or ballot|The board will vote tomorrow.
We're under pressure to ___ a decision quickly.|make|to reach a choice|We must make a decision quickly.
The deal fell ___ at the last minute.|through|failed to happen|The deal fell through.
They agreed to ___ the contract for a year.|extend|to make something last longer|They agreed to extend the contract.
The company issued new ___ to investors.|shares|parts of a company that people can own|The firm issued new shares.
We need buy-in from all ___ involved.|stakeholders|people with an interest in a business|We need all stakeholders involved.
The CEO announced a major ___ in strategy.|shift|a change in direction|The CEO announced a shift in strategy.
Negotiations are still ___ ongoing.|very much|to a great degree|Negotiations are very much ongoing.`,
  },
  {
    id: "b2p12",
    title: "Crime & Law",
    subtitle: "Reporting incidents",
    kind: "cloze",
    note: "B2-level vocabulary for news and crime reports.",
    data: `The suspect was ___ near the scene.|arrested|taken by police for a suspected crime|The suspect was arrested.
Police are ___ the robbery as a priority case.|treating|handling something in a certain way|Police are treating it as a priority.
The witness gave a detailed ___ to police.|statement|a spoken or written account|The witness gave a statement.
He was found ___ of the crime.|guilty|found to have done the crime|He was found guilty.
The jury reached a ___ after two days.|verdict|the decision of a court jury|The jury reached a verdict.
She was ___ to five years in prison.|sentenced|given a punishment by a judge|She was sentenced to five years.
The thief managed to ___ before police arrived.|escape|to get away from a place|The thief tried to escape.
Detectives are still ___ the case.|investigating|trying to find out the facts|Detectives are investigating the case.
The court will ___ the case next month.|hear|to listen to a case in court|The court will hear the case next month.
He pleaded ___ to the charges.|not guilty|saying you did not do the crime|He pleaded not guilty.
The victim reported the ___ to the police.|theft|the crime of stealing|The victim reported the theft.
CCTV footage helped ___ the suspect.|identify|to recognise who someone is|CCTV helped identify the suspect.
The judge dismissed the case due to lack of ___.|evidence|facts that show something is true|The judge dismissed it for lack of evidence.
The lawyer argued for a lighter ___.|sentence|a punishment given by a court|The lawyer argued for a lighter sentence.
Police are appealing for ___ from the public.|witnesses|people who saw a crime happen|Police are appealing for witnesses.
The burglar broke ___ through a window.|in|entered a building by force|The burglar broke in through a window.
He was released on ___ pending trial.|bail|money paid so you can wait outside prison|He was released on bail.
The case was ___ due to insufficient evidence.|dropped|stopped before it was finished|The case was dropped.
The officer read him his ___.|rights|legal protections a person has|The officer read him his rights.
The trial is expected to ___ several weeks.|last|to continue for a time|The trial will last several weeks.
She was charged with ___ a false report.|filing|presenting a formal document|She was charged with filing a false report.
The defendant appeared in court to ___ the charges.|answer|to give a formal reply to a charge|He appeared in court to answer the charges.
Forensic experts examined the ___ carefully.|scene|the place where something happened|Experts examined the scene.
The gang was involved in a series of ___.|robberies|crimes where things are stolen with force|The gang carried out a series of robberies.
He was found ___ innocent by the jury.|not|a word that makes a sentence negative|The jury found him not guilty.`,
  },
  {
    id: "b2p13",
    title: "Politics & Society",
    subtitle: "Government and public debate",
    kind: "cloze",
    note: "B2-level vocabulary for discussing politics and social issues.",
    data: `The government announced a new ___ to tackle unemployment.|policy|a plan of action used by a government|The government announced a new policy.
Voters will go to the ___ next month.|polls|places where people vote in an election|Voters will go to the polls.
The party won a clear ___ in parliament.|majority|more than half of the votes or seats|The party won a clear majority.
Citizens have the right to ___ in elections.|vote|to choose someone in an election|Citizens have the right to vote.
The proposal sparked a heated public ___.|debate|a formal talk where views are argued|The plan sparked a heated debate.
The minister was forced to ___ after the scandal.|resign|to leave a job by choice|The minister had to resign.
The new law will ___ into effect next year.|come|to begin to be in force|The law will come into effect.
Protesters gathered to ___ against the reform.|demonstrate|to show opposition in a public march|Protesters gathered to demonstrate.
The opposition ___ the government's handling of the crisis.|criticised|said what was wrong with something|The opposition criticised the government.
Many people feel ___ by the lack of change.|frustrated|annoyed because you cannot change things|Many people feel frustrated.
The council held a ___ to discuss local issues.|meeting|a gathering of people to talk and decide|The council held a meeting.
The bill was passed after months of ___.|negotiation|talks to reach an agreement|The bill passed after months of negotiation.
Inequality remains a major ___ in society.|issue|a subject people discuss or worry about|Inequality remains a major issue.
The campaign focused on ___ reform in healthcare.|systemic|affecting a whole system|The campaign called for systemic reform.
Freedom of ___ is protected by the constitution.|speech|the right to say what you think|Freedom of speech is protected.
The election result surprised most political ___.|analysts|experts who study and explain events|Most analysts were surprised.
The president signed the treaty after lengthy ___.|talks|conversations to reach an agreement|The president signed after lengthy talks.
Local communities are demanding greater ___ in decisions.|say|a chance to influence a decision|Locals want more say in decisions.
The government faces pressure to ___ its spending.|cut|to reduce|The government must cut its spending.
Turnout at the election was ___ lower than expected.|significantly|by a large and clear amount|Turnout was significantly lower than expected.
The candidate promised to ___ taxes for low earners.|lower|to make something smaller|He promised to lower taxes.
Public trust in politicians has ___ in recent years.|declined|became less or worse|Public trust has declined.
The referendum will decide whether the country should ___ the union.|leave|to go away from a group|Should the country leave the union?
Activists are calling for stronger ___ rights.|workers'|belonging to people who work for pay|They call for stronger workers' rights.
The new policy aims to reduce the wealth ___.|gap|a large difference between two groups|The policy aims to reduce the wealth gap.`,
  },
  {
    id: "b2p14",
    title: "Arts & Culture",
    subtitle: "Museums, film and performance",
    kind: "cloze",
    note: "B2-level vocabulary for discussing the arts.",
    data: `The gallery is hosting an ___ of modern sculpture.|exhibition|a public display of art|The gallery hosts an exhibition.
The film received ___ reviews from critics.|mixed|both good and bad|The film received mixed reviews.
The novel was later ___ into a successful film.|adapted|changed to suit a new form|The novel was adapted into a film.
The orchestra gave a ___ performance last night.|stunning|very impressive|The orchestra gave a stunning performance.
The museum's new wing displays ___ artefacts.|ancient|very old, from long ago|The museum shows ancient artefacts.
The play explores themes of loss and ___.|identity|who a person is and what they are|The play explores identity.
The concert was performed to a sold-out ___.|audience|people who watch a show|The audience applauded loudly.
The director is known for his unique visual ___.|style|the special way something is made or done|He has a unique visual style.
The choreography was both bold and ___.|graceful|moving in a smooth, beautiful way|The dance was bold and graceful.
The exhibition features works by local ___.|artists|people who make paintings or sculptures|The show features local artists.
The band's latest album was a huge commercial ___.|success|getting what you hoped for|The album was a huge success.
Critics praised the film's stunning ___.|cinematography|the art of filming a movie|Critics praised the film's cinematography.
The theatre company is famous for its innovative ___.|productions|shows put on at a theatre|The theatre is famous for its productions.
The museum acquired a private ___ of Impressionist works.|collection|a group of objects gathered together|The museum acquired a private collection.
The festival celebrates classical and contemporary ___.|music|sounds made by voices and instruments|The festival celebrates classical music.
The actor gave a deeply moving ___.|performance|a show given before an audience|The actor gave a moving performance.
The sculpture was carved from a single block of ___.|marble|a hard stone used for statues|The statue is carved from marble.
The author's latest book explores modern ___.|society|people living together in a country|The book explores modern society.
The gallery curator selected pieces that challenge ___.|perception|the way you see and understand things|Art can change our perception.
The documentary sheds light on an overlooked ___ movement.|artistic|connected with painting or other art|It was an overlooked artistic movement.
The opera house is renowned for its stunning ___.|acoustics|the way sound is heard in a room|The hall is known for its acoustics.
The mural depicts the city's rich cultural ___.|heritage|traditions passed down from the past|The mural shows the city's cultural heritage.
The critics called the performance a true work of ___.|art|paintings, music and other creative things|It was a true work of art.
The young pianist won critical ___ for her debut.|acclaim|strong praise from critics|The pianist won critical acclaim.
The novel won several literary ___ this year.|awards|prizes for good work|The novel won several awards.`,
  },
  {
    id: "b2p15",
    title: "Idioms & Fixed Expressions",
    subtitle: "Meaning match",
    kind: "pair",
    termFromLeft: true,
    prompt: 'The expression "%s" means…',
    note: "Common B2-level idioms and fixed expressions.",
    data: `to be on the ball|to be alert and quick to understand|to be alert and quick to understand|You need to be on the ball today.
to cost an arm and a leg|to be very expensive|to be very expensive|It will cost an arm and a leg to fix.
to hit the books|to study hard|to study hard|I need to hit the books tonight.
to get the ball rolling|to start something|to start something|We need to get the ball rolling soon.
to be in hot water|to be in trouble|to be in trouble|He seems to be in hot water with his boss.
to call it a day|to stop working for now|to stop working for now|It's time to call it a day.
to break the ice|to ease tension in a social situation|to ease tension in a social situation|A joke can help to break the ice.
to be under the weather|to feel slightly ill|to feel slightly ill|I seem to be under the weather today.
to keep an eye on|to watch carefully|to watch carefully|Please remember to keep an eye on my bag.
to make ends meet|to have just enough money to live on|to have just enough money to live|It is hard to make ends meet.
to be a piece of cake|to be very easy|to be very easy|The test should be a piece of cake to do.
to spill the beans|to reveal a secret|to reveal a secret|Try not to spill the beans about it.
to be in the same boat|to be in the same difficult situation|to share the same difficult situation|We seem to be in the same boat.
to give someone the benefit of the doubt|to trust them despite uncertainty|to trust someone despite some doubt|I am willing to give someone the benefit of the doubt.
to sit on the fence|to avoid choosing a side|to avoid choosing a side|He tends to sit on the fence.
to get cold feet|to become nervous about doing something|to become nervous before doing something|She tends to get cold feet before a big talk.
to go back to square one|to start again from the beginning|to start again from the beginning|We had to go back to square one.
to be a piece of the puzzle|to be one part of a larger issue|to be one part of a larger issue|His comment seems to be a piece of the puzzle.
to hit the nail on the head|to describe something exactly right|to describe something exactly right|You seem to hit the nail on the head!
to pull someone's leg|to joke with someone|to joke with someone|He likes to pull someone's leg.
to be up in the air|to be undecided or uncertain|to be undecided or uncertain|Our plans seem to be up in the air.
to bite off more than you can chew|to take on too much|to take on too much|Try not to bite off more than you can chew.
to take something for granted|to not appreciate something properly|to not value something enough|It is easy to take something for granted.
to be out of the blue|to happen unexpectedly|to happen without warning|Her call seemed to be out of the blue.
to keep your chin up|to stay positive during hard times|to stay positive in hard times|Try to keep your chin up.`,
  },
  {
    id: "b2p16",
    title: "Cause & Effect",
    subtitle: "Connectors for reasons and results",
    kind: "pair",
    termFromLeft: true,
    prompt: 'The connector "%s" is used to…',
    note: "B2-level connectors matched to how they signal cause or effect.",
    data: `because|give a direct reason for something|used to give a direct reason for something|I stayed home because I was ill.
because of|introduce a noun reason|used to introduce a noun reason|We stayed home because of the rain.
due to|introduce a noun reason, often formal|used to introduce a reason in formal writing|The flight was late due to fog.
owing to|introduce a noun reason, formal|used to introduce a formal reason|The match was off owing to rain.
as a result of|show what caused something, formal|used to show a formal cause|Prices rose as a result of the storm.
as a result|introduce the consequence of an action|used to introduce the effect of an action|As a result, sales fell.
consequently|show a formal, logical consequence|used to show a logical, formal effect|Consequently, the plan was dropped.
therefore|show a logical conclusion follows|used to show that a conclusion follows|He worked hard; therefore, he passed.
thus|show a formal result, similar to therefore|used to show a formal result|The test failed; thus, we stopped.
hence|show a formal consequence, often written|used to show a formal result in writing|Costs are rising; hence, prices will rise.
so|show an everyday, simple result|used to show a simple, everyday result|It was late, so we left.
which resulted in|link an event to its outcome, mid-sentence|used to link an event to its outcome|The error, which resulted in delay, was costly.
which led to|link a cause to its eventual outcome|to link a cause to its later effect|The strike, which led to chaos, ended.
thanks to|give a positive reason for something|used to give a good reason for something|We won thanks to your help.
on account of|give a formal reason, similar to because of|used to give a formal reason|The game stopped on account of rain.
in view of|introduce a reason that affects a decision|to give a reason that affects a decision|In view of the risks, we waited.
for this reason|refer back to a reason just given|to point back to a reason just given|For this reason, we say no.
as a consequence|introduce a formal result|used to introduce a formal result|As a consequence, the shop closed.
accordingly|show a result that logically follows|used to show a result that follows logically|The weather turned; accordingly, we changed plans.
that is why|give an informal reason in speech|used to give an informal reason in speech|He was ill, that is why he left.
given that|introduce a condition-like reason|to give a reason that is already known|Given that it's late, let's stop.
seeing that|introduce an obvious reason, informal|used to give an obvious reason, informally|Seeing that you're here, help me.
in light of|introduce a reason based on new information|to give a reason based on new facts|In light of the news, we changed plans.
stemming from|show that something originates from a cause|used to show where a problem comes from|Problems stemming from a lack of money grew.
triggered by|show what set off a sudden reaction or event|to show what set off a sudden event|Panic triggered by the noise spread.`,
  },
  {
    id: "b2p17",
    title: "Phrasal Verbs II",
    subtitle: "Meaning match, everyday phrasal verbs",
    kind: "pair",
    termFromLeft: true,
    prompt: 'The phrasal verb "%s" means…',
    note: "B2-level phrasal verbs beyond the basics.",
    data: `come across|to find something by chance|to find something by chance|I might come across an old photo.
get away with|to avoid punishment for something|to escape punishment|He will not get away with lying.
look into|to investigate something|to investigate something|Police will look into the crime.
put off|to postpone something|to postpone something|We had to put off the meeting.
turn down|to refuse an offer|to refuse an offer|He turned down the job.
figure out|to understand or solve something|to understand or solve something|I can't figure out this puzzle.
carry out|to perform or complete a task|to perform or complete a task|Scientists carry out tests.
bring up|to mention a topic|to mention a topic|Don't bring up politics.
give up|to stop trying|to stop trying|Never give up.
hold on|to wait a moment|to wait for a moment|Hold on, I'll be right back.
run into|to meet someone by chance|to meet someone by chance|I may run into an old friend.
set up|to arrange or establish something|to arrange or establish something|They set up a new company.
take after|to resemble a family member|to look or behave like a relative|She takes after her mother.
work out|to solve a problem or exercise|to solve a problem or to exercise|I work out every morning.
break down|to stop functioning|to stop functioning|My car might break down.
call off|to cancel something|to cancel something|They called off the wedding.
come up with|to think of an idea|to think of an idea|Can you come up with a plan?
cut down on|to reduce the amount of something|to reduce the amount of something|I want to cut down on sugar.
fall through|to fail to happen|to fail to happen|The deal might fall through.
get by|to manage with limited resources|to manage with little money|We can get by on a small salary.
go through with|to complete something as planned|to do something as planned|She will go through with the wedding.
keep up with|to stay at the same pace as others|to stay at the same pace as others|It's hard to keep up with the class.
look forward to|to feel excited about something future|to feel excited about the future|I look forward to the holidays.
point out|to draw attention to something|to draw attention to something|He pointed out my mistake.
stand up for|to defend a person or belief|to defend a person or belief|You should stand up for your friends.`,
  },
  {
    id: "b2p18",
    title: "Mixed Conditionals",
    subtitle: "Past, present, and unreal combinations",
    kind: "cloze",
    note: "B2-level mixed conditional structures.",
    data: `If I ___ harder at school, I'd have a better job now.|had studied|did study before now, in an unreal case|If I had studied harder, I'd have a better job.
If she weren't so busy, she ___ have missed the meeting.|wouldn't|the short form of would not|If she weren't busy, she wouldn't have missed it.
If he had taken the job, he ___ be living abroad now.|would|shows a result of an unreal past|If he had taken it, he would be rich.
If they ___ more careful, the accident wouldn't have happened.|had been|a helper verb for the past perfect|If they had been careful, no one would be hurt.
If I were you, I ___ have accepted the offer.|would|shows what you imagine you would do|If I were you, I would have accepted.
If she had left earlier, she ___ be stuck in traffic now.|wouldn't|shows the short form of would not|If she had left, she wouldn't be stuck.
If we hadn't missed the flight, we ___ be at the hotel now.|would|shows a result of an unreal past|If we hadn't missed it, we would be there.
If he weren't so stubborn, he ___ have listened to us.|would|shows an imagined result|If he weren't stubborn, he would have listened.
If I hadn't lost my job, I ___ be so stressed now.|wouldn't|the short form of would not|If I hadn't lost it, I wouldn't be stressed.
If she were more confident, she ___ have taken the promotion.|would|shows an imagined result|If she were bolder, she would have taken it.
If they had saved money, they ___ be able to travel now.|would|shows what could be true now|If they had saved, they would be able to go.
If I weren't allergic, I ___ have eaten the cake.|would|shows an imagined result|If I weren't allergic, I would have eaten it.
If he had trained harder, he ___ be a professional athlete now.|would|shows what could be true now|If he had trained, he would be a pro.
If we ___ checked the weather, we wouldn't be stuck in the rain.|had|a helper verb for the past perfect|If we had checked, we wouldn't be stuck.
If she hadn't quit, she ___ be the manager by now.|would|shows what could be true now|If she hadn't quit, she would be the boss.
If I were rich, I ___ have bought that house last year.|would|shows an imagined result|If I were rich, I would have bought it.
If he ___ listened to advice, he wouldn't be in this mess now.|had|a helper verb for the past perfect|If he had listened, he wouldn't be in trouble.
If they weren't so tired, they ___ have finished the project.|would|shows an imagined result|If they weren't tired, they would have finished.
If I hadn't met her, my life ___ be very different now.|would|shows a result that is not real|If I hadn't met her, my life would be different.
If she were taller, she ___ have made the basketball team.|would|shows an imagined result|If she were taller, she would have made the team.
If we had planned better, we ___ be so stressed right now.|wouldn't|the short form of would not|If we had planned, we wouldn't be stressed.
If he weren't afraid of flying, he ___ have taken the job abroad.|would|shows an imagined result|If he weren't afraid, he would have gone.
If I ___ known about the traffic, I would have left earlier.|had|a helper verb for the past perfect|If I had known, I would have left earlier.
If she hadn't studied medicine, she ___ be a doctor today.|wouldn't|the short form of would not|If she hadn't studied, she wouldn't be a doctor.
If they were more organised, they ___ have missed the deadline.|wouldn't|the short form of would not|If they were organised, they wouldn't have missed it.`,
  },
  {
    id: "b2p19",
    title: "Wish & If Only",
    subtitle: "Expressing regret and desire",
    kind: "cloze",
    note: "B2-level wish structures.",
    data: `I wish I ___ more time to finish this project.|had|owned or possessed|I wish I had more time.
If only I ___ studied harder for the exam.|had|a helper verb for a past regret|If only I had studied harder.
I wish she ___ stop interrupting me.|would|shows you want someone to change|I wish she would stop interrupting.
If only he ___ listen to advice sometimes.|would|shows you want someone to change|If only he would listen.
I wish I ___ speak French fluently.|could|shows an ability you do not have|I wish I could speak French.
If only we ___ afford a bigger house.|could|shows an ability you do not have|If only we could afford it.
I wish it ___ stop raining.|would|shows you want something to change|I wish it would stop raining.
If only I ___ known about the meeting earlier.|had|a helper verb for a past regret|If only I had known earlier.
I wish he ___ so careless with money.|weren't|the short form of were not|I wish he weren't so careless.
If only she ___ here to see this.|were|a form of be used for wishes|If only she were here.
I wish I ___ never said that to him.|had|a helper verb for a regret|I wish I had never said that.
If only they ___ listened to the warning.|had|a helper verb for a regret|If only they had listened.
I wish you ___ stop smoking.|would|shows you want someone to change|I wish you would stop smoking.
If only I ___ taller.|were|a form of be used for wishes|If only I were taller.
I wish we ___ more time together.|had|owned or possessed|I wish we had more time together.
If only he ___ apologise for what he did.|would|shows you want someone to change|If only he would apologise.
I wish I ___ that decision differently.|had made|a regret about a past choice|I wish I had made a different choice.
If only she ___ more patient with the children.|were|a form of be used for wishes|If only she were more patient.
I wish they ___ visit more often.|would|shows you want people to change|I wish they would visit more often.
If only I ___ studied medicine instead.|had|a helper verb for a regret|If only I had studied medicine.
I wish my neighbours ___ so noisy.|weren't|the short form of were not|I wish my neighbours weren't so noisy.
If only we ___ booked the tickets earlier.|had|a helper verb for a regret|If only we had booked earlier.
I wish he ___ trust me more.|would|shows you want someone to change|I wish he would trust me more.
If only I ___ able to help you then.|had been|a regret about being unable to help|If only I had been able to help.
I wish this day ___ never end.|would|shows you want something to change|I wish this day would never end.`,
  },
  {
    id: "b2p20",
    title: "Food & Cooking",
    subtitle: "Kitchen vocabulary and techniques",
    kind: "cloze",
    note: "B2-level cooking vocabulary.",
    data: `You need to ___ the onions before adding them.|chop|to cut food into small pieces|Chop the onions finely.
Please ___ the sauce so it doesn't burn.|stir|to mix food by moving a spoon|Stir the sauce slowly.
The chef decided to ___ the vegetables instead of boiling them.|roast|to cook food in an oven|Roast the vegetables for an hour.
You should ___ the meat before cooking it further.|marinate|to soak meat in a tasty liquid|Marinate the meat overnight.
Let the soup ___ for twenty minutes.|simmer|to cook gently just below boiling|Let the soup simmer.
He likes to ___ the chicken until it's golden brown.|fry|to cook in hot oil|Fry the chicken until golden.
You need to ___ the pastry before baking it.|roll|to flatten dough with a flat tool|Roll the pastry thinly.
Add a pinch of salt to ___ the flavour.|enhance|to make better|Salt can enhance the flavour.
The recipe says to ___ the oven to 200 degrees.|preheat|to heat the oven before cooking|Preheat the oven to 200 degrees.
You should ___ the vegetables before serving.|steam|to cook using hot water vapour|Steam the vegetables briefly.
Let the dough ___ for an hour before baking.|rise|to grow bigger by itself|The dough will rise in an hour.
He likes to ___ fresh herbs over the dish.|sprinkle|to scatter small pieces over food|Sprinkle fresh herbs on top.
You need to ___ the sauce until it thickens.|reduce|to boil until there is less liquid|Reduce the sauce until it thickens.
Please ___ the ingredients thoroughly.|combine|to mix things together|Combine the ingredients well.
The recipe calls for you to ___ the garlic finely.|mince|to cut into very small pieces|Mince the garlic finely.
You should ___ the meat before slicing it.|rest|to leave food alone for a while|Let the meat rest before slicing.
He decided to ___ the vegetables on the grill.|grill|to cook over direct heat|Grill the vegetables outside.
You need to ___ the excess fat from the pan.|drain|to let liquid flow away|Drain the fat from the pan.
Add the spices to ___ the dish more flavour.|give|to hand over or provide|Spices give the dish more flavour.
The chef used a whisk to ___ the eggs.|beat|to mix quickly with a tool|Beat the eggs with a whisk.
You should ___ the cake before removing it from the tin.|cool|to become less warm|Cool the cake before removing it.
He likes to ___ the meat in breadcrumbs before frying.|coat|to cover with a layer|Coat the meat in breadcrumbs.
You need to ___ the vegetables into small pieces.|dice|to cut into small cubes|Dice the vegetables.
Let the meat ___ overnight in the fridge.|chill|to make cold; to keep in a fridge|Chill the meat overnight.
The sauce needs to ___ before you can serve it.|thicken|to become thick|The sauce will thicken as it cools.`,
  },
  {
    id: "b2p21",
    title: "Listening: Reports & Arguments",
    subtitle: "Reports and arguments",
    kind: "listening",
    prompt: "What did you hear?",
    note: "Hedged reportage where one word reverses the meaning.",
    data: `The findings appear to contradict earlier research.|The findings appear to contradict earlier research.
The findings appear to confirm earlier research.|The findings appear to confirm earlier research.
He claimed the delay was beyond his control.|He claimed the delay was beyond his control.
He claimed the delay was within his control.|He claimed the delay was within his control.
Had we acted sooner, the outcome might have been different.|Had we acted sooner, the outcome might have been different.
The proposal was rejected on financial grounds.|The proposal was rejected on financial grounds.
The proposal was accepted on financial grounds.|The proposal was accepted on financial grounds.
She's widely regarded as the leading expert.|She's widely regarded as the leading expert.
She was widely regarded as the leading expert.|She was widely regarded as the leading expert.
The figures suggest a modest but steady decline.|The figures suggest a modest but steady decline.
The figures suggest a modest but steady increase.|The figures suggest a modest but steady increase.
They were reportedly unaware of the change.|They were reportedly unaware of the change.
They were reportedly aware of the change.|They were reportedly aware of the change.
It remains unclear who authorised the payment.|It remains unclear who authorised the payment.
It's now clear who authorised the payment.|It's now clear who authorised the payment.
The committee hasn't yet reached a decision.|The committee hasn't yet reached a decision.
The committee has finally reached a decision.|The committee has finally reached a decision.
His account differs considerably from hers.|His account differs considerably from hers.
His account differs slightly from hers.|His account differs slightly from hers.
The scheme was abandoned after two years.|The scheme was abandoned after two years.
The scheme was extended after two years.|The scheme was extended after two years.
Critics argue the measures don't go far enough.|Critics argue the measures don't go far enough.
Critics argue the measures go too far.|Critics argue the measures go too far.
Attendance has fallen sharply since April.|Attendance has fallen sharply since April.
Attendance has risen sharply since April.|Attendance has risen sharply since April.`,
  },
  {
    id: "b2p22",
    title: "Speaking: Longer Turns",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Multi-clause sentences to say in one breath.",
    // Each line is the same text twice: what is shown is what must be said.
    // Kept to one breath, and to phrasing the normaliser can actually reconcile
    // with a transcript (see spoken-answer.ts). Five things are avoided on
    // purpose, each of which marked a PERFECT utterance wrong when it slipped
    // through:
    //   - compound numbers and currency ("twenty one" vs smart_format's "21")
    //   - ordinals, for the same reason ("second" vs "2nd")
    //   - a contracted "has" ("He has finished" said as "He's finished", which
    //     normalises to "he is")
    //   - possessive 's ("devil's" normalises to "devil is")
    //   - names and homophones with no disambiguating context ("Sara"/"Sarah")
    data: `If I had known earlier, I would have said something.|If I had known earlier, I would have said something.
The report suggests that demand is falling.|The report suggests that demand is falling.
What surprised me most was the reaction.|What surprised me most was the reaction.
Having read the whole thing, I changed my mind.|Having read the whole thing, I changed my mind.
It is not so much the price as the timing.|It is not so much the price as the timing.
We are under no obligation to accept it.|We are under no obligation to accept it.
The sooner this is resolved, the less it will cost.|The sooner this is resolved, the less it will cost.
I would appreciate it if you could confirm.|I would appreciate it if you could confirm.
There is a strong case for waiting.|There is a strong case for waiting.
That rather depends on what we agree today.|That rather depends on what we agree today.
I am inclined to think it was a mistake.|I am inclined to think it was a mistake.
By the time we arrived, everyone had left.|By the time we arrived, everyone had left.
The decision was made without consulting us.|The decision was made without consulting us.
I take your point, although I still have doubts.|I take your point, although I still have doubts.
We will need far more evidence than that.|We will need far more evidence than that.
It turned out to be much simpler than expected.|It turned out to be much simpler than expected.
The whole process took longer than planned.|The whole process took longer than planned.
I am not sure that follows from what you said.|I am not sure that follows from what you said.
We should weigh the risks before committing.|We should weigh the risks before committing.
Given the circumstances, that seems reasonable.|Given the circumstances, that seems reasonable.
It would be unwise to rush the decision.|It would be unwise to rush the decision.
The proposal has been revised several times.|The proposal has been revised several times.
What matters most is that it actually works.|What matters most is that it actually works.
I would be reluctant to change it now.|I would be reluctant to change it now.
Had we acted sooner, this could have been avoided.|Had we acted sooner, this could have been avoided.`,
  },
  {
    id: "b2p23",
    title: "Say It Your Way: Longer Turns",
    subtitle: "Write the idea in English",
    kind: "translate",
    prompt: "Write this in English:",
    note: "Multi-clause ideas, written in your own words.",
    // The left side describes the idea rather than giving the sentence away --
    // otherwise this is a copying exercise, not a producing one. Each line
    // lists three wordings a learner plausibly reaches for; anything else valid
    // is caught by the AI grader, which is the fallback, not the plan. Avoids
    // the traps the speaking packs documented (compound numbers, ordinals,
    // contracted "has", possessive 's, undisambiguated names), because the same
    // normaliser runs underneath.
    data: `Say that if you had known, you would have said something.|If I had known, I would have said something.;Had I known, I would have spoken up.;I would have said something if I had known.
Say what surprised you most was the reaction.|What surprised me most was the reaction.;The reaction was what surprised me most.;It was the reaction that surprised me most.
Say the report suggests demand is falling.|The report suggests that demand is falling.;According to the report, demand is falling.;The report indicates falling demand.
Say it is not the price so much as the timing.|It is not so much the price as the timing.;The issue is the timing rather than the price.;It's less about price than timing.
Say nobody is obliged to accept the offer.|We are under no obligation to accept it.;We do not have to accept it.;There is no obligation to accept.
Say the sooner it is resolved the less it costs.|The sooner this is resolved, the less it will cost.;Resolving it sooner will cost less.;The longer it takes, the more it costs.
Ask someone politely to confirm.|I would appreciate it if you could confirm.;Could you please confirm?;Please confirm when you can.
Say there is a strong case for waiting.|There is a strong case for waiting.;A good argument can be made for waiting.;There are strong reasons to wait.
Say you are inclined to think it was a mistake.|I am inclined to think it was a mistake.;I tend to think it was a mistake.;My feeling is that it was a mistake.
Say that by the time you arrived everyone had left.|By the time we arrived, everyone had left.;Everyone had gone by the time we got there.;When we arrived, everyone had already left.
Complain that a decision skipped your team.|The decision was made without consulting us.;Nobody consulted us about the decision.;They decided without asking us.
Concede a point while keeping your doubts.|I take your point, although I still have doubts.;I accept that, but I remain unconvinced.;Fair enough, though I still have reservations.
Reject a claim as badly under-evidenced.|We will need far more evidence than that.;That is nowhere near enough evidence.;Much more evidence is needed.
Say it turned out simpler than expected.|It turned out to be much simpler than expected.;It was far simpler than we thought.;In the end it was simpler than expected.
Say the process took longer than planned.|The whole process took longer than planned.;It took longer than we had planned.;The process ran over schedule.
Say you are not sure that follows.|I am not sure that follows.;I don't think that follows.;That does not necessarily follow.
Say the risks should be weighed before committing.|We should weigh the risks before committing.;Let us consider the risks first.;The risks need weighing before we commit.
Say that given the circumstances it seems reasonable.|Given the circumstances, that seems reasonable.;In the circumstances, it seems fair enough.;That seems reasonable given the situation.
Say it would be unwise to rush.|It would be unwise to rush the decision.;Rushing this would be a mistake.;We should not rush the decision.
Note how often a proposal has changed.|The proposal has been revised several times.;There have been several revisions to the proposal.;The proposal went through several revisions.
Say what matters most is that it works.|What matters most is that it actually works.;The important thing is that it works.;Above all, it has to work.
Say you would be reluctant to change it now.|I would be reluctant to change it now.;I'd rather not change it at this stage.;I am hesitant to change it now.
Say that acting sooner would have avoided it.|Had we acted sooner, this could have been avoided.;If we had acted earlier, this would not have happened.;Acting sooner would have prevented this.
Say having read it all you changed your mind.|Having read the whole thing, I changed my mind.;After reading all of it, I changed my mind.;Reading it in full changed my view.
Say that rather depends on what is agreed today.|That rather depends on what we agree today.;It depends what gets agreed today.;That hinges on today's decision.`,
  },
];

const C1: Pack[] = [
  {
    id: "c1p1",
    title: "Idioms",
    subtitle: "Meaning match",
    kind: "pair",
    termFromLeft: true,
    prompt: '"%s" means:',
    note: "Idioms are fixed — the words can't be swapped.",
    data: `bite the bullet|accept something unpleasant|to accept something unpleasant and move on|You will have to bite the bullet and pay.
hit the nail on the head|be exactly right|to be exactly right|You seem to hit the nail on the head.
under the weather|slightly unwell|slightly unwell|I feel a bit under the weather today.
a blessing in disguise|a hidden benefit|a bad thing that turns out good|Losing that job was a blessing in disguise.
cut corners|do something cheaply or badly|to do something cheaply or badly|Builders who cut corners put people at risk.
on the fence|undecided|undecided; not choosing a side|On the issue of tax, she is on the fence.
the ball is in your court|it's your decision|it's your turn to decide|We made the offer, so the ball is in your court.
let the cat out of the bag|reveal a secret|to reveal a secret by mistake|He let the cat out of the bag about the party.
break the ice|start a conversation|to ease the tension at a first meeting|A joke helped to break the ice.
go the extra mile|make extra effort|to make an extra effort|She will go the extra mile for clients.
throw in the towel|give up|to give up|After two years he threw in the towel.
a grey area|something unclear|a situation where rules are unclear|The law here is a grey area.
call it a day|stop working|to stop working for the day|It's late, so let's call it a day.
take it with a pinch of salt|be sceptical|to doubt that something is completely true|Take it with a pinch of salt.
back to square one|start again|to start again from the beginning|The test failed, so we're back to square one.
in the long run|eventually|after a long time; in the end|In the long run, saving pays off.
pull strings|use influence|to use your influence to get something|He had to pull strings to get the job.
the bottom line|the essential point|the most important point|The bottom line is that we need more money.
jump the gun|act too soon|to act too soon|Don't jump the gun before the results arrive.
sit on one's hands|do nothing|to wait and do nothing|It is wrong to sit on one's hands.
a steep learning curve|hard to learn quickly|something hard to learn at first|The new software has a steep learning curve.
touch base|make brief contact|to make short contact with someone|Let's touch base on Friday.
move the goalposts|change the rules unfairly|to change the rules in an unfair way|They keep moving the goalposts on us.
play devil's advocate|argue the opposing view|to argue the other side for debate|Let me play devil's advocate for a moment.
cost an arm and a leg|be very expensive|to be very expensive|Repairing the roof will cost an arm and a leg.`,
  },
  {
    id: "c1p2",
    title: "Register",
    subtitle: "Informal → formal",
    kind: "pair",
    prompt: 'Formal equivalent of "%s":',
    note: "Academic and professional writing prefers Latinate verbs.",
    data: `find out|ascertain|to find the facts about something|We must ascertain the cause of the fire.
get|obtain|to get something by asking or effort|You must obtain a visa first.
help|assist|to help someone do something|Staff will assist passengers at the gate.
show|demonstrate|to make something clear by showing it|The results demonstrate a clear trend.
start|commence|to begin|The course will commence in September.
end|terminate|to bring something to an end|The contract was terminated last week.
need|require|to need something as a rule|All visitors are required to sign in.
tell|inform|to give someone facts|Please inform us of any change.
ask for|request|to ask politely or formally for something|I wish to request a refund.
put off|postpone|to arrange for a later time|The meeting was postponed until Friday.
look at|examine|to look at something closely|The doctor will examine the results.
think about|consider|to think carefully about something|Please consider our offer carefully.
set up|establish|to create something lasting|They established the firm in 1990.
go up|increase|to become greater in number or size|Prices tend to increase in winter.
go down|decline|to become less or worse|Sales continued to decline last year.
leave out|omit|to leave something out|Please do not omit any details.
deal with|address|to give attention to a problem|The committee must address these concerns.
point out|indicate|to show or point towards something|The figures indicate a rise in costs.
give up|relinquish|to give up a right or claim|He chose to relinquish his title.
talk about|discuss|to talk about a subject in detail|We will discuss the budget tomorrow.
make up|constitute|to form or be the parts of something|Women constitute half of the workforce.
cut down|reduce|to make smaller in amount|We aim to reduce waste by half.
bring about|induce|to cause something to happen|The drug can induce sleep.
carry out|conduct|to organise and carry out an activity|Researchers conduct tests in the lab.
back up|corroborate|to support a claim with more evidence|New data corroborate the earlier findings.`,
  },
  {
    id: "c1p3",
    title: "Inversion & Emphasis",
    subtitle: "Advanced structures",
    kind: "cloze",
    note: "Fronted negatives and adverbials trigger question word order.",
    data: `Never ___ I seen such chaos.|have|a helper verb placed first after never|Never have I seen such chaos.
Rarely ___ she complain.|does|a helper verb placed first after rarely|Rarely does she complain.
Not only ___ he late, he was rude.|was|a past form of be placed first|Not only was he late, he was rude.
Hardly ___ we arrived when it rained.|had|a helper verb for an earlier past action|Hardly had we arrived when it rained.
Under no circumstances ___ you leave.|should|a helper verb that gives a strong order|Under no circumstances should you leave.
Only then ___ I understand.|did|a helper verb for the past|Only then did I understand.
No sooner ___ he spoken than she left.|had|a helper verb for an earlier past action|No sooner had he spoken than she left.
Little ___ they know the truth.|did|a helper verb for the past|Little did they know the truth.
So loud ___ the music that we left.|was|a past form of be placed first|So loud was the music that we left.
Seldom ___ such talent appear.|does|a helper verb placed first after seldom|Seldom does such talent appear.
Not until later ___ we hear the news.|did|a helper verb for the past|Not until later did we hear the news.
Such ___ his anger that he shouted.|was|a past form of be placed first|Such was his anger that he shouted.
In no way ___ this acceptable.|is|a form of be placed first|In no way is this acceptable.
Were ___ to leave, we'd struggle.|he|the man or boy already mentioned|Were he to leave, we'd struggle.
Had I ___ , I'd have helped.|known|understood or had the facts|Had I known, I'd have helped.
Should you ___ questions, ask.|have|to own or possess|Should you have questions, ask.
What I need ___ more time.|is|a form of be that links two parts|What I need is more time.
It ___ she who solved it.|was|a past form of be for focus|It was she who solved it.
Only by working together ___ we succeed.|can|a modal verb of ability placed first|Only by working together can we succeed.
Nowhere ___ the report mention costs.|does|a helper verb placed first after nowhere|Nowhere does the report mention costs.
On no account ___ the door be opened.|must|a modal verb that forbids something|On no account must the door be opened.
Scarcely ___ she begun when he interrupted.|had|a helper verb for an earlier past action|Scarcely had she begun when he interrupted.
Never before ___ this happened.|has|a helper verb for a perfect action|Never before has this happened.
So rarely ___ it snow here.|does|a helper verb placed first after so rarely|So rarely does it snow here.
Not once ___ he apologise.|did|a helper verb for the past|Not once did he apologise.`,
  },
  {
    id: "c1p4",
    title: "Precision Connectors",
    subtitle: "Nuanced signposting",
    kind: "cloze",
    note: "Each connector carries a distinct logical relationship.",
    data: `The claim is plausible; ___ , evidence is thin.|that said|used to add a contrast to a claim|The claim is plausible; that said, evidence is thin.
___ , the two datasets differ in scope.|Crucially|used to stress a very important point|Crucially, the two datasets differ in scope.
Sales rose, ___ modestly.|albeit|although; even though|Sales rose, albeit modestly.
___ , the policy achieved its aim.|Broadly speaking|in a general way|Broadly speaking, the policy achieved its aim.
The theory holds ___ certain conditions.|under|within a set of conditions|The theory holds under certain conditions.
___ , this contradicts earlier findings.|Notably|used to point out something worth noting|Notably, this contradicts earlier findings.
The results are, ___ , inconclusive.|at best|in the best possible case|The results are, at best, inconclusive.
___ far as the data allows, we conclude X.|In so|to the degree that|In so far as the data allows, we conclude X.
___ , the mechanism remains unclear.|As yet|up to now; used when something may change|As yet, the mechanism remains unclear.
The method is robust; ___ , costly.|conversely|in the opposite way|The method is robust; conversely, it is costly.
___ of the criticism, the model persists.|Regardless|in spite of something|Regardless of criticism, the model persists.
His argument is sound ___ its premises.|given|taking something into account|His argument is sound given its premises.
___ , consider the counterexample.|By way of illustration|used to introduce an example|By way of illustration, consider this case.
The findings, ___ preliminary, are promising.|though|although; used before an adjective|The findings, though preliminary, are promising.
___ , we assume linear growth.|For simplicity|to make things easier to explain|For simplicity, we assume linear growth.
The effect is small ___ statistically significant.|yet|but; used to add a surprising contrast|The effect is small yet significant.
___ , attention turns to causation.|Accordingly|in line with what came before|Accordingly, attention turns to causation.
The sample was small; ___ , caution is advised.|hence|for this reason; as a result|The sample was small; hence, caution is advised.
___ speaking, the trend is upward.|Generally|in a general way|Generally speaking, the trend is upward.
This is true ___ in urban settings.|particularly|especially; more than in other cases|This is true particularly in cities.
___ , the hypothesis was rejected.|Ultimately|in the end|Ultimately, the hypothesis was rejected.
The data ___ suggests a link.|arguably|used for a claim that can be argued|The data arguably suggests a link.
___ this evidence, revision is needed.|In light of|taking new facts into account|In light of this evidence, revision is needed.
The study is limited ___ its scope.|in terms of|used to say which aspect you mean|The study is limited in terms of scope.
___ , no consensus has emerged.|To date|up to the present time|To date, no consensus has emerged.`,
  },
  {
    id: "c1p5",
    title: "Academic Verbs",
    subtitle: "Precise reporting verbs",
    kind: "pair",
    prompt: 'Which verb means "%s"?',
    note: "Reporting verbs encode your stance on a claim.",
    data: `state something as true without proof|assert|to state something as true without proof|Critics assert that the plan will fail.
suggest indirectly|imply|to suggest something without saying it|His silence seemed to imply guilt.
provide evidence for|substantiate|to prove a claim with evidence|Data substantiate the claim.
weaken an argument|undermine|to weaken something slowly|Doubt can undermine trust.
say something is caused by|attribute|to say something is caused by|Scientists attribute the rise to pollution.
present as an example|illustrate|to explain with an example|Let me illustrate the point.
question the validity of|challenge|to question whether something is right|Some experts challenge the findings.
express agreement with findings|corroborate|to support a finding with more evidence|New data corroborate the earlier study.
restate more clearly|clarify|to make something easier to understand|Please clarify what you mean.
soften a claim|qualify|to limit or soften a claim|You should qualify that statement.
draw out an implication|infer|to reach a conclusion from evidence|We can infer a link from these facts.
set out systematically|delineate|to describe or mark out in detail|The report delineates the main duties.
compare to establish difference|differentiate|to see or show how things differ|It is hard to differentiate the two twins.
declare formally|posit|to put forward as a basis for argument|The author posits a new theory.
put forward for consideration|propose|to put forward an idea to consider|I propose a new schedule.
examine in detail|scrutinise|to look at something very carefully|Auditors scrutinise every account.
reduce to essentials|distil|to reduce to the most important parts|The essay distils years of research.
show to be false|refute|to prove that a claim is false|New evidence refutes the theory.
give approximate value|estimate|to judge a rough value or amount|We estimate the cost at ten thousand.
place in a category|classify|to arrange things into groups|Librarians classify books by subject.
explain the reasons for|account for|to give the reasons for something|Weather accounts for the delay.
bring together findings|synthesise|to combine information into one whole|The review synthesises many studies.
consider as a possibility|entertain|to think about an idea without accepting it|I could not entertain such an idea.
insist despite objection|maintain|to keep saying something is true|He maintained his innocence to the end.
support with authority|endorse|to publicly support an idea or person|Several experts endorse the plan.`,
  },
  {
    id: "c1p6",
    title: "Hedging",
    subtitle: "Cautious academic language",
    kind: "cloze",
    note: "Hedging protects claims from overstatement.",
    data: `The results ___ suggest a correlation.|appear to|used to show something seems true|The results appear to suggest a correlation.
This ___ be attributed to sampling error.|may|used to show something is possible|This may be due to sampling error.
The data ___ indicate causation.|do not necessarily|used to say a cause is not certain|The data do not necessarily indicate causation.
It ___ that the effect is small.|seems|gives the impression that|It seems that the effect is small.
The trend is ___ consistent.|broadly|in a general way|The trend is broadly consistent.
Findings should be treated with ___ .|caution|great care to avoid harm or mistakes|Treat the findings with caution.
There is ___ evidence of bias.|some|an amount, but not a lot|There is some evidence of bias.
The link is ___ established.|not fully|not completely|The link is not fully established.
It is ___ that the model oversimplifies.|possible|able to happen or be true|It is possible that the model oversimplifies.
The effect was ___ negligible.|virtually|almost; nearly|The effect was virtually negligible.
These figures are ___ estimates.|approximate|close to the real figure, but not exact|These figures are approximate estimates.
The theory is ___ contested.|widely|by many people|The theory is widely contested.
One ___ argue the opposite.|could|a modal verb for a polite suggestion|One could argue the opposite.
The sample ___ not be representative.|might|a modal verb for a weak possibility|The sample might not be representative.
Results were ___ inconclusive.|largely|for the most part|Results were largely inconclusive.
This ___ to support the hypothesis.|tends|is likely or inclined to do something|This tends to support the hypothesis.
The claim ___ further testing.|warrants|makes something necessary or deserved|The claim warrants further testing.
There ___ to be a threshold effect.|appears|seems to be|There appears to be a threshold effect.
Evidence is ___ at best.|suggestive|hinting at something, but not proving it|Evidence is suggestive at best.
Conclusions remain ___ .|tentative|not final; open to change|Conclusions remain tentative.
The pattern is ___ apparent.|only partly|to a small degree|The pattern is only partly apparent.
It would be ___ to generalise.|premature|too early; before it is wise|It would be premature to generalise.
The difference is ___ significant.|marginally|by a very small amount|The difference is marginally significant.
Such readings are ___ open to dispute.|arguably|used for a claim that can be argued|Such readings are arguably open to dispute.
The mechanism is ___ understood.|poorly|badly; not well enough|The mechanism is poorly understood.`,
  },
  {
    id: "c1p7",
    title: "Legal & Formal Documents",
    subtitle: "Contract and policy language",
    kind: "cloze",
    note: "Formal, legalistic register found in contracts, policies, and official notices.",
    data: `The tenant shall ___ the premises in good condition.|maintain|to keep something in good condition|The tenant shall maintain the premises.
This agreement is ___ upon signature by both parties.|binding|legally required to be obeyed|This agreement is binding on both parties.
The clause shall be ___ null and void if breached.|deemed|judged or considered to be|The clause shall be deemed void if breached.
Either party may ___ this contract with 30 days' notice.|terminate|to end an agreement officially|Either party may terminate this contract.
The company reserves the ___ to amend these terms.|right|a legal claim or power to do something|The company reserves the right to amend these terms.
All disputes shall be ___ by arbitration.|resolved|settled; solved|All disputes shall be resolved by arbitration.
The parties hereby ___ to the following terms.|agree|to accept something officially|The parties hereby agree to these terms.
This policy is ___ to change without prior notice.|subject|likely to be affected by something|This policy is subject to change.
The signatory ___ that all information is accurate.|warrants|promises that a fact is true|The signatory warrants that all details are accurate.
Failure to comply may result in immediate ___.|termination|the act of ending something officially|Failure to comply may result in termination.
The agreement shall remain in ___ for two years.|effect|valid and in use|The agreement shall remain in effect for two years.
Nothing herein shall be ___ as legal advice.|construed|understood or interpreted in a certain way|Nothing herein shall be construed as advice.
The buyer shall ___ full payment within 14 days.|remit|to send money as payment|The buyer shall remit full payment promptly.
This clause is ___ from the rest of the contract.|severable|able to be separated from the rest|This clause is severable from the contract.
The undersigned hereby ___ receipt of the goods.|acknowledges|admits that something is true or received|The undersigned acknowledges receipt of the goods.
The contract is governed by the ___ of this state.|laws|the rules made by a government|The contract is governed by the laws of this state.
Any amendment must be made in ___.|writing|words put on paper|Any amendment must be made in writing.
The company shall not be held ___ for delays.|liable|legally responsible for something|The company shall not be liable for delays.
The parties agree to keep the terms ___.|confidential|meant to be kept secret|The parties keep the terms confidential.
This document shall ___ all prior agreements.|supersede|to take the place of something older|This document shall supersede all prior agreements.
The recipient must ___ the terms before proceeding.|accept|to agree to receive something|The recipient must accept the terms.
The obligation shall ___ upon the successor entity.|pass|to be handed on to someone else|The obligation shall pass to the successor.
Each party shall bear its own ___ costs.|legal|connected with the law|Each party bears its own legal costs.
The waiver shall not be ___ as a precedent.|interpreted|explained or understood in a particular way|The waiver shall not be interpreted as a precedent.
The clause takes ___ immediately upon execution.|force|legal strength or power|The clause takes force upon execution.`,
  },
  {
    id: "c1p8",
    title: "Nuanced Character & Emotion",
    subtitle: "Precise personality vocabulary",
    kind: "pair",
    prompt: 'Which trait means "%s"?',
    note: "C1-level adjectives for describing character precisely.",
    data: `extremely careful with details|meticulous|extremely careful about every detail|A meticulous editor checked every line.
boldly daring, sometimes reckless|audacious|bold in a daring way, even reckless|It was an audacious plan.
refusing to change one's mind|obstinate|stubborn; refusing to change your mind|He remained obstinate despite the evidence.
quick to notice small details|perceptive|quick to notice small details|A perceptive teacher spotted the problem.
excessively proud of oneself|conceited|too proud of yourself|The conceited actor ignored his fans.
easily annoyed or irritated|irascible|easily made angry|My irascible uncle shouted at the waiter.
showing great attention to duty|conscientious|careful to do your duty well|She is a conscientious worker.
lacking confidence or self-esteem|insecure|lacking confidence in yourself|He felt insecure about his looks.
unwilling to spend money|frugal|careful not to spend money|A frugal family saves every month.
openly expressing one's feelings|candid|honest and direct about your feelings|She gave a candid answer.
avoiding unnecessary risk|prudent|careful to avoid danger or loss|It's prudent to save for the future.
having a sharp, cutting wit|acerbic|sharp and bitter in a clever way|Her acerbic wit stung him.
easily influenced by others|impressionable|easily affected by others|Children are impressionable.
showing no emotion outwardly|impassive|showing no feeling on the face|He stayed impassive during the verdict.
tending to think the worst will happen|pessimistic|expecting the worst result|A pessimistic forecast scared investors.
having strong, unshakeable opinions|dogmatic|holding opinions as unquestionable truth|He is dogmatic about politics.
quick to take offence|touchy|easily hurt or offended|She is touchy about her age.
showing deep, genuine care|compassionate|feeling kindness for others who suffer|A compassionate nurse sat with her.
lacking experience or worldliness|naive|lacking experience of life|It was naive to trust him.
skilled at avoiding difficulty|resourceful|good at finding ways to solve problems|A resourceful cook made dinner from scraps.
overly critical of small faults|fastidious|hard to please because of small details|He is fastidious about cleanliness.
reluctant to reveal information|reticent|unwilling to share your thoughts|She was reticent about her past.
having a calm, unshakeable temperament|imperturbable|never upset or worried by events|The pilot stayed imperturbable in the storm.
excessively eager to please|obsequious|too eager to please important people|The obsequious waiter bowed constantly.
unpredictable and prone to sudden mood changes|capricious|changing mood or mind without warning|The weather is capricious in spring.`,
  },
  {
    id: "c1p9",
    title: "Rhetoric & Persuasion",
    subtitle: "Argumentative language",
    kind: "cloze",
    note: "C1-level vocabulary for constructing a persuasive argument.",
    data: `The speaker made a ___ case for reform.|compelling|very convincing|She made a compelling case for reform.
Her argument ___ on a single flawed assumption.|hinges|depends completely on one thing|The case hinges on a single assumption.
The evidence ___ against his claim.|militates|has a strong effect against something|The evidence militates against his claim.
This point ___ the very heart of the debate.|strikes|hits or affects an important part|This point strikes at the heart of it.
The policy has been ___ criticised by experts.|widely|by many people in many places|The policy was widely criticised.
His speech was designed to ___ public opinion.|sway|to change what people think|He tried to sway public opinion.
The argument ___ down to a matter of values.|boils|is simply a matter of one basic thing|It boils down to values.
She ___ her point with a striking example.|illustrated|explained with an example|She illustrated her point well.
The rhetoric was ___ but ultimately hollow.|persuasive|able to make people believe something|The speech was persuasive but hollow.
His claim does not ___ up to scrutiny.|stand|to be strong enough to bear a test|His claim does not stand up to scrutiny.
The debate ___ on questions of fairness.|turns|depends on one important point|The debate turns on fairness.
She skilfully ___ the opposing argument.|dismantled|took apart piece by piece|She dismantled the opposing argument.
The speech was carefully ___ to appeal to emotion.|crafted|made with skill and care|The speech was carefully crafted.
His conclusion ___ naturally from the evidence.|follows|comes as a logical result|His conclusion follows from the evidence.
The argument gained ___ as more facts emerged.|traction|growing support or progress|The argument gained traction.
She ___ the audience with a powerful anecdote.|won over|persuaded someone to support you|She won over the audience.
The claim is ___ by a wealth of research.|substantiated|shown to be true by evidence|The claim is substantiated by research.
His tone ___ conviction rather than certainty.|conveyed|made an idea or feeling known|His tone conveyed conviction.
The counterargument ___ to address the core issue.|fails|does not do what is needed|The counterargument fails to address the issue.
She ___ her opponent's logic point by point.|unpicked|took apart step by step|She unpicked her opponent's logic.
The rhetoric ___ more heat than light.|generated|caused or produced|The debate generated more heat than light.
His appeal was ___ rather than rational.|emotional|based on feeling, not reason|His appeal was emotional.
The argument ___ scrutiny remarkably well.|withstands|survives a test or attack|The argument withstands scrutiny.
She ___ the audience's scepticism head-on.|addressed|dealt with directly|She addressed the audience's scepticism.
The speech left little room for ___.|doubt|a feeling of not being sure|The speech left little room for doubt.`,
  },
  {
    id: "c1p10",
    title: "Scientific & Technical Prose",
    subtitle: "Precision in research writing",
    kind: "cloze",
    note: "C1-level vocabulary for describing scientific findings.",
    data: `The experiment was ___ under controlled conditions.|conducted|carried out an activity|The experiment was conducted in controlled conditions.
The results were ___ across multiple trials.|consistent|always giving the same result|The results were consistent across trials.
The hypothesis was ___ by the data.|supported|shown to be true by evidence|The data supported the hypothesis.
Researchers ___ a significant correlation.|observed|noticed by watching carefully|Researchers observed a significant correlation.
The findings ___ from earlier studies.|diverge|differ or move apart|The findings diverge from earlier studies.
The sample size was ___ to ensure reliability.|sufficient|enough for what is needed|The sample size was sufficient.
The variables were ___ carefully controlled.|meticulously|with extreme care|The variables were meticulously controlled.
The study's ___ limits its generalisability.|scope|the range of what is covered|The study's scope limits its use.
The data was ___ using standard statistical methods.|analysed|examined closely to find results|The data was analysed statistically.
The results were ___ reproducible.|largely|for the most part|The results were largely reproducible.
The team ___ a novel methodology.|developed|created over time|The team developed a new method.
The findings ___ implications for future research.|carry|have or hold as a result|The findings carry implications for future work.
The experiment was ___ due to funding cuts.|discontinued|stopped; no longer continued|The experiment was discontinued.
The paper was ___ in a peer-reviewed journal.|published|printed or put out for the public|The paper was published in a journal.
The results ___ the initial hypothesis.|confirm|to show that something is true|The results confirm the hypothesis.
The methodology has since been ___ by other researchers.|adopted|taken and used by others|The method was adopted by other researchers.
The study's ___ have been widely debated.|conclusions|final judgements based on evidence|The study's conclusions are debated.
The data set was ___ for anomalies.|screened|checked for problems|The data was screened for anomalies.
The researchers ___ several confounding variables.|controlled for|took steps to remove the effect of|They controlled for confounding variables.
The findings were ___ with caution.|presented|shown to others|The findings were presented with caution.
The experiment's ___ remains a subject of debate.|validity|the quality of being sound and true|The experiment's validity is debated.
The results were ___ statistically significant.|deemed|judged or considered|The results were deemed significant.
The team ___ their methodology in the appendix.|detailed|explained in full|The team detailed their methods.
The study ___ a gap in the existing literature.|addresses|deals with a problem or issue|The study addresses a gap in the literature.
The conclusions are ___ by the limited sample.|constrained|limited or held back|The conclusions are constrained by the sample.`,
  },
  {
    id: "c1p11",
    title: "Diplomatic Language",
    subtitle: "Softening and hedging in formal talk",
    kind: "cloze",
    note: "C1-level diplomatic phrasing for sensitive conversations.",
    data: `With all due ___, I have to disagree with that assessment.|respect|polite regard for someone's feelings|With all due respect, I disagree.
It might be ___ to reconsider the timing of this decision.|prudent|wise and careful|It might be prudent to wait.
We would ___ appreciate a more detailed explanation.|greatly|very much|We would greatly appreciate more detail.
Perhaps we could ___ this matter from a different angle.|approach|to deal with a subject in a way|Let us approach this from another angle.
It's not entirely ___ that the plan will succeed.|clear|easy to understand or see|It's not entirely clear that it will work.
There are, ___, a few concerns we should address first.|however|used to add a contrast|There are, however, a few concerns.
We understand your ___, but the budget remains fixed.|position|the way someone thinks about something|We understand your position, but the budget is fixed.
It would be ___ to say the negotiations went smoothly.|generous|kind in judging too well of something|It would be generous to say it went well.
Let's not ___ this issue any further today.|belabour|to talk about too long|Let's not belabour the issue today.
We ___ acknowledge the difficulties this has caused.|fully|completely|We fully acknowledge the difficulties.
It might be worth ___ a compromise instead.|considering|thinking about something carefully|It's worth considering a compromise.
We remain open to ___ should circumstances change.|discussion|talk about a subject|We remain open to discussion.
While we ___ your concerns, the decision stands.|understand|know why someone feels something|While we understand your concerns, the decision stands.
It would be ___ to comment further at this stage.|premature|too early|It would be premature to comment.
We'd like to ___ our gratitude for your patience.|express|to show a feeling in words|We would like to express our gratitude.
There is, ___, room for further discussion.|admittedly|used to agree something is true|There is, admittedly, room for discussion.
We should ___ from making any hasty judgements.|refrain|to hold yourself back from doing something|We should refrain from hasty judgements.
It may be ___ to revisit this proposal next quarter.|advisable|wise to do|It may be advisable to revisit this.
We ___ hope this matter can be resolved amicably.|sincerely|in an honest, true way|We sincerely hope this can be resolved.
Let us ___ the matter with the care it deserves.|treat|to deal with something in a certain way|Let us treat the matter carefully.
It would be ___ to overstate the challenges ahead.|easy|not hard to do|It would be easy to overstate the challenges.
We trust this explanation will ___ any confusion.|clear up|to remove a problem|This should clear up any confusion.
Some concerns, ___ valid, fall outside our remit.|while|although; used before an adjective|Some concerns, while valid, are outside our remit.
We ___ that further consultation is required.|maintain|to claim that something is true|We maintain that more consultation is needed.
It is with some ___ that we must decline the offer.|reluctance|an unwillingness to do something|It is with some reluctance that we decline.`,
  },
  {
    id: "c1p12",
    title: "Idiomatic Expressions II",
    subtitle: "Meaning match, advanced idioms",
    kind: "pair",
    termFromLeft: true,
    prompt: 'The idiom "%s" means…',
    note: "Advanced idioms beyond the basics.",
    data: `to jump on the bandwagon|to join something popular|to join something popular|Many firms want to jump on the bandwagon.
to read between the lines|to understand hidden meaning|to understand a hidden meaning|You have to read between the lines.
to bite the bullet|to accept something difficult|to accept something difficult|He had to bite the bullet and apologise.
to burn bridges|to end a relationship badly|to end a relationship badly|Try not to burn bridges when you quit.
to see eye to eye|to agree completely|to agree completely|We rarely see eye to eye on politics.
to go the extra mile|to make extra effort|to make an extra effort|She is willing to go the extra mile for you.
to cut to the chase|to get to the point quickly|to get to the point quickly|Let's cut to the chase.
to hit the nail on the head|to be exactly right|to be exactly right|You seem to hit the nail on the head.
to be on the same page|to have the same understanding|to have the same understanding|We need to be on the same page.
to throw in the towel|to give up|to give up|He decided to throw in the towel after a year.
to keep someone at arm's length|to avoid becoming close|to avoid becoming close|She likes to keep someone at arm's length.
to have a change of heart|to change one's opinion|to change your opinion|He seems to have a change of heart.
to be caught red-handed|to be caught doing something wrong|to be caught doing something wrong|The thief was lucky not to be caught red-handed.
to take something with a grain of salt|to not fully believe it|to not fully believe something|Try to take something with a grain of salt.
to beat around the bush|to avoid speaking directly|to avoid speaking directly|Stop trying to beat around the bush!
to be a blessing in disguise|to seem bad but turn out good|something that seems bad but proves good|It might turn out to be a blessing in disguise.
to let the cat out of the bag|to reveal a secret|to reveal a secret|Try not to let the cat out of the bag.
to go back to the drawing board|to start planning again|to start planning again|We had to go back to the drawing board.
to raise the bar|to increase the standard expected|to increase the standard expected|She aims to raise the bar for everyone.
to be under the weather|to feel slightly unwell|to feel slightly unwell|I seem to be under the weather today.
to pull strings|to use influence to get something|to use influence to get something|He pulled strings to get the job.
to be a double-edged sword|to have both good and bad effects|something with both good and bad effects|Fame can prove to be a double-edged sword.
to keep one's fingers crossed|to hope for good luck|to hope for good luck|It helps to keep one's fingers crossed.
to be at a crossroads|to face an important decision|to face an important decision|The firm appears to be at a crossroads.
to weather the storm|to survive a difficult period|to survive a difficult period|The company managed to weather the storm.`,
  },
  {
    id: "c1p13",
    title: "Complex Passive & Causative",
    subtitle: "Advanced passive structures",
    kind: "cloze",
    note: "C1-level passive and causative constructions.",
    data: `The report is believed to have been ___ deliberately.|leaked|secretly made known|The report was leaked deliberately.
It is thought that the decision will be ___ soon.|reversed|changed to the opposite|The decision will be reversed soon.
The building is said to have been ___ in the 1920s.|designed|planned and drawn up|The building was designed in the 1920s.
She had her car ___ while she was on holiday.|stolen|taken by a thief|She had her car stolen.
He got his proposal ___ by the board.|approved|accepted officially|He got his proposal approved.
The bridge is due to be ___ next year.|completed|finished|The bridge is due to be completed next year.
It is rumoured that the company is planning ___.|layoffs|losses of jobs when firms cut staff|The company is planning layoffs.
The contract is expected to be ___ by Friday.|signed|put your name on a document|The contract will be signed by Friday.
She had the documents ___ before the meeting.|translated|changed into another language|She had the documents translated.
The changes are said to have ___ efficiency.|improved|become better|Changes are said to have improved efficiency.
He had his passport ___ at the embassy.|renewed|made valid for another period|He had his passport renewed.
It is widely believed that the treaty will be ___.|ratified|confirmed officially by a vote|The treaty will be ratified.
The results are yet to be ___.|confirmed|shown to be true|The results are yet to be confirmed.
She got her essay ___ before submitting it.|proofread|checked for mistakes|She got her essay proofread.
The suspect is alleged to have ___ the country.|fled|ran away quickly|The suspect is alleged to have fled.
The proposal is being carefully ___ by the committee.|considered|thought about carefully|The proposal is being considered.
It is understood that negotiations are ___.|ongoing|continuing now|Negotiations are ongoing.
He had the roof ___ after the storm.|repaired|fixed after damage|He had the roof repaired.
The findings are reported to have ___ researchers.|surprised|caused a feeling of shock|The findings surprised researchers.
She had her application ___ by a lawyer.|reviewed|checked by an expert|She had her application reviewed.
The policy is expected to be ___ next year.|revised|changed to make better|The policy will be revised next year.
It is claimed that the figures were ___.|manipulated|changed in a dishonest way|The figures were manipulated.
He had the engine ___ before the long trip.|serviced|checked and fixed by a mechanic|He had the engine serviced.
The event is scheduled to take ___ in June.|place|to happen|The event will take place in June.
The data is believed to have been ___.|compromised|made less safe or secret|The data was compromised.`,
  },
  {
    id: "c1p14",
    title: "Formal Emails & Correspondence",
    subtitle: "Professional written English",
    kind: "cloze",
    note: "C1-level phrases for formal written communication.",
    data: `I am writing to ___ your attention to a recent issue.|draw|to pull or lead towards something|I wish to draw your attention to a problem.
Please do not ___ to contact me if you need further information.|hesitate|to pause because you are unsure|Please do not hesitate to contact me.
I would be ___ if you could confirm receipt of this email.|grateful|thankful|I would be grateful for a reply.
With reference ___ our earlier conversation, I am attaching the report.|to|links a topic with a comment|With reference to our call, here is the report.
I ___ forward to hearing from you soon.|look|to turn your eyes towards something|I look forward to hearing from you.
Please find ___ the requested documents.|attached|joined to an email as a file|Please find attached the documents.
I am writing ___ behalf of the marketing department.|on|part of the phrase "on behalf of"|I am writing on behalf of the team.
Should you have any questions, please do not hesitate to ___ out.|reach|to make contact with someone|Please feel free to reach out.
I apologise ___ any inconvenience this may have caused.|for|introduces what you are sorry about|I apologise for any inconvenience.
We would like to ___ you for your continued support.|thank|to say you are grateful|We would like to thank you for your support.
I am ___ to inform you that your application has been successful.|pleased|happy to do something|I am pleased to inform you of the result.
Following ___ discussion, I have revised the proposal.|our|belonging to us|Following our discussion, I revised the plan.
Please let me know if this ___ with your schedule.|fits|is suitable for|Please tell me if this fits your schedule.
I trust this email finds you ___.|well|in good health|I trust this email finds you well.
We ___ to inform you that the position has been filled.|regret|to feel sorry about something|We regret to inform you the post is filled.
Kindly ___ me know your availability for next week.|let|to allow something to be known|Kindly let me know your availability.
I am writing to ___ up on my previous email.|follow|to ask again about an earlier matter|I am writing to follow up on my email.
Please ___ this matter as a priority.|treat|to handle in a certain way|Please treat this matter as a priority.
I would appreciate it if you could ___ this at your earliest convenience.|address|to deal with a problem|Please address this at your earliest convenience.
We are ___ forward to a successful collaboration.|looking|turning your eyes towards the future|We are looking forward to working together.
Please accept our ___ apologies for the delay.|sincere|honest and heartfelt|Please accept our sincere apologies.
I am ___ that you found the presentation useful.|glad|pleased|I am glad you found it useful.
Should circumstances ___, please inform us immediately.|change|to become different|Should circumstances change, tell us.
We remain at your ___ should you require further assistance.|disposal|ready to be used by someone|We remain at your disposal.
I look forward to your ___ response.|prompt|done quickly|I look forward to your prompt reply.`,
  },
  {
    id: "c1p15",
    title: "Nominalisation",
    subtitle: "Turning verbs into abstract nouns",
    kind: "pair",
    prompt: 'The noun form of "%s" is…',
    note: "C1-level nominalisation, common in academic and formal writing.",
    data: `to decide|decision|a choice made after thought|The committee reached a decision.
to argue|argument|a reason put forward against or for something|The argument lasted an hour.
to analyse|analysis|a careful study of something in parts|The analysis took weeks.
to conclude|conclusion|a final decision reached after thought|We reached a clear conclusion.
to assume|assumption|something you accept as true without proof|It was a false assumption.
to describe|description|words that say what something is like|Give a full description of the thief.
to explain|explanation|words that make something clear|Her explanation was easy to follow.
to suggest|suggestion|an idea you offer to others|He made a helpful suggestion.
to develop|development|growth or a new step forward|There was a major development in the case.
to require|requirement|something that is needed|Fitness is a requirement for the job.
to fail|failure|a lack of success|The plan ended in failure.
to succeed|success|getting what you wanted|The film was a huge success.
to propose|proposal|a plan offered for others to consider|Our proposal was accepted.
to reduce|reduction|a fall in amount or size|There was a big reduction in cost.
to improve|improvement|a change that makes something better|We saw an improvement in sales.
to discover|discovery|finding something new|The discovery changed medicine.
to expand|expansion|growth in size or range|The firm planned expansion abroad.
to achieve|achievement|something done well with effort|Graduating was a great achievement.
to establish|establishment|the act of founding something|The establishment of the school took years.
to interpret|interpretation|an explanation of what something means|Each critic offered a different interpretation.
to justify|justification|a good reason for an action|She could offer no justification.
to maintain|maintenance|work to keep something in good condition|The road needs regular maintenance.
to produce|production|the process of making goods|Production rose last year.
to recognise|recognition|the act of knowing someone or something again|She won recognition for her work.
to resolve|resolution|a solution to a problem|We found a resolution to the dispute.`,
  },
  {
    id: "c1p16",
    title: "Cleft Sentences",
    subtitle: "Emphasis through structure",
    kind: "cloze",
    note: "C1-level cleft sentence structures for emphasis.",
    data: `___ was John who broke the vase, not me.|it|a word that puts focus on one part|It was John who broke the vase.
What I really need ___ a good night's sleep.|is|a form of be that links two parts|What I really need is sleep.
It was the manager ___ made the final decision.|who|links a person to a clause|It was the manager who decided.
What surprised me most ___ his honesty.|was|a past form of be linking two parts|What surprised me most was his honesty.
It was ___ in 1990 that the company was founded.|not|a word that makes a sentence negative|It was not in 1990 that it was founded.
What we need to do ___ act quickly.|is|a form of be that links two parts|What we need to do is act quickly.
It was because of the delay ___ we missed the flight.|that|links a reason to a result|It was because of the delay that we missed it.
What annoys me most ___ people who are always late.|is|a form of be that links two parts|What annoys me most is lateness.
It ___ the weather that ruined our plans.|was|a past form of be for focus|It was the weather that ruined our plans.
What she wants ___ a bit of peace and quiet.|is|a form of be that links two parts|What she wants is peace and quiet.
It was only ___ that I realised my mistake.|later|at a time after something|It was only later that I realised.
What matters most to me ___ my family's happiness.|is|a form of be that links two parts|What matters most is my family.
It was the teacher ___ noticed the problem first.|who|links a person to a clause|It was the teacher who noticed it.
What I admire about her ___ her determination.|is|a form of be that links two parts|What I admire about her is her determination.
It was ___ during the meeting that he resigned.|not|a word that makes a sentence negative|It was not during the meeting that he resigned.
What we found strange ___ his sudden silence.|was|a past form of be linking two parts|What we found strange was his silence.
It was the noise ___ woke everyone up.|that|links a thing to a clause|It was the noise that woke everyone.
What she really meant ___ something quite different.|was|a past form of be linking two parts|What she really meant was something different.
It was not until later ___ we understood the plan.|that|links a time to a clause|It was not until later that we understood.
What impressed the judges most ___ his confidence.|was|a past form of be linking two parts|What impressed the judges most was his confidence.
It ___ the traffic, not the weather, that delayed us.|was|a past form of be for focus|It was the traffic that delayed us.
What I regret most ___ not speaking up sooner.|is|a form of be that links two parts|What I regret most is not speaking up.
It was her ___ who suggested the idea first.|colleague|a person you work with|It was her colleague who suggested it.
What worries me ___ the lack of preparation.|is|a form of be that links two parts|What worries me is the lack of preparation.
It ___ exactly what I expected.|was|a past form of be linking two parts|It was exactly what I expected.`,
  },
  {
    id: "c1p17",
    title: "Collocations with Make, Do, Take & Have",
    subtitle: "Fixed verb-noun pairs",
    kind: "pair",
    prompt: 'Complete the collocation with "%s"…',
    note: "C1-level fixed collocations with common light verbs.",
    data: `make|a decision|a choice reached after thinking|I must make a decision today.
make|an effort|hard work to do something|She made an effort to smile.
make|a mistake|something you did that was wrong|Everyone can make a mistake.
make|progress|forward movement toward a goal|You are making progress.
make|a difference|a change for the better|Your help made a difference.
do|homework|schoolwork done at home|Do your homework before dinner.
do|business|buying and selling goods|We do business with many countries.
do|damage|harm that spoils something|The storm did damage to the roof.
do|research|a careful study to find facts|They do research on diseases.
do|a favour|a kind act you do for someone|Could you do me a favour?
take|responsibility|a duty to accept blame or care|Take responsibility for your actions.
take|a risk|a chance of loss or danger|It's worth taking a risk.
take|advantage|a chance to gain from something|Take advantage of the offer.
take|notice|attention paid to something|Take no notice of him.
take|a break|a short rest|Let's take a break.
have|an argument|a quarrel with someone|They had an argument last night.
have|a conversation|a talk with someone|We had a long conversation.
have|an impact|an effect on something|The law will have an impact.
have|a look|a quick view of something|Have a look at this.
have|a chance|an opportunity to do something|You have a chance to win.
make|an impression|a first feeling about a person|She hoped to make an impression.
do|harm|damage or pain|Smoking can do harm.
take|action|steps taken to deal with something|We must take action now.
have|doubts|feelings of not being sure|I have doubts about the plan.
make|arrangements|plans made in advance|She made arrangements for the trip.`,
  },
  {
    id: "c1p18",
    title: "Euphemisms & Indirect Language",
    subtitle: "Softening sensitive topics",
    kind: "pair",
    termFromLeft: true,
    prompt: 'The phrase "%s" is a polite way of saying…',
    note: "C1-level euphemisms for sensitive or blunt topics.",
    data: `to pass away|to die|to die|Sadly, he is about to pass away.
to let someone go|to fire someone|to fire someone|The firm had to let someone go.
between jobs|unemployed|unemployed|She is between jobs at the moment.
economical with the truth|dishonest|dishonest|The minister was economical with the truth.
pre-owned|second-hand|second-hand|We bought a pre-owned car.
downsize|reduce staff numbers|to reduce staff numbers|The firm plans to downsize.
in a delicate condition|pregnant|pregnant|She was in a delicate condition.
senior moment|forgetfulness|forgetfulness|I had a senior moment.
differently abled|disabled|disabled|He is differently abled.
economically disadvantaged|poor|poor|The fund helps economically disadvantaged families.
correctional facility|prison|prison|He was sent to a correctional facility.
collateral damage|unintended harm|unintended harm|Civilians suffered as collateral damage.
letting you go|firing you|firing you|I'm sorry, we are letting you go.
put to sleep|euthanised|killed painlessly; euthanised|The old dog was put to sleep.
vertically challenged|short|short|He is vertically challenged.
a bit under the weather|slightly ill|slightly ill|I'm a bit under the weather.
of a certain age|older|older|A woman of a certain age waved.
enhanced interrogation|torture|torture|Critics called it enhanced interrogation.
negative growth|decline|decline|The firm reported negative growth.
downsized position|job cut|job cut|His downsized position was removed.
substance abuse|drug addiction|drug addiction|He is treated for substance abuse.
in between opportunities|currently without a job|currently without a job|She is in between opportunities.
not the sharpest tool in the shed|not very intelligent|not very intelligent|He's not the sharpest tool in the shed.
letting nature take its course|not intervening medically|not intervening medically|The family agreed on letting nature take its course.
economical|cheap or stingy|cheap or stingy|He is economical with money.`,
  },
  {
    id: "c1p19",
    title: "Contrast & Concession",
    subtitle: "Advanced linking of opposing ideas",
    kind: "cloze",
    note: "C1-level connectors for contrast and concession.",
    data: `___ the heavy rain, the match went ahead as planned.|despite|in spite of|Despite the rain, the match went ahead.
The plan succeeded, ___ several early setbacks.|notwithstanding|in spite of; used in formal writing|It worked, notwithstanding several setbacks.
___ he was exhausted, he kept working.|although|even though|Although he was tired, he kept working.
The project failed ___ the team's best efforts.|in spite of|despite|The project failed in spite of our efforts.
He accepted the offer, ___ his initial doubts.|regardless of|without being affected by|He accepted the offer regardless of his doubts.
The company thrived, ___ competitors struggled badly.|whereas|used to compare two contrasting facts|The firm thrived whereas rivals struggled.
He stayed calm ___ his colleagues panicked.|while|at the same time as|He stayed calm while others panicked.
The results were disappointing; ___, the team kept trying.|however|used to add a contrast|Results were poor; however, the team kept trying.
The setbacks were serious; ___, morale remained high.|nevertheless|in spite of that|Setbacks were serious; nevertheless, morale stayed high.
The plan had flaws; it worked out well ___.|nonetheless|in spite of what was said|The plan had flaws; it worked nonetheless.
Sales were falling, ___ the company kept hiring.|yet|but; used to add a surprising contrast|Sales fell, yet the company kept hiring.
The risks were high; he took the job ___.|even so|in spite of that|It was risky; he took the job even so.
It was a difficult year; profits rose, ___.|that said|used to add a good point|It was hard; that said, profits rose.
He is, ___ talented, still very inexperienced.|albeit|although; used before an adjective|He is, albeit talented, inexperienced.
___ the results are disappointing, we should continue.|granted that|admitting that something may be true|Granted that it's disappointing, we should continue.
The evidence is weak; it may, ___, still be true.|be that as it may|used to accept a point but still disagree|Be that as it may, we should go on.
He was tired; he finished the race ___.|all the same|in spite of that|He was tired; he finished the race all the same.
The rules are strict; ___, exceptions are sometimes made.|on the other hand|used to give an opposing point|On the other hand, exceptions are made.
Critics say it failed; ___, sales figures suggest otherwise.|on the contrary|used to say the opposite is true|On the contrary, sales suggest otherwise.
He apologised; ___, the damage had already been done.|for all that|in spite of that|For all that, the damage was done.
The odds were against them; they pressed on ___.|still|even so; used to add a contrast|They pressed on still.
The forecast was poor; ___, they went ahead with the trip.|in any case|whatever happens|In any case, they went ahead.
___ appearances, the company was struggling.|contrary to|against what seems true|Contrary to appearances, the firm was struggling.
___ popular belief, the theory has been disproven.|contrary to what most think|against what most people think|Contrary to what most think, it was disproven.
Experts warned against it; they proceeded with the plan ___.|regardless|without caring about something|They proceeded regardless.`,
  },
  {
    id: "c1p20",
    title: "Academic Cohesion",
    subtitle: "Linking ideas across a text",
    kind: "cloze",
    note: "C1-level cohesive devices for academic writing.",
    data: `___ mentioned earlier, the results support the hypothesis.|as|in the way that|As mentioned earlier, the results support it.
The ___ point to consider is the sample size.|next|coming straight after this one|The next point to consider is the sample size.
Having established this, we can now ___ to the next issue.|turn|to move your attention to something new|We can now turn to the next issue.
This ___ raises further questions about the methodology.|finding|a result that people discover|This finding raises further questions.
Building ___ this idea, the next chapter examines causation.|on|a word used to add to an idea|Building on this idea, the next chapter examines causes.
The ___ section will explore alternative explanations.|following|coming straight after|The following section explores alternatives.
In ___ of the above, further research is needed.|light|taking something into account|In light of the above, more research is needed.
To ___ up, the study has several key limitations.|sum|to give the main points at the end|To sum up, the study has limits.
This leads us ___ to the question of validity.|onward|forward in a text or process|This leads us onward to the question of validity.
The ___ mentioned study supports this conclusion.|above|written earlier in the text|The above study supports this conclusion.
Broadly ___, the findings align with prior research.|speaking|in a general way|Broadly speaking, the findings match prior research.
This ___ ties in with the earlier discussion of ethics.|point|an idea or detail to make|This point ties in with the earlier discussion.
The argument outlined above rests upon ___ core assumptions.|three|the number 3|The argument rests upon three core assumptions.
Taking this ___ account, the results seem reliable.|into|links a fact to a result|Taking this into account, the results seem reliable.
The following ___ builds on the previous analysis.|section|a part of a longer text|The following section builds on the analysis.
This brings us ___ to the central argument.|back|to an earlier point|This brings us back to the central argument.
The data ___ referred to can be found in the appendix.|previously|before now|The data previously referred to is in the appendix.
It is ___ to note the limitations of this approach.|worth|deserving the effort|It is worth noting the limits of this approach.
This ___ leads into a discussion of policy implications.|naturally|in an easy, logical way|This naturally leads into policy implications.
The ___ analysis reveals a clear pattern.|subsequent|coming later|The subsequent analysis reveals a clear pattern.
As ___ in Table 2, the results vary by region.|shown|made clear for the eyes|As shown in Table 2, results vary.
This ___ us to the final point of the discussion.|brings|leads us to a point|This brings us to the final point.
The closing chapter will ___ these concerns in detail.|address|to deal with a problem|The closing chapter will address these concerns.
Consistent ___ with prior research, the findings confirm the theory.|with|together or in agreement|Consistent with prior research, the findings confirm it.
In ___ words, the results were not as expected.|other|different; not the same|In other words, results were not as expected.`,
  },
  {
    id: "c1p21",
    title: "Listening: Academic & Professional Register",
    subtitle: "Academic and professional register",
    kind: "listening",
    prompt: "What did you hear?",
    note: "Formal register where one word reverses the claim.",
    data: `The implementation was contingent on further funding.|The implementation was contingent on further funding.
The implementation was contingent on further approval.|The implementation was contingent on further approval.
Her argument hinges on a contested premise.|Her argument hinges on a contested premise.
Her argument hinges on an accepted premise.|Her argument hinges on an accepted premise.
Not until the audit did the discrepancy emerge.|Not until the audit did the discrepancy emerge.
Not until the enquiry did the discrepancy emerge.|Not until the enquiry did the discrepancy emerge.
The correlation shouldn't be read as causation.|The correlation shouldn't be read as causation.
The correlation may well indicate causation.|The correlation may well indicate causation.
Preliminary findings warrant a degree of caution.|Preliminary findings warrant a degree of caution.
Preliminary findings warrant a degree of optimism.|Preliminary findings warrant a degree of optimism.
The methodology has been scrutinised at length.|The methodology has been scrutinised at length.
The methodology hasn't been scrutinised at all.|The methodology hasn't been scrutinised at all.
Such an approach is arguably counterproductive.|Such an approach is arguably counterproductive.
Such an approach is arguably indispensable.|Such an approach is arguably indispensable.
Their reasoning rests on an untested assumption.|Their reasoning rests on an untested assumption.
Their reasoning rests on a well-tested assumption.|Their reasoning rests on a well-tested assumption.
The provision was subsequently deemed unenforceable.|The provision was subsequently deemed unenforceable.
The provision was subsequently deemed binding.|The provision was subsequently deemed binding.
Rarely has a reform proved so divisive.|Rarely has a reform proved so divisive.
Rarely has a reform proved so popular.|Rarely has a reform proved so popular.
The evidence is suggestive rather than conclusive.|The evidence is suggestive rather than conclusive.
The evidence is conclusive rather than suggestive.|The evidence is conclusive rather than suggestive.
The intervention yielded only marginal improvement.|The intervention yielded only marginal improvement.
The intervention yielded substantial improvement.|The intervention yielded substantial improvement.
Compliance remains largely a matter of discretion.|Compliance remains largely a matter of discretion.`,
  },
  {
    id: "c1p22",
    title: "Speaking: Register and Nuance",
    subtitle: "Say it out loud",
    kind: "speak",
    prompt: "Say this aloud:",
    note: "Idiomatic and formal phrasing said aloud.",
    // Each line is the same text twice: what is shown is what must be said.
    // Kept to one breath, and to phrasing the normaliser can actually reconcile
    // with a transcript (see spoken-answer.ts). Five things are avoided on
    // purpose, each of which marked a PERFECT utterance wrong when it slipped
    // through:
    //   - compound numbers and currency ("twenty one" vs smart_format's "21")
    //   - ordinals, for the same reason ("second" vs "2nd")
    //   - a contracted "has" ("He has finished" said as "He's finished", which
    //     normalises to "he is")
    //   - possessive 's ("devil's" normalises to "devil is")
    //   - names and homophones with no disambiguating context ("Sara"/"Sarah")
    data: `I am afraid that rather misses the point.|I am afraid that rather misses the point.
Let me argue the other side for a moment.|Let me argue the other side for a moment.
That is easier said than done.|That is easier said than done.
We are splitting hairs over the wording.|We are splitting hairs over the wording.
The argument does not really hold water.|The argument does not really hold water.
I would hesitate to draw that conclusion.|I would hesitate to draw that conclusion.
This has been on the back burner for months.|This has been on the back burner for months.
In hindsight, the warning signs were obvious.|In hindsight, the warning signs were obvious.
We are talking at cross purposes here.|We are talking at cross purposes here.
That would set an unfortunate precedent.|That would set an unfortunate precedent.
I am inclined to give them the benefit of the doubt.|I am inclined to give them the benefit of the doubt.
The proposal is ambitious, to put it mildly.|The proposal is ambitious, to put it mildly.
We should not throw the baby out with the bathwater.|We should not throw the baby out with the bathwater.
That is a distinction without a difference.|That is a distinction without a difference.
I would go so far as to call it reckless.|I would go so far as to call it reckless.
The findings are suggestive rather than conclusive.|The findings are suggestive rather than conclusive.
It is a question of priorities, not resources.|It is a question of priorities, not resources.
We have painted ourselves into a corner.|We have painted ourselves into a corner.
That interpretation strikes me as a stretch.|That interpretation strikes me as a stretch.
Let us not lose sight of the original aim.|Let us not lose sight of the original aim.
The tone of the letter was unmistakable.|The tone of the letter was unmistakable.
I would put it slightly more carefully than that.|I would put it slightly more carefully than that.
This is where the argument starts to unravel.|This is where the argument starts to unravel.
We are effectively back where we started.|We are effectively back where we started.
It bears repeating that nothing was agreed.|It bears repeating that nothing was agreed.`,
  },
  {
    id: "c1p23",
    title: "Say It Your Way: Register and Nuance",
    subtitle: "Write the idea in English",
    kind: "translate",
    prompt: "Write this in English:",
    note: "Idiomatic and formal phrasing, written in your own words.",
    // The left side describes the idea rather than giving the sentence away --
    // otherwise this is a copying exercise, not a producing one. Each line
    // lists three wordings a learner plausibly reaches for; anything else valid
    // is caught by the AI grader, which is the fallback, not the plan. Avoids
    // the traps the speaking packs documented (compound numbers, ordinals,
    // contracted "has", possessive 's, undisambiguated names), because the same
    // normaliser runs underneath.
    data: `Say politely that an argument misses the point.|I am afraid that rather misses the point.;With respect, that misses the point.;That rather misses the point, I think.
Offer to argue the opposing side for a moment.|Let me argue the other side for a moment.;Allow me to take the opposing view.;Let me put the opposite case.
Dismiss a suggestion as impractical, idiomatically.|That is easier said than done.;Easier said than done.;Saying it is easier than doing it.
Say you are arguing over trivial wording.|We are splitting hairs over the wording.;This is a quibble about wording.;We are arguing over details of wording.
Say an argument does not stand up.|The argument does not hold water.;That argument does not stand up.;The argument falls apart under scrutiny.
Say you would hesitate to draw that conclusion.|I would hesitate to draw that conclusion.;I'd be cautious about concluding that.;I am reluctant to conclude that.
Say something has been postponed for months.|This has been on the back burner for months.;It has been postponed for months.;This has been set aside for months.
Say that in hindsight the warnings were obvious.|In hindsight, the warning signs were obvious.;Looking back, the signs were clear.;With hindsight the warnings were plain.
Say two people are misunderstanding each other.|We are talking at cross purposes.;We are misunderstanding each other.;I think we are at cross purposes.
Say something would set a bad precedent.|That would set an unfortunate precedent.;That would set a bad precedent.;It would establish an unwelcome precedent.
Extend someone good faith despite doubts.|I am inclined to give them the benefit of the doubt.;I'd give them the benefit of the doubt.;I am willing to assume good faith.
Say a proposal is ambitious, understating it.|The proposal is ambitious, to put it mildly.;To say the proposal is ambitious is an understatement.;The proposal is, to put it mildly, ambitious.
Warn against discarding the good with the bad.|We should not throw the baby out with the bathwater.;Let us not discard what works along with what does not.;We should keep what is good here.
Say a distinction makes no real difference.|That is a distinction without a difference.;That distinction makes no real difference.;There is no practical difference there.
Say you would go so far as to call it reckless.|I would go so far as to call it reckless.;I'd even call it reckless.;I would describe it as reckless.
Say findings are suggestive rather than conclusive.|The findings are suggestive rather than conclusive.;The evidence suggests but does not prove.;These findings point a way without settling it.
Say it is about priorities, not resources.|It is a question of priorities, not resources.;This is about priorities rather than resources.;The issue is priorities, not money.
Say you have left yourselves no options.|We have painted ourselves into a corner.;We have left ourselves no room to move.;We are out of options now.
Say an interpretation seems like a stretch.|That interpretation strikes me as a stretch.;That reading seems like a stretch.;I find that interpretation strained.
Urge people not to lose sight of the original aim.|Let us not lose sight of the original aim.;We should keep the original aim in view.;Let's remember what we set out to do.
Say the tone of a letter was unmistakable.|The tone of the letter was unmistakable.;There was no mistaking the tone of the letter.;The letter's tone was quite clear.
Say you would put something more carefully.|I would put it more carefully than that.;I'd phrase that more carefully.;I would be more careful in how I said that.
Say this is where an argument starts to fall apart.|This is where the argument starts to unravel.;The argument begins to break down here.;Here is where it falls apart.
Say you are effectively back where you started.|We are effectively back where we started.;We have come full circle.;We are essentially back at the beginning.
Say it bears repeating that nothing is agreed.|It bears repeating that nothing was agreed.;It is worth saying again that nothing was agreed.;Let me repeat that nothing was agreed.`,
  },
];

export const BANK: Record<Level, Pack[]> = { A1, A2, B1, B2, C1 };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickDistractors(
  answer: string,
  pool: string[],
  seed: string,
  prompt?: string,
  preferConfusable = false,
  /** Hand-labelled word classes for this pack only -- see packAnswerPos. */
  overrides: Record<string, string> = {},
) {
  const others = pool.filter((o) => o.toLowerCase() !== answer.toLowerCase());
  const start = hash(seed) % Math.max(1, others.length);
  // Walk the pool from a per-question hashed offset first, so each question in
  // a pack sees a different candidate order, then let part-of-speech affinity
  // reorder that walk. Doing it in this order keeps the variety the offset
  // provides while preferring wrong answers that are at least grammatically
  // possible in the blank -- a cloze pack's pool mixes word classes, so an
  // unordered walk offered nouns for verb slots ("I need to ___ some money"
  // -> "money"). The affinity pass itself reorders and never drops. The
  // also-correct filter further down DOES change the count: it can drop a
  // candidate and top the list back up to three with clearly wrong forms, so a
  // question that used to have fewer than three wrong answers (and was always
  // multiple choice) can now have three and render as fill. That is intended;
  // the answer text and the question id are unchanged either way.
  const walk: string[] = [];
  for (let i = 0; i < others.length; i++) {
    const cand = others[(start + i * 7) % others.length];
    if (cand) walk.push(cand);
  }
  // Listening ranks by confusability instead: the whole sentence is the answer,
  // so the useful wrong answers are the ones it could be misheard as, not the
  // ones that could grammatically fill a blank. Without this the hashed walk
  // strides past a sentence's near-twin and every question becomes
  // word-spotting.
  const ordered = preferConfusable
    ? orderByLexicalSimilarity(answer, walk)
    : orderDistractorCandidates(answer, walk, prompt, overrides);
  const out: string[] = [];
  // Dedupe case-insensitively -- see bank-engine.ts's pickDistractors
  // (duplicated here; English's generator predates the shared engine and
  // hasn't been consolidated onto it -- see docs/BACKLOG.md) for the full
  // rationale. Same fix applied to both, found via an automated
  // content-consistency scan (2026-09-22).
  const seen = new Set<string>([answer.toLowerCase()]);
  // A distractor that also makes a correct sentence marks a right answer wrong
  // ("They ___ at home." with "study"), so it is skipped; clearly wrong forms
  // for the slot fill any gap. Only cloze prompts have a blank to test.
  const hasBlank = prompt?.includes("___") === true;
  const skipped: string[] = [];
  for (let i = 0; out.length < 3 && i < ordered.length; i++) {
    const cand = ordered[i];
    const key = cand?.toLowerCase();
    if (cand && key && !seen.has(key)) {
      if (isTwinSpelling(cand, answer) || out.some((o) => isTwinSpelling(o, cand))) continue;
      if (hasBlank && alsoCorrectReason(prompt!, answer, cand)) {
        skipped.push(cand);
        continue;
      }
      out.push(cand);
      seen.add(key);
    }
  }
  if (hasBlank && out.length < 3) {
    for (const cand of clearlyWrongFor(prompt!, answer)) {
      const key = cand.toLowerCase();
      if (out.length >= 3) break;
      if (!seen.has(key)) {
        out.push(cand);
        seen.add(key);
      }
    }
  }
  // A modal or be/do/have answer must keep a second option of its own class, or
  // it is the only modal on screen and gives itself away. Swap the last pick for
  // a clearly wrong form of the same class.
  const slot = hasBlank ? slotClassOf(answer) : null;
  if (slot && !out.some((o) => slotClassOf(o) === slot)) {
    const same = clearlyWrongFor(prompt!, answer).find(
      (w) => slotClassOf(w) === slot && !seen.has(w.toLowerCase()),
    );
    if (same) {
      if (out.length >= 3) out.pop();
      out.push(same);
      seen.add(same.toLowerCase());
    }
  }
  // Last resort, so a question keeps three wrong answers: the guard test names
  // any flagged one that remains.
  for (const cand of skipped) {
    if (out.length >= 3) break;
    out.push(cand);
  }
  return out;
}

function packQuestions(pack: Pack): Question[] {
  const lines = pack.data
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((p) => p.trim()));
  const pool = lines.map((l) => l[1]!);
  return lines.map(([left, right, meaning, example], i) => {
    // Optional third and fourth fields: an authored word-card gloss and example
    // sentence for this line's answer. They never change the question, its
    // options or its id, so adding them cannot move a saved answer. Only the
    // mc/fill questions below carry them (the card is derived from those).
    const card = {
      ...(pack.termFromLeft && pack.kind === "pair" ? { term: left } : {}),
      ...(meaning ? { meaning } : {}),
      ...(example ? { example } : {}),
    };
    const answer = right!;
    const seed = `${pack.id}-${i}`;
    // Returned before any distractor work: a speaking question has no choices
    // and no word bank, so picking distractors would be effort whose result is
    // discarded, and the mc/fill split below does not apply to it either.
    if (pack.kind === "speak") {
      return {
        id: `${pack.id}q${i}`,
        type: "speak",
        prompt: pack.prompt ?? "Say this aloud:",
        answer: left!,
        explanation: `Target phrase: "${left}" ${pack.note}`,
      };
    }
    // Same reasoning as speak: a translate question has no choices and no word
    // bank, so the distractor work below is effort whose result is discarded.
    if (pack.kind === "translate") {
      const answers = right!
        .split(";")
        .map((a) => a.trim())
        .filter(Boolean);
      return {
        id: `${pack.id}q${i}`,
        type: "translate",
        prompt: left!,
        acceptableAnswers: answers,
        explanation: `One way to say it: "${answers[0]}" ${pack.note}`,
      };
    }
    // Built before the distractors so they can be ranked against it -- a
    // candidate already present in the prompt makes a poor wrong answer.
    const prompt =
      pack.kind === "pair"
        ? (pack.prompt ?? "%s").replace("%s", left!)
        : pack.kind === "listening"
          ? // Substituted like a pair prompt so a template reused from one does
            // not ship a literal "%s" on screen. The audio is heard, not read,
            // so the sentence is only ever the fallback for a template that
            // asks for it explicitly.
            (pack.prompt ?? "What did you hear?").replace("%s", left!)
          : left!;
    const distractors = pickDistractors(
      answer,
      pool,
      seed,
      prompt,
      pack.kind === "listening",
      packAnswerPos(pack.id),
    );
    const explanation =
      pack.kind === "pair"
        ? `${left} → ${answer}. ${pack.note}`
        : pack.kind === "listening"
          ? // The audio sentence already ends in its own punctuation, so quoting
            // it and adding a full stop produced `"... rise.". note`.
            `The audio says "${left}" ${pack.note}`
          : `"${answer}" is correct here. ${pack.note}`;
    if (pack.kind === "listening") {
      // Order is cosmetic here: `answer` is the choice text, so there is no
      // index to keep in sync with the shuffle.
      const choices = [answer, ...distractors].sort((a, b) => hash(a + seed) - hash(b + seed));
      return {
        id: `${pack.id}q${i}`,
        type: "listening",
        prompt,
        audioText: left!,
        choices,
        answer,
        explanation,
      };
    }
    const useMc = (hash(seed) & 1) === 0 || distractors.length < 3;
    if (useMc) {
      const choices = [answer, ...distractors];
      const at = hash(seed + "x") % choices.length;
      choices[0] = choices[at]!;
      choices[at] = answer;
      return {
        id: `${pack.id}q${i}`,
        type: "mc",
        prompt,
        choices,
        answer: at,
        explanation,
        ...card,
      };
    }
    return {
      id: `${pack.id}q${i}`,
      type: "fill",
      prompt: pack.kind === "cloze" ? prompt : `${prompt} ___`,
      bank: [answer, ...distractors].sort((a, b) => hash(a + seed) - hash(b + seed)),
      answer,
      explanation,
      ...card,
    };
  });
}

const QUESTIONS_PER_LESSON = 5;
const LESSONS_PER_UNIT = 5;

function buildLevel(level: Level, startUnitIndex: number): Unit[] {
  const packs = BANK[level];
  const units: Unit[] = [];
  packs.forEach((pack, pi) => {
    const qs = packQuestions(pack);
    const lessons: Lesson[] = [];
    for (let i = 0; i < qs.length; i += QUESTIONS_PER_LESSON) {
      const slice = qs.slice(i, i + QUESTIONS_PER_LESSON);
      if (slice.length < 3) break;
      const n = lessons.length + 1;
      lessons.push({
        id: `${pack.id}l${n}`,
        title: `${pack.title} ${n}`,
        subtitle: pack.subtitle,
        questions: slice,
      });
    }
    for (let i = 0; i < lessons.length; i += LESSONS_PER_UNIT) {
      const group = lessons.slice(i, i + LESSONS_PER_UNIT);
      const idx = startUnitIndex + units.length + 1;
      units.push({
        id: `${pack.id}u${i / LESSONS_PER_UNIT + 1}`,
        level,
        eyebrow: `Unit ${idx}`,
        title: pack.title,
        description: `${pack.subtitle} — ${pack.note}`,
        lessons: group,
      });
    }
    void pi;
  });
  return units;
}

export function generatedUnits(existingCountByLevel: Record<Level, number>): Unit[] {
  const levels: Level[] = ["A1", "A2", "B1", "B2", "C1"];
  return levels.flatMap((l) => buildLevel(l, existingCountByLevel[l] ?? 0));
}
