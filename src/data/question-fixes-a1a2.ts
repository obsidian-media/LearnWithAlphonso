import type { QuestionFix } from "./question-fixes";

/** Phase 1 rewrites for English A1/A2, written under docs/distractor-policy.md. Review table: docs/content-fixes-a1a2-phase1.md */
export const FIXES_A1A2: Record<string, QuestionFix> = {
  "a1p11l2/a1p11q8": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "This costs ___ than I expected. (a higher price)",
    wrong: ["less", "fewer", "much"],
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
  "a1p16l2/a1p16q7": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["has", "having", "haves"],
  },
  "a1p17l2/a1p17q5": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["down", "out", "off"],
  },
  "a1p17l3/a1p17q14": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["out", "off", "away"],
  },
  "a1p17l5/a1p17q20": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["in", "at", "for"],
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
  "a1p2l2/a1p2q5": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["are", "am", "be"],
  },
  "a1p2l2/a1p2q6": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["is", "am", "be"],
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
  "a1p2l5/a1p2q22": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["aren't", "doesn't", "don't"],
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
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "She sits ___ me in class. (right next to me)",
    wrong: ["behind", "opposite", "in front of"],
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
  "a2p11l1/a2p11q3": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["has", "having", "had"],
  },
  "a2p13l1/a2p13q3": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The supermarket is ___ from the bakery. (on the other side of the street)",
    wrong: ["next", "near", "behind"],
  },
  "a2p13l2/a2p13q5": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["on", "around", "to"],
  },
  "a2p13l2/a2p13q6": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The bank is ___ the post office and the cafe. (with one on each side)",
    wrong: ["behind", "beside", "near"],
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
  "a2p13l4/a2p13q18": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The pharmacy is ___ the corner from here. (just out of sight, past the bend)",
    wrong: ["over", "through", "into"],
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
  "a2p14l4/a2p14q16": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["does", "did", "doing"],
  },
  "a2p17l1/a2p17q0": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The cat is sitting ___ the table. (below it)",
    wrong: ["above", "behind", "beside"],
  },
  "a2p17l1/a2p17q1": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The book is ___ the shelf. (on its top surface)",
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
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The plane flew ___ the clouds. (higher than them)",
    wrong: ["below", "among", "in"],
  },
  "a2p17l3/a2p17q13": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The children are playing ___ the swings. (next to them)",
    wrong: ["among", "inside", "under"],
  },
  "a2p17l4/a2p17q15": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["next", "near", "behind"],
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
  "a2p17l5/a2p17q23": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The plane flew ___ the city. (it went by without stopping)",
    wrong: ["into", "towards", "onto"],
  },
  "a2p18l3/a2p18q11": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["have", "had", "has"],
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
  "a2p2l1/a2p2q1": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["were", "is", "did"],
  },
  "a2p2l1/a2p2q2": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "They ___ not come to the party last night.",
    wrong: ["do", "was", "were"],
  },
  "a2p2l2/a2p2q6": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["was", "are", "did"],
  },
  "a2p2l2/a2p2q8": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "Yesterday I ___ tired, so I left.",
    wrong: ["were", "am", "is"],
  },
  "a2p2l2/a2p2q9": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["doesn't", "don't", "wasn't"],
  },
  "a2p2l3/a2p2q10": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "It ___ raining all morning yesterday.",
    wrong: ["were", "is", "are"],
  },
  "a2p2l3/a2p2q12": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["were", "is", "am"],
  },
  "a2p2l4/a2p2q15": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "We ___ hear anything last night.",
    wrong: ["don't", "weren't", "wasn't"],
  },
  "a2p2l4/a2p2q17": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "What ___ you doing at six yesterday?",
    wrong: ["was", "are", "did"],
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
  "a2p2l5/a2p2q24": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["were", "is", "did"],
  },
  "a2p4l1/a2p4q3": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["do", "is", "are"],
  },
  "a2p5l3/a2p5q11": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["many", "few", "several"],
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
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "I think it ___ rain tomorrow. (a prediction, not a possibility)",
    wrong: ["might", "may", "could"],
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
  "a2p6l2/a2p6q6": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "They ___ probably be late. (a prediction)",
    wrong: ["might", "can", "must"],
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
  "a2p6l4/a2p6q15": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "___ we take a taxi? (an offer or suggestion)",
    wrong: ["Must", "Might", "Would"],
  },
  "a2p6l4/a2p6q16": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "By June I ___ have finished. (certain)",
    wrong: ["might", "may", "could"],
  },
  "a2p6l4/a2p6q18": {
    why: "will/might/may/could all fit without the function; the clue says which",
    prompt: "I'm certain they ___ come later.",
    wrong: ["might", "may", "could"],
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
  "u3l1/q2": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "___ you help me? (a polite request)",
    wrong: ["Must", "Shall", "Might"],
  },
  "u3l3/q6": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The bank is ___ the café. (right beside it)",
    wrong: ["opposite", "behind", "in front of"],
  },
  "u5l1/q2": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["on", "at", "by"],
  },
};
