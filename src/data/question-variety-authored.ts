// Hand-authored inputs of question-variety.ts, each checked by question-variety.test.ts.

/** Real, correctly spelled English words the course text does not already contain (wrong listening choices only). */
export const REVIEWED_WORDS: string[] =
  "eraser nurses sadder colder darker dirtier coldest august widest longest west train button zip softly gradually thirteen november buys vending".split(
    " ",
  );

/** A reorder sentence that wins over the lesson's own sentences, for a lesson whose own one does not practise the structure it teaches. */
export const REORDER_OVERRIDE: Record<string, string> = {
  a2p3l5: "He is more polite than her",
};

/**
 * A reorder sentence for lessons whose own sentences all carry a movable time, place or frequency
 * adverbial (so the grader's one accepted order would reject a natural alternative), or that have
 * a single sentence (so reorder and listening would repeat it).
 */
export const REORDER_FALLBACK: Record<string, string> = {
  a2p8l1: "He kicks the ball",
  a2p8l5: "She hits the ball",
  a1p20l2: "She takes the tram",
  a1p9l5: "She wears a green skirt",
  a2p3l1: "She is happier than him",
  a2p3l2: "He swims further than me",
  a2p3l3: "She arrives earlier than us",
  a2p3l4: "You are funnier than me",
  a2p13l1: "Go straight ahead",
  a2p13l3: "Take the second street",
  a2p13l5: "Cross the bridge",
  a2p16l3: "My street is very quiet",
  a2p16l5: "The market sells fresh fruit",
  a2p17l4: "The children walk to school",
  a2p20l1: "I am as tall as her",
  a2p20l2: "She is as fluent as him",
  a2p20l4: "He is as busy as me",
  a2p20l5: "You are as lucky as them",
  a1p6l1: "Where do you live",
  a2p2l5: "They had a great time",
  a2p11l4: "The waiter brings the bill",
  a2p20l3: "I am not as fast as him",
  a1p5l5: "They throw a big party",
  a1p10l5: "The sun melts the snow",
  a1p14l3: "A week has seven days",
  a1p14l5: "A minute has sixty seconds",
  a1p16l4: "We walk the dog",
  a1p17l3: "May I use a calculator",
  a1p20l4: "I need to show my ticket",
  a1p20l3: "He drives a red taxi",
  a1p20l5: "I like fast trains",
  a2p19l5: "She could not afford the ticket",
  a2p2l3: "We were playing cards",
  a2p14l4: "I can't manage that day",
  a1p16l1: "I wash my face",
  a1p16l2: "She cooks dinner for the family",
  a1p16l3: "He reads a book to his son",
  a1p17l2: "The teacher gave us a new worksheet",
  a1p17l5: "We have a spelling test",
  a2p2l1: "He lost his keys",
  a2p6l2: "I will have the soup",
  a2p12l1: "How often do you brush your teeth",
  a2p12l2: "How often does she call her mother",
  a2p12l4: "I never eat fish",
  a2p12l5: "He bites his nails",
  a2p14l1: "Do you have any plans",
  a2p18l1: "I was watching TV",
  a2p18l2: "She was studying English",
  a2p18l3: "They were having dinner",
  a2p18l4: "We were camping",
  a2p18l5: "He was singing a song",
  a2p19l1: "I can ride a bike",
  a2p19l2: "They could not attend the meeting",
  a2p19l3: "I could not open the door",
  a2p19l4: "I can hear the music",
};

/**
 * Extra wrong listening choices, keyed by the sentence that is read aloud, for when the cloze's own
 * wrong options are misspelled, sound like the answer or are missing. Each differs from the answer
 * by one or two real words that sound clearly different.
 */
