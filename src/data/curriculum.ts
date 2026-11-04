import { advancedUnits, type Level } from "./levels";
import { applyQuestionFixes } from "./question-fixes";
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
      /** Authored word-card gloss for the answer (at most 8 words, simple English). Optional; the vocab card hides an empty one. */
      meaning?: string;
      /** Authored example sentence for the answer; when absent the card falls back to the filled cloze sentence. */
      example?: string;
      // V3 pkg 4a: optional formats layered onto ordinary mc questions
      // rather than new discriminated types -- grading, review re-grading,
      // and reshuffleQuestion all already work unchanged since these are
      // still type "mc" under the hood.
      /** Key into VOCAB_IMAGES (src/data/vocab-images.ts): shows a stock
       * photo above the prompt, turning this into an "image matching"
       * format question. */
      imageKey?: string;
      // NB: there is deliberately no `audioText` here any more. Listening was
      // once a format layered onto `mc` via an optional `audioText`, used by a
      // single question; it is now its own variant (below), and that question
      // was converted. Keeping both would have left two representations of one
      // concept, with only one of them labelled as listening in the UI.
    }
  | {
      id: string;
      type: "listening";
      /** What the learner must decide AFTER hearing `audioText`. Must not
       * restate the audio: if the prompt contains it, the question is
       * solvable by reading and tests nothing. */
      prompt: string;
      /** Spoken via TTS before the learner answers. Required -- a listening
       * question without audio is unanswerable, which is why this is its own
       * variant rather than the optional `audioText` layered onto `mc`. */
      audioText: string;
      choices: string[];
      /** The correct choice's TEXT, not its index. Deliberately unlike `mc`:
       * it matches `fill`/`reorder`, and it lets every existing grading path
       * (srs.ts's deriveAnswerCorrectness, and both web players' non-mc
       * comparison) handle listening with no change at all. */
      answer: string;
      explanation: string;
    }
  | {
      id: string;
      type: "speak";
      /** Shown on screen; the learner reads it aloud. Unlike `listening`
       * there is nothing to hide — the exercise is production, not
       * comprehension. */
      prompt: string;
      /** The phrase the learner is expected to say, compared against the
       * speech-to-text transcript. Stored as text like fill/reorder/listening,
       * and matched with `matchesSpokenAnswer` rather than a bare trim, since
       * a transcript legitimately varies ("she is" vs "she's"). That rule
       * lives in srs.ts's deriveAnswerCorrectness so the review server reaches
       * the same verdict the player showed. */
      answer: string;
      explanation: string;
    }
  | {
      id: string;
      type: "translate";
      /** Describes the idea to express, rather than giving the sentence away
       * — "Ask someone's name", not "What is your name?". */
      prompt: string;
      /** Curated valid phrasings, most canonical first. A learner's wording is
       * matched against ALL of them, and `[0]` is what they are shown after a
       * miss. Deliberately never auto-expanded from graded submissions (see
       * the spec's non-goals): what counts as correct stays a content
       * decision, not a side effect of someone's answer. */
      acceptableAnswers: string[];
      explanation: string;
    }
  | {
      id: string;
      type: "fill";
      prompt: string; // uses ___ for blank
      bank: string[];
      answer: string;
      explanation: string;
      /** Authored word-card gloss for the answer (at most 8 words, simple English). Optional; the vocab card hides an empty one. */
      meaning?: string;
      /** Authored example sentence for the answer; when absent the card falls back to the filled cloze sentence. */
      example?: string;
    }
  | {
      id: string;
      type: "reorder";
      prompt: string; // e.g. "Put the words in order"
      tokens: string[]; // shuffled pool of words to tap, in reshuffleQuestion
      answer: string; // correct sentence, tokens joined by single spaces
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
            meaning: "a polite greeting used before noon",
            example: "Good morning, class. Please sit down.",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "Nice to ___ you.",
            bank: ["meet", "meat", "met", "meeting"],
            answer: "meet",
            explanation: '"Nice to meet you" is the standard greeting when introduced.',
            meaning: "to see someone for the first time",
          },
          {
            id: "q3",
            type: "mc",
            prompt: 'How do you respond to "How are you?"',
            choices: ["I am fine, thanks.", "Yes, please.", "It is Monday.", "Goodbye."],
            answer: 0,
            explanation: 'A short answer with "thanks" is polite and standard.',
            meaning: 'a polite answer to "How are you?"',
            example: '"How are you?" "I am fine, thanks."',
          },
          {
            id: "q4",
            type: "fill",
            prompt: "___ evening, everyone.",
            bank: ["Good", "Well", "Fine", "Nice"],
            answer: "Good",
            explanation: 'Time-based greetings use "Good morning/afternoon/evening".',
            meaning: "nice; used in greetings",
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Choose the correct farewell for the night.",
            choices: ["Good night.", "Good day.", "Good hello.", "Good time."],
            answer: 0,
            explanation: '"Good night" is used when parting in the evening or before sleep.',
            meaning: "what you say before sleeping",
            example: "Good night. See you tomorrow.",
          },
          {
            id: "q6",
            type: "mc",
            prompt: "Which is a casual greeting?",
            choices: ["Good afternoon.", "Hey!", "How do you do?", "Pleased to meet you."],
            answer: 1,
            explanation: '"Hey" is informal, used with friends.',
            meaning: "a friendly, informal hello",
            example: "Hey! How is it going?",
          },
          {
            id: "q7",
            type: "fill",
            prompt: "See you ___!",
            bank: ["later", "late", "latest", "lately"],
            answer: "later",
            explanation: '"See you later" is a friendly, casual goodbye.',
            meaning: 'after now; used in "See you later"',
          },
          {
            id: "q8",
            type: "mc",
            prompt: 'Best reply to "Thank you."',
            choices: ["You're welcome.", "No, thanks.", "Please.", "Sorry."],
            answer: 0,
            explanation: '"You\'re welcome" is the standard polite response.',
            meaning: 'what you say after "Thank you"',
            example: '"Thank you." "You\'re welcome."',
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
            meaning: "the verb be, used with he or she",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "I ___ from Brazil.",
            bank: ["am", "is", "are", "be"],
            answer: "am",
            explanation: 'With "I", use "am".',
            meaning: "the verb be, used with I",
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
            meaning: "asks which country you come from",
            example: '"Where are you from?" "I am from Peru."',
          },
          {
            id: "q4",
            type: "mc",
            prompt: '"I am a ___." — pick the noun.',
            choices: ["quickly", "student", "reading", "happy"],
            answer: 1,
            explanation: '"Student" is a noun; the others are adverb, verb, adjective.',
            meaning: "a person who studies at school",
            example: "I am a student.",
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
            meaning: "tells how old you are",
            example: '"How old are you?" "I am 22."',
          },
          {
            id: "q7",
            type: "fill",
            prompt: "They ___ my friends.",
            bank: ["are", "is", "am", "be"],
            answer: "are",
            explanation: 'Plural subjects take "are".',
            meaning: "the verb be, used with they or we",
          },
          {
            id: "q8",
            type: "mc",
            prompt: "Pick the polite introduction.",
            choices: ["I'm Alex, nice to meet you.", "Me Alex.", "Alex here, bye.", "You Alex?"],
            answer: 0,
            explanation: 'Introduce yourself with "I\'m ___, nice to meet you".',
            meaning: "a friendly way to introduce yourself",
            example: "Hello! I'm Alex, nice to meet you.",
          },
          // V3 pkg 4a: image matching, listening comprehension, and
          // sentence reordering -- see curriculum.ts's Question type doc
          // comments for how each format is represented.
          {
            id: "q9",
            type: "mc",
            prompt: "What is shown in the picture?",
            choices: ["Doctor", "Teacher", "Driver", "Chef"],
            answer: 0,
            explanation: "The picture shows a doctor.",
            imageKey: "doctor",
            meaning: "a person who helps sick people",
            example: "The doctor can help you.",
          },
          {
            id: "q10",
            type: "listening",
            prompt: "What is her job?",
            audioText: "She is a doctor. She works at the hospital every day.",
            choices: ["Teacher", "Doctor", "Driver", "Chef"],
            answer: "Doctor",
            explanation: 'The audio says "She is a doctor."',
          },
          {
            id: "q11",
            type: "reorder",
            prompt: "Put the words in order to make a sentence.",
            tokens: ["is", "She", "a", "doctor"],
            answer: "She is a doctor",
            explanation: 'Subject + "is" + article "a" + noun: "She is a doctor."',
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
            meaning: "fifteen minutes after three",
            example: "The class starts at quarter past three.",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "It's ___ past six. (30 min)",
            bank: ["half", "quarter", "full", "middle"],
            answer: "half",
            explanation: '30 minutes = "half past".',
            meaning: 'thirty minutes; used in "half past"',
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Twelve at night is called…",
            choices: ["Noon", "Midnight", "Dawn", "Dusk"],
            answer: 1,
            explanation: "12:00 AM is midnight.",
            meaning: "twelve o'clock at night",
            example: "The new year starts at midnight.",
          },
          {
            id: "q4",
            type: "mc",
            prompt: 'Which number is "fifteen"?',
            choices: ["50", "15", "5", "500"],
            answer: 1,
            explanation: "Fifteen = 15.",
            meaning: "the number fifteen",
            example: "I am 15 years old.",
          },
          {
            id: "q5",
            type: "fill",
            prompt: "I wake up ___ 7 a.m.",
            bank: ["at", "on", "in", "by"],
            answer: "at",
            explanation: 'Use "at" with specific clock times.',
            meaning: "used with clock times",
          },
          {
            id: "q6",
            type: "mc",
            prompt: "Choose the correct spelling.",
            choices: ["Fourty", "Forty", "Fortty", "Fourthy"],
            answer: 1,
            explanation: 'The correct spelling is "forty".',
            meaning: "the number 40",
            example: "There are forty students here.",
          },
          {
            id: "q7",
            type: "fill",
            prompt: "The meeting is ___ Monday.",
            bank: ["on", "at", "in", "by"],
            answer: "on",
            explanation: 'Use "on" with days of the week.',
            meaning: "used with days of the week",
          },
          {
            id: "q8",
            type: "mc",
            prompt: "Which is 21?",
            choices: ["Twelve", "Twenty-one", "Two hundred one", "Two-one"],
            answer: 1,
            explanation: "21 = twenty-one, hyphenated.",
            meaning: "the number 21",
            example: "My brother is twenty-one.",
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
            meaning: "water is falling from the sky",
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
            meaning: "a friendly start to a chat",
            example: '"Nice weather, isn\'t it?" "Yes, very nice."',
          },
          {
            id: "q3",
            type: "fill",
            prompt: "The sun ___ shining.",
            bank: ["is", "are", "am", "be"],
            answer: "is",
            explanation: '"Sun" is singular → "is".',
            meaning: "the verb be, used with a thing",
          },
          {
            id: "q4",
            type: "mc",
            prompt: 'Reply to "Have a good weekend!"',
            choices: ["You too!", "Yes, I have.", "Weekend good.", "No thanks."],
            answer: 0,
            explanation: '"You too!" mirrors the kind wish.',
            meaning: "a reply to a kind wish",
            example: '"Have a good weekend!" "You too!"',
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Which is cold?",
            choices: ["Boiling", "Freezing", "Warm", "Mild"],
            answer: 1,
            explanation: '"Freezing" means very cold.',
            meaning: "very, very cold",
            example: "It is freezing outside today.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "It's a ___ day. (sunny + warm)",
            bank: ["lovely", "loudly", "lonely", "loose"],
            answer: "lovely",
            explanation: '"Lovely" is a common British small-talk adjective.',
            meaning: "very nice",
          },
          {
            id: "q7",
            type: "mc",
            prompt: "What do you say when leaving?",
            choices: ["Take care!", "Take it!", "Take me!", "Take five!"],
            answer: 0,
            explanation: '"Take care" is a warm, everyday goodbye.',
            meaning: "what you say when leaving",
            example: "Bye for now. Take care!",
          },
          {
            id: "q8",
            type: "fill",
            prompt: "How's it ___?",
            bank: ["going", "go", "goes", "went"],
            answer: "going",
            explanation: '"How\'s it going?" is a casual "how are you?".',
            meaning: 'used in the question "How\'s it going?"',
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
            meaning: "to take a liquid into your mouth",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "She ___ at 7 a.m.",
            bank: ["wakes", "wake", "waking", "woke"],
            answer: "wakes",
            explanation: "Third person singular adds -s.",
            meaning: "stops sleeping",
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Which is the present simple?",
            choices: ["I ate breakfast.", "I eat breakfast.", "I am eating.", "I will eat."],
            answer: 1,
            explanation: "Present simple describes routines.",
            meaning: "tells what you do every day",
            example: "I eat breakfast at seven every day.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "He ___ his teeth twice a day.",
            bank: ["brushes", "brush", "brushed", "brushing"],
            answer: "brushes",
            explanation: "Verbs ending in -sh add -es.",
            meaning: "cleans with a brush",
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Pick the routine adverb.",
            choices: ["Yesterday", "Usually", "Tomorrow", "Once"],
            answer: 1,
            explanation: '"Usually" fits present-simple routines.',
            meaning: "most of the time",
            example: "I usually walk to school.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "We ___ breakfast together.",
            bank: ["have", "has", "having", "is"],
            answer: "have",
            explanation: '"We" takes the base form "have".',
            meaning: "to eat a meal",
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
            meaning: "a question about a habit",
            example: "Do you drink coffee in the morning?",
          },
          {
            id: "q8",
            type: "fill",
            prompt: "He ___ not eat meat.",
            bank: ["does", "do", "is", "doing"],
            answer: "does",
            explanation: 'Third-person singular negative uses "does not".',
            meaning: "helps make a negative with he or she",
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
            meaning: "to write back to someone",
            example: "I answer emails all day.",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "She ___ in a bank.",
            bank: ["works", "work", "working", "worked"],
            answer: "works",
            explanation: "Third person singular adds -s.",
            meaning: "has a job",
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Pick the professional greeting.",
            choices: ["Yo!", "Hi team,", "Sup all,", "Oi!"],
            answer: 1,
            explanation: '"Hi team," is friendly-professional.',
            meaning: "a friendly work greeting",
            example: "Hi team, the meeting starts at ten.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "We ___ a meeting at 10.",
            bank: ["have", "has", "having", "haves"],
            answer: "have",
            explanation: "Plural subject + base form.",
            meaning: 'to hold, as in "have a meeting"',
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Best word for a work friend.",
            choices: ["Colleague", "Cousin", "Client", "Coach"],
            answer: 0,
            explanation: "Colleague = someone you work with.",
            meaning: "a person you work with",
            example: "My colleague helps me every day.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "The report is ___ Friday.",
            bank: ["due", "do", "did", "done"],
            answer: "due",
            explanation: '"Due" means the deadline is on that day.',
            meaning: "expected on a certain day",
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Polite way to disagree.",
            choices: ["You're wrong.", "That's stupid.", "I see it differently.", "No way."],
            answer: 2,
            explanation: '"I see it differently" is respectful.',
            meaning: "a polite way to disagree",
            example: "I see it differently. Let me explain.",
          },
          {
            id: "q8",
            type: "fill",
            prompt: "Let's ___ this offline.",
            bank: ["discuss", "discussion", "discussed", "discussing"],
            answer: "discuss",
            explanation: 'After "let\'s", use the base verb.',
            meaning: "to talk about something",
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
            meaning: "to like something a lot",
          },
          {
            id: "q2",
            type: "mc",
            prompt: 'Which follows "enjoy"?',
            choices: ["to run", "running", "run", "ran"],
            answer: 1,
            explanation: '"Enjoy" is followed by the -ing form.',
            meaning: "moving fast on foot",
            example: "I enjoy running in the park.",
          },
          {
            id: "q3",
            type: "fill",
            prompt: "He ___ football on weekends.",
            bank: ["plays", "play", "playing", "played"],
            answer: "plays",
            explanation: "Third person singular.",
            meaning: "takes part in a game",
          },
          {
            id: "q4",
            type: "mc",
            prompt: '"I hate ___."',
            choices: ["waiting", "to waiting", "waits", "waited"],
            answer: 0,
            explanation: '"Hate" + -ing is very common.',
            meaning: "staying until something happens",
            example: "I hate waiting in long lines.",
          },
          {
            id: "q5",
            type: "fill",
            prompt: "She's ___ in photography.",
            bank: ["interested", "interest", "interesting", "interests"],
            answer: "interested",
            explanation: '"Interested in" = a personal feeling.',
            meaning: "wanting to know more about something",
          },
          {
            id: "q6",
            type: "mc",
            prompt: 'Opposite of "boring":',
            choices: ["Bored", "Interesting", "Interested", "Busy"],
            answer: 1,
            explanation: "Adjective describing the thing = -ing.",
            meaning: "not boring",
            example: "This book is very interesting.",
          },
          {
            id: "q7",
            type: "fill",
            prompt: "We go ___ every Sunday.",
            bank: ["hiking", "hike", "hiked", "hikes"],
            answer: "hiking",
            explanation: '"Go" + activity uses -ing.',
            meaning: "walking a long way in nature",
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
            meaning: "asks what someone is doing",
            example: "Hi Sam! What are you up to?",
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
            meaning: "used with clock times",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "We eat dinner ___ the evening.",
            bank: ["in", "at", "on", "by"],
            answer: "in",
            explanation: 'Parts of the day take "in".',
            meaning: "used with parts of the day",
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Which is bedtime slang?",
            choices: ["Hit the hay", "Kick the bucket", "Break a leg", "Piece of cake"],
            answer: 0,
            explanation: '"Hit the hay" = go to sleep.',
            meaning: "a slang way to say go to bed",
            example: "I'm tired. Time to hit the hay.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "He ___ a book before sleeping.",
            bank: ["reads", "read", "reading", "readed"],
            answer: "reads",
            explanation: "Third person singular adds -s.",
            meaning: "looks at words and understands",
          },
          {
            id: "q5",
            type: "mc",
            prompt: '"I\'m exhausted" means…',
            choices: ["Very hungry", "Very tired", "Very happy", "Very angry"],
            answer: 1,
            explanation: "Exhausted = extremely tired.",
            meaning: "completely without energy",
            example: "I feel very tired after work.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "Good ___! Sleep well.",
            bank: ["night", "evening", "morning", "day"],
            answer: "night",
            explanation: '"Good night" is used at bedtime.',
            meaning: "the dark time when people sleep",
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Which means a short sleep?",
            choices: ["Nap", "Snap", "Slap", "Snip"],
            answer: 0,
            explanation: "A nap is a short sleep.",
            meaning: "a short sleep in the day",
            example: "I take a short nap after lunch.",
          },
          {
            id: "q8",
            type: "fill",
            prompt: "Set the ___ for 7 a.m.",
            bank: ["alarm", "clock", "watch", "timer"],
            answer: "alarm",
            explanation: 'You "set an alarm" to wake up.',
            meaning: "a clock sound that wakes you",
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
            meaning: "a very polite request",
            example: "Excuse me. Could I have some water, please?",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "___ you help me?",
            bank: ["Could", "Ought", "Does", "Are"],
            answer: "Could",
            explanation: '"Could you…?" is polite.',
            meaning: "a polite word for asking",
          },
          {
            id: "q3",
            type: "mc",
            prompt: 'Reply to "Thanks a lot!"',
            choices: ["It's nothing.", "You're welcome.", "Both are fine.", "Neither."],
            answer: 2,
            explanation: "Both are common polite replies.",
            meaning: "says two answers are both correct",
            example: "You can say either one. Both are fine.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "___ me, is this seat free?",
            bank: ["Excuse", "Sorry", "Please", "Pardon"],
            answer: "Excuse",
            explanation: '"Excuse me" is the standard opener.',
            meaning: 'used in "Excuse me" to get attention',
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Best way to interrupt politely:",
            choices: ["Hey you!", "Sorry to interrupt…", "Listen up!", "Stop!"],
            answer: 1,
            explanation: 'Soften with "Sorry to interrupt".',
            meaning: "a polite way to join a talk",
            example: "Sorry to interrupt, can I ask something?",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "Would you ___ opening the window?",
            bank: ["mind", "want", "like", "care"],
            answer: "mind",
            explanation: '"Would you mind + -ing?" is very polite.',
            meaning: 'a polite word in "Would you mind"',
          },
          {
            id: "q7",
            type: "mc",
            prompt: 'After "Would you mind…?", "No" means…',
            choices: ["I refuse.", "I don't mind — happy to.", "I'm confused.", "I already did."],
            answer: 1,
            explanation: '"No" means "I have no objection".',
            meaning: "says you are glad to help",
            example: "I don't mind — happy to. Just ask.",
          },
          {
            id: "q8",
            type: "fill",
            prompt: "Thanks ___ your help.",
            bank: ["for", "to", "of", "on"],
            answer: "for",
            explanation: '"Thanks for" + noun/-ing.',
            meaning: 'used with thanks, as in "thanks for"',
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
            meaning: "a polite way to order a drink",
            example: "Hello. I'll have a coffee, please.",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "Could I have the ___, please?",
            bank: ["bill", "build", "bell", "bull"],
            answer: "bill",
            explanation: 'The "bill" (UK) or "check" (US) is what you pay.',
            meaning: "the paper that shows what you owe",
          },
          {
            id: "q3",
            type: "mc",
            prompt: '"For here or to go?" is asking…',
            choices: ["Where you live", "If you'll eat in or take away", "Your name", "Your order"],
            answer: 1,
            explanation: "Servers ask this in cafés.",
            meaning: "asks whether you eat here or leave",
            example: "He asked if you'll eat in or take away.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "I'd ___ a latte, please.",
            bank: ["like", "likes", "liked", "liking"],
            answer: "like",
            explanation: '"I\'d like" = "I would like" — polite.',
            meaning: 'used in "I\'d like" to ask politely',
          },
          {
            id: "q5",
            type: "mc",
            prompt: "Ask for a recommendation:",
            choices: ["Give me something.", "What do you recommend?", "You choose.", "Random one."],
            answer: 1,
            explanation: '"What do you recommend?" is polite.',
            meaning: "asks someone to suggest something good",
            example: "Everything looks good. What do you recommend?",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "Can I pay ___ card?",
            bank: ["by", "with", "on", "at"],
            answer: "by",
            explanation: '"Pay by card / by cash" — with "by".',
            meaning: "shows how you pay",
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
            meaning: "says the food tasted very good",
            example: "Thank you, that was delicious!",
          },
          {
            id: "q8",
            type: "fill",
            prompt: "Keep the ___.",
            bank: ["change", "chance", "chase", "cheap"],
            answer: "change",
            explanation: '"Keep the change" leaves a tip.',
            meaning: "the money you get back",
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
            meaning: "a polite way to ask for a place",
            example: "Excuse me, could you tell me where the station is?",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "Go ___ for two blocks.",
            bank: ["straight", "strait", "straighten", "straightly"],
            answer: "straight",
            explanation: '"Go straight" = continue forward.',
            meaning: "without turning",
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Which is a landmark?",
            choices: ["A big tree", "The town hall", "A cloud", "A friend"],
            answer: 1,
            explanation: "Landmarks are notable buildings/places.",
            meaning: "the main building of a town",
            example: "The town hall is on Main Street.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "Turn ___ at the lights.",
            bank: ["left", "leave", "lift", "let"],
            answer: "left",
            explanation: "Directions use left/right.",
            meaning: "the opposite of right",
          },
          {
            id: "q5",
            type: "mc",
            prompt: '"It\'s around the corner" means…',
            choices: ["Very far", "Very near", "Underground", "Above"],
            answer: 1,
            explanation: "Just a short walk away.",
            meaning: "close by",
            example: "The shop is very near.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "The bank is ___ the café.",
            bank: ["next to", "next of", "next by", "next in"],
            answer: "next to",
            explanation: '"Next to" = beside.',
            meaning: "at the side of",
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Thank the helper:",
            choices: ["Whatever.", "Thanks so much!", "Cool bye.", "K."],
            answer: 1,
            explanation: '"Thanks so much" is warm.',
            meaning: "a warm way to say thank you",
            example: "You helped a lot. Thanks so much!",
          },
          {
            id: "q8",
            type: "fill",
            prompt: "I'm ___. Can you help?",
            bank: ["lost", "lose", "loss", "loose"],
            answer: "lost",
            explanation: "\"I'm lost\" = I don't know where I am.",
            meaning: "not knowing where you are",
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
            meaning: "a friendly invitation to eat",
            example: "Hi Sam! Want to grab dinner tonight?",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "How ___ we meet at 7?",
            bank: ["about", "for", "on", "in"],
            answer: "about",
            explanation: '"How about…?" suggests an option.',
            meaning: 'used in "How about" to suggest a plan',
          },
          {
            id: "q3",
            type: "mc",
            prompt: "Politely decline:",
            choices: ["No way.", "I'd love to, but I can't tonight.", "Boring.", "Ew."],
            answer: 1,
            explanation: "Soften refusals with appreciation.",
            meaning: "a polite way to say no",
            example: "Sorry! I'd love to, but I can't tonight.",
          },
          {
            id: "q4",
            type: "fill",
            prompt: "Let's ___ the movies.",
            bank: ["go to", "go on", "go by", "go in"],
            answer: "go to",
            explanation: '"Go to" + place.',
            meaning: "to travel to a place",
          },
          {
            id: "q5",
            type: "mc",
            prompt: '"Sounds great!" is used to…',
            choices: ["Reject", "Accept enthusiastically", "Complain", "Order"],
            answer: 1,
            explanation: "Warm acceptance.",
            meaning: "to say yes in a very happy way",
            example: "She will accept enthusiastically.",
          },
          {
            id: "q6",
            type: "fill",
            prompt: "Are you ___ Saturday?",
            bank: ["free", "freed", "freely", "freeing"],
            answer: "free",
            explanation: '"Free" = available.',
            meaning: "not busy",
          },
          {
            id: "q7",
            type: "mc",
            prompt: "Confirming a plan:",
            choices: ["See you then!", "Maybe never.", "If I feel like it.", "Depends."],
            answer: 0,
            explanation: '"See you then!" confirms warmly.',
            meaning: "a friendly goodbye after making a plan",
            example: "Okay, Saturday at six. See you then!",
          },
          {
            id: "q8",
            type: "fill",
            prompt: "I'm looking ___ to it.",
            bank: ["forward", "front", "ahead", "back"],
            answer: "forward",
            explanation: '"Look forward to" = anticipate happily.',
            meaning: 'used in "look forward to" for happy waiting',
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

/** The built curriculum before the hand-reviewed fixes in question-fixes.ts (for the review table). */
export const rawCurriculum: Unit[] = [...handAuthored, ...generatedUnits(existingCountByLevel)];

export const curriculum: Unit[] = applyQuestionFixes(rawCurriculum);

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
