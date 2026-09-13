import { advancedUnits, type Level } from "./levels";
import { generatedUnits } from "./lesson-bank";
export type { Level };
export { LEVELS } from "./levels";

export type Question =
  | {
      id: string;
      type: "mc";
      prompt: string;
      choices: string[];
      answer: number;
      explanation: string;
    }
  | {
      id: string;
      type: "fill";
      prompt: string; // uses ___ for blank
      bank: string[];
      answer: string;
      explanation: string;
    };

export type Lesson = {
  id: string;
  title: string;
  subtitle: string;
  questions: Question[];
};

export type Unit = {
  id: string;
  level: Level;
  eyebrow: string;
  title: string;
  description: string;
  lessons: Lesson[];
};

const foundationUnits: Unit[] = [
  {
    id: "u1",
    level: "A1",
    eyebrow: "Unit 1",
    title: "Everyday Basics",
    description: "Greetings, introductions, and the present simple.",
    lessons: [
      {
        id: "u1l1",
        title: "Saying Hello",
        subtitle: "Common greetings",
        questions: [
          {
            id: "q1",
            type: "mc",
            prompt: "Which is a formal greeting?",
            choices: ["Hey!", "What's up?", "Good morning.", "Yo."],
            answer: 2,
            explanation: '"Good morning" is polite and used in professional settings.',
          },
          {
            id: "q2",
            type: "fill",
            prompt: "Nice to ___ you.",
            bank: ["meet", "meat", "met", "meeting"],
            answer: "meet",
            explanation: '"Nice to meet you" is the standard greeting when introduced.',
          },
          {
            id: "q3",
            type: "mc",
            prompt: 'How do you respond to "How are you?"',
            choices: ["I am fine, thanks.", "Yes, please.", "It is Monday.", "Goodbye."],
            answer: 0,
            explanation: 'A short answer with "thanks" is polite and standard.',
          },
          {
            id: "q4",
            type: "fill",
            prompt: "___ evening, everyone.",
            bank: ["Good", "Well", "Fine", "Nice"],
            answer: "Good",
            explanation: 'Time-based greetings use "Good morning/afternoon/evening".',
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Choose the correct farewell for the night.",
            choices: ["Good night.", "Good day.", "Good hello.", "Good time."],
            answer: 0,
            explanation: '"Good night" is used when parting in the evening or before sleep.',
          },
          {
            id: "q6",
            type: "mc",
            prompt: "Which is a casual greeting?",
            choices: ["Good afternoon.", "Hey!", "How do you do?", "Pleased to meet you."],
            answer: 1,
            explanation: '"Hey" is informal, used with friends.',
          },
          {
            id: "q7",
            type: "fill",
            prompt: "See you ___!",
            bank: ["later", "late", "latest", "lately"],
            answer: "later",
            explanation: '"See you later" is a friendly, casual goodbye.',
          },
          {
            id: "q8",
            type: "mc",
            prompt: 'Best reply to "Thank you."',
            choices: ["You're welcome.", "No, thanks.", "Please.", "Sorry."],
            answer: 0,
            explanation: '"You\'re welcome" is the standard polite response.',
          },
        ],
      },
      {
        id: "u1l2",
        title: "About Me",
        subtitle: "Introductions",
        questions: [
          {
            id: "q1",
            type: "fill",
            prompt: "My name ___ Sara.",
            bank: ["is", "are", "am", "be"],
            answer: "is",
            explanation: 'Third-person singular of "to be" is "is".',
          },
          {
            id: "q2",
            type: "fill",
            prompt: "I ___ from Brazil.",
            bank: ["am", "is", "are", "be"],
            answer: "am",
            explanation: 'With "I", use "am".',
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Choose the correct question.",
            choices: [
              "Where you from?",
              "Where are you from?",
              "You where from?",
              "From where you?",
            ],
            answer: 1,
            explanation: 'Questions with "to be" invert the subject and verb.',
          },
          {
            id: "q4",
            type: "mc",
            prompt: '"I am a ___." — pick the noun.',
            choices: ["quickly", "student", "reading", "happy"],
            answer: 1,
            explanation: '"Student" is a noun; the others are adverb, verb, adjective.',
          },
          {
            id: "q5",
            type: "fill",
            prompt: "She ___ a doctor.",
            bank: ["is", "are", "am", "have"],
            answer: "is",
            explanation: '"She" takes "is".',
          },
          {
            id: "q6",
            type: "mc",
            prompt: "How old are you? →",
            choices: ["I have 22.", "I am 22.", "I am 22 years.", "Me 22."],
            answer: 1,
            explanation: 'English uses "to be" for age: "I am 22".',
          },
          {
            id: "q7",
            type: "fill",
            prompt: "They ___ my friends.",
            bank: ["are", "is", "am", "be"],
            answer: "are",
            explanation: 'Plural subjects take "are".',
          },
          {
            id: "q8",
            type: "mc",
            prompt: "Pick the polite introduction.",
            choices: ["I'm Alex, nice to meet you.", "Me Alex.", "Alex here, bye.", "You Alex?"],
            answer: 0,
            explanation: 'Introduce yourself with "I\'m ___, nice to meet you".',
          },
        ],
      },
      {
        id: "u1l3",
        title: "Numbers & Time",
        subtitle: "Telling the hour",
        questions: [
          {
            id: "q1",
            type: "mc",
            prompt: "What time is 3:15?",
            choices: ["Quarter past three", "Half past three", "Quarter to three", "Three sharp"],
            answer: 0,
            explanation: '15 minutes after the hour = "quarter past".',
          },
          {
            id: "q2",
            type: "fill",
            prompt: "It's ___ past six. (30 min)",
            bank: ["half", "quarter", "full", "middle"],
            answer: "half",
            explanation: '30 minutes = "half past".',
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Twelve at night is called…",
            choices: ["Noon", "Midnight", "Dawn", "Dusk"],
            answer: 1,
            explanation: "12:00 AM is midnight.",
          },
          {
            id: "q4",
            type: "mc",
            prompt: 'Which number is "fifteen"?',
            choices: ["50", "15", "5", "500"],
            answer: 1,
            explanation: "Fifteen = 15.",
          },
          {
            id: "q5",
            type: "fill",
            prompt: "I wake up ___ 7 a.m.",
            bank: ["at", "on", "in", "by"],
            answer: "at",
            explanation: 'Use "at" with specific clock times.',
          },
          {
            id: "q6",
            type: "mc",
            prompt: "Choose the correct spelling.",
            choices: ["Fourty", "Forty", "Fortty", "Fourthy"],
            answer: 1,
            explanation: 'The correct spelling is "forty".',
          },
          {
            id: "q7",
            type: "fill",
            prompt: "The meeting is ___ Monday.",
            bank: ["on", "at", "in", "by"],
            answer: "on",
            explanation: 'Use "on" with days of the week.',
          },
          {
            id: "q8",
            type: "mc",
            prompt: "Which is 21?",
            choices: ["Twelve", "Twenty-one", "Two hundred one", "Two-one"],
            answer: 1,
            explanation: "21 = twenty-one, hyphenated.",
          },
        ],
      },
      {
        id: "u1l4",
        title: "Small Talk",
        subtitle: "Weather & everyday chat",
        questions: [
          {
            id: "q1",
            type: "fill",
            prompt: "It's ___ today. Bring an umbrella.",
            bank: ["raining", "rain", "rained", "rains"],
            answer: "raining",
            explanation: "Present continuous describes current weather.",
          },
          {
            id: "q2",
            type: "mc",
            prompt: "Which is a small-talk opener?",
            choices: [
              "What's your salary?",
              "Nice weather, isn't it?",
              "Are you married?",
              "How much rent?",
            ],
            answer: 1,
            explanation: "Weather is a classic, neutral opener.",
          },
          {
            id: "q3",
            type: "fill",
            prompt: "The sun ___ shining.",
            bank: ["is", "are", "am", "be"],
            answer: "is",
            explanation: '"Sun" is singular → "is".',
          },
          {
            id: "q4",
            type: "mc",
            prompt: 'Reply to "Have a good weekend!"',
            choices: ["You too!", "Yes, I have.", "Weekend good.", "No thanks."],
            answer: 0,
            explanation: '"You too!" mirrors the kind wish.',
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Which is cold?",
            choices: ["Boiling", "Freezing", "Warm", "Mild"],
            answer: 1,
            explanation: '"Freezing" means very cold.',
          },
          {
            id: "q6",
            type: "fill",
            prompt: "It's a ___ day. (sunny + warm)",
            bank: ["lovely", "loudly", "lonely", "loose"],
            answer: "lovely",
            explanation: '"Lovely" is a common British small-talk adjective.',
          },
          {
            id: "q7",
            type: "mc",
            prompt: "What do you say when leaving?",
            choices: ["Take care!", "Take it!", "Take me!", "Take five!"],
            answer: 0,
            explanation: '"Take care" is a warm, everyday goodbye.',
          },
          {
            id: "q8",
            type: "fill",
            prompt: "How's it ___?",
            bank: ["going", "go", "goes", "went"],
            answer: "going",
            explanation: '"How\'s it going?" is a casual "how are you?".',
          },
        ],
      },
    ],
  },
  {
    id: "u2",
    level: "A1",
    eyebrow: "Unit 2",
    title: "The Daily Routine",
    description: "Common verbs and time expressions.",
    lessons: [
      {
        id: "u2l1",
        title: "Morning Habits",
        subtitle: "Present simple",
        questions: [
          {
            id: "q1",
            type: "fill",
            prompt: "I ___ coffee every morning.",
            bank: ["drink", "drinks", "drank", "drinking"],
            answer: "drink",
            explanation: "First person singular uses the base verb.",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "She ___ at 7 a.m.",
            bank: ["wakes", "wake", "waking", "woke"],
            answer: "wakes",
            explanation: "Third person singular adds -s.",
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Which is the present simple?",
            choices: ["I ate breakfast.", "I eat breakfast.", "I am eating.", "I will eat."],
            answer: 1,
            explanation: "Present simple describes routines.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "He ___ his teeth twice a day.",
            bank: ["brushes", "brush", "brushed", "brushing"],
            answer: "brushes",
            explanation: "Verbs ending in -sh add -es.",
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Pick the routine adverb.",
            choices: ["Yesterday", "Usually", "Tomorrow", "Once"],
            answer: 1,
            explanation: '"Usually" fits present-simple routines.',
          },
          {
            id: "q6",
            type: "fill",
            prompt: "We ___ breakfast together.",
            bank: ["have", "has", "having", "had"],
            answer: "have",
            explanation: '"We" takes the base form "have".',
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Choose the correct question.",
            choices: [
              "Do you drink coffee?",
              "You drink coffee?",
              "Drink you coffee?",
              "Are you drink coffee?",
            ],
            answer: 0,
            explanation: 'Present-simple questions use "do/does".',
          },
          {
            id: "q8",
            type: "fill",
            prompt: "He ___ not eat meat.",
            bank: ["does", "do", "is", "did"],
            answer: "does",
            explanation: 'Third-person singular negative uses "does not".',
          },
        ],
      },
      {
        id: "u2l2",
        title: "At Work",
        subtitle: "Common workplace verbs",
        questions: [
          {
            id: "q1",
            type: "mc",
            prompt: 'Which verb fits: "I ___ emails all day."',
            choices: ["answer", "answers", "answered", "answering"],
            answer: 0,
            explanation: "First person + present simple = base form.",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "She ___ in a bank.",
            bank: ["works", "work", "working", "worked"],
            answer: "works",
            explanation: "Third person singular adds -s.",
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Pick the professional greeting.",
            choices: ["Yo!", "Hi team,", "Sup all,", "Oi!"],
            answer: 1,
            explanation: '"Hi team," is friendly-professional.',
          },
          {
            id: "q4",
            type: "fill",
            prompt: "We ___ a meeting at 10.",
            bank: ["have", "has", "having", "haves"],
            answer: "have",
            explanation: "Plural subject + base form.",
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Best word for a work friend.",
            choices: ["Colleague", "Cousin", "Client", "Coach"],
            answer: 0,
            explanation: "Colleague = someone you work with.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "The report is ___ Friday.",
            bank: ["due", "do", "did", "done"],
            answer: "due",
            explanation: '"Due" means the deadline is on that day.',
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Polite way to disagree.",
            choices: ["You're wrong.", "That's stupid.", "I see it differently.", "No way."],
            answer: 2,
            explanation: '"I see it differently" is respectful.',
          },
          {
            id: "q8",
            type: "fill",
            prompt: "Let's ___ this offline.",
            bank: ["discuss", "discussion", "discussed", "discussing"],
            answer: "discuss",
            explanation: 'After "let\'s", use the base verb.',
          },
        ],
      },
      {
        id: "u2l3",
        title: "Free Time",
        subtitle: "Hobbies and likes",
        questions: [
          {
            id: "q1",
            type: "fill",
            prompt: "I ___ playing guitar.",
            bank: ["enjoy", "enjoys", "enjoyed", "enjoying"],
            answer: "enjoy",
            explanation: '"I" + base verb.',
          },
          {
            id: "q2",
            type: "mc",
            prompt: 'Which follows "enjoy"?',
            choices: ["to run", "running", "run", "ran"],
            answer: 1,
            explanation: '"Enjoy" is followed by the -ing form.',
          },
          {
            id: "q3",
            type: "fill",
            prompt: "He ___ football on weekends.",
            bank: ["plays", "play", "playing", "played"],
            answer: "plays",
            explanation: "Third person singular.",
          },
          {
            id: "q4",
            type: "mc",
            prompt: '"I hate ___."',
            choices: ["waiting", "to waiting", "waits", "waited"],
            answer: 0,
            explanation: '"Hate" + -ing is very common.',
          },
          {
            id: "q5",
            type: "fill",
            prompt: "She's ___ in photography.",
            bank: ["interested", "interest", "interesting", "interests"],
            answer: "interested",
            explanation: '"Interested in" = a personal feeling.',
          },
          {
            id: "q6",
            type: "mc",
            prompt: 'Opposite of "boring":',
            choices: ["Bored", "Interesting", "Interested", "Busy"],
            answer: 1,
            explanation: "Adjective describing the thing = -ing.",
          },
          {
            id: "q7",
            type: "fill",
            prompt: "We go ___ every Sunday.",
            bank: ["hiking", "hike", "hiked", "hikes"],
            answer: "hiking",
            explanation: '"Go" + activity uses -ing.',
          },
          {
            id: "q8",
            type: "mc",
            prompt: 'Casual "what do you do for fun?"',
            choices: [
              "State your hobbies.",
              "What are you up to?",
              "Report your leisure.",
              "Any activities logged?",
            ],
            answer: 1,
            explanation: '"What are you up to?" is friendly.',
          },
        ],
      },
      {
        id: "u2l4",
        title: "Evening & Sleep",
        subtitle: "Time expressions",
        questions: [
          {
            id: "q1",
            type: "fill",
            prompt: "I go to bed ___ 11 p.m.",
            bank: ["at", "on", "in", "by"],
            answer: "at",
            explanation: 'Specific clock times use "at".',
          },
          {
            id: "q2",
            type: "fill",
            prompt: "We eat dinner ___ the evening.",
            bank: ["in", "at", "on", "by"],
            answer: "in",
            explanation: 'Parts of the day take "in".',
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Which is bedtime slang?",
            choices: ["Hit the hay", "Kick the bucket", "Break a leg", "Piece of cake"],
            answer: 0,
            explanation: '"Hit the hay" = go to sleep.',
          },
          {
            id: "q4",
            type: "fill",
            prompt: "He ___ a book before sleeping.",
            bank: ["reads", "read", "reading", "readed"],
            answer: "reads",
            explanation: "Third person singular adds -s.",
          },
          {
            id: "q5",
            type: "mc",
            prompt: '"I\'m exhausted" means…',
            choices: ["Very hungry", "Very tired", "Very happy", "Very angry"],
            answer: 1,
            explanation: "Exhausted = extremely tired.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "Good ___! Sleep well.",
            bank: ["night", "evening", "morning", "day"],
            answer: "night",
            explanation: '"Good night" is used at bedtime.',
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Which means a short sleep?",
            choices: ["Nap", "Snap", "Slap", "Snip"],
            answer: 0,
            explanation: "A nap is a short sleep.",
          },
          {
            id: "q8",
            type: "fill",
            prompt: "Set the ___ for 7 a.m.",
            bank: ["alarm", "clock", "watch", "timer"],
            answer: "alarm",
            explanation: 'You "set an alarm" to wake up.',
          },
        ],
      },
    ],
  },
  {
    id: "u3",
    level: "A1",
    eyebrow: "Unit 3",
    title: "Polite Requests",
    description: "Ask, offer, and respond with grace.",
    lessons: [
      {
        id: "u3l1",
        title: "Please & Thank You",
        subtitle: "Everyday politeness",
        questions: [
          {
            id: "q1",
            type: "mc",
            prompt: "Most polite request:",
            choices: ["Give me water.", "Water!", "Could I have some water, please?", "Water now."],
            answer: 2,
            explanation: '"Could I…, please?" is the polite formula.',
          },
          {
            id: "q2",
            type: "fill",
            prompt: "___ you help me?",
            bank: ["Could", "Should", "Must", "Will"],
            answer: "Could",
            explanation: '"Could you…?" is polite.',
          },
          {
            id: "q3",
            type: "mc",
            prompt: 'Reply to "Thanks a lot!"',
            choices: ["It's nothing.", "You're welcome.", "Both are fine.", "Neither."],
            answer: 2,
            explanation: "Both are common polite replies.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "___ me, is this seat free?",
            bank: ["Excuse", "Sorry", "Please", "Pardon"],
            answer: "Excuse",
            explanation: '"Excuse me" is the standard opener.',
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Best way to interrupt politely:",
            choices: ["Hey you!", "Sorry to interrupt…", "Listen up!", "Stop!"],
            answer: 1,
            explanation: 'Soften with "Sorry to interrupt".',
          },
          {
            id: "q6",
            type: "fill",
            prompt: "Would you ___ opening the window?",
            bank: ["mind", "want", "like", "care"],
            answer: "mind",
            explanation: '"Would you mind + -ing?" is very polite.',
          },
          {
            id: "q7",
            type: "mc",
            prompt: 'After "Would you mind…?", "No" means…',
            choices: ["I refuse.", "I don't mind — happy to.", "I'm confused.", "I already did."],
            answer: 1,
            explanation: '"No" means "I have no objection".',
          },
          {
            id: "q8",
            type: "fill",
            prompt: "Thanks ___ your help.",
            bank: ["for", "to", "of", "on"],
            answer: "for",
            explanation: '"Thanks for" + noun/-ing.',
          },
        ],
      },
      {
        id: "u3l2",
        title: "At a Café",
        subtitle: "Ordering food and drink",
        questions: [
          {
            id: "q1",
            type: "mc",
            prompt: "Polite way to order:",
            choices: [
              "Give coffee.",
              "I'll have a coffee, please.",
              "Coffee here.",
              "Bring coffee!",
            ],
            answer: 1,
            explanation: '"I\'ll have… please" is standard.',
          },
          {
            id: "q2",
            type: "fill",
            prompt: "Could I have the ___, please?",
            bank: ["bill", "build", "bell", "bull"],
            answer: "bill",
            explanation: 'The "bill" (UK) or "check" (US) is what you pay.',
          },
          {
            id: "q3",
            type: "mc",
            prompt: '"For here or to go?" is asking…',
            choices: ["Where you live", "If you'll eat in or take away", "Your name", "Your order"],
            answer: 1,
            explanation: "Servers ask this in cafés.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "I'd ___ a latte, please.",
            bank: ["like", "likes", "liked", "liking"],
            answer: "like",
            explanation: '"I\'d like" = "I would like" — polite.',
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Ask for a recommendation:",
            choices: ["Give me something.", "What do you recommend?", "You choose.", "Random one."],
            answer: 1,
            explanation: '"What do you recommend?" is polite.',
          },
          {
            id: "q6",
            type: "fill",
            prompt: "Can I pay ___ card?",
            bank: ["by", "with", "on", "at"],
            answer: "by",
            explanation: '"Pay by card / by cash" — with "by".',
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Response to a great meal:",
            choices: [
              "That was delicious!",
              "That was disgusting.",
              "That was okay-ish.",
              "That was food.",
            ],
            answer: 0,
            explanation: '"Delicious" is a strong compliment.',
          },
          {
            id: "q8",
            type: "fill",
            prompt: "Keep the ___.",
            bank: ["change", "chance", "chase", "cheap"],
            answer: "change",
            explanation: '"Keep the change" leaves a tip.',
          },
        ],
      },
      {
        id: "u3l3",
        title: "Asking for Directions",
        subtitle: "Getting around",
        questions: [
          {
            id: "q1",
            type: "mc",
            prompt: "Polite opener:",
            choices: [
              "Where's the station?",
              "Excuse me, could you tell me where the station is?",
              "Station?",
              "Point to station!",
            ],
            answer: 1,
            explanation: "Longer indirect questions sound polite.",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "Go ___ for two blocks.",
            bank: ["straight", "strait", "straighten", "straightly"],
            answer: "straight",
            explanation: '"Go straight" = continue forward.',
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Which is a landmark?",
            choices: ["A big tree", "The town hall", "A cloud", "A friend"],
            answer: 1,
            explanation: "Landmarks are notable buildings/places.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "Turn ___ at the lights.",
            bank: ["left", "leave", "lift", "let"],
            answer: "left",
            explanation: "Directions use left/right.",
          },
          {
            id: "q5",
            type: "mc",
            prompt: '"It\'s around the corner" means…',
            choices: ["Very far", "Very near", "Underground", "Above"],
            answer: 1,
            explanation: "Just a short walk away.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "The bank is ___ the café.",
            bank: ["next to", "next of", "next by", "next in"],
            answer: "next to",
            explanation: '"Next to" = beside.',
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Thank the helper:",
            choices: ["Whatever.", "Thanks so much!", "Cool bye.", "K."],
            answer: 1,
            explanation: '"Thanks so much" is warm.',
          },
          {
            id: "q8",
            type: "fill",
            prompt: "I'm ___. Can you help?",
            bank: ["lost", "lose", "loss", "loose"],
            answer: "lost",
            explanation: "\"I'm lost\" = I don't know where I am.",
          },
        ],
      },
      {
        id: "u3l4",
        title: "Making Plans",
        subtitle: "Invitations & suggestions",
        questions: [
          {
            id: "q1",
            type: "mc",
            prompt: "Invite a friend to dinner:",
            choices: ["Come eat.", "Want to grab dinner tonight?", "Dinner me.", "Feed me?"],
            answer: 1,
            explanation: '"Want to grab…?" is casual and warm.',
          },
          {
            id: "q2",
            type: "fill",
            prompt: "How ___ we meet at 7?",
            bank: ["about", "for", "on", "in"],
            answer: "about",
            explanation: '"How about…?" suggests an option.',
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Politely decline:",
            choices: ["No way.", "I'd love to, but I can't tonight.", "Boring.", "Ew."],
            answer: 1,
            explanation: "Soften refusals with appreciation.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "Let's ___ the movies.",
            bank: ["go to", "go on", "go by", "go in"],
            answer: "go to",
            explanation: '"Go to" + place.',
          },
          {
            id: "q5",
            type: "mc",
            prompt: '"Sounds great!" is used to…',
            choices: ["Reject", "Accept enthusiastically", "Complain", "Order"],
            answer: 1,
            explanation: "Warm acceptance.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "Are you ___ Saturday?",
            bank: ["free", "freed", "freely", "freeing"],
            answer: "free",
            explanation: '"Free" = available.',
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Confirming a plan:",
            choices: ["See you then!", "Maybe never.", "If I feel like it.", "Depends."],
            answer: 0,
            explanation: '"See you then!" confirms warmly.',
          },
          {
            id: "q8",
            type: "fill",
            prompt: "I'm looking ___ to it.",
            bank: ["forward", "front", "ahead", "back"],
            answer: "forward",
            explanation: '"Look forward to" = anticipate happily.',
          },
        ],
      },
    ],
  },
];