export const LISTENING_EXTRA_WRONGS: Record<string, string[]> = {
  "They could not attend the meeting yesterday.": ["They did not attend the meeting yesterday."],
  "He could not swim before he took lessons.": ["He did not swim before he took lessons."],
  "It is cold today.": ["It is hot today."],
  // a2p16l4: its reorder moved to another sentence once the gate learned that a closing "here" fronts (BACKLOG 0.0-av)
  "There's a friendly community atmosphere here.": ["There's a friendly quiet atmosphere here."],
  "We are not ready.": ["We are not late."],
  "We're having dinner at eight.": ["We're having lunch at eight."],
  "He's taking his exam on Friday.": ["He's taking his exam on Monday."],
  "We are going to need help soon.": ["We are going to need money soon."],
  "I'll have the chicken, please.": ["I'll have the fish, please."],
  "They were swimming when the storm began.": ["They were sleeping when the storm began."],
  "The path leads towards the forest.": ["The path leads around the forest."],
  "The dog is behind the door.": ["The dog is near the door."],
  "This phone looks more modern than mine.": [
    "This phone looks less modern than mine.",
    "This phone looks more modern than yours.",
    "This phone looks more expensive than mine.",
  ],
  "Her plan is as simple as mine.": [
    "Her plan is as simple as yours.",
    "Her plan is as good as mine.",
  ],
  "The ladder is leaning against the wall.": ["The ladder is leaning against the door."],
  "She knits a hat with wool.": [
    "She knits a scarf with wool.",
    "She makes a hat with wool.",
    "She knits a coat with wool.",
  ],
  "The journey was as long as we expected.": ["The journey was as short as we expected."],
  "Let's meet up at the cinema at seven.": ["Let's meet up at the cinema at eight."],
  "My legs hurt after the run.": ["My legs hurt after the game."],
  "This book is thin.": ["This book is new."],
  "What is your name?": ["What is your number?"],
  "I make my bed every morning.": ["I make my bed every evening."],
  "The bill comes to fifteen euros.": ["The bill comes to eight euros."],
  "We arrived at the airport two hours early.": ["We arrived at the airport two hours late."],
  "We swam in the sea.": ["We swam in the lake.", "We swam in the pool.", "We ran in the sea."],
  "Can I try this on?": ["Can I put this on?", "Can I take this off?"],
  "Take the first turning on your left.": ["Take the second turning on your left."],
  "Doctors work to save lives.": [
    "Nurses work to save lives.",
    "Doctors work to save money.",
    "Doctors rest to save lives.",
  ],
  "We use a rubber to erase mistakes.": [
    "We use a pencil to erase mistakes.",
    "We use a pen to erase mistakes.",
  ],
  "The women talk after class.": [
    "The women talk before class.",
    "The women sing after class.",
    "The women talk after lunch.",
  ],
  "The leaves fall in autumn.": [
    "The leaves fall in winter.",
    "The leaves fall in spring.",
    "The leaves grow in autumn.",
  ],
  "There are two parties this weekend.": [
    "There are two parties last weekend.",
    "There are three parties this weekend.",
    "There are two games this weekend.",
  ],
  "Two buses stop here every hour.": [
    "Two trains stop here every hour.",
    "Two buses stop here every day.",
    "Three buses stop here every hour.",
  ],
  "The sheep eat grass on the hill.": [
    "The sheep eat grass on the road.",
    "The cows eat grass on the hill.",
    "The sheep drink water on the hill.",
  ],
  "He goes to work by bus every day.": ["He goes to work by train every day."],
  "Birds fly south in winter.": ["Birds fly west in winter.", "Birds fly south in summer."],
  "I was born in 1998.": ["I was born in 2008."],
  "We meet on Friday evening.": ["We meet on Friday morning."],
  "There is a picture on the wall.": ["There is a picture on the door."],
  "Please come into the room.": ["Please walk into the room."],
  "The cafe is opposite the station.": ["The cafe is near the station."],
  "I take a nap after lunch.": ["I take a nap before lunch."],
  "Whose book is this?": ["Which book is this?"],
  "Who is your best friend?": ["Where is your best friend?", "Who is your new friend?"],
  "Whose bag is on the chair?": ["Which bag is on the chair?"],
  "These shoes have a broken lace.": ["These shoes have a broken strap."],
  "It's very hot today — over thirty degrees.": ["It's very cold today — over thirty degrees."],
  "The police officer helped us.": [
    "The police officer called us.",
    "The police officer stopped us.",
  ],
  "The painter painted our kitchen blue.": ["The painter painted our kitchen green."],
  "The cleaner comes every morning.": ["The cleaner comes every evening."],
  "The day before Wednesday is Tuesday.": ["The day before Wednesday is Sunday."],
  "We often relax on the weekend.": ["We often relax on the beach."],
  "She cooks dinner for the family every evening.": [
    "She cooks dinner for the family every morning.",
    "She cooks lunch for the family every evening.",
  ],
  "He washes the dishes after dinner.": ["He washes the dishes after lunch."],
  "She gets up early on weekdays.": [
    "She gets up late on weekdays.",
    "She gets up early on Sundays.",
  ],
  "The teacher wrote the date on the board.": ["The teacher wrote the date on the page."],
  "The queue at the till was very long.": ["The queue at the station was very long."],
  "I usually walk to work, it's not far.": [
    "I usually walk to work, it's very far.",
    "I usually drive to work, it's not far.",
    "I usually walk to school, it's not far.",
  ],
  "He plays video games after school.": [
    "He plays video games after lunch.",
    "He plays video games before school.",
    "He plays board games after school.",
  ],
  "She goes to school on a bike.": [
    "She goes to school on a bus.",
    "She goes to work on a bike.",
    "She goes to school on a train.",
  ],
  "We play board games on rainy days.": [
    "We play board games on sunny days.",
    "We play video games on rainy days.",
  ],
  "She bought a new bag.": ["She sold a new bag.", "She bought a new coat."],
  "I took the bus to work.": ["I took the train to work."],
  "She wrote a letter to her friend.": [
    "She wrote a letter to her teacher.",
    "She read a letter to her friend.",
  ],
  "I knew the answer.": ["I heard the answer.", "I saw the answer.", "I wrote the answer."],
  "They sat on the grass.": ["They ran on the grass."],
  "I went to the cinema yesterday.": ["I went to the market yesterday."],
  "I finished my homework before dinner yesterday.": [
    "I finished my homework after dinner yesterday.",
    "I finished my homework before lunch yesterday.",
  ],
  "Last night the lights went out suddenly.": ["Last night the lights went out slowly."],
  "She looks happier today.": [
    "She looks sadder today.",
    "She looks tired today.",
    "She looks angry today.",
  ],
  "The weather is worse today.": [
    "The weather is better today.",
    "The weather is colder today.",
    "The weather is hotter today.",
  ],
  "This street is safer at night.": [
    "This street is darker at night.",
    "This street is busier at night.",
    "This street is dirtier at night.",
  ],
  "Be more careful on the stairs.": [
    "Be more careful on the bridge.",
    "Be more careful on the bus.",
    "Be more careful on the road.",
  ],
  "The street is quieter at night.": [
    "The street is louder at night.",
    "The street is darker at night.",
    "The street is busier at night.",
  ],
  "Where do I check in my luggage?": [
    "Where do I check out my luggage?",
    "Why do I check in my luggage?",
    "Where do I check in my coat?",
  ],
  "She is good at sewing.": ["She is good at cooking."],
  "We play card games at night.": [
    "We play card games at noon.",
    "We play video games at night.",
    "We play card games every night.",
  ],
  "July is the hottest month here.": [
    "July is the coldest month here.",
    "August is the hottest month here.",
    "July is the longest month here.",
  ],
  "That is the most expensive watch here.": [
    "That is the most expensive phone here.",
    "That is the most expensive clock here.",
    "That is the most expensive bag here.",
  ],
  "Friday is the busiest day at work.": [
    "Monday is the busiest day at work.",
    "Friday is the quietest day at work.",
    "Friday is the longest day at work.",
  ],
  "He is the most careful driver here.": [
    "He is the most careful pilot here.",
    "He is the most careful teacher here.",
    "He is the most careful cook here.",
  ],
  "This is the narrowest street in the city.": [
    "This is the widest street in the city.",
    "This is the longest street in the city.",
    "This is the narrowest bridge in the city.",
  ],
  "Is service included in the price?": [
    "Is service included in the bill?",
    "Is breakfast included in the price?",
  ],
  "I always brush my teeth at night.": [
    "I never brush my teeth at night.",
    "I always brush my hair at night.",
    "I often brush my teeth at night.",
  ],
  "She often calls her mother.": [
    "She never calls her mother.",
    "She often calls her teacher.",
    "She often calls her sister.",
  ],
  "I call my old friend now and then.": [
    "I call my old friend once a week.",
    "I call my old friend once a day.",
    "I call my new friend now and then.",
  ],
  "I scarcely ever see him now.": [
    "I scarcely ever see her now.",
    "I scarcely ever call him now.",
    "I scarcely ever see him again.",
  ],
  "She routinely checks her email each morning.": [
    "She routinely checks her email each evening.",
    "She routinely checks her phone each morning.",
    "She quickly checks her email each morning.",
  ],
  "Could I withdraw some cash from the machine?": [
    "Could I withdraw some cash from the bank?",
    "Could I withdraw some money from the machine?",
    "Could I borrow some cash from the machine?",
  ],
  "Could you check my account balance, please?": ["Could you check my account details, please?"],
  "He stood among the crowd, watching.": ["He stood near the crowd, watching."],
  "He was sleeping when the alarm went off.": [
    "He was reading when the alarm went off.",
    "He was cooking when the alarm went off.",
  ],
  "We were walking in the park.": ["We were walking in the rain."],
  "He was jogging when he twisted his ankle.": [
    "He was jogging when he twisted his wrist.",
    "He was jogging when he broke his ankle.",
    "He was running when he twisted his ankle.",
  ],
  "She was dancing when she slipped and fell.": [
    "She was singing when she slipped and fell.",
    "She was walking when she slipped and fell.",
  ],
  "I can hear the music from here.": ["I can hear the noise from here."],
  "We can finish the project by Friday.": ["We can finish the project by Monday."],
  "Could we postpone the meeting to next week?": [
    "Could we postpone the meeting to next month?",
    "Could we postpone the party to next week?",
  ],
  "Can you let me know by Friday?": [
    "Can you let me know by Monday?",
    "Can you let him know by Friday?",
  ],
  "Could you write that down for me?": [
    "Could you write that down for him?",
    "Could you write that down for us?",
  ],
};
