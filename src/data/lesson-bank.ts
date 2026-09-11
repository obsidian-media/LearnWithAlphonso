import type { Lesson, Question, Unit } from "./curriculum";
import type { Level } from "./levels";

/**
 * Compact content bank. Each pack holds 25 items written as terse lines;
 * the generator below expands them into 5-question lessons and groups
 * lessons into units, giving 30 generated lessons per CEFR band.
 */

type Pack = {
  id: string;
  title: string;
  subtitle: string;
  note: string;
  /** "pair" lines: "left|right" — prompt asks for the right side. */
  kind: "pair" | "cloze";
  /** prompt template for pair packs, `%s` is the left side. */
  prompt?: string;
  data: string;
};

const A1: Pack[] = [
  {
    id: "a1p1", title: "Plurals", subtitle: "Singular → plural", kind: "pair",
    prompt: "Plural of \"%s\":", note: "Irregular and spelling-change plurals must be memorised.",
    data: `child|children
man|men
woman|women
person|people
foot|feet
tooth|teeth
mouse|mice
goose|geese
knife|knives
leaf|leaves
wife|wives
shelf|shelves
city|cities
baby|babies
party|parties
box|boxes
watch|watches
bus|buses
dish|dishes
potato|potatoes
photo|photos
sheep|sheep
fish|fish
half|halves
life|lives`,
  },
  {
    id: "a1p2", title: "To Be & Present Simple", subtitle: "Core verb forms", kind: "cloze",
    note: "Match the verb form to the subject.",
    data: `I ___ a student.|am
She ___ my sister.|is
They ___ at home.|are
He ___ to work by bus.|goes
We ___ English every day.|study
It ___ cold today.|is
My parents ___ teachers.|are
She ___ coffee in the morning.|drinks
I ___ like spicy food.|don't
He ___ not live here.|does
___ you from Spain?|Are
___ she speak French?|Does
The keys ___ on the table.|are
Tom ___ football on Sundays.|plays
I ___ two brothers.|have
She ___ a car.|has
We ___ not ready.|are
___ it your birthday?|Is
They ___ breakfast at seven.|have
He ___ up at six.|gets
The shop ___ at nine.|opens
Birds ___ south in winter.|fly
My phone ___ working.|isn't
You ___ right.|are
She ___ in London.|lives`,
  },
  {
    id: "a1p3", title: "Opposites", subtitle: "Everyday adjectives", kind: "pair",
    prompt: "Opposite of \"%s\":", note: "Learning adjectives in pairs doubles your vocabulary.",
    data: `big|small
hot|cold
old|young
fast|slow
happy|sad
easy|difficult
cheap|expensive
early|late
open|closed
clean|dirty
full|empty
light|heavy
near|far
strong|weak
long|short
wet|dry
loud|quiet
right|wrong
rich|poor
soft|hard
new|old
high|low
safe|dangerous
same|different
first|last`,
  },
  {
    id: "a1p4", title: "Time & Place", subtitle: "Basic prepositions", kind: "cloze",
    note: "Use in for months/years, on for days/dates, at for clock times.",
    data: `The meeting is ___ Monday.|on
I was born ___ 1998.|in
We eat ___ seven o'clock.|at
The cat is ___ the table.|under
She lives ___ Paris.|in
Put the book ___ the shelf.|on
I'll see you ___ the weekend.|at
The shop is ___ the bank.|next to
He arrives ___ May.|in
We meet ___ Friday evening.|on
The bus stops ___ the corner.|at
There is a picture ___ the wall.|on
The keys are ___ my bag.|in
She sits ___ me in class.|beside
The plane flies ___ the clouds.|above
Walk ___ the bridge.|across
The dog is ___ the door.|behind
Come ___ the room.|into
We travel ___ train.|by
The party is ___ midnight.|at
I study ___ the morning.|in
The cafe is ___ the station.|opposite
He is ___ holiday.|on
The ball rolled ___ the hill.|down
She waited ___ the rain.|in`,
  },
  {
    id: "a1p5", title: "Everyday Verbs", subtitle: "Verb + noun pairs", kind: "pair",
    prompt: "Which verb goes with \"%s\"?", note: "English fixes certain verbs to certain nouns.",
    data: `a shower|take
breakfast|have
homework|do
a photo|take
a mistake|make
the bus|catch
music|listen to
TV|watch
a question|ask
money|spend
friends|make
a bike|ride
the dishes|wash
your teeth|brush
a nap|take
a decision|make
the shopping|do
a language|speak
a letter|write
the piano|play
a bed|make
a cold|catch
a party|throw
attention|pay
care|take`,
  },
  {
    id: "a1p6", title: "Questions", subtitle: "Question words", kind: "cloze",
    note: "Choose the question word that matches the answer you want.",
    data: `___ is your name?|What
___ do you live?|Where
___ are you late?|Why
___ does the film start?|When
___ is that woman?|Who
___ much is the ticket?|How
___ book is this?|Whose
___ colour do you like?|Which
___ old are you?|How
___ are you going?|Where
___ many people came?|How
___ is your favourite singer?|Who
___ time is it?|What
___ often do you exercise?|How
___ do you get to work?|How
___ is the meeting about?|What
___ did you choose that one?|Why
___ one is cheaper?|Which
___ far is the beach?|How
___ are you free?|When
___ told you that?|Who
___ is the problem?|What
___ long does it take?|How
___ bag is on the chair?|Whose
___ do we start?|When`,
  },
  {
    id: "a1p7", title: "Family & People", subtitle: "Male → female counterparts", kind: "pair",
    prompt: "Female form of \"%s\":", note: "Many family and role words change form by gender in English.",
    data: `father|mother
brother|sister
son|daughter
husband|wife
uncle|aunt
nephew|niece
grandfather|grandmother
boy|girl
man|woman
king|queen
prince|princess
actor|actress
waiter|waitress
host|hostess
hero|heroine
groom|bride
gentleman|lady
godfather|godmother
grandson|granddaughter
stepfather|stepmother
father-in-law|mother-in-law
landlord|landlady
widower|widow
duke|duchess
salesman|saleswoman`,
  },
  {
    id: "a1p8", title: "Food & Drink", subtitle: "Everyday meals", kind: "cloze",
    note: "High-frequency food vocabulary used in daily conversation.",
    data: `I'd like a cup of ___, please.|coffee
Can I have some ___ with my tea?|milk
We had ___ and eggs for breakfast.|bacon
She ordered a bowl of ___ soup.|tomato
Pass the ___ and pepper, please.|salt
I'll have a slice of ___ bread.|brown
Would you like some ___ on your salad?|dressing
He always has ___ for dessert.|cake
Can we get the ___ for the table?|menu
I'm allergic to ___.|peanuts
She drinks ___ juice every morning.|orange
We need more ___ for the sandwiches.|cheese
Could you pass the ___ for my tea?|sugar
Let's order a ___ of pizza to share.|slice
He spread some ___ on his toast.|jam
I prefer ___ tea to green tea.|black
Could I have the bill, or the ___?|check
This restaurant is famous for its ___.|steak
She's a vegetarian, so no ___ for her.|meat
We ran out of ___ for breakfast.|bread
This dish needs a squeeze of ___.|lemon
He always orders his steak ___.|rare
Could we split the ___ between us?|bill
This cake is made with real ___.|butter
Would you like ___ or sparkling water?|still`,
  },
  {
    id: "a1p9", title: "Clothes & Colours", subtitle: "What people wear", kind: "cloze",
    note: "Common clothing vocabulary with colour adjectives.",
    data: `She's wearing a red ___.|dress
He always wears a black ___.|jacket
I need new ___ for winter.|boots
Put on your ___ before you go out.|coat
These ___ are too tight.|jeans
She bought a blue ___ for work.|shirt
He wears ___ to bed.|pyjamas
I can't find my left ___.|sock
It's cold — wear a ___.|scarf
She never leaves home without her ___.|sunglasses
He wore a ___ to the wedding.|suit
These shoes have a broken ___.|lace
I like your green ___.|sweater
She wears a ___ on her wrist.|watch
He always carries a leather ___.|bag
Take your ___ — it might rain.|umbrella
She wore a yellow ___ to the party.|hat
He loosened his ___ after a long day.|tie
I need to buy new ___ for the gym.|shorts
She wore a white ___ under her jacket.|blouse
He put on his ___ before the run.|trainers
These ___ don't match my shoes.|socks
She tied her hair back with a ___.|ribbon
He rolled up his ___.|sleeves
I ironed my ___ this morning.|trousers`,
  },
  {
    id: "a1p10", title: "Weather & Seasons", subtitle: "Talking about the sky", kind: "cloze",
    note: "Basic weather vocabulary and seasonal expressions.",
    data: `It's very ___ today — take an umbrella.|rainy
The sky is ___ and blue.|clear
It's ___ outside, so wear a coat.|cold
There's a strong ___ blowing today.|wind
It ___ heavily all night.|rained
The forecast says it will ___ tomorrow.|snow
Summer is the ___ season of the year.|hottest
In autumn, the leaves turn ___.|brown
It's very ___ today — over thirty degrees.|hot
The ___ is out, so let's go to the beach.|sun
There was a loud ___ during the storm.|thunder
It's ___ this morning — I can barely see.|foggy
Winter in this city is very ___.|harsh
The temperature dropped ___ overnight.|suddenly
Spring brings warmer ___ and flowers.|weather
It's ___ outside — the ground is icy.|freezing
A ___ crossed the sky before the rain.|cloud
We had a picnic on a ___ day.|sunny
The ___ made it hard to drive.|fog
The sky turned dark before the ___ began.|storm
It's too ___ to go swimming today.|windy
The ___ melted quickly in the sun.|ice
Autumn is also called ___ in American English.|fall
It's a ___ day, perfect for a walk.|mild
Bring a jacket — it's ___ this evening.|chilly`,
  },
  {
    id: "a1p11", title: "Numbers & Money", subtitle: "Prices and quantities", kind: "cloze",
    note: "Everyday number and money vocabulary.",
    data: `This shirt costs ___ dollars.|twenty
Can I pay in ___ instead of cash?|coins
I'd like to ___ some money from the machine.|withdraw
The bill comes to ___ euros.|fifteen
Could you ___ this note, please?|change
I need to ___ some money for the trip.|save
She ___ ten dollars on the gift.|spent
He asked for a ___ on the price.|discount
This costs ___ than I expected.|more
Do you have ___ change for a ten?|exact
The total is ___ pounds and fifty pence.|three
I paid by ___, not cash.|card
Could I get a ___ for this purchase?|receipt
The price includes ___.|tax
She counted the ___ carefully.|money
I only have a few ___ left.|notes
He borrowed ___ dollars from his brother.|fifty
The shop only accepts ___ payments.|contactless
We split the bill ___.|equally
I forgot my ___ at home.|wallet
The item is on ___ this week.|sale
She saved ___ money for college.|enough
The price went ___ last month.|up
He paid the ___ in full.|amount
I need to check my bank ___.|balance`,
  },
  {
    id: "a1p12", title: "Jobs & Occupations", subtitle: "What people do", kind: "pair",
    prompt: "Someone who \"%s\" is a…", note: "Common job titles matched to their main duty.",
    data: `teaches students|teacher
treats sick people|doctor
cooks food in a restaurant|chef
flies a plane|pilot
fixes cars|mechanic
delivers letters|postman
puts out fires|firefighter
defends the law|lawyer
builds houses|builder
cuts hair|hairdresser
serves food in a restaurant|waiter
designs buildings|architect
grows crops|farmer
sells goods in a shop|shopkeeper
catches criminals|police officer
writes news stories|journalist
looks after teeth|dentist
drives a taxi|taxi driver
takes care of patients|nurse
paints houses|painter
manages a company|manager
repairs pipes|plumber
programs computers|programmer
cleans buildings|cleaner
delivers babies|midwife`,
  },
  {
    id: "a1p13", title: "Animals", subtitle: "Pets and wild animals", kind: "pair",
    prompt: "This animal is a…", note: "Common animals, from pets to farm and wild species.",
    data: `barks and wags its tail|dog
says meow|cat
gives us milk|cow
lays eggs and clucks|hen
hops and has long ears|rabbit
is the king of the jungle|lion
has a long trunk|elephant
is very tall with a long neck|giraffe
lives in water and has fins|fish
can fly and has feathers|bird
is slow and carries a shell|turtle
says quack|duck
is pink and says oink|pig
has stripes like a cat|tiger
climbs trees and eats bananas|monkey
is black and white and eats bamboo|panda
hops on strong back legs|kangaroo
is a very large grey animal with tusks|elephant seal
lives in a hive and makes honey|bee
spins a web|spider
is a fast desert animal with a hump|camel
swims and is the largest animal|whale
has a shell and moves slowly|snail
barks like a dog but is wild|fox
flies at night and sleeps upside down|bat`,
  },
  {
    id: "a1p14", title: "Days, Months & Time", subtitle: "Everyday time expressions", kind: "cloze",
    note: "Days of the week, months, and simple time phrases.",
    data: `The first day of the school week is ___.|Monday
The last day of the weekend is ___.|Sunday
Christmas is in the month of ___.|December
The shortest month of the year is ___.|February
We eat lunch in the ___.|afternoon
We usually sleep at ___.|night
There are seven days in a ___.|week
There are twelve ___ in a year.|months
My birthday is in the month of ___.|July
The clock shows what ___ it is.|time
I wake up early in the ___.|morning
The first month of the year is ___.|January
Halloween is celebrated in ___.|October
We go to work on weekday ___, not weekends.|mornings
A year has three hundred and sixty-five ___.|days
The day after Friday is ___.|Saturday
Summer holidays often start in ___.|June
The day before Wednesday is ___.|Tuesday
New Year's Eve is on the last day of the ___.|year
There are sixty minutes in an ___.|hour
There are sixty seconds in a ___.|minute
The middle day of the week is ___.|Wednesday
Valentine's Day is celebrated with cards and ___.|flowers
We often relax on the ___.|weekend
The day after Thursday is ___.|Friday`,
  },
];

