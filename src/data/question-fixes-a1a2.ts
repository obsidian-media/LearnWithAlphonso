import type { QuestionFix } from "./question-fixes";

/** Phase 1 rewrites for English A1/A2, written under docs/distractor-policy.md. Review table: docs/content-fixes-a1a2-phase1.md */
export const FIXES_A1A2: Record<string, QuestionFix> = {
  "a1p10l1/a1p10q0": {
    why: "options replaced with same-kind wrong options",
    prompt: "It's very ___ today — take an umbrella. (water falls from the sky)",
    wrong: ["sunny", "foggy", "dry"],
  },
  "a1p10l1/a1p10q1": {
    why: "reason refreshed to match the current options",
    context:
      "Only a clear sky shows blue; foggy and rainy skies look grey and freezing describes the temperature.",
    wrong: ["foggy", "rainy", "freezing"],
  },
  "a1p10l1/a1p10q2": {
    why: "reason refreshed to match the current options",
    context:
      "A coat is worn in cold weather; sunny and hot days call for light clothes and mild weather is in between.",
    wrong: ["sunny", "hot", "mild"],
  },
  "a1p10l1/a1p10q3": {
    why: "options replaced with same-kind wrong options",
    prompt: "There's a strong ___ blowing today. (moving air)",
    wrong: ["sunshine", "fog", "thunder"],
  },
  "a1p10l1/a1p10q4": {
    why: "options and wording fixed after the third review",
    prompt: "Last night, it ___ heavily.",
    wrong: ["rain", "raining", "will rain"],
  },
  "a1p10l2/a1p10q5": {
    why: "options replaced with same-kind wrong options",
    prompt: "The forecast says it will ___ tomorrow. (white flakes fall)",
    wrong: ["snowed", "snowing", "snows"],
  },
  "a1p10l2/a1p10q6": {
    why: "reason added",
    context:
      "After the, season needs a superlative; hotter is a comparative and hotest and most hot are the common mistakes.",
    wrong: ["hotter", "hotest", "most hot"],
  },
  "a1p10l2/a1p10q7": {
    why: "options and wording fixed after the third review",
    prompt: "In autumn, the leaves turn ___. (a colour like soil)",
    wrong: ["green", "blue", "purple"],
  },
  "a1p10l2/a1p10q8": {
    why: "reason refreshed against the replaced options",
    prompt: "It's very ___ today — over thirty degrees.",
    wrong: ["freezing", "chilly", "snowy"],
    context:
      "Over thirty degrees is hot weather; freezing, chilly and snowy describe cold weather.",
  },
  "a1p10l2/a1p10q9": {
    why: "options replaced with same-kind wrong options",
    prompt: "The ___ is out, so let's go to the beach. (it shines and warms us)",
    wrong: ["rain", "snow", "fog"],
  },
  "a1p10l3/a1p10q10": {
    why: "reason added",
    context: "A loud noise during a storm is thunder; ice, weather and fog make no sound.",
    wrong: ["ice", "weather", "fog"],
  },
  "a1p10l3/a1p10q11": {
    why: "reason refreshed to match the options",
    context:
      "Barely seeing is caused by fog, a thick low cloud; the other options describe temperature or clear skies where you see well.",
    wrong: ["cold", "sunny", "clear"],
  },
  "a1p10l3/a1p10q12": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Winter in this city is very ___. (bitterly cold and stormy)",
    wrong: ["hot", "sunny", "clear"],
  },
  "a1p10l3/a1p10q13": {
    why: 'the other words of the pack were nouns; the wrong options are adverbs a learner might pick, ruled out by "all at once"',
    context: "the sentence already rules out the other options",
    prompt: "The temperature dropped ___ overnight. (it happened all at once)",
    wrong: ["slowly", "gradually", "softly"],
  },
  "a1p10l3/a1p10q14": {
    why: "reason refreshed",
    context:
      "Spring brings warmer weather as the days lengthen; the other options are frozen or loud things that nobody calls warmer.",
    wrong: ["ice", "fog", "thunder"],
  },
  "a1p10l4/a1p10q15": {
    why: "reason refreshed to match the current options",
    context:
      "Ground that is icy is below zero, which is freezing; mild and hot are warmer and snow is a noun.",
    wrong: ["mild", "snow", "hot"],
  },
  "a1p10l4/a1p10q16": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "cloud",
  },
  "a1p10l4/a1p10q17": {
    why: '"a rainy day" is also a day for a picnic; the clue says the sun was shining',
    context: "the sentence already rules out the other options",
    wrong: ["rainy", "foggy", "windy"],
    prompt: "We had a picnic on a ___ day. (the sun was shining)",
  },
  "a1p10l4/a1p10q18": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The ___ made it hard to drive. (the road was hidden in white air)",
    wrong: ["sun", "snow", "cloud"],
  },
  "a1p10l4/a1p10q19": {
    why: "specific clue kept",
    prompt: "The sky turned dark before the ___ began. (thunder and lightning followed)",
    wrong: ["snow", "fog", "sunshine"],
  },
  "a1p10l5/a1p10q20": {
    why: "options replaced with same-kind wrong options",
    prompt: "It's too ___ to go swimming today. (the waves and trees were moving a lot)",
    wrong: ["sunny", "foggy", "snowy"],
  },
  "a1p10l5/a1p10q21": {
    why: "options replaced with same-kind wrong options",
    prompt: "The ___ melted quickly in the sun. (frozen water)",
    wrong: ["rain", "wind", "thunder"],
  },
  "a1p10l5/a1p10q22": {
    why: "reason refreshed to match the current options",
    context:
      "Fall is the American word for autumn; ice, wind and cloud belong to weather, not to the list of seasons.",
    wrong: ["ice", "wind", "cloud"],
  },
  "a1p10l5/a1p10q23": {
    why: "options replaced with same-kind wrong options",
    prompt: "It's a ___ day, perfect for a walk. (neither hot nor cold)",
    wrong: ["hot", "freezing", "stormy"],
  },
  "a1p10l5/a1p10q24": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Bring a jacket — it's ___ this evening. (a bit cold)",
    wrong: ["sunny", "rainy", "hot"],
  },
  "a1p11l1/a1p11q0": {
    why: "options replaced with same-kind wrong options",
    prompt: "This shirt costs ___ dollars. (the number 20)",
    wrong: ["thirty", "fifty", "fifteen"],
  },
  "a1p11l1/a1p11q1": {
    why: "reason refreshed to match the options",
    context:
      "A jar of one-pound coins is a saving habit; the other options are paper or plastic items that come in other amounts.",
    wrong: ["receipts", "wallets", "cards"],
  },
  "a1p11l1/a1p11q2": {
    why: "reason refreshed to match the current options",
    context:
      "Money comes out of a machine when you withdraw it; deposit puts money in, and save and pay name other actions.",
    wrong: ["deposit", "save", "pay"],
  },
  "a1p11l1/a1p11q3": {
    why: "options replaced with same-kind wrong options",
    prompt: "The bill comes to ___ euros. (the number 15)",
    wrong: ["thirteen", "fifty", "five"],
  },
  "a1p11l1/a1p11q4": {
    why: "reason refreshed to match the options",
    context:
      "A twenty-pound note is changed for smaller ones at a shop; the other options describe putting money in or taking it out of an account.",
    wrong: ["save", "withdraw", "deposit"],
  },
  "a1p11l2/a1p11q5": {
    why: '"change / withdraw some money for the trip" are also correct; the clue says put aside',
    context: "the sentence already rules out the other options",
    wrong: ["spend", "change", "withdraw"],
    prompt: "I need to ___ some money for the trip. (put it aside, not spend it)",
  },
  "a1p11l2/a1p11q6": {
    why: '"saved ten dollars on the gift" is also correct; the clue says she paid',
    context: "the sentence already rules out the other options",
    wrong: ["save", "withdraw", "change"],
    prompt: "She ___ ten dollars on the gift. (she paid for it)",
  },
  "a1p11l2/a1p11q7": {
    why: "options replaced with same-kind wrong options",
    prompt: "He asked for a ___ on the price. (a lower price for him)",
    wrong: ["refund", "receipt", "change"],
  },
  "a1p11l2/a1p11q8": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "This costs ___ than I expected. (a higher price)",
    wrong: ["less", "fewer", "much"],
  },
  "a1p11l2/a1p11q9": {
    why: '"enough change" is also correct; the clue says exactly the right coins',
    context: "the sentence already rules out the other options",
    wrong: ["contactless", "enough", "big"],
    prompt: "Do you have ___ change for a ten? (the right coins, no more and no less)",
  },
  "a1p11l3/a1p11q10": {
    why: "options replaced with same-kind wrong options",
    prompt: "The total is ___ pounds and fifty pence. (the sum 3.50)",
    wrong: ["thirteen", "thirty", "five"],
  },
  "a1p11l3/a1p11q11": {
    why: "reason refreshed to match the options",
    context:
      "Paying by card is the usual alternative to cash; the other options are parts of a price or of a purse, not ways to pay.",
    wrong: ["discount", "notes", "balance"],
  },
  "a1p11l3/a1p11q12": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could I get a ___ for this purchase? (proof that I paid)",
    wrong: ["refund", "discount", "balance"],
  },
  "a1p11l3/a1p11q13": {
    why: "money-word options only",
    context:
      "The price includes tax; a receipt, a total and a bill are what you get after paying, not part of the price.",
    wrong: ["coins", "notes", "cash"],
  },
  "a1p11l3/a1p11q14": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She counted the ___ carefully. (coins and notes)",
    wrong: ["sale", "tax", "wallet"],
  },
  "a1p11l4/a1p11q15": {
    why: '"a few discounts" fitted; the clue says paper money',
    context: "the sentence already rules out the other options",
    prompt: "I only have a few ___ left. (paper money)",
    wrong: ["coins", "balance", "tax"],
  },
  "a1p11l4/a1p11q16": {
    why: "options were not numbers",
    context: "the sentence already rules out the other options",
    wrong: ["twenty", "fifteen", "three"],
    prompt: "He borrowed ___ dollars from his brother. (the number 50)",
  },
  "a1p11l4/a1p11q17": {
    why: "options were not adjectives",
    prompt: "The shop only accepts ___ payments. (you tap your card)",
    wrong: ["exact", "enough", "expensive"],
  },
  "a1p11l4/a1p11q18": {
    why: "options were not adverbs",
    context: "the sentence already rules out the other options",
    prompt: "We split the bill ___. (everyone paid the same)",
    wrong: ["quickly", "secretly", "later"],
  },
  "a1p11l4/a1p11q19": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "wallet",
  },
  "a1p11l5/a1p11q20": {
    why: "options replaced with same-kind wrong options",
    prompt: "The item is on ___ this week. (it costs less than usual)",
    wrong: ["receipt", "balance", "change"],
  },
  "a1p11l5/a1p11q21": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "She saved ___ money for college. (as much as she needed)",
    wrong: ["many", "few", "several"],
  },
  "a1p11l5/a1p11q22": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The price went ___ last month. (it became more expensive)",
    wrong: ["down", "off", "out"],
  },
  "a1p11l5/a1p11q23": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "He paid the ___ in full. (the total sum)",
    wrong: ["discount", "change", "wallet"],
  },
  "a1p11l5/a1p11q24": {
    why: '"bank notes" is also a phrase; the clue says how much is in the account',
    context: "the sentence already rules out the other options",
    prompt: "I need to check my bank ___. (how much money is in it)",
    wrong: ["notes", "receipt", "tax"],
  },
  "a1p14l1/a1p14q0": {
    why: "reason refreshed against the replaced options",
    prompt: "The first day of the school week is ___.",
    wrong: ["Tuesday", "Friday", "Saturday"],
    context:
      "The school week begins on Monday, while Tuesday, Friday and Saturday come later in it.",
  },
  "a1p14l1/a1p14q1": {
    why: "reason refreshed against the replaced options",
    prompt: "The last day of the weekend is ___.",
    wrong: ["Monday", "Friday", "Wednesday"],
    context: "The weekend ends on Sunday; Monday, Friday and Wednesday are weekdays.",
  },
  "a1p14l1/a1p14q2": {
    why: "reason refreshed against the replaced options",
    prompt: "Christmas is in the month of ___.",
    wrong: ["November", "June", "January"],
    context:
      "Christmas Day is on 25 December; November, June and January are other months of the year.",
  },
  "a1p14l1/a1p14q3": {
    why: "reason refreshed against the replaced options",
    prompt: "The shortest month of the year is ___.",
    wrong: ["January", "March", "April"],
    context: "February has 28 or 29 days, fewer than January, March and April.",
  },
  "a1p14l1/a1p14q4": {
    why: "options replaced with same-kind wrong options",
    prompt: "We eat lunch in the ___. (around one o'clock)",
    wrong: ["morning", "evening", "night"],
  },
  "a1p14l2/a1p14q5": {
    why: "time-of-day options only",
    context:
      "People sleep at night; noon, afternoon and dawn are other parts of the day when most people are awake.",
    wrong: ["noon", "afternoon", "dawn"],
    prompt: "We usually sleep at ___.",
  },
  "a1p14l2/a1p14q6": {
    why: "reason refreshed against the replaced options",
    prompt: "There are seven days in a ___.",
    wrong: ["month", "year", "weekend"],
    context: "A week lasts seven days; a month, a year and a weekend are other lengths of time.",
  },
  "a1p14l2/a1p14q7": {
    why: "reason refreshed against the replaced options",
    prompt: "There are twelve ___ in a year.",
    wrong: ["weeks", "days", "hours"],
    context: "A year is made of twelve months; weeks, days and hours give 52, 365 and 8,760.",
  },
  "a1p14l2/a1p14q8": {
    why: 'any month fits "my birthday is in the month of"; the clue picks the seventh',
    context: "the sentence already rules out the other options",
    wrong: ["June", "October", "December"],
    prompt: "My birthday is in the month of ___. (it is the seventh month)",
  },
  "a1p14l2/a1p14q9": {
    why: "options replaced with same-kind wrong options",
    prompt: "The clock shows what ___ it is. (hours and minutes)",
    wrong: ["day", "month", "year"],
  },
  "a1p14l3/a1p14q10": {
    why: "options replaced with same-kind wrong options",
    prompt: "I wake up early in the ___. (when the sun comes up)",
    wrong: ["evening", "afternoon", "night"],
  },
  "a1p14l3/a1p14q11": {
    why: "reason refreshed against the replaced options",
    prompt: "The first month of the year is ___.",
    wrong: ["December", "February", "March"],
    context: "January starts the year; December ends it, and February and March come after it.",
  },
  "a1p14l3/a1p14q12": {
    why: '"celebrated in weekend" was not a real option',
    context: "Halloween is on 31 October; July, June and November are other months.",
    wrong: ["July", "June", "November"],
  },
  "a1p14l3/a1p14q13": {
    why: "same-kind options; clue removes the ambiguity",
    wrong: ["afternoons", "evenings", "nights"],
    prompt: "We go to work on weekday ___, not weekends. (when the sun comes up)",
  },
  "a1p14l3/a1p14q14": {
    why: "reason refreshed against the replaced options",
    prompt: "A year has three hundred and sixty-five ___.",
    wrong: ["weeks", "months", "hours"],
    context: "A year has 365 days; weeks, months and hours give 52, 12 and 8,760.",
  },
  "a1p14l4/a1p14q15": {
    why: "reason refreshed against the replaced options",
    prompt: "The day after Friday is ___.",
    wrong: ["Sunday", "Thursday", "Monday"],
    context:
      "Saturday comes right after Friday; Sunday is two days after it, and Thursday and Monday are other days.",
  },
  "a1p14l4/a1p14q16": {
    why: "reason refreshed to match the current options",
    context:
      "Summer holidays begin in June or July in Europe and North America; October, March and November belong to other seasons.",
    wrong: ["October", "March", "November"],
  },
  "a1p14l4/a1p14q17": {
    why: "reason refreshed against the replaced options",
    prompt: "The day before Wednesday is ___.",
    wrong: ["Monday", "Thursday", "Friday"],
    context:
      "Tuesday is the day directly before Wednesday; Monday is two days before, and Thursday and Friday come after.",
  },
  "a1p14l4/a1p14q18": {
    why: "reason refreshed against the replaced options",
    prompt: "New Year's Eve is on the last day of the ___.",
    wrong: ["week", "day", "hour"],
    context: "New Year's Eve closes the year; a week, a day or an hour can end on any date.",
  },
  "a1p14l4/a1p14q19": {
    why: "time-unit options only",
    prompt: "There are sixty minutes in one ___.",
    wrong: ["day", "week", "month"],
    context: "Sixty minutes make one hour; a day, a week and a month are far longer units of time.",
  },
  "a1p14l5/a1p14q20": {
    why: "reason refreshed against the replaced options",
    prompt: "There are sixty seconds in a ___.",
    wrong: ["hour", "day", "week"],
    context: "Sixty seconds make one minute; an hour, a day and a week hold many more.",
  },
  "a1p14l5/a1p14q21": {
    why: "reason refreshed against the replaced options",
    prompt: "The middle day of the week is ___.",
    wrong: ["Tuesday", "Thursday", "Friday"],
    context:
      "Wednesday sits in the middle of Monday to Friday, with Tuesday and Thursday on either side.",
  },
  "a1p14l5/a1p14q22": {
    why: "reason refreshed against the replaced options",
    prompt: "Twelve o'clock in the middle of the day is called ___.",
    wrong: ["midnight", "evening", "dawn"],
    context:
      "Noon is twelve o'clock in the middle of the day; midnight is twelve at night, and evening and dawn are other parts of the day.",
  },
  "a1p14l5/a1p14q23": {
    why: "options replaced with same-kind wrong options",
    prompt: "We often relax on the ___. (Saturday and Sunday)",
    wrong: ["week", "month", "year"],
  },
  "a1p14l5/a1p14q24": {
    why: "reason refreshed against the replaced options",
    prompt: "The day after Thursday is ___.",
    wrong: ["Wednesday", "Saturday", "Monday"],
    context:
      "Friday comes straight after Thursday; Wednesday comes before it, and Saturday and Monday come later.",
  },
  "a1p15l1/a1p15q2": {
    why: "a sphere is also perfectly round",
    wrong: ["oval", "rectangle", "hexagon"],
  },
  "a1p15l3/a1p15q12": {
    why: "options are other size words",
    prompt: "A road that goes on and on is very ___.",
    context:
      "A road that goes on and on has great length, which is the meaning of long; thick, narrow and heavy describe width and weight.",
    wrong: ["short", "narrow", "thin"],
  },
  "a1p15l5/a1p15q21": {
    why: "a triangle also has a pointed top",
    wrong: ["rectangle", "octagon", "circle"],
  },
  "a1p16l1/a1p16q0": {
    why: "options replaced with same-kind wrong options",
    prompt: "I ___ up at seven o'clock every morning. (stop sleeping)",
    wrong: ["put", "hold", "bring"],
  },
  "a1p16l1/a1p16q1": {
    why: "options replaced with same-kind wrong options",
    prompt: "She ___ a shower before breakfast. (washes under running water)",
    wrong: ["does", "makes", "puts"],
  },
  "a1p16l1/a1p16q2": {
    why: "options replaced with same-kind wrong options",
    prompt: "She ___ her hair every morning before she goes out.",
    wrong: ["brush", "brushing", "to brush"],
  },
  "a1p16l1/a1p16q3": {
    why: "reason refreshed against the replaced options",
    slot: "inflection",
    wrong: ["eats", "eating", "are eat"],
    prompt: "We ___ breakfast together every morning as a family.",
  },
  "a1p16l1/a1p16q4": {
    why: "options replaced with same-kind wrong options",
    prompt: "I ___ dressed before I leave the house. (put my clothes on)",
    wrong: ["do", "make", "put"],
  },
  "a1p16l2/a1p16q5": {
    why: "options replaced with same-kind wrong options",
    prompt: "She ___ to work by bus every day.",
    wrong: ["travel", "travelling", "to travel"],
  },
  "a1p16l2/a1p16q6": {
    why: "reason refreshed to match the options",
    context:
      "The first job in the office is checking email; the other verbs take food, television or luggage as their object.",
    wrong: ["eat", "watch", "pack"],
  },
  "a1p16l2/a1p16q7": {
    why: '"We had lunch" is also correct; the options are now agreement and form errors',
    wrong: ["has", "having", "hasn't"],
  },
  "a1p16l2/a1p16q8": {
    why: "options replaced with same-kind wrong options",
    prompt: "I ___ home from work at six every day.",
    wrong: ["comes", "coming", "to come"],
  },
  "a1p16l2/a1p16q9": {
    why: "options replaced with same-kind wrong options",
    prompt: "She ___ dinner for the family every evening.",
    wrong: ["cook", "cooking", "to cook"],
  },
  "a1p16l3/a1p16q10": {
    why: "clue added; options are other dish jobs",
    wrong: ["dries", "sets", "puts"],
    prompt: "He ___ the dishes after dinner. (uses soap and water)",
  },
  "a1p16l3/a1p16q11": {
    why: "options replaced with same-kind wrong options",
    prompt: "We ___ television every evening.",
    wrong: ["watches", "watching", "to watch"],
  },
  "a1p16l3/a1p16q12": {
    why: "clue added; options are other things done to a book",
    wrong: ["write", "close", "hide"],
    prompt: "I ___ a book before bed. (look at the words on the page)",
  },
  "a1p16l3/a1p16q13": {
    why: "options replaced with same-kind wrong options",
    prompt: "She ___ to bed at eleven o'clock every night.",
    wrong: ["go", "going", "to go"],
  },
  "a1p16l3/a1p16q14": {
    why: "reason refreshed to match the current options",
    context:
      "Glance at is a quick look at something such as a phone; watch, walk and sleep need a different kind of object or none.",
    wrong: ["watch", "walk", "sleep"],
  },
  "a1p16l4/a1p16q15": {
    why: "reason refreshed to match the options",
    context:
      "A house gets tidied before leaving the morning rush; the other verbs take a vehicle, food or a person as their object.",
    wrong: ["drive", "cook", "sleep"],
  },
  "a1p16l4/a1p16q16": {
    why: "options replaced with same-kind wrong options",
    prompt: "I ___ my bag the night before every trip.",
    wrong: ["packs", "packing", "to pack"],
  },
  "a1p16l4/a1p16q17": {
    why: "reason refreshed to match the options",
    context:
      "The verb drives agrees with She and takes the kids to school; the other verbs are the base form or take other objects.",
    wrong: ["watch", "pack", "tidy"],
  },
  "a1p16l4/a1p16q18": {
    why: "options replaced with same-kind wrong options",
    prompt: "He ___ out three times a week.",
    wrong: ["work", "working", "to work"],
  },
  "a1p16l4/a1p16q19": {
    why: '"We watch the dog" is also correct; the clue says what we do with it',
    context: "the sentence already rules out the other options",
    prompt: "We ___ the dog every evening. (for exercise, on a lead)",
    wrong: ["watch", "feed", "groom"],
  },
  "a1p16l5/a1p16q20": {
    why: "options and wording fixed after the third review",
    prompt: "I ___ my clothes for the next day.",
    wrong: ["chooses", "choosing", "to choose"],
  },
  "a1p16l5/a1p16q21": {
    why: "options replaced with same-kind wrong options",
    prompt: "She ___ up early on weekdays.",
    wrong: ["get", "getting", "to get"],
  },
  "a1p16l5/a1p16q22": {
    why: "options replaced with same-kind wrong options",
    prompt: "He ___ home late on Fridays.",
    wrong: ["arrive", "arriving", "to arrive"],
  },
  "a1p16l5/a1p16q23": {
    why: "options and wording fixed after the third review",
    prompt: "We ___ the weekend relaxing at home.",
    wrong: ["spends", "spending", "to spend"],
  },
  "a1p16l5/a1p16q24": {
    why: "reason refreshed to match the options",
    context:
      "An alarm is set the night before; the other options use the wrong subject agreement or other verbs for alarms.",
    wrong: ["gets", "hear", "glances at"],
  },
  "a1p17l1/a1p17q0": {
    why: '"on" is a preposition; the options are now classroom nouns',
    imageKey: "book",
    wrong: ["rubber", "ruler", "bell"],
  },
  "a1p17l1/a1p17q1": {
    why: "reason refreshed to match the current options",
    context:
      "A whiteboard is a surface to write on; a bell, a rubber and a calculator are tools that do other jobs.",
    wrong: ["bell", "rubber", "calculator"],
  },
  "a1p17l1/a1p17q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "pen",
  },
  "a1p17l1/a1p17q3": {
    why: "options were not nouns for equipment",
    context:
      "A ruler draws straight lines; a rubber rubs out, a calculator calculates and a bell rings.",
    wrong: ["rubber", "calculator", "bell"],
  },
  "a1p17l1/a1p17q4": {
    why: "options replaced with same-kind wrong options",
    prompt: "The ___ sits at the front of the class. (the adult who teaches us)",
    wrong: ["student", "classmate", "pupil"],
  },
  "a1p17l2/a1p17q5": {
    why: "reason refreshed to match the current options",
    wrong: ["down", "out", "off"],
    context: "Raising a hand up shows you know the answer; down, out and off point other ways.",
  },
  "a1p17l2/a1p17q6": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "notebook",
  },
  "a1p17l2/a1p17q7": {
    why: "reason refreshed against the replaced options",
    prompt: "The students sit at their ___.",
    wrong: ["bells", "maps", "rulers"],
    context:
      "Students sit at desks; bells, maps and rulers are classroom objects but nobody sits at them.",
  },
  "a1p17l2/a1p17q8": {
    why: "reason refreshed to match the current options",
    context:
      "Books are closed before a test; sharpen, erase and ring act on pencils, mistakes and bells.",
    wrong: ["sharpen", "erase", "ring"],
  },
  "a1p17l2/a1p17q9": {
    why: '"a new rubber" fits; the clue says a printed page of exercises',
    context: "the sentence already rules out the other options",
    wrong: ["rubber", "bell", "map"],
    prompt: "The teacher gave us a new ___ today. (a printed page of exercises)",
  },
  "a1p17l3/a1p17q10": {
    why: "reason refreshed to match the options",
    context:
      "A calculator is the tool for adding in maths; the other options name a bell, a map and furniture.",
    wrong: ["bell", "map", "desks"],
  },
  "a1p17l3/a1p17q11": {
    why: "reason refreshed to match the current options",
    context:
      "Listen to the teacher is the fixed phrase; sharpen, raise and erase are followed by an object instead of to.",
    wrong: ["sharpen", "raise", "erase"],
  },
  "a1p17l3/a1p17q12": {
    why: "reason refreshed against the replaced options",
    prompt: "The ___ rings at the end of the lesson.",
    wrong: ["book", "ruler", "desk"],
    context: "A school bell rings to end the lesson; a book, a ruler and a desk make no sound.",
  },
  "a1p17l3/a1p17q13": {
    why: "reason refreshed against the replaced options",
    prompt: "We use a ___ to erase mistakes.",
    wrong: ["ruler", "glue", "bell"],
    context: "A rubber rubs out pencil mistakes; a ruler measures, glue sticks and a bell rings.",
  },
  "a1p17l3/a1p17q14": {
    why: "reason refreshed to match the options",
    wrong: ["out", "off", "away"],
    context:
      "Sit down is the phrasal verb for taking a seat; the other particles give other meanings or none.",
  },
  "a1p17l4/a1p17q15": {
    why: "rise/rose are a different verb; options now forms of raise",
    wrong: ["raises", "raising", "to raise"],
    context:
      "Raise takes an object like hands; rise has no object and rose and raised are the wrong forms after to.",
    slot: "inflection",
  },
  "a1p17l4/a1p17q16": {
    why: "reason refreshed to match the current options",
    context:
      "A pencil that is too short is sharpened to a point; erase, close and ring act on other things.",
    wrong: ["erase", "close", "ring"],
  },
  "a1p17l4/a1p17q17": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "map",
  },
  "a1p17l4/a1p17q18": {
    why: "reason refreshed to match the current options",
    context: "Homework is handed in to the teacher; a bell, a desk and a board stay in the room.",
    wrong: ["bell", "desk", "board"],
  },
  "a1p17l4/a1p17q19": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "textbooks",
  },
  "a1p17l5/a1p17q20": {
    why: "reason refreshed to match the options",
    wrong: ["in", "at", "for"],
    context:
      "Days of the week take on, as in on Friday; in, at and for go with months, times and durations.",
  },
  "a1p17l5/a1p17q21": {
    why: "reason refreshed to match the current options",
    context:
      "You turn to the next page of a book; a ruler, a rubber and a bell are objects, not parts of a book.",
    wrong: ["ruler", "rubber", "bell"],
  },
  "a1p17l5/a1p17q22": {
    why: "reason refreshed to match the current options",
    context:
      "The board at the front of the class is where the date is written; a bell, a teacher and a pencil case are things in the room.",
    wrong: ["bell", "teacher", "pencil case"],
  },
  "a1p17l5/a1p17q23": {
    why: "reason refreshed against the replaced options",
    prompt: "I keep my pens in a ___.",
    wrong: ["map", "bell", "rubber"],
    context: "Pens are kept in a pencil case; a map, a bell and a rubber hold no pens.",
  },
  "a1p17l5/a1p17q24": {
    why: "up, down and book are not adjectives",
    context: "An exam asks for silence; noisy, loud and rude are the opposite.",
    wrong: ["noisy", "loud", "rude"],
  },
  "a1p18l2/a1p18q9": {
    why: '"light pillow/shoes/suitcase" are all correct',
    wrong: ["rock", "building", "turtle"],
  },
  "a1p18l4/a1p18q15": { why: '"a short towel" is correct', wrong: ["lemon", "car", "kitchen"] },
  "a1p18l4/a1p18q16": {
    why: '"a wide suitcase/book" are correct',
    wrong: ["pencil", "noise", "lemon"],
  },
  "a1p18l4/a1p18q18": {
    why: '"a clean library/book" are correct',
    wrong: ["noise", "fire", "sugar"],
  },
  "a1p18l4/a1p18q19": {
    why: '"a dirty kitchen/pillow" are correct',
    wrong: ["light", "sugar", "noise"],
  },
  "a1p18l5/a1p18q20": { why: '"a full road" is correct', wrong: ["feather", "noise", "light"] },
  "a1p18l5/a1p18q21": {
    why: '"an empty library/book" are correct',
    wrong: ["noise", "feather", "ice"],
  },
  "a1p18l5/a1p18q22": {
    why: '"a new pillow/kitchen" are correct',
    wrong: ["ice", "sugar", "lemon"],
  },
  "a1p18l5/a1p18q23": {
    why: '"an old knife/turtle/building" are all correct',
    wrong: ["lemon", "feather", "noise"],
  },
  "a1p18l5/a1p18q24": {
    why: '"a wet pillow/kitchen/ice" are correct',
    wrong: ["fire", "light", "noise"],
  },
  "a1p19l1/a1p19q0": {
    why: "reason refreshed to match the options",
    context:
      "You buy food for dinner; the other options are items or ideas that go with shopping rather than with dinner.",
    wrong: ["list", "bag", "price"],
  },
  "a1p19l1/a1p19q1": {
    why: "options replaced with same-kind wrong options",
    prompt: "Can you push the ___ while I shop? (the wheeled cart)",
    wrong: ["receipt", "list", "card"],
  },
  "a1p19l1/a1p19q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "basket",
  },
  "a1p19l1/a1p19q3": {
    why: "reason refreshed against the replaced options",
    prompt: "We're out of ___, so there's nothing to make toast with.",
    wrong: ["soap", "rice", "tea"],
    context: "Toast is made from bread; soap, rice and tea give you nothing to toast.",
  },
  "a1p19l1/a1p19q4": {
    why: '"check the food / price" also fit; the clue says when it goes off',
    context: "the sentence already rules out the other options",
    wrong: ["trolley", "debit", "price"],
    prompt: "Please check the ___ before you buy the milk. (to see when it goes off)",
  },
  "a1p19l2/a1p19q5": {
    why: "reason refreshed to match the current options",
    context:
      "The checkout is the place at the front of a shop where you pay; a discount, a bag and a debit are things, not places.",
    wrong: ["discount", "bag", "debit"],
  },
  "a1p19l2/a1p19q6": {
    why: "options and wording fixed after the third review",
    prompt: "I forgot my shopping ___ at home. (what I wrote the things I need on)",
    wrong: ["bag", "basket", "receipt"],
  },
  "a1p19l2/a1p19q7": {
    why: "reason refreshed to match the current options",
    context:
      "An item in a shop can be on sale; a checkout, a cashier and a debit are parts of paying, with no price tag.",
    wrong: ["checkout", "cashier", "debit"],
  },
  "a1p19l2/a1p19q8": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "vegetables",
  },
  "a1p19l2/a1p19q9": {
    why: "options replaced with same-kind wrong options",
    prompt: "I paid with my ___ card. (money comes straight from my bank account)",
    wrong: ["credit", "gift", "loyalty"],
  },
  "a1p19l3/a1p19q10": {
    why: "options replaced with same-kind wrong options",
    prompt: "The ___ scanned each item quickly. (the person at the till)",
    wrong: ["driver", "farmer", "teacher"],
  },
  "a1p19l3/a1p19q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "eggs",
  },
  "a1p19l3/a1p19q12": {
    why: "reason added",
    context:
      "Are needs a plural noun and snacks sit in an aisle; price, trolley and debit are singular.",
    wrong: ["price", "trolley", "debit"],
  },
  "a1p19l3/a1p19q13": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "bag",
  },
  "a1p19l3/a1p19q14": {
    why: "in-topic options",
    prompt: "Could you tell me where the ___ is? (milk, butter and cheese are kept there)",
    wrong: ["bakery", "freezer", "checkout"],
  },
  "a1p19l4/a1p19q15": {
    why: "options replaced with same-kind wrong options",
    prompt: "This shop has a big ___ this week. (prices are lower)",
    wrong: ["receipt", "trolley", "basket"],
  },
  "a1p19l4/a1p19q16": {
    why: "reason refreshed to match the current options",
    context:
      "Oil is what you fry food in; lettuce is eaten raw, sugar sweetens food and soap is for washing.",
    prompt: "I need to buy some ___ for cooking. (you fry food in it)",
    wrong: ["lettuce", "soap", "sugar"],
  },
  "a1p19l4/a1p19q17": {
    why: "options replaced with same-kind wrong options",
    prompt: "The queue at the ___ was very long. (where you pay at the shop)",
    wrong: ["bakery", "entrance", "car park"],
  },
  "a1p19l4/a1p19q18": {
    why: "reason refreshed to match the current options",
    context:
      "Frozen food is kept in the freezer; a basket, a trolley and a bag carry shopping home.",
    prompt: "Please put the frozen food in the ___. (it keeps food frozen)",
    wrong: ["basket", "trolley", "bag"],
  },
  "a1p19l4/a1p19q19": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I always check the ___ before I buy something. (how much it costs)",
    wrong: ["eggs", "freezer", "soap"],
  },
  "a1p19l5/a1p19q20": {
    why: "options and wording fixed after the third review",
    imageKey: "soap",
    prompt: "We ran out of ___, so I can't wash my hands. (it makes bubbles)",
    wrong: ["bread", "eggs", "milk"],
  },
  "a1p19l5/a1p19q21": {
    why: "checkout, lettuce and discount are not numbers",
    context: "the sentence already rules out the other options",
    prompt: "The shop closes at ___ o'clock. (the number 9)",
    wrong: ["seven", "ten", "twelve"],
  },
  "a1p19l5/a1p19q22": {
    why: "reason refreshed to match the options",
    context:
      "A bag for life is a strong reusable bag for carrying shopping; the other options are payment and cooking words.",
    wrong: ["basket", "trolley", "till"],
    prompt: "I need a ___ to carry all these bags. (a strong reusable carrier)",
  },
  "a1p19l5/a1p19q23": {
    why: "reason refreshed to match the current options",
    context:
      "Lettuce is the main leaf of a salad; a bag, soap and a freezer are items of other kinds.",
    wrong: ["bag", "soap", "freezer"],
  },
  "a1p19l5/a1p19q24": {
    why: "reason refreshed to match the current options",
    context:
      "A receipt lists the total amount you paid; vegetables, a bag and a list are other items in the shop.",
    wrong: ["vegetables", "bag", "list"],
  },
  "a1p1l1/a1p1q0": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["childs", "childrens", "childes"],
  },
  "a1p1l1/a1p1q1": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["mans", "manes", "mens"],
  },
  "a1p1l1/a1p1q2": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["womans", "womens", "womanes"],
  },
  "a1p1l1/a1p1q3": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["persones", "peopels", "personz"],
  },
  "a1p1l1/a1p1q4": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["foots", "feets", "footes"],
  },
  "a1p1l2/a1p1q5": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["tooths", "teeths", "toothes"],
  },
  "a1p1l2/a1p1q6": { why: '"meese" is not a plausible error', wrong: ["mouses", "mices", "mouse"] },
  "a1p1l2/a1p1q7": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["gooses", "geeses", "gooss"],
  },
  "a1p1l2/a1p1q8": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["knifes", "knifs", "knive"],
  },
  "a1p1l2/a1p1q9": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["leafs", "leafes", "leavs"],
  },
  "a1p1l3/a1p1q10": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["wifes", "wifs", "wivs"],
  },
  "a1p1l3/a1p1q11": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["shelfs", "shelfes", "shelvs"],
  },
  "a1p1l3/a1p1q12": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["citys", "cityes", "cites"],
  },
  "a1p1l3/a1p1q13": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["babys", "babyes", "babis"],
  },
  "a1p1l3/a1p1q14": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["partys", "partyes", "partis"],
  },
  "a1p1l4/a1p1q15": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["boxs", "boxies", "boxen"],
  },
  "a1p1l4/a1p1q16": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["watchs", "watchies", "watchen"],
  },
  "a1p1l4/a1p1q17": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["buss", "busen", "busis"],
  },
  "a1p1l4/a1p1q18": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["dishs", "dishies", "dishen"],
  },
  "a1p1l4/a1p1q19": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["potatos", "potatoe", "potatoies"],
  },
  "a1p1l5/a1p1q20": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["photoes", "photo's", "photoss"],
  },
  "a1p1l5/a1p1q21": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["sheeps", "sheepes", "sheepen"],
  },
  "a1p1l5/a1p1q22": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["fishs", "fishies", "fishen"],
  },
  "a1p1l5/a1p1q23": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["halfs", "halfes", "halvs"],
  },
  "a1p1l5/a1p1q24": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["lifes", "lifs", "livs"],
  },
  "a1p20l1/a1p20q0": {
    why: "reason refreshed to match the current options",
    context:
      "By bus is the vehicle you travel on; by walk is wrong, and an airport and petrol are a place and a fuel.",
    wrong: ["walk", "airport", "petrol"],
  },
  "a1p20l1/a1p20q1": {
    why: "reason refreshed against the replaced options",
    prompt: "The ___ leaves from platform three.",
    wrong: ["ticket", "seat", "driver"],
    context:
      "A train leaves from a platform; a ticket, a seat and a driver go with the train or the passenger.",
  },
  "a1p20l1/a1p20q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "taxi",
  },
  "a1p20l1/a1p20q3": {
    why: "reason refreshed to match the current options",
    context:
      "A bike is something you ride to school; keys, petrol and a timetable belong to other kinds of travel.",
    wrong: ["keys", "petrol", "timetable"],
  },
  "a1p20l1/a1p20q4": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "plane",
  },
  "a1p20l2/a1p20q5": {
    why: "reason refreshed to match the current options",
    context:
      "A coach stop is where long-distance coaches pick people up; bus, tram and taxi name local transport.",
    prompt: "Could you tell me where the ___ stop is? (for long-distance buses)",
    wrong: ["bus", "tram", "taxi"],
  },
  "a1p20l2/a1p20q6": {
    why: "options replaced with same-kind wrong options",
    prompt: "I usually ___ to work, it's not far. (go on foot)",
    wrong: ["walks", "walking", "to walk"],
  },
  "a1p20l2/a1p20q7": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The ___ station is near my house. (underground trains)",
    wrong: ["carriage", "jet", "ticket"],
  },
  "a1p20l2/a1p20q8": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "ticket",
  },
  "a1p20l2/a1p20q9": {
    why: "reason refreshed to match the current options",
    context:
      "A tram runs to a timetable and can be late; a carriage, keys and petrol are parts or supplies.",
    wrong: ["carriage", "keys", "petrol"],
  },
  "a1p20l3/a1p20q10": {
    why: "reason refreshed to match the options",
    prompt: "I left my ___ at home, so I can't drive.",
    wrong: ["bike", "ticket", "map"],
    context:
      "Keys start a car, so leaving them at home stops you driving; the other options are things you use on other kinds of journey.",
  },
  "a1p20l3/a1p20q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "ferry",
  },
  "a1p20l3/a1p20q12": {
    why: "options and wording fixed after the third review",
    prompt: "Please fasten your ___ before we take off. (the strap across your lap)",
    wrong: ["coat", "bag", "shoes"],
  },
  "a1p20l3/a1p20q13": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "jet",
  },
  "a1p20l3/a1p20q14": {
    why: "reason refreshed to match the current options",
    context:
      "The underground runs below the traffic; a seatbelt, a carriage and petrol are parts or supplies of a journey.",
    wrong: ["seatbelt", "carriage", "petrol"],
  },
  "a1p20l4/a1p20q15": {
    why: "reason refreshed to match the options",
    context:
      "A flight leaves at a set time, like six in the morning; the other options are an activity, a fuel and car keys.",
    wrong: ["walk", "petrol", "keys"],
  },
  "a1p20l4/a1p20q16": {
    why: "reason added",
    context: "the sentence already rules out the other options",
    prompt: "The ___ dropped us right outside the hotel. (a car with a driver you pay)",
    wrong: ["train", "plane", "ferry"],
  },
  "a1p20l4/a1p20q17": {
    why: "reason refreshed to match the current options",
    context:
      "A ticket is shown before boarding; fasten is for belts, ride is for a vehicle and queue is for people.",
    wrong: ["fasten", "ride", "queue"],
  },
  "a1p20l4/a1p20q18": {
    why: "reason refreshed to match the current options",
    context:
      "A closed road makes a driver take a detour, which is another route; a seatbelt, petrol and a timetable are travel items.",
    wrong: ["seatbelt", "petrol", "timetable"],
  },
  "a1p20l4/a1p20q19": {
    why: "options replaced with same-kind wrong options",
    prompt: "We waited at the ___ for twenty minutes. (where trains stop)",
    wrong: ["airport", "harbour", "garage"],
  },
  "a1p20l5/a1p20q20": {
    why: "reason refreshed to match the current options",
    context:
      "A carriage that is full leaves passengers standing; a detour, keys and petrol have no floor to stand on.",
    wrong: ["detour", "keys", "petrol"],
  },
  "a1p20l5/a1p20q21": {
    why: '"check the airport / flight" also fitted; the clue says it lists departures',
    context: "the sentence already rules out the other options",
    wrong: ["petrol", "keys", "seatbelt"],
    prompt: "I always check the ___ before I travel. (it lists when trains leave)",
  },
  "a1p20l5/a1p20q22": {
    why: "options and wording fixed after the third review",
    prompt: "The car needs more ___ before the trip. (fuel for most cars)",
    wrong: ["oil", "air", "water"],
  },
  "a1p20l5/a1p20q23": {
    why: "options replaced with same-kind wrong options",
    prompt: "We arrived at the ___ two hours early. (to catch a flight)",
    wrong: ["station", "harbour", "garage"],
  },
  "a1p20l5/a1p20q24": {
    why: "reason refreshed to match the options",
    context:
      "A subway runs underground across a city; the other options are vehicles that travel above ground or on water.",
    wrong: ["bus", "taxi", "ferry"],
  },
  "a1p21l1/a1p21q2": {
    why: "options are other body parts",
    prompt: "You smell with your ___.",
    context:
      "The nose is the part of the face used for smelling; feet, mouth and cheeks are other body parts with other jobs.",
    wrong: ["eyes", "ears", "hands"],
  },
  "a1p22l1/a1p22q0": {
    why: '"reading a new language" is also correct',
    wrong: ["stamps", "on a bike", "in a pool"],
  },
  "a1p22l1/a1p22q1": {
    why: '"watching in a pool / on a bike" are also sentences; the options are now things that cannot be watched',
    wrong: ["books", "songs", "cakes"],
  },
  "a1p22l1/a1p22q2": {
    why: '"listening to sports on TV" is also correct',
    wrong: ["on a bike", "with wool", "in a pool"],
  },
  "a1p22l1/a1p22q3": {
    why: '"playing songs" is also correct',
    wrong: ["in a pool", "books", "stamps"],
  },
  "a1p22l1/a1p22q4": {
    why: '"taking pictures" is also correct',
    wrong: ["stories", "with wool", "songs"],
  },
  "a1p22l2/a1p22q5": {
    why: '"drawing art" is also correct',
    wrong: ["on a bike", "a new language", "in a pool"],
  },
  "a1p22l2/a1p22q6": {
    why: '"painting plants" is also correct',
    wrong: ["music", "for exercise", "in a pool"],
  },
  "a1p22l2/a1p22q7": {
    why: "reason added",
    prompt: "She loves dancing ___.",
    wrong: ["on music", "for music", "of music"],
    context:
      "Dancing is done to music, with the preposition to; on, for and of music are the usual learner mistakes.",
  },
  "a1p22l2/a1p22q8": {
    why: '"singing on a bike" is arguable',
    wrong: ["stamps", "a new language", "with wool"],
  },
  "a1p22l2/a1p22q9": {
    why: '"collecting photographs/stories" are also correct',
    wrong: ["in the community", "on a bike", "to music"],
  },
  "a1p22l3/a1p22q10": {
    why: '"gardening for exercise/relaxation" are also correct',
    wrong: ["stamps", "books", "songs"],
  },
  "a1p22l3/a1p22q12": {
    why: '"writing films" is arguable',
    wrong: ["cakes", "with wool", "on a bike"],
  },
  "a1p22l3/a1p22q13": {
    why: '"travelling by the river / to music" are also correct',
    wrong: ["books", "stamps", "with wool"],
  },
  "a1p22l4/a1p22q16": {
    why: '"cycling to music / by the river" are also sentences',
    wrong: ["in a pool", "with wool", "for relaxation"],
  },
  "a1p22l4/a1p22q18": {
    why: '"swimming for exercise" is also correct',
    wrong: ["to music", "books", "with wool"],
  },
  "a1p22l5/a1p22q20": {
    why: '"enjoying" fits music/stamps/bikes as well as board games',
    prompt: 'This hobby involves "playing"… ___',
    wrong: ["stamps", "on a bike", "with wool"],
  },
  "a1p22l5/a1p22q21": {
    why: '"following video games" is also correct',
    wrong: ["new places", "with wool", "stamps"],
  },
  "a1p2l1/a1p2q0": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["is", "are", "be"],
  },
  "a1p2l1/a1p2q1": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["are", "am", "be"],
  },
  "a1p2l1/a1p2q2": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["is", "am", "be"],
  },
  "a1p2l1/a1p2q3": {
    why: "reason refreshed against the replaced options",
    slot: "inflection",
    wrong: ["go", "going", "is go"],
    prompt: "He ___ to work by bus every day.",
  },
  "a1p2l1/a1p2q4": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["studies", "studying", "are study"],
  },
  "a1p2l2/a1p2q5": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["are", "am", "be"],
  },
  "a1p2l2/a1p2q6": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["is", "am", "be"],
  },
  "a1p2l2/a1p2q7": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["drink", "drinking", "is drink"],
  },
  "a1p2l2/a1p2q8": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["doesn't", "isn't", "aren't"],
  },
  "a1p2l2/a1p2q9": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["do", "is", "are"],
  },
  "a1p2l3/a1p2q10": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["Is", "Am", "Do"],
  },
  "a1p2l3/a1p2q11": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["Do", "Is", "Are"],
  },
  "a1p2l3/a1p2q12": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["is", "am", "be"],
  },
  "a1p2l3/a1p2q13": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["play", "playing", "is play"],
  },
  "a1p2l3/a1p2q14": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["has", "am", "are"],
  },
  "a1p2l4/a1p2q15": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["have", "is", "having"],
  },
  "a1p2l4/a1p2q16": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["is", "am", "be"],
  },
  "a1p2l4/a1p2q17": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["Are", "Am", "Do"],
  },
  "a1p2l4/a1p2q18": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["has", "having", "are"],
  },
  "a1p2l4/a1p2q19": {
    why: "time anchor added so only one tense fits",
    slot: "inflection",
    wrong: ["get", "getting", "is get"],
    prompt: "He ___ up at six every day.",
  },
  "a1p2l5/a1p2q20": {
    why: "time anchor added so only one tense fits",
    slot: "inflection",
    wrong: ["open", "opening", "do open"],
    prompt: "The shop ___ at nine every day.",
  },
  "a1p2l5/a1p2q21": {
    why: "verb forms of one lemma",
    slot: "inflection",
    wrong: ["flies", "flying", "is fly"],
  },
  "a1p2l5/a1p2q22": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["aren't", "doesn't", "don't"],
  },
  "a1p2l5/a1p2q24": {
    why: "reason refreshed against the replaced options",
    slot: "inflection",
    wrong: ["live", "living", "is live"],
    prompt: "She ___ in London now.",
  },
  "a1p4l1/a1p4q1": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["on", "at", "for"],
  },
  "a1p4l1/a1p4q2": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["in", "on", "for"],
  },
  "a1p4l1/a1p4q3": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The cat is ___ the table. (below it)",
    wrong: ["above", "behind", "beside"],
  },
  "a1p4l1/a1p4q4": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["on", "at", "to"],
  },
  "a1p4l2/a1p4q5": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "Put the book ___ the shelf. (on its top surface)",
    wrong: ["in", "under", "behind"],
  },
  "a1p4l2/a1p4q6": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["in", "of"],
  },
  "a1p4l2/a1p4q7": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The shop is ___ the bank. (right beside it)",
    wrong: ["opposite", "behind", "in front of"],
  },
  "a1p4l2/a1p4q8": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["on", "at", "for"],
  },
  "a1p4l3/a1p4q10": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The bus stops ___ the corner. (at that exact point)",
    wrong: ["in", "under"],
  },
  "a1p4l3/a1p4q11": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "There is a picture ___ the wall. (touching its surface)",
    wrong: ["in", "under", "behind"],
  },
  "a1p4l3/a1p4q12": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The keys are ___ my bag. (inside it)",
    wrong: ["on", "under", "behind"],
  },
  "a1p4l3/a1p4q13": {
    why: '"in front of" is not in the fixed-phrase pool',
    prompt: "She sits ___ me in class. (right next to me)",
    wrong: ["behind", "opposite", "near"],
  },
  "a1p4l3/a1p4q14": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The plane flies ___ the clouds. (higher than them)",
    wrong: ["below", "among", "in"],
  },
  "a1p4l4/a1p4q15": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "Walk ___ the bridge. (from one side to the other)",
    wrong: ["along", "under", "into"],
  },
  "a1p4l4/a1p4q16": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The dog is ___ the door. (hidden on the other side)",
    wrong: ["in front of", "beside", "on"],
  },
  "a1p4l4/a1p4q17": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "Come ___ the room. (enter it)",
    wrong: ["onto", "across", "past"],
  },
  "a1p4l4/a1p4q18": { why: '"into" is not an option for "by train"', wrong: ["with", "at", "for"] },
  "a1p4l4/a1p4q19": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["on", "in"],
  },
  "a1p4l5/a1p4q20": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["at", "on", "for"],
  },
  "a1p4l5/a1p4q21": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The cafe is ___ the station. (across the road from it)",
    wrong: ["behind", "next to", "inside"],
  },
  "a1p4l5/a1p4q22": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["in", "at", "to"],
  },
  "a1p4l5/a1p4q23": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The ball rolled ___ the hill. (from the top to the bottom)",
    wrong: ["up", "along", "across"],
  },
  "a1p6l1/a1p6q1": {
    why: '"How/Why do you live?" are valid questions without the reply',
    prompt: "___ do you live? In Madrid.",
    wrong: ["Which", "Why", "How"],
  },
  "a1p6l1/a1p6q2": {
    why: '"When are you late?" is a valid question',
    prompt: "___ are you late? Because of the traffic.",
    wrong: ["Which", "Where", "When"],
  },
  "a1p6l1/a1p6q3": {
    why: '"How does the film start?" is valid',
    prompt: "___ does the film start? At eight o'clock.",
    wrong: ["How", "Whose", "What"],
  },
  "a1p6l1/a1p6q4": {
    why: '"How/What is that woman?" are valid',
    prompt: "___ is that woman? My teacher.",
    wrong: ["How", "What", "When"],
  },
  "a1p6l2/a1p6q9": {
    why: '"Why/How are you going?" are valid',
    prompt: "___ are you going? To the park.",
    wrong: ["Why", "How", "Whose"],
  },
  "a1p6l3/a1p6q11": {
    why: '"Which/What is your favourite singer?" are valid',
    prompt: "___ is your favourite singer? Taylor Swift.",
    wrong: ["Whose", "When", "How many"],
  },
  "a1p6l3/a1p6q12": { why: "only two wrong options before", wrong: ["How"] },
  "a1p6l3/a1p6q14": {
    why: '"When/Where do you get to work?" are valid',
    prompt: "___ do you get to work? By bus.",
    wrong: ["Where", "Who", "When"],
  },
  "a1p6l4/a1p6q15": { why: '"Who is the meeting about?" was also correct', wrong: ["Where"] },
  "a1p6l4/a1p6q16": {
    why: '"When did you choose that one?" is valid',
    prompt: "___ did you choose that one? Because it is cheaper.",
    wrong: ["Who", "What", "When"],
  },
  "a1p6l4/a1p6q19": {
    why: '"Where/Why are you free?" are valid',
    prompt: "___ are you free? On Saturday.",
    wrong: ["Where", "Which", "Why"],
  },
  "a1p6l5/a1p6q20": {
    why: '"What told you that?" was also correct',
    wrong: ["Whose", "Where", "How"],
  },
  "a1p6l5/a1p6q21": {
    why: '"Where/Which is the problem?" are valid',
    prompt: "___ is the problem? My phone is broken.",
    wrong: ["How"],
  },
  "a1p6l5/a1p6q24": {
    why: '"What do we start?" is a valid question',
    prompt: "___ do we start? At nine.",
    wrong: ["Why", "Where", "What"],
  },
  "a1p8l1/a1p8q0": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "coffee",
  },
  "a1p8l1/a1p8q1": {
    why: "options replaced with same-kind wrong options",
    prompt: "Can I have some ___ with my tea? (white, to make it creamy)",
    wrong: ["lemon", "honey", "lime"],
  },
  "a1p8l1/a1p8q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "bacon",
  },
  "a1p8l1/a1p8q3": {
    why: "options replaced with same-kind wrong options",
    prompt: "She ordered a bowl of ___ soup. (the soup is red)",
    wrong: ["pea", "mushroom", "carrot"],
  },
  "a1p8l1/a1p8q4": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "salt",
  },
  "a1p8l2/a1p8q5": {
    why: "options replaced with same-kind wrong options",
    prompt: "I'll have a slice of ___ bread. (the colour of wholemeal)",
    wrong: ["green", "blue", "purple"],
  },
  "a1p8l2/a1p8q6": {
    why: "options replaced with same-kind wrong options",
    prompt: "Would you like some ___ on your salad? (oil and vinegar)",
    wrong: ["jam", "cream", "honey"],
  },
  "a1p8l2/a1p8q7": {
    why: "options replaced with same-kind wrong options",
    prompt: "He always has ___ for dessert. (a sweet treat with candles on it)",
    wrong: ["soup", "rice", "salad"],
  },
  "a1p8l2/a1p8q8": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "menu",
  },
  "a1p8l2/a1p8q9": {
    why: "options replaced with same-kind wrong options",
    prompt: "I'm allergic to ___. (the small nuts in a packet)",
    wrong: ["cherries", "carrots", "olives"],
  },
  "a1p8l3/a1p8q10": {
    why: "options replaced with same-kind wrong options",
    prompt: "She drinks ___ juice every morning. (squeezed from a citrus fruit)",
    wrong: ["apple", "carrot", "tomato"],
  },
  "a1p8l3/a1p8q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "cheese",
  },
  "a1p8l3/a1p8q12": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could you pass the ___ for my tea? (to make it sweet)",
    wrong: ["salt", "pepper", "flour"],
  },
  "a1p8l3/a1p8q13": {
    why: "options replaced with same-kind wrong options",
    prompt: "Let's order a ___ of pizza to share. (one triangle of the whole)",
    wrong: ["box", "bottle", "bowl"],
  },
  "a1p8l3/a1p8q14": {
    why: "options replaced with same-kind wrong options",
    prompt: "He spread some ___ on his toast. (sweet and made from fruit)",
    wrong: ["cheese", "ham", "mustard"],
  },
  "a1p8l4/a1p8q15": {
    why: "options replaced with same-kind wrong options",
    prompt: "I prefer ___ tea to green tea. (with no milk)",
    wrong: ["white", "milky", "creamy"],
  },
  "a1p8l4/a1p8q16": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could I have the bill, or the ___? (the word Americans use)",
    wrong: ["menu", "tip", "order"],
  },
  "a1p8l4/a1p8q17": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "steak",
  },
  "a1p8l4/a1p8q18": {
    why: "options replaced with same-kind wrong options",
    prompt: "She's a vegetarian, so no ___ for her. (she doesn't eat animals)",
    wrong: ["salad", "rice", "bread"],
  },
  "a1p8l4/a1p8q19": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "bread",
  },
  "a1p8l5/a1p8q20": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "lemon",
  },
  "a1p8l5/a1p8q21": {
    why: "options replaced with same-kind wrong options",
    prompt: "He always orders his steak ___. (barely cooked inside)",
    wrong: ["well done", "medium", "burnt"],
  },
  "a1p8l5/a1p8q22": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could we split the ___ between us? (at the end of the meal)",
    wrong: ["menu", "soup", "table"],
  },
  "a1p8l5/a1p8q23": {
    why: "options replaced with same-kind wrong options",
    prompt: "This cake is made with real ___. (yellow, from cream)",
    wrong: ["cheese", "pepper", "ice"],
  },
  "a1p8l5/a1p8q24": {
    why: "options replaced with same-kind wrong options",
    prompt: "Would you like ___ or sparkling water? (without bubbles)",
    wrong: ["warm", "salty", "dry"],
  },
  "a1p9l1/a1p9q0": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She's wearing a red ___. (a one-piece for a party)",
    wrong: ["trousers", "sock", "hat"],
  },
  "a1p9l1/a1p9q1": {
    why: "options replaced with same-kind wrong options",
    prompt: "He always wears a black ___. (a top with sleeves that zips up)",
    wrong: ["scarf", "hat", "belt"],
  },
  "a1p9l1/a1p9q2": {
    why: "options replaced with same-kind wrong options",
    prompt: "I need new ___ for winter. (for snow and rain)",
    wrong: ["sandals", "slippers", "trainers"],
  },
  "a1p9l1/a1p9q3": {
    why: '"sleeves" is a part of a garment, not a garment',
    prompt: "Put on your ___ before you go out. (a warm layer over your clothes)",
    wrong: ["sunglasses", "hat", "scarf"],
  },
  "a1p9l1/a1p9q4": {
    why: "options replaced with same-kind wrong options",
    prompt: "These ___ are too tight. (blue, made of denim)",
    wrong: ["socks", "gloves", "boots"],
  },
  "a1p9l2/a1p9q5": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She bought a blue ___ for work. (with buttons and a collar)",
    wrong: ["ribbon", "umbrella", "jeans"],
  },
  "a1p9l2/a1p9q6": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "He wears ___ to bed. (he changes into them at night)",
    wrong: ["hat", "sunglasses", "jacket"],
  },
  "a1p9l2/a1p9q7": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "sock",
  },
  "a1p9l2/a1p9q8": {
    why: "options replaced with same-kind wrong options",
    prompt: "It's cold — wear a ___. (around your neck)",
    wrong: ["belt", "gloves", "socks"],
  },
  "a1p9l2/a1p9q9": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "sunglasses",
  },
  "a1p9l3/a1p9q10": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "suit",
  },
  "a1p9l3/a1p9q11": {
    why: "options replaced with same-kind wrong options",
    prompt: "These shoes have a broken ___. (you tie it)",
    wrong: ["zip", "button", "pocket"],
  },
  "a1p9l3/a1p9q12": {
    why: "options replaced with same-kind wrong options",
    prompt: "I like your green ___. (a knitted top you pull over your head)",
    wrong: ["jacket", "scarf", "tie"],
  },
  "a1p9l3/a1p9q13": {
    why: "options replaced with same-kind wrong options",
    prompt: "She wears a ___ on her wrist. (it tells the time)",
    wrong: ["bracelet", "belt", "glove"],
  },
  "a1p9l3/a1p9q14": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "bag",
  },
  "a1p9l4/a1p9q15": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Take your ___ — it might rain. (it opens above your head)",
    wrong: ["shirt", "hat", "sleeves"],
  },
  "a1p9l4/a1p9q16": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "hat",
  },
  "a1p9l4/a1p9q17": {
    why: "options replaced with same-kind wrong options",
    prompt: "He loosened his ___ after a long day. (it hangs from his collar)",
    wrong: ["belt", "scarf", "bag"],
  },
  "a1p9l4/a1p9q18": {
    why: "options replaced with same-kind wrong options",
    prompt: "I need to buy new ___ for the gym. (short, for hot weather)",
    wrong: ["jumper", "coat", "boots"],
  },
  "a1p9l4/a1p9q19": {
    why: "options replaced with same-kind wrong options",
    prompt: "She wore a white ___ under her jacket. (a smart top)",
    wrong: ["skirt", "trousers", "belt"],
  },
  "a1p9l5/a1p9q20": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "He put on his ___ before the run. (he laces them up)",
    wrong: ["trousers", "watch", "pyjamas"],
  },
  "a1p9l5/a1p9q21": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "socks",
  },
  "a1p9l5/a1p9q22": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She tied her hair back with a ___. (a thin strip of silk)",
    wrong: ["socks", "jeans", "trousers"],
  },
  "a1p9l5/a1p9q23": {
    why: "options replaced with same-kind wrong options",
    prompt: "He rolled up his ___. (the parts that cover his arms)",
    wrong: ["pockets", "buttons", "legs"],
  },
  "a1p9l5/a1p9q24": {
    why: "options replaced with same-kind wrong options",
    prompt: "I ironed my ___ this morning. (two legs, worn with a belt)",
    wrong: ["skirt", "dress", "jacket"],
  },
  "a2p10l1/a2p10q0": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["bigger", "bigest", "most big"],
  },
  "a2p10l1/a2p10q1": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["hotter", "hotest", "most hot"],
  },
  "a2p10l1/a2p10q2": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["happier", "happyest", "most happy"],
  },
  "a2p10l1/a2p10q3": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["easier", "easyest", "most easy"],
  },
  "a2p10l1/a2p10q4": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["goodest", "most good", "better"],
  },
  "a2p10l2/a2p10q5": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["baddest", "most bad", "worse"],
  },
  "a2p10l2/a2p10q6": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["farrest", "most far", "further"],
  },
  "a2p10l2/a2p10q7": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["more expensive", "expensivest", "most expensiver"],
  },
  "a2p10l2/a2p10q8": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["more beautiful", "beautifulest", "most beautifuler"],
  },
  "a2p10l2/a2p10q9": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["thinner", "thinest", "most thin"],
  },
  "a2p10l3/a2p10q10": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["earlier", "earlyest", "most early"],
  },
  "a2p10l3/a2p10q11": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["busier", "busyest", "most busy"],
  },
  "a2p10l3/a2p10q12": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["safer", "safeest", "most safe"],
  },
  "a2p10l3/a2p10q13": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["larger", "largeest", "most large"],
  },
  "a2p10l3/a2p10q14": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["simpler", "simpleest", "most simpler"],
  },
  "a2p10l4/a2p10q15": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["more careful", "carefulest", "most carefullest"],
  },
  "a2p10l4/a2p10q16": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["more tired", "tiredest", "most tireder"],
  },
  "a2p10l4/a2p10q17": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["funnier", "funnyest", "most funny"],
  },
  "a2p10l4/a2p10q18": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["heavier", "heavyest", "most heavy"],
  },
  "a2p10l4/a2p10q19": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["more modern", "modernest", "most moderner"],
  },
  "a2p10l5/a2p10q20": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["narrower", "narrowwest", "narrowwer"],
  },
  "a2p10l5/a2p10q21": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["more polite", "politeest", "most politer"],
  },
  "a2p10l5/a2p10q22": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["quieter", "quietist", "quieteest"],
  },
  "a2p10l5/a2p10q23": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["stranger", "strangeest", "strangiest"],
  },
  "a2p10l5/a2p10q24": {
    why: "other adjectives' superlatives are too easy to rule out; the comparative and -est/most errors are the real mistakes",
    wrong: ["more useful", "usefulest", "most usefuler"],
  },
  "a2p11l1/a2p11q0": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could I see the ___, please? (the list of dishes)",
    wrong: ["bill", "tip", "table"],
  },
  "a2p11l1/a2p11q1": {
    why: "looking, ketchup and booked: ketchup is not a verb form",
    context:
      "Book a table follows I would like to; booking, booked and books are the wrong forms of the verb.",
    wrong: ["booking", "booked", "books"],
  },
  "a2p11l1/a2p11q2": {
    why: "options replaced with same-kind wrong options",
    prompt: "Are you ready to ___? (tell the waiter what you want)",
    wrong: ["pay", "sit", "leave"],
  },
  "a2p11l1/a2p11q3": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["has", "having", "had"],
  },
  "a2p11l1/a2p11q4": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Could we have the ___ when you're ready? (we want to pay)",
    wrong: ["ketchup", "cards", "order"],
  },
  "a2p11l2/a2p11q5": {
    why: "options replaced with same-kind wrong options",
    prompt: "Is service ___ in the price?",
    wrong: ["include", "including", "includes"],
  },
  "a2p11l2/a2p11q6": {
    why: "reason refreshed",
    context:
      "Dishes without meat are called vegetarian; the other words name a list, a drink and a sauce.",
    wrong: ["menu", "water", "ketchup"],
  },
  "a2p11l2/a2p11q7": {
    why: "dishes is not a food",
    context: "the sentence already rules out the other options",
    prompt: "I'm allergic to ___, so no peanuts please. (they grow in a shell)",
    wrong: ["bread", "milk", "eggs"],
  },
  "a2p11l2/a2p11q8": {
    why: '"window / medium / bill" cannot follow "tap"',
    context: "the sentence already rules out the other options",
    prompt: "Could I get some tap ___ as well? (you drink it)",
    wrong: ["ketchup", "bread", "dish"],
  },
  "a2p11l2/a2p11q9": {
    why: "reason refreshed to match the current options",
    context:
      "The waiter brings the food and recommends dishes; the chef, the manager and the cook have other roles.",
    prompt: "The ___ recommended the fish today. (he brings your food to the table)",
    wrong: ["chef", "manager", "cook"],
  },
  "a2p11l3/a2p11q10": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "We're just ___ at the menu for now, not ready to order. (reading it)",
    wrong: ["book", "booked", "included"],
  },
  "a2p11l3/a2p11q11": {
    why: "dish, medium and bill are not things you ask for more of",
    context: "the sentence already rules out the other options",
    prompt: "Could you bring some more ___, please? (we want to eat it with butter)",
    wrong: ["water", "soup", "wine"],
  },
  "a2p11l3/a2p11q12": {
    why: "kids, cards and order are not ways of cooking",
    context:
      "Medium is a way of cooking steak; well done, burnt and overcooked are the opposite of not too well done.",
    wrong: ["well done", "burnt", "overcooked"],
  },
  "a2p11l3/a2p11q13": {
    why: "reason refreshed to match the current options",
    context:
      "Kids menu is the fixed phrase for a children's menu; credit, water and window go with other nouns.",
    wrong: ["credit", "water", "window"],
  },
  "a2p11l3/a2p11q14": {
    why: "options replaced with same-kind wrong options",
    prompt: "Can I pay by ___ card? (you pay the bank later)",
    wrong: ["debit", "gift", "loyalty"],
  },
  "a2p11l4/a2p11q15": {
    why: "tip, book and bill are not places",
    context: "the sentence already rules out the other options",
    wrong: ["kitchen", "bar", "toilets"],
    prompt: "We would like to sit by the ___, please. (so we can see the street)",
  },
  "a2p11l4/a2p11q16": {
    why: "book, order and ketchup are not adverbs",
    context: "the sentence already rules out the other options",
    prompt: "This soup is ___ hot, be careful. (it could burn you)",
    wrong: ["barely", "hardly", "slightly"],
  },
  "a2p11l4/a2p11q17": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could we get some extra ___ for the fries? (a red sauce)",
    wrong: ["mustard", "mayonnaise", "vinegar"],
  },
  "a2p11l4/a2p11q18": {
    why: "book, ketchup and credit are not things a chef cooks",
    context: "the sentence already rules out the other options",
    wrong: ["dish", "menu", "bill"],
    prompt: "The ___ was excellent tonight, please thank the chef. (everything we ate)",
  },
  "a2p11l4/a2p11q19": {
    why: "cards, ketchup and credit are not things you order",
    context: "the sentence already rules out the other options",
    wrong: ["menu", "bill", "table"],
    prompt: "I will have the same ___ as my friend. (what is on the plate)",
  },
  "a2p11l5/a2p11q20": {
    why: "reason refreshed to match the current options",
    context:
      "Cards are a way of paying, in contrast to cash; menus, orders and tables are restaurant items.",
    wrong: ["menus", "orders", "tables"],
  },
  "a2p11l5/a2p11q21": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could you box this up, we'd like a ___ bag? (the nickname for a bag of leftovers)",
    wrong: ["gift", "party", "kitchen"],
  },
  "a2p11l5/a2p11q22": {
    why: "reason refreshed to match the current options",
    context:
      "A busy restaurant is fully booked; ordered, delayed and declined describe other things.",
    wrong: ["ordered", "delayed", "declined"],
  },
  "a2p11l5/a2p11q23": {
    why: "options replaced with same-kind wrong options",
    prompt: "Please leave a ___ for the staff if service was good. (extra money)",
    wrong: ["discount", "deposit", "receipt"],
  },
  "a2p11l5/a2p11q24": {
    why: "reason refreshed to match the current options",
    context:
      "Waiters wish diners to enjoy their dinner; credit, window and medium belong in other sentences.",
    wrong: ["credit", "window", "medium"],
  },
  "a2p12l1/a2p12q0": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "only rarely, not very often", "not on any occasion, ever"],
  },
  "a2p12l1/a2p12q1": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "only rarely, not very often", "not on any occasion, ever"],
  },
  "a2p12l1/a2p12q2": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "only rarely, not very often", "not on any occasion, ever"],
  },
  "a2p12l1/a2p12q3": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "only rarely, not very often", "not on any occasion, ever"],
  },
  "a2p12l1/a2p12q4": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "only rarely, not very often", "not on any occasion, ever"],
  },
  "a2p12l2/a2p12q5": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "only rarely, not very often", "not on any occasion, ever"],
  },
  "a2p12l2/a2p12q6": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "only rarely, not very often", "not on any occasion, ever"],
  },
  "a2p12l2/a2p12q7": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "not on any occasion, ever",
    ],
  },
  "a2p12l2/a2p12q8": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "not on any occasion, ever",
    ],
  },
  "a2p12l2/a2p12q9": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "not on any occasion, ever",
    ],
  },
  "a2p12l3/a2p12q10": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "not on any occasion, ever",
    ],
  },
  "a2p12l3/a2p12q11": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "not on any occasion, ever",
    ],
  },
  "a2p12l3/a2p12q12": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "not on any occasion, ever",
    ],
  },
  "a2p12l3/a2p12q13": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "the great majority of the time",
    ],
  },
  "a2p12l3/a2p12q14": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "the great majority of the time",
    ],
  },
  "a2p12l4/a2p12q15": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "the great majority of the time",
    ],
  },
  "a2p12l4/a2p12q16": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "the great majority of the time",
    ],
  },
  "a2p12l4/a2p12q17": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "the great majority of the time",
    ],
  },
  "a2p12l4/a2p12q18": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "the great majority of the time",
    ],
  },
  "a2p12l4/a2p12q19": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: [
      "every single time, without exception",
      "without stopping, all the time",
      "the great majority of the time",
    ],
  },
  "a2p12l5/a2p12q20": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "not on any occasion, ever", "only rarely, not very often"],
  },
  "a2p12l5/a2p12q21": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "not on any occasion, ever", "only rarely, not very often"],
  },
  "a2p12l5/a2p12q22": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "not on any occasion, ever", "only rarely, not very often"],
  },
  "a2p12l5/a2p12q23": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "not on any occasion, ever", "only rarely, not very often"],
  },
  "a2p12l5/a2p12q24": {
    why: "frequency adverbs: the other definitions were near-synonyms of the answer; wrong options now come from a clearly different frequency band",
    wrong: ["almost never at all", "not on any occasion, ever", "only rarely, not very often"],
  },
  "a2p13l1/a2p13q0": {
    why: "options replaced with same-kind wrong options",
    prompt: "Go ___ at the traffic lights. (don't turn)",
    wrong: ["left", "right", "back"],
  },
  "a2p13l1/a2p13q1": {
    why: "options replaced with same-kind wrong options",
    prompt: "Turn ___ at the next corner. (the opposite of right)",
    wrong: ["straight", "up", "forward"],
  },
  "a2p13l1/a2p13q2": {
    why: "options replaced with same-kind wrong options",
    prompt: "Turn ___ at the bank. (the direction of your writing hand for most people)",
    wrong: ["left", "straight", "back"],
  },
  "a2p13l1/a2p13q3": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The supermarket is ___ from the bakery. (on the other side of the street)",
    wrong: ["next", "near", "behind"],
  },
  "a2p13l1/a2p13q4": {
    why: '"down" is not an option for "next to"',
    prompt: "The park is ___ to the school. (right beside it)",
    wrong: ["near", "behind", "far"],
  },
  "a2p13l2/a2p13q5": {
    why: '"around" is not an option for "Walk for two blocks"',
    wrong: ["on", "to", "from"],
  },
  "a2p13l2/a2p13q6": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The bank is ___ the post office and the cafe. (with one on each side)",
    wrong: ["behind", "beside", "near"],
  },
  "a2p13l2/a2p13q7": {
    why: "options replaced with same-kind wrong options",
    prompt: "Cross the ___ carefully. (where cars drive)",
    wrong: ["pavement", "garden", "park"],
  },
  "a2p13l2/a2p13q8": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The museum is just ___ the corner. (just out of sight, past the bend)",
    wrong: ["over", "through", "into"],
  },
  "a2p13l2/a2p13q9": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "Keep walking ___ the river. (beside it, in its direction)",
    wrong: ["across", "into", "over"],
  },
  "a2p13l3/a2p13q10": {
    why: "reason refreshed to match the current options",
    context: "The end is where a street stops; start, middle and side name other parts of it.",
    prompt: "The station is at the ___ of the street. (where the street stops)",
    wrong: ["start", "middle", "side"],
  },
  "a2p13l3/a2p13q11": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "Go ___ the bridge to reach the old town. (from one side to the other)",
    wrong: ["under", "along", "into"],
  },
  "a2p13l3/a2p13q12": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The hotel is ___ the city centre. (close to it, not in it)",
    wrong: ["in", "inside", "between"],
  },
  "a2p13l3/a2p13q13": {
    why: "reason refreshed to match the current options",
    context:
      "A turning is a small side road on your left; corner, junction and bridge name other road features.",
    prompt: "Take the first ___ on your left. (a small side road)",
    wrong: ["corner", "junction", "bridge"],
  },
  "a2p13l3/a2p13q14": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The library is ___ the town hall. (at the back of it)",
    wrong: ["in front of", "beside", "opposite"],
  },
  "a2p13l4/a2p13q15": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "Go ___ the stairs to the first floor. (to a higher floor)",
    wrong: ["down", "along", "past"],
  },
  "a2p13l4/a2p13q16": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The car park is ___ the shopping centre. (below it, underground)",
    wrong: ["above", "beside", "behind"],
  },
  "a2p13l4/a2p13q17": {
    why: "reason refreshed",
    context:
      "Signs lead you to an exit; the other options are directions or actions that name no destination.",
    wrong: ["in", "down", "walk"],
  },
  "a2p13l4/a2p13q18": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The pharmacy is ___ the corner from here. (just out of sight, past the bend)",
    wrong: ["over", "through", "into"],
  },
  "a2p13l4/a2p13q19": {
    why: '"drive" is also a correct five-minute journey; the clue says on foot',
    context: "the sentence already rules out the other options",
    prompt: "It's about a five-minute ___ from here. (you go on foot)",
    wrong: ["drive", "ride", "flight"],
  },
  "a2p13l5/a2p13q20": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The bus stop is ___ the church. (not inside it)",
    wrong: ["in", "inside", "between"],
  },
  "a2p13l5/a2p13q21": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "Go ___ this road until you reach the roundabout. (follow it along)",
    wrong: ["across", "over", "into"],
  },
  "a2p13l5/a2p13q22": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The café is ___ the corner of Main Street. (on the corner itself)",
    wrong: ["in", "under", "behind"],
  },
  "a2p13l5/a2p13q23": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The nearest ATM is ___ the entrance. (within the building)",
    wrong: ["outside", "behind", "opposite"],
  },
  "a2p13l5/a2p13q24": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "You can't miss it, it's ___ the town square. (in the middle of it)",
    wrong: ["outside", "opposite", "behind"],
  },
  "a2p14l1/a2p14q0": {
    why: "reason refreshed against the replaced options",
    prompt: "Would you like to ___ out for dinner tonight?",
    wrong: ["going", "goes", "went"],
    context:
      "After would you like to comes the base verb go; going, goes and went are other forms.",
  },
  "a2p14l1/a2p14q1": {
    why: "reason refreshed against the replaced options",
    prompt: "I'm ___ to a party on Saturday, do you want to come?",
    wrong: ["go", "went", "goes"],
    context:
      "I'm going to a party uses the -ing form after I'm; go, went and goes are the wrong forms there.",
  },
  "a2p14l1/a2p14q2": {
    why: "options replaced with same-kind wrong options",
    prompt: "Are you ___ this weekend?",
    wrong: ["freed", "freely", "freeing"],
  },
  "a2p14l1/a2p14q3": {
    why: "reason refreshed to match the options",
    context:
      "Meet up is the phrasal verb for arranging to see someone; the other options pair with different particles.",
    wrong: ["keep", "planning", "forward"],
  },
  "a2p14l1/a2p14q4": {
    why: "options replaced with same-kind wrong options",
    prompt: "I'd love to, but I already have ___.",
    wrong: ["plan", "planning", "planned"],
  },
  "a2p14l2/a2p14q5": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could we ___ the meeting to next week?",
    wrong: ["postponing", "postponed", "postpones"],
  },
  "a2p14l2/a2p14q6": {
    why: "reason added",
    wrong: ["do", "take", "have"],
    prompt: "I can't ___ to your party tonight.",
    context:
      "Make it to a party means to attend, and in the negative it politely declines; the other verbs build different phrases with to.",
  },
  "a2p14l2/a2p14q7": {
    why: "reason refreshed to match the current options",
    context:
      "Fix a date means agree on one; make it, looking and keep need other words around them.",
    wrong: ["make it", "looking", "keep"],
  },
  "a2p14l2/a2p14q8": {
    why: "options replaced with same-kind wrong options",
    prompt: "Let's ___ it a rain check and go another time.",
    wrong: ["calling", "called", "calls"],
  },
  "a2p14l2/a2p14q9": {
    why: "reason refreshed to match the options",
    context:
      "You check your schedule before confirming; the other options pair with different objects.",
    wrong: ["go", "pick", "looking"],
  },
  "a2p14l3/a2p14q10": {
    why: "verb forms of one lemma",
    prompt: "Can you ___ me know by Friday?",
    wrong: ["letting", "lets", "let's"],
    context:
      "Let me know is the fixed phrase; letting, lets and left are the wrong forms after Can you.",
    slot: "inflection",
  },
  "a2p14l3/a2p14q11": {
    why: "options replaced with same-kind wrong options",
    prompt: "We're ___ to have a picnic on Sunday.",
    wrong: ["plan", "planned", "plans"],
  },
  "a2p14l3/a2p14q12": {
    why: "reason refreshed to match the options",
    context:
      "Pick you up at eight means collect you in a car; the other options give other meanings with up.",
    wrong: ["check", "manage", "show"],
  },
  "a2p14l3/a2p14q13": {
    why: "options replaced with same-kind wrong options",
    prompt: "Let's ___ for coffee sometime next week.",
    wrong: ["arranging", "arranged", "arranges"],
  },
  "a2p14l3/a2p14q14": {
    why: "options replaced with same-kind wrong options",
    prompt: "I'm really ___ forward to seeing you.",
    wrong: ["look", "looked", "looks"],
  },
  "a2p14l4/a2p14q15": {
    why: "reason added",
    context:
      "Forward me an invite means send it on; meet me an invite, let me an invite and planning me an invite are wrong.",
    wrong: ["meet", "let", "planning"],
  },
  "a2p14l4/a2p14q16": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["does", "did", "doing"],
  },
  "a2p14l4/a2p14q17": {
    why: "verb forms of one lemma",
    prompt: "I'll ___ you a text to confirm the time.",
    wrong: ["wrote", "writing", "writes"],
    context: "After I'll comes the base verb write; wrote, writing and writes are the wrong forms.",
    slot: "inflection",
  },
  "a2p14l4/a2p14q18": {
    why: "reason refreshed to match the options",
    context:
      "Keep it for Thursday means leave the plan but move it to that day; the other options have other meanings.",
    wrong: ["check", "manage", "miss"],
  },
  "a2p14l4/a2p14q19": {
    why: "reason refreshed to match the current options",
    context:
      "Can manage that day means being available then; call, forward and hold change the meaning.",
    wrong: ["call", "forward", "hold"],
  },
  "a2p14l5/a2p14q20": {
    why: "options replaced with same-kind wrong options",
    prompt: "Can we ___ the time to later in the day?",
    wrong: ["changing", "changed", "changes"],
  },
  "a2p14l5/a2p14q21": {
    why: "reason refreshed to match the options",
    context:
      "Leave it for another day means postpone it; the other options give other meanings with it.",
    wrong: ["agree", "planning", "looking"],
  },
  "a2p14l5/a2p14q22": {
    why: "options replaced with same-kind wrong options",
    prompt: "Let's ___ on a place to meet.",
    wrong: ["agreeing", "agreed", "agrees"],
  },
  "a2p14l5/a2p14q23": {
    why: "reason refreshed to match the options",
    context:
      "Book the tickets in advance means reserve them; the other options give other meanings with the tickets.",
    wrong: ["set", "make it", "look"],
  },
  "a2p14l5/a2p14q24": {
    why: "reason added",
    context: "All set means ready; all pick, manage or looking to meet is wrong.",
    wrong: ["pick", "manage", "looking"],
  },
  "a2p15l1/a2p15q0": {
    why: "reason refreshed to match the current options",
    context:
      "A parcel is what you send abroad by post; change, days and a balance are other post and money words.",
    wrong: ["change", "days", "balance"],
  },
  "a2p15l1/a2p15q1": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could I have a ___ for this letter? (it is stuck on the envelope)",
    wrong: ["parcel", "queue", "form"],
  },
  "a2p15l1/a2p15q2": {
    why: "options replaced with same-kind wrong options",
    prompt: "I need to ___ some money into my account.",
    wrong: ["deposits", "depositing", "deposited"],
  },
  "a2p15l1/a2p15q3": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could I ___ some cash from the machine?",
    wrong: ["withdrew", "withdrawing", "withdraws"],
  },
  "a2p15l1/a2p15q4": {
    why: "reason refreshed to match the current options",
    context:
      "A new bank account is where money is kept; a branch, a balance and a card are other bank words.",
    prompt: "I'd like to open a new bank ___. (where your money is kept)",
    wrong: ["branch", "balance", "card"],
  },
  "a2p15l2/a2p15q5": {
    why: "reason refreshed against the replaced options",
    prompt: "The parcel should arrive within three working ___.",
    wrong: ["day", "weekends", "Mondays"],
    context:
      "Three working days is the usual delivery wording; day is singular and weekends and Mondays are counted differently.",
  },
  "a2p15l2/a2p15q6": {
    why: "reason refreshed to match the current options",
    context:
      "A package is weighed to find the postage; a bank, an ATM and a branch are places, not parcels.",
    wrong: ["bank", "ATM", "branch"],
  },
  "a2p15l2/a2p15q7": {
    why: "options replaced with same-kind wrong options",
    prompt: "I need to ___ this form before I send it.",
    wrong: ["filling in", "filled in", "fills in"],
  },
  "a2p15l2/a2p15q8": {
    why: "options replaced with same-kind wrong options",
    prompt: "The ___ is outside the bank. (it gives out cash)",
    wrong: ["vending", "washing", "ticket"],
  },
  "a2p15l2/a2p15q9": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "receipt",
  },
  "a2p15l3/a2p15q10": {
    why: "reason refreshed to match the current options",
    context:
      "Airmail post travels by plane; second-class, surface and registered name other kinds of post.",
    prompt: "I'd like to send this by ___ post. (it travels by plane)",
    wrong: ["second-class", "surface", "registered"],
  },
  "a2p15l3/a2p15q11": {
    why: "reason refreshed to match the current options",
    context:
      "A card can be declined by a machine; withdraw, deposit and fill in are base verbs, so a passive after was needs the past participle.",
    wrong: ["withdraw", "deposit", "fill in"],
  },
  "a2p15l3/a2p15q12": {
    why: "reason refreshed to match the current options",
    context: "A PIN number can be changed; parcel, cash and post are other post and money words.",
    wrong: ["parcel", "cash", "post"],
  },
  "a2p15l3/a2p15q13": {
    why: "stamp, PIN and balance are not places",
    context: "the sentence already rules out the other options",
    wrong: ["bank", "branch", "ATM"],
    prompt: "The queue at the ___ was very long today. (where you send parcels)",
  },
  "a2p15l3/a2p15q14": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could you check my account ___, please? (how much money is in it)",
    wrong: ["number", "holder", "manager"],
  },
  "a2p15l4/a2p15q15": {
    why: "the options were not verbs for a cheque you exchange",
    context: "the sentence already rules out the other options",
    wrong: ["deposit", "fill in", "renew"],
    prompt: "I'd like to ___ a cheque, please. (exchange it for money)",
  },
  "a2p15l4/a2p15q16": {
    why: "reason refreshed to match the current options",
    context:
      "Letters sent abroad need more stamps; a cost, a bank and an order are other post and money words.",
    wrong: ["cost", "bank", "order"],
  },
  "a2p15l4/a2p15q17": {
    why: '"forgot my order number" is also correct; the clue says the four digits for my card',
    context: "the sentence already rules out the other options",
    prompt: "I forgot my ___ for the account. (the four digits for my card)",
    wrong: ["branch", "order", "balance"],
  },
  "a2p15l4/a2p15q18": {
    why: "reason refreshed to match the options",
    context:
      "You transfer money to a bank, the place that receives it; the other options are post office words.",
    wrong: ["package", "cost", "stamp"],
  },
  "a2p15l4/a2p15q19": {
    why: "options replaced with same-kind wrong options",
    prompt: "The bank ___ closes at five o'clock. (the local office)",
    wrong: ["account", "card", "loan"],
  },
  "a2p15l5/a2p15q20": {
    why: "reason refreshed to match the current options",
    context:
      "An expired bank card is renewed; withdraw, deposit and fill in act on money and forms.",
    wrong: ["withdraw", "deposit", "fill in"],
  },
  "a2p15l5/a2p15q21": {
    why: "options replaced with same-kind wrong options",
    prompt: "Could you tell me the ___ to send this parcel? (how much I must pay)",
    wrong: ["weight", "colour", "number"],
  },
  "a2p15l5/a2p15q22": {
    why: "options replaced with same-kind wrong options",
    prompt: "I'd like to set up a standing ___. (a regular automatic payment)",
    wrong: ["account", "card", "queue"],
  },
  "a2p15l5/a2p15q23": {
    why: "reason refreshed to match the current options",
    context: "A clerk asks you to sign a form; renew, withdraw and deposit act on cards and money.",
    wrong: ["renew", "withdraw", "deposit"],
  },
  "a2p15l5/a2p15q24": {
    why: "reason refreshed to match the current options",
    context:
      "A delivery is collected from the post office; stamps, a balance and a PIN are bought or checked.",
    wrong: ["stamps", "balance", "PIN"],
  },
  "a2p16l1/a2p16q0": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "My ___ is very quiet and friendly. (the whole area around my house)",
    wrong: ["train", "road", "bus"],
  },
  "a2p16l1/a2p16q1": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "There's a small ___ at the end of my street. (with grass and benches)",
    wrong: ["market", "school", "café"],
  },
  "a2p16l1/a2p16q2": {
    why: "options replaced with same-kind wrong options",
    prompt: "The ___ next door always says hello. (a person who lives beside you)",
    wrong: ["customer", "passenger", "tourist"],
  },
  "a2p16l1/a2p16q3": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "We have a good ___ near our house. (children go there to learn)",
    wrong: ["park", "café", "market"],
  },
  "a2p16l1/a2p16q4": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "There's a busy ___ close to where I live. (cars and lorries drive on it)",
    wrong: ["park", "field", "market"],
  },
  "a2p16l2/a2p16q5": {
    why: "shopping, bus and train are nouns in an adjective slot",
    prompt: "My area has lots of ___ shops. (near to where I live)",
    wrong: ["busy", "quiet", "clean"],
  },
  "a2p16l2/a2p16q6": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The ___ centre is a ten-minute walk away. (where all the shops are)",
    wrong: ["bus", "train", "school"],
  },
  "a2p16l2/a2p16q7": {
    why: '"a quiet area" also fitted',
    prompt: "I live in a ___ area, not the city. (mostly houses, few shops)",
    wrong: ["shopping", "commercial", "industrial"],
  },
  "a2p16l2/a2p16q8": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "There's a nice ___ where I walk my dog. (open and green)",
    wrong: ["café", "market", "school"],
  },
  "a2p16l2/a2p16q9": {
    why: "options replaced with same-kind wrong options",
    prompt: "The bus ___ is right outside my house. (where the bus waits for people)",
    wrong: ["driver", "ticket", "seat"],
  },
  "a2p16l3/a2p16q10": {
    why: "options replaced with same-kind wrong options",
    prompt: "My street is very ___ at night. (there is almost no noise)",
    wrong: ["busy", "noisy", "crowded"],
  },
  "a2p16l3/a2p16q11": {
    why: '"clean" is an adjective; the options are now places',
    imageKey: "market",
    wrong: ["park", "school", "field"],
  },
  "a2p16l3/a2p16q12": {
    why: '"bus station" is also a station; the clue says trains',
    context: "the sentence already rules out the other options",
    prompt: "The ___ station is a short walk from home. (trains arrive there)",
    wrong: ["bus", "leisure", "community"],
  },
  "a2p16l3/a2p16q13": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "There's a lovely ___ near my flat. (I go there for coffee and cake)",
    wrong: ["school", "park", "market"],
  },
  "a2p16l3/a2p16q14": {
    why: "years, clean and quiet are not nouns",
    context: "the sentence already rules out the other options",
    wrong: ["park", "stop", "market"],
    prompt: "My neighbourhood is close to the city ___. (the middle of the city)",
  },
  "a2p16l4/a2p16q15": {
    why: "options and wording fixed after the third review",
    prompt: "The area has lots of green ___. (parks and open land)",
    wrong: ["stop", "centre", "road"],
  },
  "a2p16l4/a2p16q16": {
    why: "options replaced with same-kind wrong options",
    prompt: "There's a friendly ___ atmosphere here. (neighbours know each other)",
    wrong: ["traffic", "parking", "tax"],
  },
  "a2p16l4/a2p16q17": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The ___ near my house has great restaurants. (the district around it)",
    wrong: ["bus", "train", "road"],
  },
  "a2p16l4/a2p16q18": {
    why: "options replaced with same-kind wrong options",
    prompt: "We live in a ___ that's popular with families. (a quiet area outside the city)",
    wrong: ["factory", "airport", "station"],
  },
  "a2p16l4/a2p16q19": {
    why: '"stop / neighbour / community" were nouns for an adjective slot',
    prompt: "The streets here are very ___ and safe. (no rubbish)",
    wrong: ["busy", "residential", "local"],
  },
  "a2p16l5/a2p16q20": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "My building is close to the ___ stop. (where the bus waits)",
    wrong: ["train", "leisure", "community"],
  },
  "a2p16l5/a2p16q21": {
    why: "options replaced with same-kind wrong options",
    prompt: "There's a good ___ centre nearby for sports. (a place for exercise)",
    wrong: ["shopping", "garden", "police"],
  },
  "a2p16l5/a2p16q22": {
    why: "options replaced with same-kind wrong options",
    prompt: "The area gets quite ___ during rush hour. (full of cars and people)",
    wrong: ["empty", "quiet", "silent"],
  },
  "a2p16l5/a2p16q23": {
    why: "options replaced with same-kind wrong options",
    prompt: "My neighbourhood has changed a lot over the ___. (a long period of time)",
    wrong: ["morning", "hour", "minute"],
  },
  "a2p16l5/a2p16q24": {
    why: "reason added",
    prompt: "I really like living in this part of ___.",
    wrong: ["street", "park", "school"],
    context:
      "Part of town is the usual phrase without an article; street, park and school each need the in this phrase.",
  },
  "a2p17l1/a2p17q0": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The cat is sitting ___ the table. (below it)",
    wrong: ["above", "behind", "beside"],
  },
  "a2p17l1/a2p17q1": {
    why: "the clue no longer states the answer",
    prompt: "The vase stands ___ the shelf. (the shelf holds it up)",
    wrong: ["in", "under", "behind"],
  },
  "a2p17l1/a2p17q2": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "She is standing ___ the door. (hidden on the other side of it)",
    wrong: ["in front of", "beside", "against"],
  },
  "a2p17l1/a2p17q4": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The park is ___ the school and the shop. (in the middle of the two)",
    wrong: ["behind", "above", "opposite"],
  },
  "a2p17l2/a2p17q5": {
    why: '"near to his sister" is also correct',
    context: "Sitting next to is the phrase; behind to, far to and beside to his sister are wrong.",
    wrong: ["behind", "far", "beside"],
  },
  "a2p17l2/a2p17q6": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The picture is hanging ___ the wall. (touching it)",
    wrong: ["near", "behind", "in front of"],
  },
  "a2p17l2/a2p17q7": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The dog is running ___ the garden. (in circles)",
    wrong: ["through", "across", "into"],
  },
  "a2p17l2/a2p17q8": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The shop is right ___ the corner. (just past the bend)",
    wrong: ["over", "through", "into"],
  },
  "a2p17l2/a2p17q9": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "She parked the car ___ the building. (not inside it)",
    wrong: ["inside", "in", "between"],
  },
  "a2p17l3/a2p17q10": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The ball rolled ___ the stairs. (from the top to the bottom)",
    wrong: ["up", "over", "across"],
  },
  "a2p17l3/a2p17q11": {
    why: 'duplicate of the A1 sentence "The plane flies above the clouds"; the A2 version uses a new sentence',
    prompt: "The balloon floated ___ the village. (higher than the houses)",
    wrong: ["below", "among", "in"],
  },
  "a2p17l3/a2p17q12": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The cat hid ___ the sofa cushions. (underneath them)",
    wrong: ["above", "behind", "beside"],
  },
  "a2p17l3/a2p17q13": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The children are playing ___ the swings. (next to them)",
    wrong: ["among", "inside", "under"],
  },
  "a2p17l4/a2p17q15": {
    why: "the wrong options were filler from outside the slot's pool; a clue picks opposite",
    prompt: "The bank is ___ the café. (on the other side of the street, facing it)",
    wrong: ["next to", "near", "behind"],
  },
  "a2p17l4/a2p17q16": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "He walked ___ the room and sat down. (entered it)",
    wrong: ["onto", "across", "through"],
  },
  "a2p17l4/a2p17q17": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The lamp is ___ the desk. (right next to it)",
    wrong: ["under", "behind", "opposite"],
  },
  "a2p17l4/a2p17q18": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "She placed the vase ___ the window. (close to it, not touching)",
    wrong: ["in", "on", "against"],
  },
  "a2p17l4/a2p17q19": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The tunnel goes ___ the mountain. (from one side to the other, inside it)",
    wrong: ["over", "around", "along"],
  },
  "a2p17l5/a2p17q20": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The cinema is ___ the shopping centre. (within the building)",
    wrong: ["outside", "behind", "opposite"],
  },
  "a2p17l5/a2p17q21": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "He stood ___ the crowd, watching. (in the middle of the people)",
    wrong: ["behind", "beside", "in front of"],
  },
  "a2p17l5/a2p17q22": {
    why: "reason refreshed to match the options",
    prompt: "The car is parked ___ the garage. (next to it, not inside)",
    wrong: ["in", "behind", "inside"],
    context:
      "Alongside the garage means next to it; the other prepositions place the car inside or behind the building.",
  },
  "a2p17l5/a2p17q23": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The plane flew ___ the city. (it went by without stopping)",
    wrong: ["into", "towards", "onto"],
  },
  "a2p17l5/a2p17q24": {
    why: "options are other motion prepositions",
    prompt: "The path leads ___ the forest. (it stops before the first trees)",
    wrong: ["into", "through", "onto"],
  },
  "a2p18l1/a2p18q0": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["watch", "watched", "watches"],
  },
  "a2p18l1/a2p18q1": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["play", "played", "plays"],
  },
  "a2p18l1/a2p18q2": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["cook", "cooked", "cooks"],
  },
  "a2p18l1/a2p18q3": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["talk", "talked", "talks"],
  },
  "a2p18l1/a2p18q4": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["sleep", "slept", "sleeps"],
  },
  "a2p18l2/a2p18q5": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["read", "readed", "reads"],
  },
  "a2p18l2/a2p18q6": {
    why: "verb forms of one lemma",
    slot: "inflection",
    wrong: ["drive", "drove", "drives"],
  },
  "a2p18l2/a2p18q7": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["study", "studied", "studies"],
  },
  "a2p18l2/a2p18q8": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["walk", "walked", "walks"],
  },
  "a2p18l2/a2p18q9": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["work", "worked", "works"],
  },
  "a2p18l3/a2p18q10": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["wait", "waited", "waits"],
  },
  "a2p18l3/a2p18q11": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["have", "had", "has"],
  },
  "a2p18l3/a2p18q12": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["listen", "listened", "listens"],
  },
  "a2p18l3/a2p18q13": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["shop", "shopped", "shops"],
  },
  "a2p18l3/a2p18q14": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["jog", "jogged", "jogs"],
  },
  "a2p18l4/a2p18q15": {
    why: "verb forms of one lemma",
    slot: "inflection",
    wrong: ["write", "wrote", "writes"],
  },
  "a2p18l4/a2p18q16": {
    why: "verb forms of one lemma",
    slot: "inflection",
    wrong: ["swim", "swam", "swims"],
  },
  "a2p18l4/a2p18q17": {
    why: "verb forms of one lemma",
    slot: "inflection",
    wrong: ["sing", "sang", "sings"],
  },
  "a2p18l4/a2p18q18": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["camp", "camped", "camps"],
  },
  "a2p18l4/a2p18q19": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["paint", "painted", "paints"],
  },
  "a2p18l5/a2p18q20": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["dream", "dreamed", "dreams"],
  },
  "a2p18l5/a2p18q21": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["argue", "argued", "argues"],
  },
  "a2p18l5/a2p18q22": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["dance", "danced", "dances"],
  },
  "a2p18l5/a2p18q23": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["chat", "chatted", "chats"],
  },
  "a2p18l5/a2p18q24": {
    why: "verb forms of one lemma",
    slot: "inflection",
    wrong: ["ride", "rode", "rides"],
  },
  "a2p19l1/a2p19q0": {
    why: "past cue present: the present modals are wrong, and 'ought'/'used' were out of the pool",
    wrong: ["can", "may", "will"],
  },
  "a2p19l1/a2p19q1": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "___ I open the window, please? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l1/a2p19q2": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "She ___ speak three languages fluently. (she has the skill)",
    wrong: ["must", "might", "would"],
  },
  "a2p19l1/a2p19q3": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "___ you help me carry this bag? (a polite request)",
    wrong: ["must", "shall", "might"],
  },
  "a2p19l1/a2p19q4": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "We ___ leave early if we finish the work. (it is possible)",
    wrong: ["would", "must", "mustn't"],
  },
  "a2p19l2/a2p19q5": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "___ I use your phone for a moment? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l2/a2p19q6": {
    why: "past cue present: the present modals are wrong, and 'ought'/'used' were out of the pool",
    wrong: ["can", "may", "will"],
  },
  "a2p19l2/a2p19q8": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "___ I ask you a question? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l2/a2p19q9": {
    why: "past cue present: the present modals are wrong, and 'ought'/'used' were out of the pool",
    wrong: ["may", "can", "will"],
  },
  "a2p19l3/a2p19q11": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "___ you pass me the salt, please? (a polite request)",
    wrong: ["must", "shall", "might"],
  },
  "a2p19l3/a2p19q12": {
    why: "options and wording fixed after the third review",
    prompt: "We ___ not enter without a ticket. (we are unable to)",
    wrong: ["may", "might", "shall"],
  },
  "a2p19l3/a2p19q13": {
    why: "past cue present: the present modals are wrong, and 'ought'/'used' were out of the pool",
    wrong: ["can", "may", "will"],
  },
  "a2p19l3/a2p19q14": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "___ I sit here, or is this seat taken? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l4/a2p19q16": {
    why: "past cue present: the present modals are wrong, and 'ought'/'used' were out of the pool",
    wrong: ["can", "may", "will"],
  },
  "a2p19l4/a2p19q17": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "___ we borrow your umbrella, please? (a polite request)",
    wrong: ["must", "will", "shall"],
  },
  "a2p19l4/a2p19q18": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "He ___ lift very heavy weights at the gym. (he is strong enough)",
    wrong: ["must", "would", "should"],
  },
  "a2p19l4/a2p19q19": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "___ I leave the room for a moment? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l5/a2p19q20": {
    why: "past cue present: the present modals are wrong, and 'ought'/'used' were out of the pool",
    wrong: ["can", "may", "will"],
  },
  "a2p19l5/a2p19q22": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "___ you show me the way to the station? (a polite request)",
    wrong: ["must", "shall", "might"],
  },
  "a2p19l5/a2p19q23": {
    why: "past cue present: the present modals are wrong, and 'ought'/'used' were out of the pool",
    wrong: ["can", "may", "will"],
  },
  "a2p19l5/a2p19q24": {
    why: "can/could/may all fit without the function; the clue says which",
    prompt: "I ___ help you with your homework if you want. (I am able to)",
    wrong: ["must", "should", "would"],
  },
  "a2p1l1/a2p1q0": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["goed", "gone", "goes"],
  },
  "a2p1l1/a2p1q1": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["eated", "eaten", "eats"],
  },
  "a2p1l1/a2p1q2": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["buyed", "buied", "buys"],
  },
  "a2p1l1/a2p1q3": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["bringed", "brang", "brings"],
  },
  "a2p1l1/a2p1q4": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["thinked", "thank", "thunk"],
  },
  "a2p1l2/a2p1q5": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["teached", "teacht", "teaches"],
  },
  "a2p1l2/a2p1q6": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["catched", "catchd", "catches"],
  },
  "a2p1l2/a2p1q7": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["seed", "seen", "sees"],
  },
  "a2p1l2/a2p1q8": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["taked", "taken", "takes"],
  },
  "a2p1l2/a2p1q9": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["gived", "given", "gives"],
  },
  "a2p1l3/a2p1q10": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["writed", "written", "writes"],
  },
  "a2p1l3/a2p1q11": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["drived", "driven", "drives"],
  },
  "a2p1l3/a2p1q12": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["speaked", "spoken", "speaks"],
  },
  "a2p1l3/a2p1q13": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["breaked", "broken", "breaks"],
  },
  "a2p1l3/a2p1q14": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["choosed", "chosen", "chooses"],
  },
  "a2p1l4/a2p1q15": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["knowed", "known", "knows"],
  },
  "a2p1l4/a2p1q16": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["growed", "grown", "grows"],
  },
  "a2p1l4/a2p1q17": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["flyed", "flown", "flies"],
  },
  "a2p1l4/a2p1q18": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["beginned", "begun", "begins"],
  },
  "a2p1l4/a2p1q19": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["drinked", "drunk", "drinks"],
  },
  "a2p1l5/a2p1q20": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["swimmed", "swum", "swims"],
  },
  "a2p1l5/a2p1q21": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["runned", "run", "runs"],
  },
  "a2p1l5/a2p1q22": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["sitted", "sitt", "sits"],
  },
  "a2p1l5/a2p1q23": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["winned", "win", "wins"],
  },
  "a2p1l5/a2p1q24": {
    why: "other verbs' past forms are too easy to rule out; the real errors are the regularised form and the participle",
    wrong: ["leaved", "leavd", "leaves"],
  },
  "a2p20l1/a2p20q0": {
    why: "options replaced with same-kind wrong options",
    prompt: "This bag is as ___ as that one. (they weigh the same)",
    wrong: ["tall", "wide", "loud"],
  },
  "a2p20l1/a2p20q1": {
    why: "options replaced with same-kind wrong options",
    prompt: "She is as ___ as her sister. (the same height)",
    wrong: ["old", "wide", "heavy"],
  },
  "a2p20l1/a2p20q2": {
    why: "reason refreshed to match the current options",
    context:
      "A test is described as difficult or easy; warm, tall and sweet describe people, weather or food.",
    wrong: ["warm", "tall", "sweet"],
  },
  "a2p20l1/a2p20q3": {
    why: "options replaced with same-kind wrong options",
    prompt: "His car is as ___ as mine. (they go at the same speed)",
    wrong: ["big", "loud", "old"],
  },
  "a2p20l1/a2p20q4": {
    why: '"as quick / small" were weak options; the clue picks the one that burns',
    context: "the sentence already rules out the other options",
    prompt: "This soup is as ___ as the last one. (it burns your tongue)",
    wrong: ["sweet", "cold", "hard"],
  },
  "a2p20l2/a2p20q5": {
    why: "options replaced with same-kind wrong options",
    prompt: "The film was as ___ as the book. (equally enjoyable)",
    wrong: ["expensive", "heavy", "wide"],
  },
  "a2p20l2/a2p20q6": {
    why: "options and wording fixed after the third review",
    prompt: "He runs as ___ as a professional sprinter. (very fast)",
    wrong: ["slow", "weak", "tired"],
  },
  "a2p20l2/a2p20q7": {
    why: "options replaced with same-kind wrong options",
    prompt: "This hotel is as ___ as the other one. (it costs the same)",
    wrong: ["big", "old", "noisy"],
  },
  "a2p20l2/a2p20q8": {
    why: "options and wording fixed after the third review",
    prompt: "Her English is as ___ as her brother's. (speaks smoothly)",
    wrong: ["poor", "basic", "weak"],
  },
  "a2p20l2/a2p20q9": {
    why: "options replaced with same-kind wrong options",
    prompt: "The weather today is as ___ as yesterday. (it is freezing)",
    wrong: ["hot", "warm", "mild"],
  },
  "a2p20l3/a2p20q10": {
    why: "options replaced with same-kind wrong options",
    prompt: "This restaurant is as ___ as the one downtown. (it has as many customers)",
    wrong: ["quiet", "tiny", "silent"],
  },
  "a2p20l3/a2p20q11": {
    why: "reason refreshed against the replaced options",
    prompt: "The exam was not as ___ as I thought. (difficult)",
    wrong: ["easy", "short", "long"],
    context:
      "Hard here means difficult, in contrast with easy; short and long describe length, not how hard an exam is.",
  },
  "a2p20l3/a2p20q12": {
    why: "options replaced with same-kind wrong options",
    prompt: "This coffee is as ___ as the one at home. (it wakes you up just as much)",
    wrong: ["weak", "cold", "small"],
  },
  "a2p20l3/a2p20q13": {
    why: "options replaced with same-kind wrong options",
    prompt: "The journey was as ___ as we expected. (it took the same time)",
    wrong: ["heavy", "loud", "wide"],
  },
  "a2p20l3/a2p20q14": {
    why: "options replaced with same-kind wrong options",
    prompt: "His new phone is as ___ as the old one. (it never breaks down)",
    wrong: ["heavy", "cheap", "noisy"],
  },
  "a2p20l4/a2p20q15": {
    why: "options replaced with same-kind wrong options",
    prompt: "This road is as ___ as the motorway. (the same amount of traffic)",
    wrong: ["quiet", "empty", "clean"],
  },
  "a2p20l4/a2p20q16": {
    why: "options replaced with same-kind wrong options",
    prompt: "The party was as ___ as last year's. (everyone enjoyed it as much)",
    wrong: ["boring", "cold", "quiet"],
  },
  "a2p20l4/a2p20q17": {
    why: "options replaced with same-kind wrong options",
    prompt: "Her cooking is as ___ as a professional chef's. (it tastes just as good)",
    wrong: ["terrible", "awful", "bland"],
  },
  "a2p20l4/a2p20q18": {
    why: "options replaced with same-kind wrong options",
    prompt: "The city is as ___ as the countryside. (just as quiet and calm)",
    wrong: ["noisy", "crowded", "busy"],
  },
  "a2p20l4/a2p20q19": {
    why: "options replaced with same-kind wrong options",
    prompt: "This jacket is as ___ as the other colour. (it keeps you cosy)",
    wrong: ["light", "heavy", "expensive"],
  },
  "a2p20l5/a2p20q20": {
    why: "options replaced with same-kind wrong options",
    prompt: "My flat is as ___ as yours. (the same size, tiny)",
    wrong: ["large", "huge", "big"],
  },
  "a2p20l5/a2p20q21": {
    why: "options replaced with same-kind wrong options",
    prompt: "The lesson was as ___ as the last one. (it kept me awake just as much)",
    wrong: ["boring", "long", "short"],
  },
  "a2p20l5/a2p20q22": {
    why: "options replaced with same-kind wrong options",
    prompt: "This wine is as ___ as the other bottle. (the same amount of sugar)",
    wrong: ["bitter", "salty", "sour"],
  },
  "a2p20l5/a2p20q23": {
    why: "options replaced with same-kind wrong options",
    prompt: "Her plan is as ___ as mine. (just as easy to follow)",
    wrong: ["complicated", "difficult", "confusing"],
  },
  "a2p20l5/a2p20q24": {
    why: "options replaced with same-kind wrong options",
    prompt: "The bridge is as ___ as the old one. (it won't break)",
    wrong: ["fragile", "weak", "flimsy"],
  },
  "a2p2l1/a2p2q0": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["go", "goes", "goed"],
  },
  "a2p2l1/a2p2q1": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["were", "is", "did"],
  },
  "a2p2l1/a2p2q2": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "They ___ not come to the party last night.",
    wrong: ["do", "was", "were"],
  },
  "a2p2l1/a2p2q3": {
    why: "verb forms of one lemma",
    slot: "inflection",
    wrong: ["was talking", "were talk", "have talked"],
    prompt: "While we ___ , the phone rang.",
    context:
      "While plus the past continuous sets up a longer action that the phone call interrupted; was talking disagrees with we.",
  },
  "a2p2l1/a2p2q4": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["lose", "loses", "losed"],
  },
  "a2p2l2/a2p2q6": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["was", "are", "did"],
  },
  "a2p2l2/a2p2q7": {
    why: "reason refreshed against the replaced options",
    slot: "inflection",
    wrong: ["start", "starts", "starting"],
    prompt: "The film ___ at eight yesterday.",
  },
  "a2p2l2/a2p2q8": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "Yesterday I ___ tired, so I left.",
    wrong: ["were", "am", "is"],
  },
  "a2p2l2/a2p2q9": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    prompt: "When she was young, she ___ use to smoke.",
    wrong: ["doesn't", "don't", "wasn't"],
  },
  "a2p2l3/a2p2q10": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "It ___ raining all morning yesterday.",
    wrong: ["were", "is", "are"],
  },
  "a2p2l3/a2p2q11": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["get", "gets", "getted"],
  },
  "a2p2l3/a2p2q12": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["were", "is", "am"],
  },
  "a2p2l3/a2p2q13": {
    why: "reason refreshed against the replaced options",
    slot: "inflection",
    wrong: ["finish", "finishes", "finishing"],
    prompt: "I ___ my homework before dinner yesterday.",
  },
  "a2p2l3/a2p2q14": {
    why: "the past continuous is fixed by the time; no other tense fits",
    slot: "inflection",
    wrong: ["was playing", "were play", "are playing"],
    prompt: "At six o'clock yesterday, the children ___ in the garden.",
  },
  "a2p2l4/a2p2q15": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "We ___ hear anything last night.",
    wrong: ["don't", "weren't", "wasn't"],
  },
  "a2p2l4/a2p2q16": {
    why: "time anchor added",
    slot: "inflection",
    wrong: ["close", "closes", "closing"],
    prompt: "She ___ the door quietly last night.",
  },
  "a2p2l4/a2p2q17": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "What ___ you doing at six yesterday?",
    wrong: ["was", "are", "did"],
  },
  "a2p2l4/a2p2q18": {
    why: "time anchor added",
    slot: "inflection",
    wrong: ["arrive", "arrives", "arriving"],
    prompt: "The train ___ on time yesterday.",
  },
  "a2p2l4/a2p2q19": {
    why: "options are forms of use",
    slot: "inflection",
    wrong: ["use", "uses", "to use"],
    prompt: "He ___ to walk to school when he was young.",
  },
  "a2p2l5/a2p2q20": {
    why: "time anchor added so only the past form fits",
    slot: "inflection",
    wrong: ["know", "knows", "knowed"],
    prompt: "Nobody ___ what to say at the party last night.",
  },
  "a2p2l5/a2p2q21": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["were", "am", "did"],
  },
  "a2p2l5/a2p2q22": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "They ___ a great time last summer.",
    wrong: ["have", "has", "having"],
  },
  "a2p2l5/a2p2q23": {
    why: "time anchor added",
    slot: "inflection",
    wrong: ["go", "goes", "goed"],
    prompt: "Last night the lights ___ out suddenly.",
  },
  "a2p2l5/a2p2q24": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["were", "is", "did"],
  },
  "a2p3l1/a2p3q0": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["biger", "more big", "bigier"],
  },
  "a2p3l1/a2p3q1": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["hoter", "more hot", "hotier"],
  },
  "a2p3l1/a2p3q2": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["happyer", "happyier", "most happy"],
  },
  "a2p3l1/a2p3q3": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["easyer", "more easy", "easiest"],
  },
  "a2p3l1/a2p3q4": {
    why: '"well" is an adverb, not a comparative',
    wrong: ["more good", "gooder", "best"],
  },
  "a2p3l2/a2p3q5": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["worser", "badder", "more bad"],
  },
  "a2p3l2/a2p3q6": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["farer", "more far", "furtherer"],
  },
  "a2p3l2/a2p3q7": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["expensiver", "most expensive", "more expensiver"],
  },
  "a2p3l2/a2p3q8": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["beautifuler", "most beautiful", "more beautifuler"],
  },
  "a2p3l2/a2p3q9": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["thiner", "more thin", "thinier"],
  },
  "a2p3l3/a2p3q10": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["earlyer", "more early", "earler"],
  },
  "a2p3l3/a2p3q11": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["busyer", "more busy", "busyier"],
  },
  "a2p3l3/a2p3q12": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["safeer", "safier", "most safe"],
  },
  "a2p3l3/a2p3q13": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["largeer", "more large", "largger"],
  },
  "a2p3l3/a2p3q14": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["simpleer", "simplier", "most simple"],
  },
  "a2p3l4/a2p3q15": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["carefuler", "most careful", "more carefuller"],
  },
  "a2p3l4/a2p3q16": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["tireder", "most tired", "tiredder"],
  },
  "a2p3l4/a2p3q17": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["funnyer", "funer", "most funny"],
  },
  "a2p3l4/a2p3q18": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["heavyer", "more heavy", "heavyier"],
  },
  "a2p3l4/a2p3q19": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["moderner", "most modern", "modernner"],
  },
  "a2p3l5/a2p3q20": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["narrowwer", "most narrow", "narroweer"],
  },
  "a2p3l5/a2p3q21": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["politeer", "most polite", "more politer"],
  },
  "a2p3l5/a2p3q22": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["quieteer", "quietter", "most quiet"],
  },
  "a2p3l5/a2p3q23": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["strangeer", "strangger", "most strange"],
  },
  "a2p3l5/a2p3q24": {
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["usefuler", "most useful", "more usefuler"],
  },
  "a2p4l1/a2p4q0": {
    why: "verb forms of one lemma",
    prompt: "Can I ___ this on? (in a shop, to see if it fits)",
    wrong: ["trying", "tried", "tries"],
    slot: "inflection",
  },
  "a2p4l1/a2p4q1": {
    why: "options and wording fixed after the third review",
    wrong: ["booking", "booked", "books"],
    prompt: "I'd like to ___ a room.",
    slot: "inflection",
  },
  "a2p4l1/a2p4q2": {
    why: "reason refreshed to match the current options",
    context:
      "The bill is what you ask for when you want to pay; a menu, a receipt and change are other restaurant items.",
    prompt: "Could I have the ___ , please? (we want to pay)",
    wrong: ["menu", "receipt", "change"],
  },
  "a2p4l1/a2p4q3": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["do", "is", "are"],
  },
  "a2p4l1/a2p4q4": {
    why: "options replaced with same-kind wrong options",
    prompt: "Do you ___ cards? (accept payment)",
    wrong: ["taking", "took", "takes"],
  },
  "a2p4l2/a2p4q5": {
    why: "reason refreshed to match the current options",
    context:
      "Luggage is checked in at the airport; fit, looking and delayed go with other situations.",
    wrong: ["fit", "looking", "delayed"],
  },
  "a2p4l2/a2p4q6": {
    why: "time anchor added so only one tense fits",
    prompt: "The train ___ from platform 4 at nine every day.",
    wrong: ["depart", "departing", "departure"],
  },
  "a2p4l2/a2p4q7": {
    why: "options replaced with same-kind wrong options",
    prompt: "I'd like a ___ ticket, please. (a trip there and back)",
    wrong: ["single", "student", "child"],
  },
  "a2p4l2/a2p4q8": {
    why: "options and wording fixed after the third review",
    prompt: "Is this seat ___ ?",
    wrong: ["take", "taking", "takes"],
    slot: "inflection",
  },
  "a2p4l2/a2p4q9": {
    why: "options replaced with same-kind wrong options",
    prompt: "Can you ___ me the way to the museum?",
    wrong: ["shows", "showing", "showed"],
  },
  "a2p4l3/a2p4q10": {
    why: "options replaced with same-kind wrong options",
    prompt: "I'm just ___ , thanks. (browsing in a shop)",
    wrong: ["look", "looked", "looks"],
  },
  "a2p4l3/a2p4q11": {
    why: "reason refreshed to match the current options",
    context: "A size can be bigger; colour, style and shape come in other kinds of difference.",
    wrong: ["colour", "style", "shape"],
  },
  "a2p4l3/a2p4q12": {
    why: "reason refreshed to match the current options",
    context:
      "A jacket is returned to a shop; wear, try and buy happen before or instead of taking it back.",
    prompt: "I'd like to ___ this jacket. (take it back to the shop)",
    wrong: ["wear", "try", "buy"],
  },
  "a2p4l3/a2p4q13": {
    why: "options replaced with same-kind wrong options",
    prompt: "What time is ___ out? (leaving the hotel)",
    wrong: ["take", "set", "hand"],
  },
  "a2p4l3/a2p4q14": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "cash machine",
  },
  "a2p4l4/a2p4q15": {
    why: "options replaced with same-kind wrong options",
    prompt: "The flight has been ___ .",
    wrong: ["delay", "delaying", "delays"],
  },
  "a2p4l4/a2p4q16": {
    why: "verb forms of one lemma",
    prompt: "Could you ___ that down for me?",
    wrong: ["wrote", "writing", "writes"],
    context:
      "Write down is the phrasal verb for noting something on paper; wrote, writing and writes have the wrong form after Could you.",
    slot: "inflection",
  },
  "a2p4l4/a2p4q17": {
    why: "options replaced with same-kind wrong options",
    prompt: "I'd like to ___ some money. (swap it into another currency)",
    wrong: ["changing", "changed", "changes"],
  },
  "a2p4l4/a2p4q18": {
    why: '"Are you behind in the queue?" is also correct; the clue says your turn is next',
    context: "the sentence already rules out the other options",
    wrong: ["behind", "near", "far"],
    prompt: "Are you ___ in the queue? (it is your turn after this person)",
  },
  "a2p4l4/a2p4q19": {
    why: "reason refreshed to match the current options",
    context:
      "A taxi is how you get to the airport; a bill, a fit and a size are words from shops and restaurants.",
    wrong: ["bill", "fit", "size"],
  },
  "a2p4l5/a2p4q20": {
    why: "options replaced with same-kind wrong options",
    prompt: "This shirt doesn't ___ me. (it's too small)",
    wrong: ["fits", "fitting", "fitted"],
  },
  "a2p4l5/a2p4q21": {
    why: "reason refreshed to match the current options",
    context:
      "Out of stock is the fixed phrase for a shop with none left; off, away and back change the phrase.",
    wrong: ["off", "away", "back"],
  },
  "a2p4l5/a2p4q22": {
    why: "reason refreshed to match the options",
    context:
      "In a shop I'll take it means I'm buying; the other options use the wrong verb form after I'll.",
    wrong: ["write", "looking", "delayed"],
  },
  "a2p4l5/a2p4q23": {
    why: "reason refreshed to match the current options",
    context: "A bus is caught at a stop; fit, write and wash go with clothes, letters and dishes.",
    wrong: ["fit", "write", "wash"],
  },
  "a2p4l5/a2p4q24": {
    why: "options replaced with same-kind wrong options",
    prompt: "The price ___ breakfast. (it is part of what you pay)",
    wrong: ["include", "including", "to include"],
  },
  "a2p5l3/a2p5q11": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["many", "few", "several"],
  },
  "a2p5l4/a2p5q19": {
    why: "options replaced with same-kind wrong options",
    prompt: "Add a ___ of salt. (a very small amount between two fingers)",
    wrong: ["spoon", "cup", "bag"],
  },
  "a2p5l5/a2p5q22": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["to", "with", "from"],
  },
  "a2p5l5/a2p5q23": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["to", "with", "from"],
  },
  "a2p6l1/a2p6q0": {
    why: "options and wording fixed after the third review",
    prompt: "I promise I ___ call you tomorrow.",
    wrong: ["must", "should", "might"],
  },
  "a2p6l1/a2p6q1": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "We ___ going to move house next month.",
    wrong: ["is", "am", "were"],
  },
  "a2p6l1/a2p6q2": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "She ___ meeting Tom at six tonight.",
    wrong: ["are", "am", "was"],
  },
  "a2p6l1/a2p6q3": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "___ you help me, please? (a polite request)",
    wrong: ["Shall", "Must", "Might"],
  },
  "a2p6l1/a2p6q4": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["go", "gone"],
  },
  "a2p6l2/a2p6q5": {
    why: "verb forms of one lemma",
    slot: "inflection",
    wrong: ["leave", "leaving", "left"],
  },
  "a2p6l2/a2p6q6": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "They ___ probably be late. (a prediction)",
    wrong: ["might", "can", "must"],
  },
  "a2p6l2/a2p6q7": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["go"],
  },
  "a2p6l2/a2p6q8": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "I ___ have the soup, please. (deciding now, and sure)",
    wrong: ["might", "may", "could"],
  },
  "a2p6l2/a2p6q9": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["is", "am", "were"],
  },
  "a2p6l3/a2p6q10": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "He ___ be twenty next month. (a certain fact)",
    wrong: ["might", "may", "could"],
  },
  "a2p6l3/a2p6q11": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["have", "has", "had"],
  },
  "a2p6l3/a2p6q12": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "I promise I ___ tell anyone. (a promise)",
    wrong: ["can't", "shouldn't", "mustn't"],
  },
  "a2p6l3/a2p6q13": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["go", "goes", "gone"],
  },
  "a2p6l3/a2p6q14": {
    why: "tonight fixes the present-for-schedule form",
    slot: "inflection",
    wrong: ["start", "starting", "started"],
    prompt: "The film ___ at nine tonight.",
  },
  "a2p6l4/a2p6q15": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "___ we take a taxi? (an offer or suggestion)",
    wrong: ["Must", "Might", "Would"],
  },
  "a2p6l4/a2p6q16": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "I ___ send it tomorrow, I promise. (certain)",
    wrong: ["might", "may", "could"],
  },
  "a2p6l4/a2p6q17": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["go"],
  },
  "a2p6l4/a2p6q18": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "I'm certain they ___ come later.",
    wrong: ["might", "may", "could"],
  },
  "a2p6l4/a2p6q19": {
    why: "verb forms of one lemma",
    slot: "inflection",
    wrong: ["take", "takes", "took"],
  },
  "a2p6l5/a2p6q20": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "It ___ be easy, I'm afraid. (it is certain to be hard)",
    wrong: ["will", "might", "may"],
  },
  "a2p6l5/a2p6q21": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "We ___ going to need help soon.",
    wrong: ["is", "am", "were"],
  },
  "a2p6l5/a2p6q22": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "I ___ call you when I arrive. (a promise)",
    wrong: ["might", "may", "could"],
  },
  "a2p6l5/a2p6q23": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["are", "am", "was"],
  },
  "a2p6l5/a2p6q24": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "Nobody ___ notice. (I am sure)",
    wrong: ["might", "may", "could"],
  },
  "a2p7l1/a2p7q0": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "kitchen",
  },
  "a2p7l1/a2p7q1": {
    why: '"in the kitchen / garage" are also sentences; the clue says a cupboard in the bedroom',
    context: "the sentence already rules out the other options",
    wrong: ["kitchen", "garage", "bathroom"],
    prompt: "I keep my clothes in the ___. (a tall cupboard in my bedroom)",
  },
  "a2p7l1/a2p7q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "living room",
  },
  "a2p7l1/a2p7q3": {
    why: '"in the hallway / garage" are also sentences; the clue says next to the shower',
    context: "the sentence already rules out the other options",
    wrong: ["kitchen", "garage", "hallway"],
    prompt: "He's brushing his teeth in the ___. (next to the shower)",
  },
  "a2p7l1/a2p7q4": {
    why: '"plates in the hallway" is also a sentence; the clue says a shelf behind a door',
    context: "the sentence already rules out the other options",
    wrong: ["hallway", "garage", "attic"],
    prompt: "Put the plates in the ___. (they go on a shelf behind a door)",
  },
  "a2p7l2/a2p7q5": {
    why: "the options were not rooms (ceiling, cupboard)",
    context: "the sentence already rules out the other options",
    prompt: "We sleep in the ___. (it has the beds)",
    wrong: ["kitchen", "garage", "bathroom"],
  },
  "a2p7l2/a2p7q6": {
    why: '"light / mattress / hook" are not places',
    context:
      "Gardens are behind a house; nothing can be behind a window, a ceiling or a floor as a place for a garden.",
    wrong: ["window", "ceiling", "floor"],
    prompt: "There's a nice garden behind the ___.",
  },
  "a2p7l2/a2p7q7": {
    why: '"on the wardrobe" is also a sentence; the clue says where we eat',
    context: "the sentence already rules out the other options",
    wrong: ["wardrobe", "attic", "garage"],
    prompt: "I left my keys on the ___. (where we eat)",
  },
  "a2p7l2/a2p7q8": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "sofa",
  },
  "a2p7l2/a2p7q9": {
    why: '"on the table" fitted; the clue says a small bent piece on the wall',
    context: "the sentence already rules out the other options",
    prompt: "Hang your coat on the ___. (a small bent piece on the wall)",
    wrong: ["table", "kitchen", "hallway"],
  },
  "a2p7l3/a2p7q10": {
    why: "the options were not rooms (light, mattress, hook)",
    context: "the sentence already rules out the other options",
    wrong: ["kitchen", "bedroom", "bathroom"],
    prompt: "We eat breakfast in the ___. (the room with the big table for meals)",
  },
  "a2p7l3/a2p7q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "garage",
  },
  "a2p7l3/a2p7q12": {
    why: '"in the kitchen" is also correct; the clue says a separate room',
    context: "the sentence already rules out the other options",
    wrong: ["kitchen", "bedroom", "hallway"],
    prompt: "The washing machine is in the ___. (a separate room just for washing clothes)",
  },
  "a2p7l3/a2p7q13": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "window",
  },
  "a2p7l3/a2p7q14": {
    why: '"close the bedroom" is odd; the clue says you walk through it',
    context: "the sentence already rules out the other options",
    prompt: "Please close the ___ when you leave. (you walk through it)",
    wrong: ["bedroom", "attic", "basement"],
  },
  "a2p7l4/a2p7q15": {
    why: '"in the garage" is also correct; the clue says outside',
    context: "the sentence already rules out the other options",
    wrong: ["garage", "kitchen", "attic"],
    prompt: "We keep the car in the ___. (outside, in front of the house)",
  },
  "a2p7l4/a2p7q16": {
    why: '"up to the bathroom / hallway" fitted; the clue says under the roof',
    context: "the sentence already rules out the other options",
    wrong: ["bathroom", "hallway", "kitchen"],
    prompt: "The stairs lead up to the ___. (the room under the roof)",
  },
  "a2p7l4/a2p7q17": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "garden",
  },
  "a2p7l4/a2p7q18": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "He's cleaning the ___ before guests arrive. (the area just inside the front door)",
    wrong: ["bathroom", "garden", "kitchen"],
  },
  "a2p7l4/a2p7q19": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "mattress",
  },
  "a2p7l5/a2p7q20": {
    why: "reason refreshed to match the current options",
    context:
      "The light is switched off at bedtime; television, heating and oven are other things in a house.",
    prompt: "Turn off the ___ before you sleep. (it makes the room bright)",
    wrong: ["television", "heating", "oven"],
  },
  "a2p7l5/a2p7q21": {
    why: "the options were not homes (bathroom, mat)",
    context: "the sentence already rules out the other options",
    wrong: ["house", "garage", "garden"],
    prompt: "We're renting a small ___ downtown. (an apartment on one floor of a building)",
  },
  "a2p7l5/a2p7q22": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "ceiling",
  },
  "a2p7l5/a2p7q23": {
    why: '"in the wardrobe / attic" fitted; the clue says under the ground floor',
    context: "the sentence already rules out the other options",
    wrong: ["attic", "garage", "kitchen"],
    prompt: "I store old boxes in the ___. (the room under the ground floor)",
  },
  "a2p7l5/a2p7q24": {
    why: "options and wording fixed after the third review",
    imageKey: "mat",
    prompt: "Please wipe your feet on the ___ by the door.",
    wrong: ["bed", "sofa", "wardrobe"],
  },
  "a2p8l4/a2p8q18": { why: "sewing also uses a needle", wrong: ["swimming", "badminton", "golf"] },
  "a2p8l4/a2p8q19": {
    why: "tennis also uses a court and net",
    wrong: ["cricket", "music", "golf"],
  },
  "a2p9l1/a2p9q0": {
    why: "a bad cough is also possible; the clue says a blocked nose",
    context: "the sentence already rules out the other options",
    prompt: "I have a bad ___ and can't stop sneezing. (my nose is blocked)",
    wrong: ["cough", "fever", "headache"],
  },
  "a2p9l1/a2p9q1": {
    why: "options are now illnesses, ruled out by pain in her head",
    context: "the sentence already rules out the other options",
    prompt: "She's got a ___ — take some painkillers. (pain in her head)",
    wrong: ["cough", "fever", "bruise"],
  },
  "a2p9l1/a2p9q2": {
    why: "options were not body parts you run with",
    context: "the sentence already rules out the other options",
    wrong: ["arm", "throat", "wrist"],
    prompt: "My ___ hurts after running. (the part you run with)",
  },
  "a2p9l1/a2p9q3": {
    why: "pulse, throat and fever cannot be broken",
    context: "the sentence already rules out the other options",
    wrong: ["leg", "ankle", "throat"],
    prompt: "He broke his ___ playing football. (his hand was in a sling)",
  },
  "a2p9l1/a2p9q4": {
    why: '"I feel sick" is also correct; the clue says the room is spinning',
    context: "the sentence already rules out the other options",
    wrong: ["sick", "injured", "hungry"],
    prompt: "I feel ___ — I need to sit down. (the room is spinning)",
  },
  "a2p9l2/a2p9q5": {
    why: "options were body parts; now illnesses, ruled out by the pain in her head",
    context: "the sentence already rules out the other options",
    wrong: ["cough", "fever", "bruise"],
    prompt: "She has a ___ — please be quiet. (a very bad pain in her head)",
  },
  "a2p9l2/a2p9q6": {
    why: "reason refreshed to match the current options",
    context:
      "The throat becomes sore from shouting; the ankle, knee and wrist are joints used for moving.",
    wrong: ["ankle", "knee", "wrist"],
  },
  "a2p9l2/a2p9q7": {
    why: "reason refreshed to match the current options",
    context:
      "A high temperature is another way to say fever; cough, headache and bruise go with other words.",
    wrong: ["cough", "headache", "bruise"],
  },
  "a2p9l2/a2p9q8": {
    why: "options were not joints",
    context: "the sentence already rules out the other options",
    prompt: "I twisted my ___ on the stairs. (the joint above my foot)",
    wrong: ["wrist", "knee", "elbow"],
  },
  "a2p9l2/a2p9q9": {
    why: "sick, injured and faint are adjectives",
    context: "the sentence already rules out the other options",
    prompt: "She's allergic to ___. (small hard foods in a shell)",
    wrong: ["bread", "milk", "eggs"],
  },
  "a2p9l3/a2p9q10": {
    why: "a doctor also gives a spray; the clue says you swallow it",
    context: "the sentence already rules out the other options",
    wrong: ["spray", "cream", "bruise"],
    prompt: "The doctor gave me some ___. (I swallow it)",
  },
  "a2p9l3/a2p9q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "dentist",
  },
  "a2p9l3/a2p9q12": {
    why: '"My headache hurts" is also a sentence; the clue puts the pain in the mouth',
    context: "the sentence already rules out the other options",
    prompt: "My ___ hurts when I chew. (the pain is inside your mouth)",
    wrong: ["fever", "dentist", "headache"],
  },
  "a2p9l3/a2p9q13": {
    why: "nuts, spray and tooth are nouns",
    context: "the sentence already rules out the other options",
    wrong: ["dizzy", "faint", "upset"],
    prompt: "He's been ___ since Monday. (ill in bed all week)",
  },
  "a2p9l3/a2p9q14": {
    why: "nuts and wrist are nouns",
    context: "the sentence already rules out the other options",
    wrong: ["injured", "upset", "hungry"],
    prompt: "She fainted because she felt ___. (like she was about to pass out)",
  },
  "a2p9l4/a2p9q15": {
    why: '"headache / fever / ankle": "I cut my ankle" is also correct; the options are now things that cannot be cut',
    imageKey: "finger",
    wrong: ["fever", "cough", "bruise"],
  },
  "a2p9l4/a2p9q16": {
    why: '"checked my fever" also fits; the clue says the beat of the heart',
    context: "the sentence already rules out the other options",
    wrong: ["cough", "fever", "dentist"],
    prompt: "The nurse checked my ___. (the beat of my heart)",
  },
  "a2p9l4/a2p9q17": {
    why: "reason refreshed",
    context:
      "An injured leg needs rest; the other options describe how a person feels instead of a leg.",
    wrong: ["upset", "faint", "dizzy"],
  },
  "a2p9l4/a2p9q18": {
    why: "reason added",
    context: "Upset starts with a vowel sound so an fits; faint, cold and sick take a.",
    wrong: ["faint", "sick", "tired"],
  },
  "a2p9l4/a2p9q19": {
    why: "throat, arm and ankle are not illnesses",
    context: "the sentence already rules out the other options",
    wrong: ["cough", "bruise", "cold"],
    prompt: "She's recovering from a ___. (a high temperature)",
  },
  "a2p9l5/a2p9q20": {
    why: "options and wording fixed after the third review",
    wrong: ["hurting", "is hurts", "to hurt"],
    prompt: "My back ___ after lifting the box.",
    slot: "inflection",
  },
  "a2p9l5/a2p9q21": {
    why: "reason refreshed to match the current options",
    context:
      "A bruise is the dark mark that appears on a knee; a fever, a cough and a headache describe the whole body or head.",
    wrong: ["fever", "cough", "headache"],
  },
  "a2p9l5/a2p9q22": {
    why: "a dentist, spray or medicine is not a symptom",
    context: "the sentence already rules out the other options",
    wrong: ["headache", "ankle", "fever"],
    prompt: "I should see a doctor about my ___. (I keep coughing at night)",
  },
  "a2p9l5/a2p9q23": {
    why: "migraine, cough and fever cannot be sprained",
    context: "the sentence already rules out the other options",
    wrong: ["ankle", "knee", "elbow"],
    prompt: "She sprained her ___ at the gym. (the joint between her hand and arm)",
  },
  "a2p9l5/a2p9q24": {
    why: "options and wording fixed after the third review",
    wrong: ["syrup", "tablet", "plaster"],
    prompt: "The pharmacist recommended this ___ for allergies. (you squirt it into your nose)",
  },
  "u1l1/q4": {
    why: "Fine/Nice evening are also fine greetings; the clue says which",
    prompt: "___ evening, everyone. (a formal greeting)",
    wrong: ["Well", "Fine", "Nice"],
  },
  "u1l1/q5": {
    why: 'nonsense options "Good hello" and "Good time" replaced with real expressions',
    wrong: ["Good morning.", "Good afternoon.", "Good luck."],
    prompt: "Choose the correct farewell for the night. (said to someone going to bed)",
  },
  "u1l1/q7": {
    why: "reason refreshed against the replaced options",
    context:
      "The farewell is See you later; late, latest and lately are different words from the same family.",
  },
  "u1l3/q5": { why: '"by 7 a.m." is also correct', wrong: ["on", "in", "to"] },
  "u1l3/q7": {
    why: '"by Monday" is also plausible; use a clearly wrong preposition',
    wrong: ["at", "in", "to"],
  },
  "u2l1/q1": {
    why: '"I drank coffee every morning" is a correct past habit',
    wrong: ["drinks", "drinking", "is drink"],
  },
  "u2l1/q2": {
    why: '"She woke at 7 a.m." is also correct without a present cue',
    prompt: "She ___ at 7 a.m. every day.",
    wrong: ["wake", "waking", "is wake"],
  },
  "u2l1/q4": {
    why: '"He brushed his teeth twice a day" is a correct past habit',
    wrong: ["brush", "brushing", "is brush"],
  },
  "u2l1/q5": { why: '"Once" is a real frequency adverb', wrong: ["Yesterday", "Tomorrow", "Soon"] },
  "u2l2/q1": {
    why: '"I answered emails all day" is correct',
    wrong: ["answers", "answering", "am answer"],
  },
  "u2l2/q2": {
    why: "options and wording fixed after the third review",
    wrong: ["work", "working", "is work"],
    prompt: "She ___ in a bank.",
  },
  "u2l2/q4": {
    why: '"We had a meeting" is also correct; the options are now agreement and form errors',
    wrong: ["has", "having", "hasn't"],
  },
  "u2l2/q6": {
    why: "the clue fixes the meaning; done Friday also parses",
    prompt: "The report is ___ Friday. (the deadline)",
  },
  "u2l3/q1": {
    why: "reason refreshed against the replaced options",
    wrong: ["enjoys", "enjoying", "am enjoy"],
    prompt: "I ___ playing guitar every weekend.",
  },
  "u2l3/q3": {
    why: '"He played football on weekends" is correct',
    wrong: ["play", "playing", "is play"],
  },
  "u2l3/q4": {
    why: "reason refreshed against the replaced options",
    context:
      "After hate comes an -ing form or to plus a base verb; waits and waited are finite verbs and to waiting mixes the two.",
  },
  "u2l4/q1": { why: '"by 11 p.m." is also correct', wrong: ["on", "in", "to"] },
  "u2l4/q2": {
    why: '"on the evening" and "by the evening" are also correct',
    wrong: ["at", "to", "of"],
  },
  "u2l4/q4": {
    why: "reason refreshed against the replaced options",
    wrong: ["reading", "readed", "is read"],
    prompt: "He ___ a book every night before sleeping.",
  },
  "u2l4/q8": {
    why: "reason refreshed against the replaced options",
    wrong: ["alarms", "alarmed", "alarming"],
    context:
      "Set the alarm is the phrase for a wake-up call; alarms is plural and alarmed and alarming are adjectives.",
  },
  "u3l1/q2": {
    why: "options and wording fixed after the third review",
    prompt: "___ you help me? (a polite request)",
    wrong: ["Must", "Shall", "Should"],
  },
  "u3l1/q4": {
    why: '"Pardon me, is this seat free?" is correct',
    wrong: ["Sorry", "Please", "Excused"],
  },
  "u3l2/q2": {
    why: '"Could I have the bell, please?" is a correct sentence without the clue',
    prompt: "We have finished eating. Could I have the ___, please?",
    wrong: ["build", "bell", "bull"],
  },
  "u3l2/q6": { why: '"pay with card" is also correct', wrong: ["on", "at", "of"] },
  "u3l2/q7": {
    why: '"That was food." is not something anyone says; replaced by a lukewarm reply',
    wrong: ["That was disgusting.", "That was okay-ish.", "That was fine, I suppose."],
  },
  "u3l2/q8": {
    why: '"Keep the chance" is a correct sentence without the clue',
    prompt: "Keep the ___. (the extra money)",
    wrong: ["chance", "chase", "cheap"],
  },
  "u3l3/q2": {
    why: "reason refreshed against the replaced options",
    context:
      "Go straight means keep going in the same direction; strait, straighten and straightly are look-alike words of other kinds.",
  },
  "u3l3/q3": {
    why: '"A big tree" can be a landmark too',
    wrong: ["A friend", "A cloud", "A meal"],
  },
  "u3l3/q6": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The bank is ___ the café. (right beside it)",
    wrong: ["opposite", "behind", "in front of"],
  },
  "u4l1/q2": {
    why: '"I eat dinner at eight" is also correct without a past cue',
    prompt: "I ___ dinner at eight last night.",
    wrong: ["eat", "eaten", "eating"],
  },
  "u4l2/q1": {
    why: "Finally/Meanwhile/However also fit as openers; the next sentence now makes it the first step",
    prompt: "___, I woke up late. Then I had breakfast.",
    wrong: ["Finally", "Because", "Although"],
  },
  "u5l1/q2": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["on", "at", "by"],
  },
  "u5l1/q4": { why: '"paid by cash" and "with cash" are also heard', wrong: ["on", "at", "of"] },
  "u5l1/q6": {
    why: '"anything cheap" is also correct',
    wrong: ["cheapest", "more cheap", "cheaply"],
  },
  "u5l2/q2": {
    why: "take in my luggage also fits without the clue",
    prompt: "I'd like to ___ in my luggage. (hand it over at the airport desk)",
  },
  "u5l2/q4": {
    why: "reason refreshed against the replaced options",
    prompt: "The train ___ from platform 3 every morning.",
  },
  "u6l2/q2": { why: "options are other forms of be", wrong: ["are", "is", "be"] },
  "u6l2/q4": { why: "options are other modals", wrong: ["will", "shall", "must"] },
  "u6l2/q6": { why: "options are other negatives", wrong: ["won't", "mustn't", "needn't"] },
  "u7l1/q2": {
    why: "options are other words from attach",
    context:
      "Please find the report attached is the fixed email phrase; attaching, attach and attachment have the wrong form after the noun.",
    wrong: ["attaching", "attachment", "attachments"],
  },
  "u9l1/q4": {
    why: '"hold ground" is also a phrase; options now cannot hold',
    wrong: ["air", "sand", "oil"],
  },
  "u9l2/q2": {
    why: "reason added",
    context:
      "Data takes the plural verb indicate in formal writing; the other options add to or change the form.",
  },
  "u9l2/q4": {
    why: "options from the particle group; the preposition over has no near rival there",
    wrong: ["onto", "past", "from"],
  },
  "c1p20l4/c1p20q17": {
    why: 'the sentence read "worth to note"; worth takes an -ing form',
    prompt: "It is ___ noting the limitations of this approach.",
  },
  "c1p20l5/c1p20q23": {
    why: 'the sentence read "Consistent with with"; the blank follows the adjective, so the word before it is dropped',
    prompt: "Consistent ___ prior research, the findings confirm the theory.",
  },
};
