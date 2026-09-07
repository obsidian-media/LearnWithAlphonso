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
    id: "b2p5", title: "Reporting & Hedging", subtitle: "Report what was said", kind: "cloze",
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
    id: "b2p6", title: "Collocations", subtitle: "Words that go together", kind: "pair",
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