const A2: Pack[] = [
  {
    id: "a2p1", title: "Irregular Past", subtitle: "Base → past simple", kind: "pair",
    prompt: "Past simple of \"%s\":", note: "Irregular verbs don't take -ed.",
    data: `go|went
eat|ate
buy|bought
bring|brought
think|thought
teach|taught
catch|caught
see|saw
take|took
give|gave
write|wrote
drive|drove
speak|spoke
break|broke
choose|chose
know|knew
grow|grew
fly|flew
begin|began
drink|drank
swim|swam
run|ran
sit|sat
win|won
leave|left`,
  },
  {
    id: "a2p2", title: "Talking About the Past", subtitle: "Past tenses in use", kind: "cloze",
    note: "Past simple for finished events; past continuous for background action.",
    data: `I ___ to the cinema yesterday.|went
She ___ cooking when I arrived.|was
They ___ not come to the party.|did
While we ___ , the phone rang.|were talking
He ___ his keys last night.|lost
___ you enjoy the concert?|Did
We ___ living in Rome then.|were
The film ___ at eight.|started
I ___ tired, so I left.|was
She ___ used to smoke.|didn't
It ___ raining all morning.|was
They ___ married in 2015.|got
He ___ never late before.|was
I ___ my homework before dinner.|finished
The children ___ in the garden.|were playing
We ___ hear anything.|didn't
She ___ the door quietly.|closed
What ___ you doing at six?|were
The train ___ on time.|arrived
He ___ used to walk to school.|used
Nobody ___ what to say.|knew
I ___ reading when she called.|was
They ___ a great time.|had
The lights ___ out suddenly.|went
She ___ born in Lisbon.|was`,
  },
  {
    id: "a2p3", title: "Comparatives", subtitle: "Adjective → comparative", kind: "pair",
    prompt: "Comparative of \"%s\":", note: "Short adjectives add -er; long ones take \"more\".",
    data: `big|bigger
hot|hotter
happy|happier
easy|easier
good|better
bad|worse
far|further
expensive|more expensive
beautiful|more beautiful
thin|thinner
early|earlier
busy|busier
safe|safer
large|larger
simple|simpler
careful|more careful
tired|more tired
funny|funnier
heavy|heavier
modern|more modern
narrow|narrower
polite|more polite
quiet|quieter
strange|stranger
useful|more useful`,
  },
  {
    id: "a2p4", title: "Out & About", subtitle: "Shopping and travel", kind: "cloze",
    note: "Fixed travel and shopping phrases.",
    data: `Can I ___ this on?|try
I'd like to ___ a room.|book
Could I have the ___ , please?|bill
How much ___ this cost?|does
Do you ___ by card?|take
Where do I ___ my luggage?|check in
The train ___ from platform 4.|departs
I'd like a ___ ticket, please.|return
Is this seat ___ ?|taken
Can you ___ me the way to the museum?|show
I'm just ___ , thanks.|looking
Do you have this in a bigger ___ ?|size
I'd like to ___ this jacket.|return
What time is ___ out?|check
Excuse me, is there a ___ near here?|cash machine
The flight has been ___ .|delayed
Could you ___ that down for me?|write
I'd like to ___ some money.|change
Are you ___ in the queue?|next
Can I get a ___ to the airport?|taxi
This shirt doesn't ___ me.|fit
We're ___ of stock.|out
I'll ___ it, thanks.|take
Where can I ___ the bus?|catch
The hotel ___ breakfast.|includes`,
  },
  {
    id: "a2p5", title: "How Much, How Many", subtitle: "Quantifiers", kind: "cloze",
    note: "Countable nouns take many/few; uncountable nouns take much/little.",
    data: `How ___ sugar do you want?|much
How ___ people came?|many
There isn't ___ milk left.|much
I have a ___ questions.|few
She has ___ money.|little
There are ___ chairs here.|enough
We need ___ more bread.|some
Are there ___ tickets left?|any
He drinks too ___ coffee.|much
Only a ___ of us knew.|few
I don't have ___ time.|much
There's ___ of space.|plenty
___ of the students passed.|Most
She ate the ___ cake.|whole
Would you like ___ tea?|some
I bought ___ apples.|several
There's hardly ___ juice.|any
We have ___ homework tonight.|lots of
He owns ___ books.|many
Add a ___ of salt.|pinch
I need ___ information.|more
There were ___ few chairs.|too
Both ___ them agreed.|of
Neither ___ us was ready.|of
She has ___ friends here.|no`,
  },
  {
    id: "a2p6", title: "Future Forms", subtitle: "Will, going to, present continuous", kind: "cloze",
    note: "\"Will\" for decisions now, \"going to\" for plans, present continuous for arrangements.",
    data: `I think it ___ rain.|will
We ___ going to move house.|are
She ___ meeting Tom at six.|is
___ you help me, please?|Will
I'm ___ to study medicine.|going
The train ___ at ten tomorrow.|leaves
They ___ probably be late.|will
Look at those clouds — it's ___ to storm.|going
I ___ have the soup, please.|will
What ___ you doing tonight?|are
He ___ be twenty next month.|will
We're ___ dinner at eight.|having
I promise I ___ tell anyone.|won't
She's ___ to look for a new job.|going
The film ___ at nine.|starts
___ we take a taxi?|Shall
By June I ___ have finished.|will
I'm not ___ to argue.|going
Perhaps they ___ come later.|will
He's ___ his exam on Friday.|taking
It ___ be easy, I'm afraid.|won't
We ___ going to need help.|are
I ___ call you when I arrive.|will
She ___ flying to Rome tomorrow.|is
Nobody ___ notice.|will`,
  },
  {
    id: "a2p7", title: "House & Home", subtitle: "Rooms and furniture", kind: "cloze",
    note: "Everyday vocabulary for describing where you live.",
    data: `We cook dinner in the ___.|kitchen
I keep my clothes in the ___.|wardrobe
She's watching TV in the ___.|living room
He's brushing his teeth in the ___.|bathroom
Put the plates in the ___.|cupboard
We sleep in the ___.|bedroom
There's a nice garden behind the ___.|house
I left my keys on the ___.|table
She sat down on the ___ to relax.|sofa
Hang your coat on the ___.|hook
We eat breakfast in the ___.|dining room
He's fixing a shelf in the ___.|garage
The washing machine is in the ___.|laundry room
Open the ___ to let some air in.|window
Please close the ___ when you leave.|door
We keep the car in the ___.|driveway
The stairs lead up to the ___.|attic
She's watering the plants in the ___.|garden
He's cleaning the ___ before guests arrive.|hallway
The bed has a soft ___.|mattress
Turn off the ___ before you sleep.|light
We're renting a small ___ downtown.|flat
The ___ needs painting.|ceiling
I store old boxes in the ___.|basement
Please wipe your feet on the ___.|mat`,
  },
  {
    id: "a2p8", title: "Sport & Hobbies", subtitle: "Free-time activities", kind: "pair",
    prompt: "Which sport or hobby uses \"%s\"?", note: "Match the equipment or place to the activity.",
    data: `a racket|tennis
a ball and hoop|basketball
a board and wheels|skateboarding
a net and ball|volleyball
a pool|swimming
a track|running
a helmet and bike|cycling
a bat and ball|cricket
gloves and a ring|boxing
skis and snow|skiing
a rod and hook|fishing
a needle and thread|sewing
a canvas and brush|painting
a camera|photography
clay and a wheel|pottery
a deck of cards|card games
a chessboard|chess
a guitar|music
a needle and yarn|knitting
a court and net|badminton
a climbing wall|climbing
a yoga mat|yoga
a set of clubs|golf
a rowing boat|rowing
a garden and seeds|gardening`,
  },
  {
    id: "a2p9", title: "Body & Health", subtitle: "Illness and doctor visits", kind: "cloze",
    note: "Basic health vocabulary for describing how you feel.",
    data: `I have a bad ___ and can't stop coughing.|cold
She's got a ___ — take some painkillers.|headache
My ___ hurts after running.|leg
He broke his ___ playing football.|arm
I feel ___ — I need to sit down.|dizzy
She has a ___ — please be quiet.|migraine
My ___ is sore from shouting.|throat
He's got a high ___.|temperature
I twisted my ___ on the stairs.|ankle
She's allergic to ___.|nuts
The doctor gave me some ___.|medicine
I need to make a ___ appointment.|dentist
My ___ hurts when I chew.|tooth
He's been ___ since Monday.|sick
She fainted because she felt ___.|faint
I cut my ___ while cooking.|finger
The nurse checked my ___.|pulse
He needs to rest his ___ leg.|injured
I have a ___ stomach.|upset
She's recovering from a ___ .|fever
My back ___ after lifting the box.|hurts
He's got a nasty ___ on his knee.|bruise
I should see a doctor about my ___.|cough
She sprained her ___ at the gym.|wrist
The pharmacist recommended this ___ for allergies.|spray`,
  },
  {
    id: "a2p10", title: "Superlatives", subtitle: "Adjective → superlative", kind: "pair",
    prompt: "Superlative of \"%s\":", note: "Short adjectives take -est; long ones take \"most\".",
    data: `big|biggest
hot|hottest
happy|happiest
easy|easiest
good|best
bad|worst
far|furthest
expensive|most expensive
beautiful|most beautiful
thin|thinnest
early|earliest
busy|busiest
safe|safest
large|largest
simple|simplest
careful|most careful
tired|most tired
funny|funniest
heavy|heaviest
modern|most modern
narrow|narrowest
polite|most polite
quiet|quietest
strange|strangest
useful|most useful`,
  },
  {
    id: "a2p11", title: "At the Restaurant", subtitle: "Ordering and dining out", kind: "cloze",
    note: "Common phrases for eating out.",
    data: `Could I see the ___, please?|menu
I'd like to ___ a table for two.|book
Are you ready to ___?|order
I'll ___ the chicken, please.|have
Could we have the ___ when you're ready?|bill
Is service ___ in the price?|included
Do you have any ___ dishes for people who don't eat meat?|vegetarian
I'm allergic to ___, so no peanuts please.|nuts
Could I get some tap ___ as well?|water
The ___ recommended the fish today.|waiter
We're just ___ a table for now, not ready to order.|looking
Could you bring some more ___, please?|bread
I'd like my steak ___, not too well done.|medium
Is there a ___ menu for the children?|kids
Can I pay by ___ card?|credit
We'd like to sit by the ___, please.|window
This soup is ___ hot, be careful.|very
Could we get some extra ___ for the fries?|ketchup
The ___ was excellent tonight, please thank the chef.|meal
I'll have the same ___ as my friend.|dish
Do you take ___ or only cash?|cards
Could you box this up, we'd like a ___ bag?|doggy
The restaurant was fully ___, so we waited outside.|booked
Please leave a ___ for the staff if service was good.|tip
Enjoy your ___!|dinner`,
  },
  {
    id: "a2p12", title: "Adverbs of Frequency", subtitle: "How often things happen", kind: "pair",
    prompt: "How often does \"%s\" happen?", note: "Frequency adverbs matched to how often they mean.",
    data: `always|every single time, without exception
usually|the great majority of the time
normally|as a rule, under typical conditions
generally|in most cases you'll find
frequently|on many separate occasions
often|quite a lot, many times
regularly|at fixed, repeated intervals
sometimes|on certain occasions but not most
occasionally|now and then, but not often
periodically|at intervals, coming and going
now and then|every so often, casually
once in a while|not very often, infrequently
from time to time|at scattered, irregular moments
seldom|only rarely, not very often
rarely|very infrequently indeed
hardly ever|almost never at all
scarcely ever|barely ever, close to never
barely ever|almost not at all
infrequently|not often, with gaps between
never|not on any occasion, ever
constantly|without stopping, all the time
continually|again and again over time
repeatedly|one time after another
routinely|as part of a fixed routine
habitually|out of a settled habit`,
  },
];