const handAuthored: Unit[] = [...foundationUnits, ...advancedUnits];

const existingCountByLevel = handAuthored.reduce(
  (acc, u) => ({ ...acc, [u.level]: (acc[u.level] ?? 0) + 1 }),
  {} as Record<Level, number>,
);

export const curriculum: Unit[] = [...handAuthored, ...generatedUnits(existingCountByLevel)];

export type QuestionRef = { lessonId: string; unitId: string; level: Level; question: Question };

export const questionIndex: Record<string, QuestionRef> = (() => {
  const map: Record<string, QuestionRef> = {};
  for (const unit of curriculum)
    for (const lesson of unit.lessons)
      for (const question of lesson.questions)
        map[`${lesson.id}:${question.id}`] = {
          lessonId: lesson.id,
          unitId: unit.id,
          level: unit.level,
          question,
        };
  return map;
})();

export function lookupQuestion(key: string): QuestionRef | null {
  return questionIndex[key] ?? null;
}

export function unitsForLevel(level: Level): Unit[] {
  return curriculum.filter((u) => u.level === level);
}

export function findLesson(id: string): { unit: Unit; lesson: Lesson; index: number } | null {
  for (const unit of curriculum) {
    const idx = unit.lessons.findIndex((l) => l.id === id);
    if (idx >= 0) return { unit, lesson: unit.lessons[idx], index: idx };
  }
  return null;
}

export const allLessonIds = curriculum.flatMap((u) => u.lessons.map((l) => l.id));
