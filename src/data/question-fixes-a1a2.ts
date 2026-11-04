import type { QuestionFix } from "./question-fixes";

/** Phase 1 rewrites for English A1/A2. Review table: docs/content-fixes-a1a2-phase1.md */
export const FIXES_A1A2: Record<string, QuestionFix> = {
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
  "a1p1l2/a1p1q6": {
    why: "other words' plurals are too easy to rule out; a learner's real error is the regularised or mis-spelt plural",
    wrong: ["mouses", "mices", "meese"],
  },
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
  "a1p2l1/a1p2q0": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["is", "are", "be"],
  },
  "a1p2l1/a1p2q1": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["are", "am", "be"],
  },
  "a1p2l1/a1p2q2": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["is", "am", "be"],
  },
  "a1p2l1/a1p2q3": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["go", "going", "is go"],
  },
  "a1p2l1/a1p2q4": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["studies", "studying", "are study"],
  },
  "a1p2l2/a1p2q5": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["are", "am", "be"],
  },
  "a1p2l2/a1p2q6": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["is", "am", "be"],
  },
  "a1p2l2/a1p2q7": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["drink", "drinking", "is drink"],
  },
  "a1p2l2/a1p2q8": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["doesn't", "isn't", "am not"],
  },
  "a1p2l2/a1p2q9": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["do", "is", "are"],
  },
  "a1p2l3/a1p2q10": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["Is", "Am", "Do"],
  },
  "a1p2l3/a1p2q11": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["Do", "Is", "Are"],
  },
  "a1p2l3/a1p2q12": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["is", "am", "be"],
  },
  "a1p2l3/a1p2q13": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["play", "playing", "is play"],
  },
  "a1p2l3/a1p2q14": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["has", "am", "are"],
  },
  "a1p2l4/a1p2q15": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["have", "is", "having"],
  },
  "a1p2l4/a1p2q16": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["is", "am", "be"],
  },
  "a1p2l4/a1p2q17": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["Are", "Am", "Do"],
  },
  "a1p2l4/a1p2q18": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["has", "having", "are"],
  },
  "a1p2l4/a1p2q19": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["get", "getting", "is get"],
  },
  "a1p2l5/a1p2q20": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["open", "opening", "do open"],
  },
  "a1p2l5/a1p2q21": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["flies", "flying", "is fly"],
  },
  "a1p2l5/a1p2q22": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["aren't", "doesn't", "don't"],
  },
  "a1p2l5/a1p2q23": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["is", "am", "be"],
  },
  "a1p2l5/a1p2q24": {
    why: 'wrong options were other verbs from the pack (too easy) or, for q15, a real alternative ("gets a car"); now the agreement errors learners actually make',
    wrong: ["live", "living", "is live"],
  },
  "a1p4l1/a1p4q0": { why: '"by 15 March" is also correct', wrong: ["at", "in", "of"] },
  "a1p4l1/a1p4q1": {
    why: "down/across were too easy; these are the real confusions",
    wrong: ["on", "at", "of"],
  },
  "a1p4l1/a1p4q2": { why: "beside/opposite were too easy", wrong: ["in", "on", "to"] },
  "a1p4l1/a1p4q3": {
    why: "behind/next to/beside were also correct without a clue",
    prompt: "The cat is ___ the table. (it is hiding below it)",
    wrong: ["above", "beside", "behind"],
  },
  "a1p4l1/a1p4q4": { why: "opposite was too easy", wrong: ["at", "on", "of"] },
  "a1p4l2/a1p4q5": {
    why: "into/in were also plausible without a clue",
    prompt: "Put the book ___ the shelf. (on the top surface)",
    wrong: ["in", "under", "at"],
  },
  "a1p4l2/a1p4q6": {
    why: '"on the weekend" (US) was also correct; "on" removed',
    wrong: ["in", "by"],
  },
  "a1p4l2/a1p4q7": {
    why: "several place words fit without a clue",
    prompt: "The shop is ___ the bank. (right beside it)",
    wrong: ["opposite", "behind", "above"],
  },
  "a1p4l2/a1p4q8": { why: '"by May" was also correct', wrong: ["on", "at", "of"] },
  "a1p4l2/a1p4q9": { why: '"by Friday evening" was also correct', wrong: ["at", "in", "to"] },
  "a1p4l3/a1p4q10": { why: '"on the corner" was also correct', wrong: ["into", "to"] },
  "a1p4l3/a1p4q11": {
    why: '"on" was fine; "in" kept as the near error',
    wrong: ["at", "into", "of"],
  },
  "a1p4l3/a1p4q12": {
    why: '"on my bag" was also correct without a clue',
    prompt: "The keys are ___ my bag. (inside it)",
    wrong: ["on", "under", "behind"],
  },
  "a1p4l3/a1p4q13": {
    why: "behind was also correct without a clue",
    prompt: "She sits ___ me in class. (right next to me)",
    wrong: ["behind", "opposite", "above"],
  },
  "a1p4l3/a1p4q14": {
    why: '"into the clouds" was also correct without a clue',
    prompt: "The plane flies ___ the clouds. (higher than them)",
    wrong: ["below", "through", "into"],
  },
  "a1p4l4/a1p4q15": {
    why: '"along/down the bridge" were also fine',
    prompt: "Walk ___ the bridge. (from one side to the other)",
    wrong: ["under", "into", "beside"],
  },
  "a1p4l4/a1p4q16": {
    why: "next to/behind both fit without a clue",
    prompt: "The dog is ___ the door. (hidden on the other side)",
    wrong: ["in front of", "beside", "on"],
  },
  "a1p4l4/a1p4q17": {
    why: '"Come in the room" is also heard; offer clear errors',
    wrong: ["on", "at", "of"],
  },
  "a1p4l4/a1p4q18": { why: '"on" was also acceptable', wrong: ["with", "at", "into"] },
  "a1p4l4/a1p4q19": { why: '"by midnight" was also correct', wrong: ["on", "in"] },
  "a1p4l5/a1p4q20": { why: "above was too easy", wrong: ["at", "on", "to"] },
  "a1p4l5/a1p4q21": {
    why: "beside/next to were also correct without a clue",
    prompt: "The cafe is ___ the station. (across the road from it)",
    wrong: ["behind", "next to", "inside"],
  },
  "a1p4l5/a1p4q22": { why: "across/down were too easy", wrong: ["at", "in", "to"] },
  "a1p4l5/a1p4q23": {
    why: '"on the hill" was also correct without a clue',
    prompt: "The ball rolled ___ the hill. (from the top to the bottom)",
    wrong: ["up", "into", "across"],
  },
  "a1p5l1/a1p5q2": { why: '"have homework" is also correct', wrong: ["spend", "play", "speak"] },
  "a1p5l2/a1p5q5": {
    why: '"take the bus" and "ride the bus" are also correct',
    wrong: ["make", "wash", "throw"],
  },
  "a1p5l2/a1p5q6": { why: '"make music" is also correct', wrong: ["throw", "wash", "speak"] },
  "a1p5l2/a1p5q8": { why: '"have a question" is also correct', wrong: ["wash", "play", "ride"] },
  "a1p5l2/a1p5q9": { why: '"pay money" is also correct', wrong: ["catch", "brush", "wash"] },
  "a1p5l3/a1p5q13": { why: '"wash your teeth" is also heard', wrong: ["catch", "make", "throw"] },
  "a1p5l4/a1p5q15": {
    why: '"take a decision" is also correct (British)',
    wrong: ["catch", "wash", "ride"],
  },
  "a1p5l4/a1p5q17": { why: '"do a language" is also correct', wrong: ["spend", "wash", "throw"] },
  "a1p5l5/a1p5q20": { why: '"have a bed" is also correct', wrong: ["write", "spend", "catch"] },
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
  "u1l1/q4": {
    why: '"Fine/Nice evening" are also fine greetings',
    wrong: ["Well", "Goods", "Nicely"],
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
  "u2l2/q2": { why: '"She worked in a bank" is correct', wrong: ["work", "working", "is work"] },
  "u2l3/q1": {
    why: '"I enjoyed playing guitar" is correct',
    wrong: ["enjoys", "enjoying", "am enjoy"],
  },
  "u2l3/q3": {
    why: '"He played football on weekends" is correct',
    wrong: ["play", "playing", "is play"],
  },
  "u2l4/q1": { why: '"by 11 p.m." is also correct', wrong: ["on", "in", "to"] },
  "u2l4/q2": {
    why: '"on the evening" and "by the evening" are also correct',
    wrong: ["at", "to", "of"],
  },
  "u2l4/q4": { why: '"He read a book" (past) is correct', wrong: ["reading", "readed", "is read"] },
  "u2l4/q8": {
    why: '"Set the clock/timer for 7 a.m." are also correct',
    wrong: ["alarms", "alarmed", "alarming"],
  },
  "u3l1/q2": {
    why: '"Ought you help me?" read as a near-correct modal; use learner errors',
    wrong: ["Does", "Are", "Ought"],
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
  "u3l2/q8": {
    why: '"Keep the chance" is a correct sentence without the clue',
    prompt: "Keep the ___. (the extra money)",
    wrong: ["chance", "chase", "cheap"],
  },
};
