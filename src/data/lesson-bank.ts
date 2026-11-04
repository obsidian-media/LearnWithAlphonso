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
    prompt: '"%s" means:',
    note: "Phrasal verbs rarely mean the sum of their parts.",
    data: `give up|stop trying
look after|take care of
put off|postpone
run out of|have none left
turn down|reject
find out|discover
get on with|have a good relationship with
bring up|raise a topic
call off|cancel
come across|find by chance
carry on|continue
break down|stop working
look into|investigate
take over|assume control
put up with|tolerate
set up|establish
work out|solve or exercise
turn up|arrive
let down|disappoint
pick up|collect
go over|review
hold on|wait
sort out|resolve
cut down on|reduce
look forward to|anticipate happily`,
  },
  {
    id: "b1p2",
    title: "Conditionals",
    subtitle: "If-clauses",
    kind: "cloze",
    note: "First conditional: if + present, will. Second: if + past, would.",
    data: `If it rains, we ___ stay home.|will
If we ___ closer, I'd visit more often.|were
She'd help if she ___ time.|had
If you heat ice, it ___ .|melts
I'll call you if I ___ late.|am
If he studied, he ___ pass.|would
Unless you hurry, you ___ miss it.|will
If I ___ you, I'd apologise.|were
What would you do if you ___ the lottery?|won
If they leave now, they ___ arrive by six.|will
I wouldn't do that if I ___ you.|were
If she ___ harder, she'd succeed.|tried
We'll go out if the weather ___ good.|is
If I had known, I ___ have come.|would
He would be happier if he ___ less.|worked
If you don't water plants, they ___ .|die
I'd tell you if I ___ .|knew
If the shop ___ open, buy milk.|is
She'll be angry if you ___ her.|tell
If we ___ earlier, we'd have seen it.|had left
Provided you pay, we ___ deliver.|will
If only I ___ speak Spanish.|could
Even if it rains, we ___ go.|will
If I ___ time, I'd learn piano.|had
Should you need help, ___ me.|call`,
  },
  {
    id: "b1p3",
    title: "Modal Verbs",
    subtitle: "Obligation, advice, possibility",
    kind: "cloze",
    note: "Modals express degree of certainty, permission, or obligation.",
    data: `You ___ see a doctor.|should
I ___ speak three languages.|can
Visitors ___ wear a badge.|must
You ___ not smoke here.|must
She ___ be at work now.|might
We ___ to leave early.|ought
He ___ have missed the train.|may
You ___ have told me!|should
I ___ swim when I was five.|could
Students ___ not use phones.|may
That ___ be John — he's abroad.|can't
You ___ do it if you don't want to.|needn't
It ___ be true; I saw it.|must
___ I open the window?|May
We ___ better hurry.|had
She ___ have forgotten.|could
You ___ to apologise.|need
Passengers ___ remain seated.|must
He ___ not come after all.|might
___ you mind helping?|Would
I ___ rather stay home.|would
They ___ have arrived by now.|should
You ___ be joking.|must
We ___ not have bothered.|need
___ you like some tea?|Would`,
  },
  {
    id: "b1p4",
    title: "Perfect Tenses",
    subtitle: "Present perfect vs past",
    kind: "cloze",
    note: "Present perfect links past to now; past simple names a finished time.",
    data: `I ___ never been to Japan.|have
She ___ here since 2019.|has lived
We ___ the film last night.|saw
___ you finished yet?|Have
He ___ just left.|has
They ___ in Berlin for years.|have lived
I ___ him yesterday.|met
The train ___ already gone.|has
How long ___ you known her?|have
She ___ worked here since May.|has
We ___ lunch an hour ago.|had
I've ___ that book twice.|read
He hasn't called ___ .|yet
They've been married ___ ten years.|for
I've known him ___ childhood.|since
___ ever tried sushi?|Have you
She ___ finished her degree in 2020.|finished
We've ___ been to Greece.|never
The rain ___ stopped.|has
I ___ my keys — I can't find them.|have lost
He ___ his keys yesterday.|lost
It's the best film I've ___ seen.|ever
She's ___ working all day.|been
They ___ arrived a moment ago.|arrived
I've lived here ___ 2010.|since`,
  },
  {
    id: "b1p5",
    title: "Work & Opinions",
    subtitle: "Natural collocations",
    kind: "pair",
    prompt: 'Which word completes "%s"?',
    note: "Collocations make speech sound natural.",
    data: `make an ___ (job application)|application
take ___ (accept blame)|responsibility
meet a ___ (finish on time)|deadline
attend a ___|meeting
give a ___|presentation
reach an ___|agreement
raise an ___|issue
solve a ___|problem
gain ___ (working knowledge)|experience
run a ___|business
apply for a ___|job
earn a ___|salary
keep in ___|touch
strongly ___ (opinion verb)|agree
express an ___|opinion
change your ___|mind
make a ___ (choose)|decision
draw a ___|conclusion
have a ___ (talk)|conversation
hold a ___ (meeting verb)|meeting
set a ___ (target)|goal
take a ___ (rest)|break
share an ___|idea
build a ___ (working bond)|relationship
face a ___ (difficulty)|challenge`,
  },
  {
    id: "b1p6",
    title: "Relative Clauses",
    subtitle: "Who, which, that, whose",
    kind: "cloze",
    note: "Use who for people, which for things, whose for possession.",
    data: `The man ___ called is my boss.|who
The book ___ I read was great.|that
She's the woman ___ car broke down.|whose
This is the town ___ I grew up.|where
That's the reason ___ he left.|why
The film, ___ won an award, is long.|which
Anyone ___ wants to join is welcome.|who
The house ___ we bought is old.|that
Do you know the day ___ they arrive?|when
He's the person ___ I trust most.|whom
The company, ___ is based in Oslo, hires.|which
The students ___ passed celebrated.|who
That's the shop ___ sells guitars.|that
The room ___ window is broken is locked.|whose
I met a man ___ speaks six languages.|who
The reason ___ she resigned is unclear.|why
This is the café ___ we first met.|where
The dog ___ barked all night is gone.|that
My sister, ___ lives in Rome, visits soon.|who
Everything ___ he said was true.|that
The bag ___ you found is mine.|that
The year ___ we moved was 2012.|when
She's someone ___ opinion I respect.|whose
The road ___ leads to the lake is closed.|which
People ___ exercise sleep better.|who`,
  },
  {
    id: "b1p7",
    title: "Travel & Tourism",
    subtitle: "Getting around abroad",
    kind: "cloze",
    note: "Common vocabulary for booking and navigating trips.",
    data: `We need to ___ our flight before it fills up.|book
Our hotel has a great ___ of the sea.|view
Could you recommend a good ___ to visit?|attraction
We're planning a two-week ___ around Europe.|trip
I forgot to pack my ___ before the flight.|passport
The tour ___ showed us around the old town.|guide
We stayed in a small ___ near the beach.|guesthouse
Our flight was ___ by two hours.|delayed
We need to ___ our luggage before boarding.|check
The hotel offers a free airport ___.|shuttle
We got lost, so we asked for ___.|directions
This city is famous for its ancient ___.|ruins
We booked a ___ tour of the museum.|guided
Make sure your ___ hasn't expired.|visa
We spent the afternoon ___ around the market.|wandering
The ___ desk can help with excursions.|reception
We took a scenic ___ along the coast.|route
Our train has a short ___ in Milan.|stopover
The local ___ was incredibly friendly.|staff
We need travel ___ in case something goes wrong.|insurance
The ___ office can exchange currency for you.|tourist
We're staying in a ___ apartment downtown.|rental
The flight was fully ___, so we waited standby.|booked
We explored the city on a ___ tour bus.|hop-on-hop-off
Remember to keep your boarding ___ safe.|pass`,
  },
  {
    id: "b1p8",
    title: "Feelings & Emotions",
    subtitle: "Adjective ↔ noun forms",
    kind: "pair",
    prompt: 'Noun form of "%s":',
    note: "Emotion adjectives and their matching nouns.",
    data: `happy|happiness
sad|sadness
angry|anger
anxious|anxiety
excited|excitement
proud|pride
jealous|jealousy
confident|confidence
nervous|nervousness
curious|curiosity
embarrassed|embarrassment
grateful|gratitude
disappointed|disappointment
confused|confusion
relieved|relief
frustrated|frustration
lonely|loneliness
surprised|surprise
ashamed|shame
content|contentment
bored|boredom
hopeful|hope
suspicious|suspicion
satisfied|satisfaction
sympathetic|sympathy`,
  },
  {
    id: "b1p9",
    title: "Money & Shopping",
    subtitle: "Banking and budgeting",
    kind: "cloze",
    note: "Intermediate vocabulary for managing money.",
    data: `I need to ___ some money before payday.|budget
She's saving up to ___ a deposit for a flat.|pay
We ___ a loan to buy the car.|took out
He's ___ into debt because of his spending.|falling
I set up a standing ___ for my rent.|order
The bank charges a ___ for overdrafts.|fee
She transferred money ___ her savings account.|to
We compared prices before making a ___.|decision
He's trying to ___ his monthly expenses.|track
I applied for a credit ___.|card
The store offers a money-back ___.|guarantee
She always shops around for the best ___.|deal
We're on a tight ___ this month.|allowance
He returned the item for a full ___.|refund
I prefer to pay in ___ rather than instalments.|full
The interest ___ on that account is low.|rate
She's trying to pay off her ___.|debt
We split the cost ___ between us.|evenly
He negotiated better ___ on the loan.|terms
I keep an eye on my bank ___ daily.|balance
She's saving for a rainy ___.|day
The shop was offering a seasonal ___.|discount
We opened a joint ___ together.|account
He's careful with his ___.|spending
I always check the ___ before buying online.|reviews`,
  },
  {
    id: "b1p10",
    title: "Environment",
    subtitle: "Talking about the planet",
    kind: "cloze",
    note: "B1-level environmental vocabulary.",
    data: `We should ___ less plastic to protect the ocean.|use
Recycling helps ___ waste going to landfill.|reduce
The factory was fined for ___ the river.|polluting
Many species are at risk of ___.|extinction
We need to ___ energy to fight climate change.|save
Solar panels use ___ energy from the sun.|renewable
The forest was cut down for ___.|farming
Rising temperatures are causing the ice to ___.|melt
We should ___ more trees to help the planet.|plant
The city introduced a ban on single-use ___.|plastic
Air ___ is a serious problem in big cities.|pollution
We can ___ our carbon footprint by cycling.|lower
The government promised to cut carbon ___.|emissions
Many animals lost their natural ___.|habitat
We should ___ water instead of wasting it.|conserve
The beach was covered in ___ after the storm.|litter
Electric cars produce ___ pollution than petrol ones.|less
The charity works to protect ___ species.|endangered
We separate our rubbish for ___.|recycling
The company switched to ___ packaging.|sustainable
Deforestation is a major cause of climate ___.|change
We should walk instead of ___ short distances.|driving
The river was cleaned up after years of ___.|neglect
Wind farms generate clean ___.|energy
Protecting the environment is everyone's ___.|responsibility`,
  },
  {
    id: "b1p11",
    title: "Education & Learning",
    subtitle: "School, study and exams",
    kind: "cloze",
    note: "B1-level vocabulary for talking about education.",
    data: `She is studying for a ___ in biology at university.|degree
He failed the exam, so he has to ___ it in June.|resit
Students must ___ their assignments by Friday.|submit
The teacher gave us some homework to ___ overnight.|complete
She got a ___ mark of ninety percent.|top
He dropped out of school and never got his ___.|diploma
The lecture ___ was very clear and easy to follow.|hall
We have a ___ exam at the end of term.|final
She was awarded a ___ to study abroad.|scholarship
He struggled with maths, so he hired a private ___.|tutor
The school offers extra ___ classes after hours.|tutoring
Attendance is compulsory for all ___ students.|registered
The professor asked us to ___ our essays in class.|present
She is doing a ___ degree in psychology.|master's
He was ___ for cheating during the exam.|caught
The library is a quiet place to ___ for tests.|revise
Class ___ starts at nine every morning.|registration
She earned a ___ grade in her final report.|distinction
The teacher marked the essay and gave useful ___.|feedback
He is ___ to graduate next summer.|due
The school ___ all students who miss too many classes.|warns
Good study ___ help you remember more information.|habits
She took extra ___ classes to improve her English.|evening
The university offers many ___ courses online.|distance
He passed every subject except ___, which he must repeat.|chemistry`,
  },
  {
    id: "b1p12",
    title: "Describing Trends",
    subtitle: "Talking about graphs and change",
    kind: "cloze",
    note: "B1-level language for describing statistics and change over time.",
    data: `Sales ___ sharply after the new product launched.|increased
Prices ___ slightly over the last three months.|rose
Unemployment ___ steadily since last year.|fell
The graph shows a clear ___ in online shopping.|rise
Profits ___ dramatically after the factory closed.|dropped
The number of visitors ___ constant throughout the year.|remained
There was a sudden ___ in demand for masks.|surge
The trend shows a gradual ___ in average income.|increase
The company's revenue ___ off after a strong start.|levelled
House prices have ___ significantly in the city.|risen
The population is expected to ___ over the next decade.|grow
Costs ___ slightly before stabilising again.|fluctuated
The chart shows a steady ___ in pollution levels.|decline
Exports ___ by ten percent last quarter.|shrank
The line on the graph shows a sharp ___ in usage.|peak
Interest rates have stayed ___ for two years.|stable
The number of students ___ every year since 2020.|increases
Traffic in the city has ___ noticeably this year.|worsened
The figures show a slight ___ compared to last month.|dip
Demand ___ rapidly after the advertising campaign.|grew
The report predicts a further ___ in oil prices.|fall
Wages have barely ___ despite rising costs.|changed
The company saw a huge ___ in customer complaints.|drop
Tourism numbers ___ to record levels last summer.|climbed
Overall, the data shows an upward ___.|trend`,
  },
  {
    id: "b1p13",
    title: "Job Interviews & CVs",
    subtitle: "Applying for work",
    kind: "cloze",
    note: "B1-level vocabulary for job applications and interviews.",
    data: `I'm writing to ___ for the marketing position.|apply
Please find my ___ attached to this email.|CV
I have three years of ___ in customer service.|experience
I'm looking for a role with more ___.|responsibility
Could you tell me about your ___ strengths?|main
I'm a very ___ team player.|reliable
The interviewer asked about my greatest ___.|weakness
I believe I would be a great ___ for this role.|fit
I'm available for an ___ any day next week.|interview
My current ___ ends next month.|contract
I'm hoping to ___ my career to the next level.|take
The job ___ mentions strong communication skills.|description
I have a ___ in business administration.|degree
I worked as an ___ for a local company last summer.|intern
Could you describe your ___ working style?|typical
I'm confident I can meet the ___ deadlines.|tight
The company offers a competitive ___ package.|salary
I would appreciate the chance to ___ my skills.|demonstrate
Please let me know if you need any further ___.|information
I'm currently ___ for new opportunities.|searching
I have excellent ___ skills, both written and spoken.|communication
The recruiter will be in ___ shortly.|touch
I'm keen to ___ more about the role.|learn
Thank you for ___ my application.|considering
I look forward to ___ from you soon.|hearing`,
  },
  {
    id: "b1p14",
    title: "Describing People's Character",
    subtitle: "Personality traits",
    kind: "pair",
    prompt: 'Someone who is "%s" tends to…',
    note: "Personality adjectives matched to typical behaviour.",
    data: `generous|share what they have with others
stubborn|refuse to change their mind
honest|always tell the truth
reliable|always do what they promise
ambitious|work hard to achieve big goals
patient|stay calm while waiting
curious|ask a lot of questions
confident|believe in their own abilities
shy|feel nervous meeting new people
outgoing|enjoy meeting new people
careless|make mistakes without noticing
organised|keep everything neat and planned
lazy|avoid doing work
hardworking|put a lot of effort into tasks
selfish|think mainly of themselves
kind|treat others with care
arrogant|think they are better than others
modest|not boast about achievements
cheerful|stay happy and positive
moody|change mood suddenly and often
loyal|stay faithful to friends
jealous|feel envious of others
sensitive|get upset easily
creative|come up with original ideas
tactless|say things without thinking of others' feelings`,
  },
  {
    id: "b1p15",
    title: "Used to & Would",
    subtitle: "Past habits and states",
    kind: "cloze",
    note: "B1-level structures for talking about past habits.",
    data: `I ___ to walk to school every day when I was young.|used
We ___ visit our grandparents every summer.|would
She ___ to have long hair, but she cut it short.|used
He ___ play football every weekend as a teenager.|would
I ___ to live in a small village.|used
They ___ argue about everything when they were kids.|would
She ___ to be afraid of the dark.|used
We ___ spend hours playing outside after school.|would
He ___ to smoke, but he quit years ago.|used
I ___ eat sweets every day when I was a child.|would
She ___ to work as a teacher before she retired.|used
We ___ to have a dog when I was young.|used
They ___ meet at the same café every Friday.|would
He ___ to be much thinner than he is now.|used
I ___ to hate vegetables when I was a kid.|used
We ___ stay up late telling stories.|would
She ___ to own a bright red car.|used
He ___ complain about the weather every winter.|would
I ___ to study French at school.|used
They ___ to travel a lot before they had children.|used
We ___ sing songs on long car journeys.|would
She ___ to be much more confident as a teenager.|used
He ___ to play the piano every evening.|used
I ___ collect stamps when I was younger.|would
They ___ to live next door to us years ago.|used`,
  },
  {
    id: "b1p16",
    title: "Question Tags",
    subtitle: "Confirming and checking information",
    kind: "cloze",
    note: "B1-level question tag practice.",
    data: `You're coming to the party, ___ you?|aren't
She's happy with the result, ___ she?|isn't
He can dance really well, ___ he?|can't
He can't swim very far, ___ he?|can
It was sunny yesterday, ___ it?|wasn't
It wasn't sunny yesterday, ___ it?|was
They were at the party, ___ they?|weren't
They weren't at home last night, ___ they?|were
She likes chocolate, ___ she?|doesn't
She doesn't like tea very much, ___ she?|does
You smoke sometimes, ___ you?|don't
You don't smoke at all, ___ you?|do
You've seen this film before, ___ you?|haven't
You haven't seen my keys, ___ you?|have
He's finished his homework, ___ he?|hasn't
He hasn't finished the report yet, ___ he?|has
She'll call us later, ___ she?|won't
She won't be late again, ___ she?|will
You'd like some tea, ___ you?|wouldn't
You wouldn't mind helping, ___ you?|would
He could swim as a child, ___ he?|couldn't
He couldn't swim before lessons, ___ he?|could
We should leave soon, ___ we?|shouldn't
We shouldn't be late, ___ we?|should
They didn't call you yesterday, ___ they?|did`,
  },
  {
    id: "b1p17",
    title: "Giving Opinions & Agreeing",
    subtitle: "Sharing your point of view",
    kind: "cloze",
    note: "B1-level phrases for discussion and debate.",
    data: `In my ___, this is the best option.|opinion
I ___ agree with what you're saying.|totally
I'm not really ___ about that idea.|sure
That's a fair ___, but I see it differently.|point
I couldn't ___ more with you.|agree
Personally, I ___ that we should wait.|think
I see what you ___, but I disagree.|mean
As ___ as I'm concerned, it's a bad idea.|far
I'm ___ sure that's correct.|not
I'd have to ___ with you on that one.|disagree
From my point of ___, it's a good plan.|view
I ___ your point, but I still disagree.|understand
Honestly, I don't ___ it that way.|see
I tend to ___ with the majority here.|side
That's exactly what I was going to ___.|say
I'm ___ convinced by that argument.|hardly
It seems to ___ that we have no choice.|me
I have to ___ with you there.|concur
I'm afraid I ___ agree with that.|can't
That's a good ___, actually.|observation
I'm ___ of two minds about this.|kind
I really don't think that's ___.|true
Let's agree to ___ on this one.|differ
I ___ what you're saying, but I still think I'm right.|hear
To be ___, I hadn't thought of it that way.|honest`,
  },
  {
    id: "b1p18",
    title: "Health & Fitness",
    subtitle: "Exercise and healthy living",
    kind: "cloze",
    note: "B1-level vocabulary for talking about fitness and wellbeing.",
    data: `I try to ___ out at the gym three times a week.|work
Eating a ___ diet keeps you healthy.|balanced
I always ___ up before I start exercising.|warm
Getting enough ___ is important for your health.|sleep
She ___ five kilometres every morning.|runs
Drinking plenty of ___ keeps you hydrated.|water
He joined a ___ to get fit.|gym
Doing ___ exercise strengthens your heart.|cardio
I need to ___ down after my workout.|cool
Lifting ___ builds muscle strength.|weights
Cutting down on ___ food is good for you.|junk
Stretching helps prevent ___.|injuries
I try to eat five portions of ___ a day.|fruit
Getting regular exercise reduces ___.|stress
She follows a strict fitness ___.|routine
He hired a personal ___ to help him train.|trainer
Drinking too much ___ isn't good for you.|alcohol
Yoga is great for ___ and relaxation.|flexibility
I go ___ every weekend to stay active.|swimming
Skipping breakfast isn't a healthy ___.|habit
Getting fresh ___ is good for your lungs.|air
Cycling to work is good ___.|exercise
He tracks his ___ intake carefully.|calorie
A good night's ___ helps you recover.|rest
She takes a daily ___ for her health.|vitamin`,
  },
  {
    id: "b1p19",
    title: "Weather & Natural Events",
    subtitle: "Extreme weather vocabulary",
    kind: "cloze",
    note: "B1-level vocabulary for weather and natural events.",
    data: `A strong ___ knocked down several trees.|storm
The ___ caused severe flooding in the town.|rain
Scientists are monitoring the approaching ___.|hurricane
The ___ shook the entire building.|earthquake
Heavy ___ blocked the roads for days.|snow
The region suffered a long ___ last summer.|drought
The ___ destroyed several homes near the coast.|flood
A sudden ___ hit the coastal town.|gale
The ___ warning was issued early this morning.|weather
Thick ___ made driving dangerous.|fog
The ___ caused widespread damage to crops.|hailstorm
Firefighters battled a huge ___ in the forest.|wildfire
The city experienced a rare ___ this winter.|blizzard
The ___ swept through the village overnight.|tornado
Rising sea levels are linked to climate ___.|change
The ___ lasted for nearly three hours.|thunderstorm
The heatwave caused several ___ related illnesses.|heat
The ___ left thousands without electricity.|blackout
Meteorologists predicted a severe ___ this weekend.|downpour
The volcano's ___ affected air travel for days.|eruption
The ___ made the roads extremely slippery.|ice
A powerful ___ hit the island nation.|cyclone
The ___ brought record-breaking temperatures.|heatwave
Officials issued a ___ warning for the coast.|tsunami
The ___ has caused significant coastal erosion.|surge`,
  },
  {
    id: "b1p20",
    title: "Describing a Process",
    subtitle: "Sequencing and instructions",
    kind: "cloze",
    note: "B1-level sequencing language for describing steps.",
    data: `___ of all, you need to gather the ingredients.|first
The ___ step is to preheat the oven.|next
After that, you should ___ the flour and sugar.|mix
Once the mixture is ready, you ___ it into the tin.|pour
___ this, place the tin in the oven.|following
While it bakes, you can ___ the kitchen.|clean
After twenty minutes, ___ the cake to check it's done.|check
Then, you need to ___ it out to cool.|take
Finally, you can ___ the cake with icing.|decorate
The ___ stage involves cutting the pieces.|final
Before you start, make sure you ___ your hands.|wash
The ___ step is to switch on the machine.|initial
Once it's ready, you should ___ off the power.|turn
After the process is finished, ___ everything away.|put
The ___ thing you do is check the results.|last
To begin ___, gather all the necessary tools.|with
Next, you ___ the pieces together carefully.|fit
Once assembled, you need to ___ the screws.|tighten
After that, ___ the device before use.|test
The ___ step is often the most important.|closing
Before finishing, you should ___ everything twice.|verify
Once complete, you can ___ the finished product.|use
The process ___ with a simple inspection.|starts
After preparation, the next ___ is mixing.|step
Lastly, allow the mixture to ___ overnight.|rest`,
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
    data: `The report ___ written last week.|was
The bridge is ___ repaired.|being
Nothing ___ been decided yet.|has
The letters ___ sent yesterday.|were
He ___ given a warning.|was
The results will ___ announced soon.|be
The room ___ cleaned every day.|is
The car needs ___ .|repairing
She ___ said to be brilliant.|is
The house is ___ to have been built in 1820.|thought
Mistakes ___ made.|were
The film ___ directed by Lean.|was
The data ___ being analysed now.|is
Tickets can ___ bought online.|be
The law ___ have been changed.|must
He got ___ in the accident.|hurt
The matter is ___ investigated.|being
The plan ___ approved next month.|will be
It is widely ___ that prices will rise.|believed
The rules ___ to be followed.|have
The parcel should ___ arrived.|have
The offer was ___ down.|turned
Our flight ___ cancelled.|was
The issue ___ dealt with promptly.|was
Nothing ___ be done about it.|can`,
  },
  {
    id: "b2p2",
    title: "Confusable Words",
    subtitle: "Choose precisely",
    kind: "pair",
    prompt: 'Which fits: "%s"?',
    note: "These pairs are frequently mixed up by learners.",
    data: `affect / effect (verb, to influence)|affect
practice / practise (British verb)|practise
principal / principle (a rule)|principle
lose / loose (opposite of tight)|loose
its / it's (belonging to it)|its
advice / advise (noun)|advice
economic / economical (money-saving)|economical
historic / historical (of the past)|historical
sensible / sensitive (easily hurt)|sensitive
continual / continuous (unbroken)|continuous
few / less (with countable nouns)|few
among / between (three or more)|among
bring / take (movement away)|take
borrow / lend (give temporarily)|lend
rise / raise (needs an object)|raise
lie / lay (needs an object)|lay
remember / remind (prompt someone)|remind
say / tell (needs a person object)|tell
travel / trip (a journey noun)|trip
job / work (uncountable)|work
alone / lonely (feeling sad)|lonely
classic / classical (music style)|classical
efficient / effective (achieves the goal)|effective
assure / ensure (make certain)|ensure
imply / infer (draw a conclusion)|infer`,
  },
  {
    id: "b2p3",
    title: "Linking Ideas",
    subtitle: "Discourse markers",
    kind: "cloze",
    note: "Linkers signal contrast, cause, or addition — choose by logic.",
    data: `It was raining; ___ , we went out.|nevertheless
He was tired. ___ , he kept working.|Even so
___ the cost, the project went ahead.|Despite
She is talented; ___ , she lacks focus.|however
___ of the delay, we arrived on time.|In spite
The plan failed ___ poor planning.|due to
___ , the results were encouraging.|Overall
He studied hard; ___ , he passed.|therefore
___ , let's review the numbers.|Firstly
The data is old; ___ , it's still useful.|nonetheless
___ addition, costs have risen.|In
We must act ___ it's too late.|before
___ as the report suggests, sales fell.|Just
___ , the strategy needs revision.|In short
She left early ___ she felt ill.|because
___ contrast, exports grew.|In
He is, ___ , the best candidate.|arguably
___ hand, the risks are real.|On the other
The trial failed; ___ , funding stopped.|consequently
___ than complain, act.|Rather
___ far, progress is slow.|So
We agreed, ___ with conditions.|albeit
___ this in mind, we proceeded.|With
___ , nothing has changed.|Meanwhile
The claim is, ___ , unproven.|however`,
  },
  {
    id: "b2p4",
    title: "Reported Speech",
    subtitle: "Backshift and reporting verbs",
    kind: "cloze",
    note: "Tenses usually shift back one step when reporting.",
    data: `He said he ___ tired.|was
She told me she ___ finished.|had
They said they ___ come later.|would
He asked ___ I was free.|if
She asked me where I ___ .|lived
He admitted ___ the mistake.|making
She refused ___ comment.|to
They denied ___ involved.|being
He promised ___ help.|to
She suggested ___ a break.|taking
He warned us ___ to go.|not
She explained that she ___ busy.|was
He insisted ___ paying.|on
They announced that prices ___ rise.|would
She apologised ___ being late.|for
He claimed he ___ seen nothing.|had
She reminded me ___ call.|to
He complained ___ the noise.|about
They agreed ___ postpone.|to
She wondered ___ it was true.|whether
He offered ___ drive us.|to
She accused him ___ lying.|of
He recommended ___ the early train.|taking
She confirmed that she ___ attend.|would
He asked what time the meeting ___ .|started`,
  },
  {
    id: "b2p5",
    title: "Strong Collocations",
    subtitle: "Natural word partners",
    kind: "pair",
    prompt: 'Which word pairs with "%s"?',
    note: "Advanced fluency lives in collocation.",
    data: `___ rain (very heavy)|heavy
___ evidence (convincing)|compelling
___ difference (large)|significant
___ silence (complete)|utter
___ mistake (serious)|grave
___ opportunity (rare)|golden
___ debate (intense)|heated
___ progress (steady)|steady
___ criticism (strong)|fierce
___ demand (great)|high
___ impact (large)|profound
___ deadline (unmovable)|strict
___ concern (increasing)|growing
___ argument (persuasive)|convincing
___ change (basic)|fundamental
___ interest (strong)|keen
___ traffic (crowded)|heavy
___ knowledge (deep)|thorough
___ apology (sincere)|heartfelt
___ effort (concentrated)|concerted
___ failure (total)|complete
___ increase (sharp)|sharp
___ resemblance (close)|striking
___ decision (final)|firm
___ support (broad)|widespread`,
  },
  {
    id: "b2p6",
    title: "Word Formation",
    subtitle: "Verb → noun",
    kind: "pair",
    prompt: 'Noun form of "%s":',
    note: "Suffix patterns are predictable once learned.",
    data: `analyse|analysis
decide|decision
argue|argument
achieve|achievement
succeed|success
fail|failure
maintain|maintenance
prove|proof
choose|choice
lose|loss
believe|belief
grow|growth
know|knowledge
solve|solution
apply|application
persuade|persuasion
expand|expansion
respond|response
behave|behaviour
survive|survival
explain|explanation
assume|assumption
conclude|conclusion
refuse|refusal
depart|departure`,
  },
  {
    id: "b2p7",
    title: "Reporting & Hedging",
    subtitle: "Report what was said",
    kind: "cloze",
    note: "Reported speech shifts tense back and changes time and place words.",
    data: `She said she ___ tired.|was
He told ___ he would call.|me
They asked where I ___ from.|came
She wondered ___ I had finished.|whether
He admitted ___ the money.|taking
She denied ___ anything wrong.|doing
He suggested ___ earlier.|leaving
They insisted ___ paying the bill.|on
She warned us ___ to touch it.|not
He apologised ___ being late.|for
She claimed ___ have seen him.|to
He refused ___ comment.|to
They announced that the deal ___ off.|was
She explained ___ the system worked.|how
She complained ___ the delay.|about
She reminded me ___ lock the door.|to
He accused her ___ lying.|of
They agreed ___ meet on Friday.|to
She promised she ___ help.|would
He asked me ___ I needed anything.|if
She pointed ___ the flaw in the plan.|out
He implied that something ___ wrong.|was
They confirmed the flight ___ been delayed.|had
She urged them ___ reconsider.|to
He maintained that he ___ innocent.|was`,
  },
  {
    id: "b2p8",
    title: "Collocations",
    subtitle: "Words that go together",
    kind: "pair",
    prompt: 'Complete: "%s ___"',
    note: "Natural English depends on the right partner word.",
    data: `make a|decision
take a|risk
pay|attention
draw a|conclusion
meet a|deadline
raise|awareness
break the|news
keep a|promise
run a|business
hold a|meeting
reach an|agreement
set a|precedent
bear in|mind
take|responsibility
place an|order
gain|experience
cause|damage
express|concern
launch a|campaign
strike a|balance
face a|challenge
issue a|statement
conduct|research
achieve a|goal
lose|patience`,
  },
  {
    id: "b2p9",
    title: "Health & Medicine",
    subtitle: "Describing symptoms and care",
    kind: "cloze",
    note: "Intermediate-plus vocabulary for talking about health.",
    data: `The doctor ___ a full recovery within weeks.|predicted
She's been ___ from a bad cold all week.|suffering
He was ___ to hospital after the accident.|admitted
The medicine should ___ the pain quickly.|relieve
She's ___ to penicillin, so avoid it.|allergic
The nurse took his ___ before the appointment.|temperature
He's on ___ to manage his blood pressure.|medication
The wound needs to be ___ regularly.|dressed
She was ___ with a mild infection.|diagnosed
Rest and fluids should help you ___.|recover
The clinic offers a free ___ once a year.|check-up
He ___ his ankle playing football.|twisted
The vaccine helps ___ the disease.|prevent
She's been feeling ___ since yesterday.|nauseous
The doctor ___ two weeks of rest.|recommended
His symptoms ___ after a few days.|improved
The hospital ___ him overnight for observation.|kept
She takes a daily ___ for her allergies.|tablet
The surgeon ___ the operation successfully.|performed
He's ___ to a specialist for further tests.|referred
The patient's condition remained ___.|stable
She was given ___ before the procedure.|anaesthesia
The clinic is fully ___ for emergencies.|equipped
His recovery has been slow but ___.|steady
The doctor advised him to ___ smoking.|quit`,
  },
  {
    id: "b2p10",
    title: "Technology & Media",
    subtitle: "Talking about devices and news",
    kind: "cloze",
    note: "Everyday tech and media vocabulary at B2 level.",
    data: `My phone's ___ died, so I couldn't call.|battery
The app keeps ___ every time I open it.|crashing
We need to ___ the software before using it.|update
The article went ___ within hours.|viral
He ___ his password and got locked out.|forgot
The company was ___ over a data breach.|criticised
Streaming services have ___ how we watch TV.|changed
She ___ the video before sharing it.|verified
The signal ___ whenever it rains.|drops
This site collects your data without ___.|consent
The report was ___ by several news outlets.|shared
He ___ his old laptop for a new one.|upgraded
The story was quickly ___ by fact-checkers.|debunked
Most people now get news through social ___.|media
The website ___ if too many users log in.|crashes
She backed up her files to the ___.|cloud
The headline was clearly ___.|misleading
He ___ the news alert before reading it.|dismissed
The device connects ___ to your phone.|wirelessly
Online ___ can spread faster than facts.|misinformation
The company issued a public ___.|apology
She disabled ___ to save her battery.|notifications
The article cited an ___ source.|unreliable
His account was ___ after suspicious activity.|suspended
The platform introduced stricter privacy ___.|settings`,
  },
  {
    id: "b2p11",
    title: "Business & Negotiation",
    subtitle: "Deals and workplace talk",
    kind: "cloze",
    note: "B2-level vocabulary for meetings and negotiations.",
    data: `We need to ___ a deal before the deadline.|close
Both sides made a ___ to reach agreement.|compromise
The company plans to ___ into new markets.|expand
We're hoping to ___ a long-term partnership.|build
The talks broke down over pricing ___.|disputes
She was promoted to ___ the new division.|head
The merger was finally ___ this week.|approved
We need to ___ the terms before signing.|finalise
His proposal was ___ by the board.|rejected
The company had to ___ several employees.|lay off
We're aiming to ___ costs by ten percent.|cut
The client asked for a better ___.|quote
They reached a ___ after hours of talks.|deal
The firm plans to ___ with a rival company.|merge
We need more data before we can ___.|decide
The negotiation ___ down to price alone.|came
She's known for driving a hard ___.|bargain
The board will ___ on the proposal tomorrow.|vote
We're under pressure to ___ a decision quickly.|make
The deal fell ___ at the last minute.|through
They agreed to ___ the contract for a year.|extend
The company issued new ___ to investors.|shares
We need buy-in from all ___ involved.|stakeholders
The CEO announced a major ___ in strategy.|shift
Negotiations are still ___ ongoing.|very much`,
  },
  {
    id: "b2p12",
    title: "Crime & Law",
    subtitle: "Reporting incidents",
    kind: "cloze",
    note: "B2-level vocabulary for news and crime reports.",
    data: `The suspect was ___ near the scene.|arrested
Police are ___ the robbery as a priority case.|treating
The witness gave a detailed ___ to police.|statement
He was found ___ of the crime.|guilty
The jury reached a ___ after two days.|verdict
She was ___ to five years in prison.|sentenced
The thief managed to ___ before police arrived.|escape
Detectives are still ___ the case.|investigating
The court will ___ the case next month.|hear
He pleaded ___ to the charges.|not guilty
The victim reported the ___ to the police.|theft
CCTV footage helped ___ the suspect.|identify
The judge dismissed the case due to lack of ___.|evidence
The lawyer argued for a lighter ___.|sentence
Police are appealing for ___ from the public.|witnesses
The burglar broke ___ through a window.|in
He was released on ___ pending trial.|bail
The case was ___ due to insufficient evidence.|dropped
The officer read him his ___.|rights
The trial is expected to ___ several weeks.|last
She was charged with ___ a false report.|filing
The defendant appeared in court to ___ the charges.|answer
Forensic experts examined the ___ carefully.|scene
The gang was involved in a series of ___.|robberies
He was found ___ innocent by the jury.|not`,
  },
  {
    id: "b2p13",
    title: "Politics & Society",
    subtitle: "Government and public debate",
    kind: "cloze",
    note: "B2-level vocabulary for discussing politics and social issues.",
    data: `The government announced a new ___ to tackle unemployment.|policy
Voters will go to the ___ next month.|polls
The party won a clear ___ in parliament.|majority
Citizens have the right to ___ in elections.|vote
The proposal sparked a heated public ___.|debate
The minister was forced to ___ after the scandal.|resign
The new law will ___ into effect next year.|come
Protesters gathered to ___ against the reform.|demonstrate
The opposition ___ the government's handling of the crisis.|criticised
Many people feel ___ by the lack of change.|frustrated
The council held a ___ to discuss local issues.|meeting
The bill was passed after months of ___.|negotiation
Inequality remains a major ___ in society.|issue
The campaign focused on ___ reform in healthcare.|systemic
Freedom of ___ is protected by the constitution.|speech
The election result surprised most political ___.|analysts
The president signed the treaty after lengthy ___.|talks
Local communities are demanding greater ___ in decisions.|say
The government faces pressure to ___ its spending.|cut
Turnout at the election was ___ lower than expected.|significantly
The candidate promised to ___ taxes for low earners.|lower
Public trust in politicians has ___ in recent years.|declined
The referendum will decide whether the country should ___ the union.|leave
Activists are calling for stronger ___ rights.|workers'
The new policy aims to reduce the wealth ___.|gap`,
  },
  {
    id: "b2p14",
    title: "Arts & Culture",
    subtitle: "Museums, film and performance",
    kind: "cloze",
    note: "B2-level vocabulary for discussing the arts.",
    data: `The gallery is hosting an ___ of modern sculpture.|exhibition
The film received ___ reviews from critics.|mixed
The novel was later ___ into a successful film.|adapted
The orchestra gave a ___ performance last night.|stunning
The museum's new wing displays ___ artefacts.|ancient
The play explores themes of loss and ___.|identity
The concert was performed to a sold-out ___.|audience
The director is known for his unique visual ___.|style
The choreography was both bold and ___.|graceful
The exhibition features works by local ___.|artists
The band's latest album was a huge commercial ___.|success
Critics praised the film's stunning ___.|cinematography
The theatre company is famous for its innovative ___.|productions
The museum acquired a private ___ of Impressionist works.|collection
The festival celebrates classical and contemporary ___.|music
The actor gave a deeply moving ___.|performance
The sculpture was carved from a single block of ___.|marble
The author's latest book explores modern ___.|society
The gallery curator selected pieces that challenge ___.|perception
The documentary sheds light on an overlooked ___ movement.|artistic
The opera house is renowned for its stunning ___.|acoustics
The mural depicts the city's rich cultural ___.|heritage
The critics called the performance a true work of ___.|art
The young pianist won critical ___ for her debut.|acclaim
The novel won several literary ___ this year.|awards`,
  },
  {
    id: "b2p15",
    title: "Idioms & Fixed Expressions",
    subtitle: "Meaning match",
    kind: "pair",
    prompt: 'The expression "%s" means…',
    note: "Common B2-level idioms and fixed expressions.",
    data: `to be on the ball|to be alert and quick to understand
to cost an arm and a leg|to be very expensive
to hit the books|to study hard
to get the ball rolling|to start something
to be in hot water|to be in trouble
to call it a day|to stop working for now
to break the ice|to ease tension in a social situation
to be under the weather|to feel slightly ill
to keep an eye on|to watch carefully
to make ends meet|to have just enough money to live on
to be a piece of cake|to be very easy
to spill the beans|to reveal a secret
to be in the same boat|to be in the same difficult situation
to give someone the benefit of the doubt|to trust them despite uncertainty
to sit on the fence|to avoid choosing a side
to get cold feet|to become nervous about doing something
to go back to square one|to start again from the beginning
to be a piece of the puzzle|to be one part of a larger issue
to hit the nail on the head|to describe something exactly right
to pull someone's leg|to joke with someone
to be up in the air|to be undecided or uncertain
to bite off more than you can chew|to take on too much
to take something for granted|to not appreciate something properly
to be out of the blue|to happen unexpectedly
to keep your chin up|to stay positive during hard times`,
  },
  {
    id: "b2p16",
    title: "Cause & Effect",
    subtitle: "Connectors for reasons and results",
    kind: "pair",
    prompt: 'The connector "%s" is used to…',
    note: "B2-level connectors matched to how they signal cause or effect.",
    data: `because|give a direct reason for something
because of|introduce a noun reason
due to|introduce a noun reason, often formal
owing to|introduce a noun reason, formal
as a result of|show what caused something, formal
as a result|introduce the consequence of an action
consequently|show a formal, logical consequence
therefore|show a logical conclusion follows
thus|show a formal result, similar to therefore
hence|show a formal consequence, often written
so|show an everyday, simple result
which resulted in|link an event to its outcome, mid-sentence
which led to|link a cause to its eventual outcome
thanks to|give a positive reason for something
on account of|give a formal reason, similar to because of
in view of|introduce a reason that affects a decision
for this reason|refer back to a reason just given
as a consequence|introduce a formal result
accordingly|show a result that logically follows
that is why|give an informal reason in speech
given that|introduce a condition-like reason
seeing that|introduce an obvious reason, informal
in light of|introduce a reason based on new information
stemming from|show that something originates from a cause
triggered by|show what set off a sudden reaction or event`,
  },
  {
    id: "b2p17",
    title: "Phrasal Verbs II",
    subtitle: "Meaning match, everyday phrasal verbs",
    kind: "pair",
    prompt: 'The phrasal verb "%s" means…',
    note: "B2-level phrasal verbs beyond the basics.",
    data: `come across|to find something by chance
get away with|to avoid punishment for something
look into|to investigate something
put off|to postpone something
turn down|to refuse an offer
figure out|to understand or solve something
carry out|to perform or complete a task
bring up|to mention a topic
give up|to stop trying
hold on|to wait a moment
run into|to meet someone by chance
set up|to arrange or establish something
take after|to resemble a family member
work out|to solve a problem or exercise
break down|to stop functioning
call off|to cancel something
come up with|to think of an idea
cut down on|to reduce the amount of something
fall through|to fail to happen
get by|to manage with limited resources
go through with|to complete something as planned
keep up with|to stay at the same pace as others
look forward to|to feel excited about something future
point out|to draw attention to something
stand up for|to defend a person or belief`,
  },
  {
    id: "b2p18",
    title: "Mixed Conditionals",
    subtitle: "Past, present, and unreal combinations",
    kind: "cloze",
    note: "B2-level mixed conditional structures.",
    data: `If I ___ harder at school, I'd have a better job now.|had studied
If she weren't so busy, she ___ have missed the meeting.|wouldn't
If he had taken the job, he ___ be living abroad now.|would
If they ___ more careful, the accident wouldn't have happened.|had been
If I were you, I ___ have accepted the offer.|would
If she had left earlier, she ___ be stuck in traffic now.|wouldn't
If we hadn't missed the flight, we ___ be at the hotel now.|would
If he weren't so stubborn, he ___ have listened to us.|would
If I hadn't lost my job, I ___ be so stressed now.|wouldn't
If she were more confident, she ___ have taken the promotion.|would
If they had saved money, they ___ be able to travel now.|would
If I weren't allergic, I ___ have eaten the cake.|would
If he had trained harder, he ___ be a professional athlete now.|would
If we ___ checked the weather, we wouldn't be stuck in the rain.|had
If she hadn't quit, she ___ be the manager by now.|would
If I were rich, I ___ have bought that house last year.|would
If he ___ listened to advice, he wouldn't be in this mess now.|had
If they weren't so tired, they ___ have finished the project.|would
If I hadn't met her, my life ___ be very different now.|would
If she were taller, she ___ have made the basketball team.|would
If we had planned better, we ___ be so stressed right now.|wouldn't
If he weren't afraid of flying, he ___ have taken the job abroad.|would
If I ___ known about the traffic, I would have left earlier.|had
If she hadn't studied medicine, she ___ be a doctor today.|wouldn't
If they were more organised, they ___ have missed the deadline.|wouldn't`,
  },
  {
    id: "b2p19",
    title: "Wish & If Only",
    subtitle: "Expressing regret and desire",
    kind: "cloze",
    note: "B2-level wish structures.",
    data: `I wish I ___ more time to finish this project.|had
If only I ___ studied harder for the exam.|had
I wish she ___ stop interrupting me.|would
If only he ___ listen to advice sometimes.|would
I wish I ___ speak French fluently.|could
If only we ___ afford a bigger house.|could
I wish it ___ stop raining.|would
If only I ___ known about the meeting earlier.|had
I wish he ___ so careless with money.|weren't
If only she ___ here to see this.|were
I wish I ___ never said that to him.|had
If only they ___ listened to the warning.|had
I wish you ___ stop smoking.|would
If only I ___ taller.|were
I wish we ___ more time together.|had
If only he ___ apologise for what he did.|would
I wish I ___ that decision differently.|had made
If only she ___ more patient with the children.|were
I wish they ___ visit more often.|would
If only I ___ studied medicine instead.|had
I wish my neighbours ___ so noisy.|weren't
If only we ___ booked the tickets earlier.|had
I wish he ___ trust me more.|would
If only I ___ able to help you then.|had been
I wish this day ___ never end.|would`,
  },
  {
    id: "b2p20",
    title: "Food & Cooking",
    subtitle: "Kitchen vocabulary and techniques",
    kind: "cloze",
    note: "B2-level cooking vocabulary.",
    data: `You need to ___ the onions before adding them.|chop
Please ___ the sauce so it doesn't burn.|stir
The chef decided to ___ the vegetables instead of boiling them.|roast
You should ___ the meat before cooking it further.|marinate
Let the soup ___ for twenty minutes.|simmer
He likes to ___ the chicken until it's golden brown.|fry
You need to ___ the pastry before baking it.|roll
Add a pinch of salt to ___ the flavour.|enhance
The recipe says to ___ the oven to 200 degrees.|preheat
You should ___ the vegetables before serving.|steam
Let the dough ___ for an hour before baking.|rise
He likes to ___ fresh herbs over the dish.|sprinkle
You need to ___ the sauce until it thickens.|reduce
Please ___ the ingredients thoroughly.|combine
The recipe calls for you to ___ the garlic finely.|mince
You should ___ the meat before slicing it.|rest
He decided to ___ the vegetables on the grill.|grill
You need to ___ the excess fat from the pan.|drain
Add the spices to ___ the dish more flavour.|give
The chef used a whisk to ___ the eggs.|beat
You should ___ the cake before removing it from the tin.|cool
He likes to ___ the meat in breadcrumbs before frying.|coat
You need to ___ the vegetables into small pieces.|dice
Let the meat ___ overnight in the fridge.|chill
The sauce needs to ___ before you can serve it.|thicken`,
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
    prompt: '"%s" means:',
    note: "Idioms are fixed — the words can't be swapped.",
    data: `bite the bullet|accept something unpleasant
hit the nail on the head|be exactly right
under the weather|slightly unwell
a blessing in disguise|a hidden benefit
cut corners|do something cheaply or badly
on the fence|undecided
the ball is in your court|it's your decision
let the cat out of the bag|reveal a secret
break the ice|start a conversation
go the extra mile|make extra effort
throw in the towel|give up
a grey area|something unclear
call it a day|stop working
take it with a pinch of salt|be sceptical
back to square one|start again
in the long run|eventually
pull strings|use influence
the bottom line|the essential point
jump the gun|act too soon
sit on one's hands|do nothing
a steep learning curve|hard to learn quickly
touch base|make brief contact
move the goalposts|change the rules unfairly
play devil's advocate|argue the opposing view
cost an arm and a leg|be very expensive`,
  },
  {
    id: "c1p2",
    title: "Register",
    subtitle: "Informal → formal",
    kind: "pair",
    prompt: 'Formal equivalent of "%s":',
    note: "Academic and professional writing prefers Latinate verbs.",
    data: `find out|ascertain
get|obtain
help|assist
show|demonstrate
start|commence
end|terminate
need|require
tell|inform
ask for|request
put off|postpone
look at|examine
think about|consider
set up|establish
go up|increase
go down|decline
leave out|omit
deal with|address
point out|indicate
give up|relinquish
talk about|discuss
make up|constitute
cut down|reduce
bring about|induce
carry out|conduct
back up|corroborate`,
  },
  {
    id: "c1p3",
    title: "Inversion & Emphasis",
    subtitle: "Advanced structures",
    kind: "cloze",
    note: "Fronted negatives and adverbials trigger question word order.",
    data: `Never ___ I seen such chaos.|have
Rarely ___ she complain.|does
Not only ___ he late, he was rude.|was
Hardly ___ we arrived when it rained.|had
Under no circumstances ___ you leave.|should
Only then ___ I understand.|did
No sooner ___ he spoken than she left.|had
Little ___ they know the truth.|did
So loud ___ the music that we left.|was
Seldom ___ such talent appear.|does
Not until later ___ we hear the news.|did
Such ___ his anger that he shouted.|was
In no way ___ this acceptable.|is
Were ___ to leave, we'd struggle.|he
Had I ___ , I'd have helped.|known
Should you ___ questions, ask.|have
What I need ___ more time.|is
It ___ she who solved it.|was
Only by working together ___ we succeed.|can
Nowhere ___ the report mention costs.|does
On no account ___ the door be opened.|must
Scarcely ___ she begun when he interrupted.|had
Never before ___ this happened.|has
So rarely ___ it snow here.|does
Not once ___ he apologise.|did`,
  },
  {
    id: "c1p4",
    title: "Precision Connectors",
    subtitle: "Nuanced signposting",
    kind: "cloze",
    note: "Each connector carries a distinct logical relationship.",
    data: `The claim is plausible; ___ , evidence is thin.|that said
___ , the two datasets differ in scope.|Crucially
Sales rose, ___ modestly.|albeit
___ , the policy achieved its aim.|Broadly speaking
The theory holds ___ certain conditions.|under
___ , this contradicts earlier findings.|Notably
The results are, ___ , inconclusive.|at best
___ far as the data allows, we conclude X.|In so
___ , the mechanism remains unclear.|As yet
The method is robust; ___ , costly.|conversely
___ of the criticism, the model persists.|Regardless
His argument is sound ___ its premises.|given
___ , consider the counterexample.|By way of illustration
The findings, ___ preliminary, are promising.|though
___ , we assume linear growth.|For simplicity
The effect is small ___ statistically significant.|yet
___ , attention turns to causation.|Accordingly
The sample was small; ___ , caution is advised.|hence
___ speaking, the trend is upward.|Generally
This is true ___ in urban settings.|particularly
___ , the hypothesis was rejected.|Ultimately
The data ___ suggests a link.|arguably
___ this evidence, revision is needed.|In light of
The study is limited ___ its scope.|in terms of
___ , no consensus has emerged.|To date`,
  },
  {
    id: "c1p5",
    title: "Academic Verbs",
    subtitle: "Precise reporting verbs",
    kind: "pair",
    prompt: 'Which verb means "%s"?',
    note: "Reporting verbs encode your stance on a claim.",
    data: `state something as true without proof|assert
suggest indirectly|imply
provide evidence for|substantiate
weaken an argument|undermine
say something is caused by|attribute
present as an example|illustrate
question the validity of|challenge
express agreement with findings|corroborate
restate more clearly|clarify
soften a claim|qualify
draw out an implication|infer
set out systematically|delineate
compare to establish difference|differentiate
declare formally|posit
put forward for consideration|propose
examine in detail|scrutinise
reduce to essentials|distil
show to be false|refute
give approximate value|estimate
place in a category|classify
explain the reasons for|account for
bring together findings|synthesise
consider as a possibility|entertain
insist despite objection|maintain
support with authority|endorse`,
  },
  {
    id: "c1p6",
    title: "Hedging",
    subtitle: "Cautious academic language",
    kind: "cloze",
    note: "Hedging protects claims from overstatement.",
    data: `The results ___ suggest a correlation.|appear to
This ___ be attributed to sampling error.|may
The data ___ indicate causation.|do not necessarily
It ___ that the effect is small.|seems
The trend is ___ consistent.|broadly
Findings should be treated with ___ .|caution
There is ___ evidence of bias.|some
The link is ___ established.|not fully
It is ___ that the model oversimplifies.|possible
The effect was ___ negligible.|virtually
These figures are ___ estimates.|approximate
The theory is ___ contested.|widely
One ___ argue the opposite.|could
The sample ___ not be representative.|might
Results were ___ inconclusive.|largely
This ___ to support the hypothesis.|tends
The claim ___ further testing.|warrants
There ___ to be a threshold effect.|appears
Evidence is ___ at best.|suggestive
Conclusions remain ___ .|tentative
The pattern is ___ apparent.|only partly
It would be ___ to generalise.|premature
The difference is ___ significant.|marginally
Such readings are ___ open to dispute.|arguably
The mechanism is ___ understood.|poorly`,
  },
  {
    id: "c1p7",
    title: "Legal & Formal Documents",
    subtitle: "Contract and policy language",
    kind: "cloze",
    note: "Formal, legalistic register found in contracts, policies, and official notices.",
    data: `The tenant shall ___ the premises in good condition.|maintain
This agreement is ___ upon signature by both parties.|binding
The clause shall be ___ null and void if breached.|deemed
Either party may ___ this contract with 30 days' notice.|terminate
The company reserves the ___ to amend these terms.|right
All disputes shall be ___ by arbitration.|resolved
The parties hereby ___ to the following terms.|agree
This policy is ___ to change without prior notice.|subject
The signatory ___ that all information is accurate.|warrants
Failure to comply may result in immediate ___.|termination
The agreement shall remain in ___ for two years.|effect
Nothing herein shall be ___ as legal advice.|construed
The buyer shall ___ full payment within 14 days.|remit
This clause is ___ from the rest of the contract.|severable
The undersigned hereby ___ receipt of the goods.|acknowledges
The contract is governed by the ___ of this state.|laws
Any amendment must be made in ___.|writing
The company shall not be held ___ for delays.|liable
The parties agree to keep the terms ___.|confidential
This document shall ___ all prior agreements.|supersede
The recipient must ___ the terms before proceeding.|accept
The obligation shall ___ upon the successor entity.|pass
Each party shall bear its own ___ costs.|legal
The waiver shall not be ___ as a precedent.|interpreted
The clause takes ___ immediately upon execution.|force`,
  },
  {
    id: "c1p8",
    title: "Nuanced Character & Emotion",
    subtitle: "Precise personality vocabulary",
    kind: "pair",
    prompt: 'Which trait means "%s"?',
    note: "C1-level adjectives for describing character precisely.",
    data: `extremely careful with details|meticulous
boldly daring, sometimes reckless|audacious
refusing to change one's mind|obstinate
quick to notice small details|perceptive
excessively proud of oneself|conceited
easily annoyed or irritated|irascible
showing great attention to duty|conscientious
lacking confidence or self-esteem|insecure
unwilling to spend money|frugal
openly expressing one's feelings|candid
avoiding unnecessary risk|prudent
having a sharp, cutting wit|acerbic
easily influenced by others|impressionable
showing no emotion outwardly|impassive
tending to think the worst will happen|pessimistic
having strong, unshakeable opinions|dogmatic
quick to take offence|touchy
showing deep, genuine care|compassionate
lacking experience or worldliness|naive
skilled at avoiding difficulty|resourceful
overly critical of small faults|fastidious
reluctant to reveal information|reticent
having a calm, unshakeable temperament|imperturbable
excessively eager to please|obsequious
unpredictable and prone to sudden mood changes|capricious`,
  },
  {
    id: "c1p9",
    title: "Rhetoric & Persuasion",
    subtitle: "Argumentative language",
    kind: "cloze",
    note: "C1-level vocabulary for constructing a persuasive argument.",
    data: `The speaker made a ___ case for reform.|compelling
Her argument ___ on a single flawed assumption.|hinges
The evidence ___ against his claim.|militates
This point ___ the very heart of the debate.|strikes
The policy has been ___ criticised by experts.|widely
His speech was designed to ___ public opinion.|sway
The argument ___ down to a matter of values.|boils
She ___ her point with a striking example.|illustrated
The rhetoric was ___ but ultimately hollow.|persuasive
His claim does not ___ up to scrutiny.|stand
The debate ___ on questions of fairness.|turns
She skilfully ___ the opposing argument.|dismantled
The speech was carefully ___ to appeal to emotion.|crafted
His conclusion ___ naturally from the evidence.|follows
The argument gained ___ as more facts emerged.|traction
She ___ the audience with a powerful anecdote.|won over
The claim is ___ by a wealth of research.|substantiated
His tone ___ conviction rather than certainty.|conveyed
The counterargument ___ to address the core issue.|fails
She ___ her opponent's logic point by point.|unpicked
The rhetoric ___ more heat than light.|generated
His appeal was ___ rather than rational.|emotional
The argument ___ scrutiny remarkably well.|withstands
She ___ the audience's scepticism head-on.|addressed
The speech left little room for ___.|doubt`,
  },
  {
    id: "c1p10",
    title: "Scientific & Technical Prose",
    subtitle: "Precision in research writing",
    kind: "cloze",
    note: "C1-level vocabulary for describing scientific findings.",
    data: `The experiment was ___ under controlled conditions.|conducted
The results were ___ across multiple trials.|consistent
The hypothesis was ___ by the data.|supported
Researchers ___ a significant correlation.|observed
The findings ___ from earlier studies.|diverge
The sample size was ___ to ensure reliability.|sufficient
The variables were ___ carefully controlled.|meticulously
The study's ___ limits its generalisability.|scope
The data was ___ using standard statistical methods.|analysed
The results were ___ reproducible.|largely
The team ___ a novel methodology.|developed
The findings ___ implications for future research.|carry
The experiment was ___ due to funding cuts.|discontinued
The paper was ___ in a peer-reviewed journal.|published
The results ___ the initial hypothesis.|confirm
The methodology has since been ___ by other researchers.|adopted
The study's ___ have been widely debated.|conclusions
The data set was ___ for anomalies.|screened
The researchers ___ several confounding variables.|controlled for
The findings were ___ with caution.|presented
The experiment's ___ remains a subject of debate.|validity
The results were ___ statistically significant.|deemed
The team ___ their methodology in the appendix.|detailed
The study ___ a gap in the existing literature.|addresses
The conclusions are ___ by the limited sample.|constrained`,
  },
  {
    id: "c1p11",
    title: "Diplomatic Language",
    subtitle: "Softening and hedging in formal talk",
    kind: "cloze",
    note: "C1-level diplomatic phrasing for sensitive conversations.",
    data: `With all due ___, I have to disagree with that assessment.|respect
It might be ___ to reconsider the timing of this decision.|prudent
We would ___ appreciate a more detailed explanation.|greatly
Perhaps we could ___ this matter from a different angle.|approach
It's not entirely ___ that the plan will succeed.|clear
There are, ___, a few concerns we should address first.|however
We understand your ___, but the budget remains fixed.|position
It would be ___ to say the negotiations went smoothly.|generous
Let's not ___ this issue any further today.|belabour
We ___ acknowledge the difficulties this has caused.|fully
It might be worth ___ a compromise instead.|considering
We remain open to ___ should circumstances change.|discussion
While we ___ your concerns, the decision stands.|understand
It would be ___ to comment further at this stage.|premature
We'd like to ___ our gratitude for your patience.|express
There is, ___, room for further discussion.|admittedly
We should ___ from making any hasty judgements.|refrain
It may be ___ to revisit this proposal next quarter.|advisable
We ___ hope this matter can be resolved amicably.|sincerely
Let us ___ the matter with the care it deserves.|treat
It would be ___ to overstate the challenges ahead.|easy
We trust this explanation will ___ any confusion.|clear up
Some concerns, ___ valid, fall outside our remit.|while
We ___ that further consultation is required.|maintain
It is with some ___ that we must decline the offer.|reluctance`,
  },
  {
    id: "c1p12",
    title: "Idiomatic Expressions II",
    subtitle: "Meaning match, advanced idioms",
    kind: "pair",
    prompt: 'The idiom "%s" means…',
    note: "Advanced idioms beyond the basics.",
    data: `to jump on the bandwagon|to join something popular
to read between the lines|to understand hidden meaning
to bite the bullet|to accept something difficult
to burn bridges|to end a relationship badly
to see eye to eye|to agree completely
to go the extra mile|to make extra effort
to cut to the chase|to get to the point quickly
to hit the nail on the head|to be exactly right
to be on the same page|to have the same understanding
to throw in the towel|to give up
to keep someone at arm's length|to avoid becoming close
to have a change of heart|to change one's opinion
to be caught red-handed|to be caught doing something wrong
to take something with a grain of salt|to not fully believe it
to beat around the bush|to avoid speaking directly
to be a blessing in disguise|to seem bad but turn out good
to let the cat out of the bag|to reveal a secret
to go back to the drawing board|to start planning again
to raise the bar|to increase the standard expected
to be under the weather|to feel slightly unwell
to pull strings|to use influence to get something
to be a double-edged sword|to have both good and bad effects
to keep one's fingers crossed|to hope for good luck
to be at a crossroads|to face an important decision
to weather the storm|to survive a difficult period`,
  },
  {
    id: "c1p13",
    title: "Complex Passive & Causative",
    subtitle: "Advanced passive structures",
    kind: "cloze",
    note: "C1-level passive and causative constructions.",
    data: `The report is believed to have been ___ deliberately.|leaked
It is thought that the decision will be ___ soon.|reversed
The building is said to have been ___ in the 1920s.|designed
She had her car ___ while she was on holiday.|stolen
He got his proposal ___ by the board.|approved
The bridge is due to be ___ next year.|completed
It is rumoured that the company is planning ___.|layoffs
The contract is expected to be ___ by Friday.|signed
She had the documents ___ before the meeting.|translated
The changes are said to have ___ efficiency.|improved
He had his passport ___ at the embassy.|renewed
It is widely believed that the treaty will be ___.|ratified
The results are yet to be ___.|confirmed
She got her essay ___ before submitting it.|proofread
The suspect is alleged to have ___ the country.|fled
The proposal is being carefully ___ by the committee.|considered
It is understood that negotiations are ___.|ongoing
He had the roof ___ after the storm.|repaired
The findings are reported to have ___ researchers.|surprised
She had her application ___ by a lawyer.|reviewed
The policy is expected to be ___ next year.|revised
It is claimed that the figures were ___.|manipulated
He had the engine ___ before the long trip.|serviced
The event is scheduled to take ___ in June.|place
The data is believed to have been ___.|compromised`,
  },
  {
    id: "c1p14",
    title: "Formal Emails & Correspondence",
    subtitle: "Professional written English",
    kind: "cloze",
    note: "C1-level phrases for formal written communication.",
    data: `I am writing to ___ your attention to a recent issue.|draw
Please do not ___ to contact me if you need further information.|hesitate
I would be ___ if you could confirm receipt of this email.|grateful
With reference ___ our earlier conversation, I am attaching the report.|to
I ___ forward to hearing from you soon.|look
Please find ___ the requested documents.|attached
I am writing ___ behalf of the marketing department.|on
Should you have any questions, please do not hesitate to ___ out.|reach
I apologise ___ any inconvenience this may have caused.|for
We would like to ___ you for your continued support.|thank
I am ___ to inform you that your application has been successful.|pleased
Following ___ discussion, I have revised the proposal.|our
Please let me know if this ___ with your schedule.|fits
I trust this email finds you ___.|well
We ___ to inform you that the position has been filled.|regret
Kindly ___ me know your availability for next week.|let
I am writing to ___ up on my previous email.|follow
Please ___ this matter as a priority.|treat
I would appreciate it if you could ___ this at your earliest convenience.|address
We are ___ forward to a successful collaboration.|looking
Please accept our ___ apologies for the delay.|sincere
I am ___ that you found the presentation useful.|glad
Should circumstances ___, please inform us immediately.|change
We remain at your ___ should you require further assistance.|disposal
I look forward to your ___ response.|prompt`,
  },
  {
    id: "c1p15",
    title: "Nominalisation",
    subtitle: "Turning verbs into abstract nouns",
    kind: "pair",
    prompt: 'The noun form of "%s" is…',
    note: "C1-level nominalisation, common in academic and formal writing.",
    data: `to decide|decision
to argue|argument
to analyse|analysis
to conclude|conclusion
to assume|assumption
to describe|description
to explain|explanation
to suggest|suggestion
to develop|development
to require|requirement
to fail|failure
to succeed|success
to propose|proposal
to reduce|reduction
to improve|improvement
to discover|discovery
to expand|expansion
to achieve|achievement
to establish|establishment
to interpret|interpretation
to justify|justification
to maintain|maintenance
to produce|production
to recognise|recognition
to resolve|resolution`,
  },
  {
    id: "c1p16",
    title: "Cleft Sentences",
    subtitle: "Emphasis through structure",
    kind: "cloze",
    note: "C1-level cleft sentence structures for emphasis.",
    data: `___ was John who broke the vase, not me.|it
What I really need ___ a good night's sleep.|is
It was the manager ___ made the final decision.|who
What surprised me most ___ his honesty.|was
It was ___ in 1990 that the company was founded.|not
What we need to do ___ act quickly.|is
It was because of the delay ___ we missed the flight.|that
What annoys me most ___ people who are always late.|is
It ___ the weather that ruined our plans.|was
What she wants ___ a bit of peace and quiet.|is
It was only ___ that I realised my mistake.|later
What matters most to me ___ my family's happiness.|is
It was the teacher ___ noticed the problem first.|who
What I admire about her ___ her determination.|is
It was ___ during the meeting that he resigned.|not
What we found strange ___ his sudden silence.|was
It was the noise ___ woke everyone up.|that
What she really meant ___ something quite different.|was
It was not until later ___ we understood the plan.|that
What impressed the judges most ___ his confidence.|was
It ___ the traffic, not the weather, that delayed us.|was
What I regret most ___ not speaking up sooner.|is
It was her ___ who suggested the idea first.|colleague
What worries me ___ the lack of preparation.|is
It ___ exactly what I expected.|was`,
  },
  {
    id: "c1p17",
    title: "Collocations with Make, Do, Take & Have",
    subtitle: "Fixed verb-noun pairs",
    kind: "pair",
    prompt: 'Complete the collocation with "%s"…',
    note: "C1-level fixed collocations with common light verbs.",
    data: `make|a decision
make|an effort
make|a mistake
make|progress
make|a difference
do|homework
do|business
do|damage
do|research
do|a favour
take|responsibility
take|a risk
take|advantage
take|notice
take|a break
have|an argument
have|a conversation
have|an impact
have|a look
have|a chance
make|an impression
do|harm
take|action
have|doubts
make|arrangements`,
  },
  {
    id: "c1p18",
    title: "Euphemisms & Indirect Language",
    subtitle: "Softening sensitive topics",
    kind: "pair",
    prompt: 'The phrase "%s" is a polite way of saying…',
    note: "C1-level euphemisms for sensitive or blunt topics.",
    data: `to pass away|to die
to let someone go|to fire someone
between jobs|unemployed
economical with the truth|dishonest
pre-owned|second-hand
downsize|reduce staff numbers
in a delicate condition|pregnant
senior moment|forgetfulness
differently abled|disabled
economically disadvantaged|poor
correctional facility|prison
collateral damage|unintended harm
letting you go|firing you
put to sleep|euthanised
vertically challenged|short
a bit under the weather|slightly ill
of a certain age|older
enhanced interrogation|torture
negative growth|decline
downsized position|job cut
substance abuse|drug addiction
in between opportunities|currently without a job
not the sharpest tool in the shed|not very intelligent
letting nature take its course|not intervening medically
economical|cheap or stingy`,
  },
  {
    id: "c1p19",
    title: "Contrast & Concession",
    subtitle: "Advanced linking of opposing ideas",
    kind: "cloze",
    note: "C1-level connectors for contrast and concession.",
    data: `___ the heavy rain, the match went ahead as planned.|despite
The plan succeeded, ___ several early setbacks.|notwithstanding
___ he was exhausted, he kept working.|although
The project failed ___ the team's best efforts.|in spite of
He accepted the offer, ___ his initial doubts.|regardless of
The company thrived, ___ competitors struggled badly.|whereas
He stayed calm ___ his colleagues panicked.|while
The results were disappointing; ___, the team kept trying.|however
The setbacks were serious; ___, morale remained high.|nevertheless
The plan had flaws; it worked out well ___.|nonetheless
Sales were falling, ___ the company kept hiring.|yet
The risks were high; he took the job ___.|even so
It was a difficult year; profits rose, ___.|that said
He is, ___ talented, still very inexperienced.|albeit
___ the results are disappointing, we should continue.|granted that
The evidence is weak; it may, ___, still be true.|be that as it may
He was tired; he finished the race ___.|all the same
The rules are strict; ___, exceptions are sometimes made.|on the other hand
Critics say it failed; ___, sales figures suggest otherwise.|on the contrary
He apologised; ___, the damage had already been done.|for all that
The odds were against them; they pressed on ___.|still
The forecast was poor; ___, they went ahead with the trip.|in any case
___ appearances, the company was struggling.|contrary to
___ popular belief, the theory has been disproven.|contrary to what most think
Experts warned against it; they proceeded with the plan ___.|regardless`,
  },
  {
    id: "c1p20",
    title: "Academic Cohesion",
    subtitle: "Linking ideas across a text",
    kind: "cloze",
    note: "C1-level cohesive devices for academic writing.",
    data: `___ mentioned earlier, the results support the hypothesis.|as
The ___ point to consider is the sample size.|next
Having established this, we can now ___ to the next issue.|turn
This ___ raises further questions about the methodology.|finding
Building ___ this idea, the next chapter examines causation.|on
The ___ section will explore alternative explanations.|following
In ___ of the above, further research is needed.|light
To ___ up, the study has several key limitations.|sum
This leads us ___ to the question of validity.|onward
The ___ mentioned study supports this conclusion.|above
Broadly ___, the findings align with prior research.|speaking
This ___ ties in with the earlier discussion of ethics.|point
The argument outlined above rests upon ___ core assumptions.|three
Taking this ___ account, the results seem reliable.|into
The following ___ builds on the previous analysis.|section
This brings us ___ to the central argument.|back
The data ___ referred to can be found in the appendix.|previously
It is ___ to note the limitations of this approach.|worth
This ___ leads into a discussion of policy implications.|naturally
The ___ analysis reveals a clear pattern.|subsequent
As ___ in Table 2, the results vary by region.|shown
This ___ us to the final point of the discussion.|brings
The closing chapter will ___ these concerns in detail.|address
Consistent ___ with prior research, the findings confirm the theory.|with
In ___ words, the results were not as expected.|other`,
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