const B1: Pack[] = [
  {
    id: "b1p1", title: "Phrasal Verbs", subtitle: "Meaning match", kind: "pair",
    prompt: "\"%s\" means:", note: "Phrasal verbs rarely mean the sum of their parts.",
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
    id: "b1p2", title: "Conditionals", subtitle: "If-clauses", kind: "cloze",
    note: "First conditional: if + present, will. Second: if + past, would.",
    data: `If it rains, we ___ stay home.|will
If I ___ rich, I'd travel.|were
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
    id: "b1p3", title: "Modal Verbs", subtitle: "Obligation, advice, possibility", kind: "cloze",
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
    id: "b1p4", title: "Perfect Tenses", subtitle: "Present perfect vs past", kind: "cloze",
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
    id: "b1p5", title: "Work & Opinions", subtitle: "Natural collocations", kind: "pair",
    prompt: "Which word completes \"%s\"?", note: "Collocations make speech sound natural.",
    data: `make a ___ (job application)|application
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
    id: "b1p6", title: "Relative Clauses", subtitle: "Who, which, that, whose", kind: "cloze",
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
    id: "b1p7", title: "Travel & Tourism", subtitle: "Getting around abroad", kind: "cloze",
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
    id: "b1p8", title: "Feelings & Emotions", subtitle: "Adjective ↔ noun forms", kind: "pair",
    prompt: "Noun form of \"%s\":", note: "Emotion adjectives and their matching nouns.",
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
    id: "b1p9", title: "Money & Shopping", subtitle: "Banking and budgeting", kind: "cloze",
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
    id: "b1p10", title: "Environment", subtitle: "Talking about the planet", kind: "cloze",
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
    id: "b1p11", title: "Education & Learning", subtitle: "School, study and exams", kind: "cloze",
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
    id: "b1p12", title: "Describing Trends", subtitle: "Talking about graphs and change", kind: "cloze",
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
];

const B2: Pack[] = [
  {
    id: "b2p1", title: "The Passive", subtitle: "Passive structures", kind: "cloze",
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
    id: "b2p2", title: "Confusable Words", subtitle: "Choose precisely", kind: "pair",
    prompt: "Which fits: \"%s\"?", note: "These pairs are frequently mixed up by learners.",
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
    id: "b2p3", title: "Linking Ideas", subtitle: "Discourse markers", kind: "cloze",
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
    id: "b2p4", title: "Reported Speech", subtitle: "Backshift and reporting verbs", kind: "cloze",
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
    id: "b2p5", title: "Strong Collocations", subtitle: "Natural word partners", kind: "pair",
    prompt: "Which word pairs with \"%s\"?", note: "Advanced fluency lives in collocation.",
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
    id: "b2p6", title: "Word Formation", subtitle: "Verb → noun", kind: "pair",
    prompt: "Noun form of \"%s\":", note: "Suffix patterns are predictable once learned.",
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
    id: "b2p7", title: "Reporting & Hedging", subtitle: "Report what was said", kind: "cloze",
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
He complained ___ the noise.|about
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
    id: "b2p8", title: "Collocations", subtitle: "Words that go together", kind: "pair",
    prompt: "Complete: \"%s ___\"", note: "Natural English depends on the right partner word.",
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
    id: "b2p9", title: "Health & Medicine", subtitle: "Describing symptoms and care", kind: "cloze",
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
    id: "b2p10", title: "Technology & Media", subtitle: "Talking about devices and news", kind: "cloze",
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
    id: "b2p11", title: "Business & Negotiation", subtitle: "Deals and workplace talk", kind: "cloze",
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
    id: "b2p12", title: "Crime & Law", subtitle: "Reporting incidents", kind: "cloze",
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
    id: "b2p13", title: "Politics & Society", subtitle: "Government and public debate", kind: "cloze",
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
    id: "b2p14", title: "Arts & Culture", subtitle: "Museums, film and performance", kind: "cloze",
    note: "B2-level vocabulary for discussing the arts.",
    data: `The gallery is hosting an ___ of modern sculpture.|exhibition
The film received ___ reviews from critics.|mixed
The novel was later ___ into a successful film.|adapted
The orchestra gave a ___ performance last night.|stunning
The museum's new wing displays ___ artefacts.|ancient
The play explores themes of loss and ___.|identity
Tickets for the concert sold out within ___.|minutes
The director is known for his unique visual ___.|style
The choreography was both bold and ___.|graceful
The exhibition features works by local ___.|artists
The band's latest album was a huge commercial ___.|success
Critics praised the film's stunning ___.|cinematography
The theatre company is famous for its innovative ___.|productions
The painting sold at auction for a record ___.|price
The festival celebrates classical and contemporary ___.|music
The actor gave a deeply moving ___.|performance
The sculpture was carved from a single block of ___.|marble
The author's latest book explores modern ___.|society
The gallery curator selected pieces that challenge ___.|perception
The documentary sheds light on an overlooked ___ movement.|artistic
The opera house is renowned for its stunning ___.|acoustics
The mural depicts the city's rich cultural ___.|heritage
The critics called the performance a true work of ___.|art
The exhibition runs until the end of the ___.|month
The novel won several literary ___ this year.|awards`,
  },
];

const C1: Pack[] = [
  {
    id: "c1p1", title: "Idioms", subtitle: "Meaning match", kind: "pair",
    prompt: "\"%s\" means:", note: "Idioms are fixed — the words can't be swapped.",
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
    id: "c1p2", title: "Register", subtitle: "Informal → formal", kind: "pair",
    prompt: "Formal equivalent of \"%s\":", note: "Academic and professional writing prefers Latinate verbs.",
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
    id: "c1p3", title: "Inversion & Emphasis", subtitle: "Advanced structures", kind: "cloze",
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
    id: "c1p4", title: "Precision Connectors", subtitle: "Nuanced signposting", kind: "cloze",
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
    id: "c1p5", title: "Academic Verbs", subtitle: "Precise reporting verbs", kind: "pair",
    prompt: "Which verb means \"%s\"?", note: "Reporting verbs encode your stance on a claim.",
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
    id: "c1p6", title: "Hedging", subtitle: "Cautious academic language", kind: "cloze",
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
    id: "c1p7", title: "Legal & Formal Documents", subtitle: "Contract and policy language", kind: "cloze",
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
    id: "c1p8", title: "Nuanced Character & Emotion", subtitle: "Precise personality vocabulary", kind: "pair",
    prompt: "Which trait means \"%s\"?", note: "C1-level adjectives for describing character precisely.",
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
    id: "c1p9", title: "Rhetoric & Persuasion", subtitle: "Argumentative language", kind: "cloze",
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
    id: "c1p10", title: "Scientific & Technical Prose", subtitle: "Precision in research writing", kind: "cloze",
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
    id: "c1p11", title: "Diplomatic Language", subtitle: "Softening and hedging in formal talk", kind: "cloze",
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
    id: "c1p12", title: "Idiomatic Expressions II", subtitle: "Meaning match, advanced idioms", kind: "pair",
    prompt: "The idiom \"%s\" means…", note: "Advanced idioms beyond the basics.",
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
];

const BANK: Record<Level, Pack[]> = { A1, A2, B1, B2, C1 };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickDistractors(answer: string, pool: string[], seed: string) {
  const others = pool.filter((o) => o.toLowerCase() !== answer.toLowerCase());
  const start = hash(seed) % Math.max(1, others.length);
  const out: string[] = [];
  for (let i = 0; out.length < 3 && i < others.length; i++) {
    const cand = others[(start + i * 7) % others.length];
    if (cand && !out.includes(cand)) out.push(cand);
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
  return lines.map(([left, right], i) => {
    const answer = right!;
    const seed = `${pack.id}-${i}`;
    const distractors = pickDistractors(answer, pool, seed);
    const prompt =
      pack.kind === "pair"
        ? (pack.prompt ?? "%s").replace("%s", left!)
        : left!;
    const explanation =
      pack.kind === "pair"
        ? `${left} → ${answer}. ${pack.note}`
        : `"${answer}" is correct here. ${pack.note}`;
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
      };
    }
    return {
      id: `${pack.id}q${i}`,
      type: "fill",
      prompt: pack.kind === "cloze" ? prompt : `${prompt} ___`,
      bank: [answer, ...distractors].sort((a, b) => (hash(a + seed) - hash(b + seed))),
      answer,
      explanation,
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
