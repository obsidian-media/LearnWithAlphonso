import type { QuestionFix } from "./question-fixes";

/** Phase 1 rewrites for English A1/A2, written under docs/distractor-policy.md. Review table: docs/content-fixes-a1a2-phase1.md */
export const FIXES_A1A2: Record<string, QuestionFix> = {
  "a1p10l1/a1p10q0": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l1/a1p10q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l1/a1p10q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["sunny", "hot", "mild"],
  },
  "a1p10l1/a1p10q3": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l1/a1p10q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l2/a1p10q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l2/a1p10q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l2/a1p10q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l2/a1p10q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l2/a1p10q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l3/a1p10q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["ice", "weather", "fog"],
  },
  "a1p10l3/a1p10q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["cold", "sunny", "clear"],
  },
  "a1p10l3/a1p10q12": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Winter in this city is very ___. (bitterly cold and stormy)",
    wrong: ["hot", "sunny", "clear"],
  },
  "a1p10l3/a1p10q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l3/a1p10q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["ice", "fog", "thunder"],
  },
  "a1p10l4/a1p10q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["mild", "snow", "hot"],
  },
  "a1p10l4/a1p10q16": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "cloud",
  },
  "a1p10l4/a1p10q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["fall", "rainy", "thunder"],
  },
  "a1p10l4/a1p10q18": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The ___ made it hard to drive. (the road was hidden in white air)",
    wrong: ["sun", "snow", "cloud"],
  },
  "a1p10l4/a1p10q19": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The sky turned dark before the ___ began. (thunder and lightning followed)",
  },
  "a1p10l5/a1p10q20": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "It's too ___ to go swimming today. (the waves and trees were moving a lot)",
  },
  "a1p10l5/a1p10q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l5/a1p10q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p10l5/a1p10q23": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "It's a ___ day, perfect for a walk. (neither hot nor cold)",
  },
  "a1p10l5/a1p10q24": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Bring a jacket — it's ___ this evening. (a bit cold)",
    wrong: ["sunny", "rainy", "hot"],
  },
  "a1p11l1/a1p11q0": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "This shirt costs ___ dollars. (the number 20)",
  },
  "a1p11l1/a1p11q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p11l1/a1p11q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["more", "up", "enough"],
  },
  "a1p11l1/a1p11q3": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The bill comes to ___ euros. (the number 15)",
  },
  "a1p11l1/a1p11q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p11l2/a1p11q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["up", "more", "enough"],
  },
  "a1p11l2/a1p11q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["save", "more", "enough"],
  },
  "a1p11l2/a1p11q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p11l2/a1p11q8": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "This costs ___ than I expected. (a higher price)",
    wrong: ["less", "fewer", "much"],
  },
  "a1p11l2/a1p11q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["up", "contactless", "spent"],
  },
  "a1p11l3/a1p11q10": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The total is ___ pounds and fifty pence. (the sum 3.50)",
  },
  "a1p11l3/a1p11q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p11l3/a1p11q12": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Could I get a ___ for this purchase? (proof that I paid)",
  },
  "a1p11l3/a1p11q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p11l3/a1p11q14": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She counted the ___ carefully. (coins and notes)",
    wrong: ["sale", "tax", "wallet"],
  },
  "a1p11l4/a1p11q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p11l4/a1p11q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["change", "up", "contactless"],
  },
  "a1p11l4/a1p11q17": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The shop only accepts ___ payments. (you tap your card)",
    wrong: ["up", "sale", "change"],
  },
  "a1p11l4/a1p11q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p11l4/a1p11q19": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "wallet",
  },
  "a1p11l5/a1p11q20": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l1/a1p14q0": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l1/a1p14q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l1/a1p14q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l1/a1p14q3": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l1/a1p14q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l2/a1p14q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l2/a1p14q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l2/a1p14q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l2/a1p14q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["noon", "afternoon", "week"],
  },
  "a1p14l2/a1p14q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l3/a1p14q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l3/a1p14q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l3/a1p14q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l3/a1p14q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["noon", "January", "year"],
  },
  "a1p14l3/a1p14q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l4/a1p14q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l4/a1p14q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["October", "January", "February"],
  },
  "a1p14l4/a1p14q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l4/a1p14q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l4/a1p14q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l5/a1p14q20": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l5/a1p14q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l5/a1p14q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l5/a1p14q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p14l5/a1p14q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p15l1/a1p15q2": {
    why: "a sphere is also perfectly round",
    wrong: ["oval", "rectangle", "hexagon"],
  },
  "a1p15l5/a1p15q21": {
    why: "a triangle also has a pointed top",
    wrong: ["rectangle", "octagon", "circle"],
  },
  "a1p16l1/a1p16q0": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l1/a1p16q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l1/a1p16q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l1/a1p16q3": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["eats", "eating", "are eat"],
  },
  "a1p16l1/a1p16q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l2/a1p16q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l2/a1p16q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["eat", "watch", "pack"],
  },
  "a1p16l2/a1p16q7": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["has", "having", "haves"],
  },
  "a1p16l2/a1p16q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l2/a1p16q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l3/a1p16q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l3/a1p16q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l3/a1p16q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l3/a1p16q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l3/a1p16q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l4/a1p16q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l4/a1p16q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l4/a1p16q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["watch", "pack", "tidy"],
  },
  "a1p16l4/a1p16q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l4/a1p16q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l5/a1p16q20": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l5/a1p16q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l5/a1p16q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l5/a1p16q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p16l5/a1p16q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l1/a1p17q0": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "book",
  },
  "a1p17l1/a1p17q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["down", "desks", "bell"],
  },
  "a1p17l1/a1p17q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "pen",
  },
  "a1p17l1/a1p17q3": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l1/a1p17q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l2/a1p17q5": {
    why: "the wrong options were filler from outside the slot's pool; topic word reviewed: the sentence's own context excludes the other options",
    wrong: ["down", "out", "off"],
    context: "the sentence already rules out the other options",
  },
  "a1p17l2/a1p17q6": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "notebook",
  },
  "a1p17l2/a1p17q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l2/a1p17q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l2/a1p17q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["up", "down", "bell"],
  },
  "a1p17l3/a1p17q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["whiteboard", "bell", "map"],
  },
  "a1p17l3/a1p17q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l3/a1p17q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l3/a1p17q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l3/a1p17q14": {
    why: "the wrong options were filler from outside the slot's pool; topic word reviewed: the sentence's own context excludes the other options",
    wrong: ["out", "off", "away"],
    context: "the sentence already rules out the other options",
  },
  "a1p17l4/a1p17q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l4/a1p17q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l4/a1p17q17": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "map",
  },
  "a1p17l4/a1p17q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["bell", "ruler", "board"],
  },
  "a1p17l4/a1p17q19": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "textbooks",
  },
  "a1p17l5/a1p17q20": {
    why: "the wrong options were filler from outside the slot's pool; topic word reviewed: the sentence's own context excludes the other options",
    wrong: ["in", "at", "for"],
    context: "the sentence already rules out the other options",
  },
  "a1p17l5/a1p17q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["ruler", "rubber", "bell"],
  },
  "a1p17l5/a1p17q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l5/a1p17q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p17l5/a1p17q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["list", "bag", "price"],
  },
  "a1p19l1/a1p19q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l1/a1p19q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "basket",
  },
  "a1p19l1/a1p19q3": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l1/a1p19q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["trolley", "debit", "till"],
  },
  "a1p19l2/a1p19q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["discount", "bag", "debit"],
  },
  "a1p19l2/a1p19q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l2/a1p19q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["checkout", "cashier", "debit"],
  },
  "a1p19l2/a1p19q8": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "vegetables",
  },
  "a1p19l2/a1p19q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l3/a1p19q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l3/a1p19q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "eggs",
  },
  "a1p19l3/a1p19q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["price", "trolley", "debit"],
  },
  "a1p19l3/a1p19q13": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "bag",
  },
  "a1p19l3/a1p19q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l4/a1p19q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l4/a1p19q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l4/a1p19q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l4/a1p19q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l4/a1p19q19": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I always check the ___ before I buy something. (how much it costs)",
    wrong: ["eggs", "freezer", "soap"],
  },
  "a1p19l5/a1p19q20": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "soap",
  },
  "a1p19l5/a1p19q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p19l5/a1p19q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["debit", "oil", "till"],
  },
  "a1p19l5/a1p19q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["bag", "soap", "freezer"],
  },
  "a1p19l5/a1p19q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
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
  "a1p20l1/a1p20q0": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["walk", "airport", "carriage"],
  },
  "a1p20l1/a1p20q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p20l1/a1p20q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "taxi",
  },
  "a1p20l1/a1p20q3": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["keys", "petrol", "timetable"],
  },
  "a1p20l1/a1p20q4": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "plane",
  },
  "a1p20l2/a1p20q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p20l2/a1p20q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["carriage", "keys", "petrol"],
  },
  "a1p20l3/a1p20q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p20l3/a1p20q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "ferry",
  },
  "a1p20l3/a1p20q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p20l3/a1p20q13": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "jet",
  },
  "a1p20l3/a1p20q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["seatbelt", "carriage", "petrol"],
  },
  "a1p20l4/a1p20q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["walk", "petrol", "keys"],
  },
  "a1p20l4/a1p20q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p20l4/a1p20q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p20l4/a1p20q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["seatbelt", "petrol", "timetable"],
  },
  "a1p20l4/a1p20q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p20l5/a1p20q20": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["detour", "keys", "petrol"],
  },
  "a1p20l5/a1p20q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["petrol", "keys", "seatbelt"],
  },
  "a1p20l5/a1p20q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p20l5/a1p20q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p20l5/a1p20q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a1p22l1/a1p22q0": {
    why: '"reading a new language" is also correct',
    wrong: ["stamps", "on a bike", "in a pool"],
  },
  "a1p22l1/a1p22q1": {
    why: '"watching video games/plants" are also correct',
    wrong: ["on a bike", "with wool", "in a pool"],
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
    why: '"cycling outdoors" is also correct',
    wrong: ["to music", "with wool", "stamps"],
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["go", "going", "is go"],
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["get", "getting", "is get"],
  },
  "a1p2l5/a1p2q20": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["open", "opening", "do open"],
  },
  "a1p2l5/a1p2q21": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["flies", "flying", "is fly"],
  },
  "a1p2l5/a1p2q22": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["aren't", "doesn't", "don't"],
  },
  "a1p2l5/a1p2q24": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["live", "living", "is live"],
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Can I have some ___ with my tea? (white, to make it creamy)",
  },
  "a1p8l1/a1p8q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "bacon",
  },
  "a1p8l1/a1p8q3": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She ordered a bowl of ___ soup. (the soup is red)",
  },
  "a1p8l1/a1p8q4": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "salt",
  },
  "a1p8l2/a1p8q5": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I'll have a slice of ___ bread. (the colour of wholemeal)",
  },
  "a1p8l2/a1p8q6": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Would you like some ___ on your salad? (oil and vinegar)",
  },
  "a1p8l2/a1p8q7": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "He always has ___ for dessert. (a sweet treat with candles on it)",
  },
  "a1p8l2/a1p8q8": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "menu",
  },
  "a1p8l2/a1p8q9": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I'm allergic to ___. (the small nuts in a packet)",
  },
  "a1p8l3/a1p8q10": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She drinks ___ juice every morning. (squeezed from a citrus fruit)",
  },
  "a1p8l3/a1p8q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "cheese",
  },
  "a1p8l3/a1p8q12": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Could you pass the ___ for my tea? (to make it sweet)",
  },
  "a1p8l3/a1p8q13": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Let's order a ___ of pizza to share. (one triangle of the whole)",
  },
  "a1p8l3/a1p8q14": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "He spread some ___ on his toast. (sweet and made from fruit)",
  },
  "a1p8l4/a1p8q15": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I prefer ___ tea to green tea. (with no milk)",
  },
  "a1p8l4/a1p8q16": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Could I have the bill, or the ___? (the word Americans use)",
  },
  "a1p8l4/a1p8q17": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "steak",
  },
  "a1p8l4/a1p8q18": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She's a vegetarian, so no ___ for her. (she doesn't eat animals)",
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "He always orders his steak ___. (barely cooked inside)",
  },
  "a1p8l5/a1p8q22": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Could we split the ___ between us? (at the end of the meal)",
  },
  "a1p8l5/a1p8q23": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "This cake is made with real ___. (yellow, from cream)",
  },
  "a1p8l5/a1p8q24": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Would you like ___ or sparkling water? (without bubbles)",
  },
  "a1p9l1/a1p9q0": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She's wearing a red ___. (a one-piece for a party)",
    wrong: ["trousers", "sock", "hat"],
  },
  "a1p9l1/a1p9q1": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "jacket",
  },
  "a1p9l1/a1p9q2": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I need new ___ for winter. (for snow and rain)",
  },
  "a1p9l1/a1p9q3": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Put on your ___ before you go out. (a warm layer over your clothes)",
  },
  "a1p9l1/a1p9q4": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "These ___ are too tight. (blue, made of denim)",
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "It's cold — wear a ___. (around your neck)",
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "These shoes have a broken ___. (you tie it)",
  },
  "a1p9l3/a1p9q12": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "sweater",
  },
  "a1p9l3/a1p9q13": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She wears a ___ on her wrist. (it tells the time)",
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "He loosened his ___ after a long day. (it hangs from his collar)",
  },
  "a1p9l4/a1p9q18": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I need to buy new ___ for the gym. (short, for hot weather)",
  },
  "a1p9l4/a1p9q19": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She wore a white ___ under her jacket. (a smart top)",
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "He rolled up his ___. (the parts that cover his arms)",
  },
  "a1p9l5/a1p9q24": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I ironed my ___ this morning. (two legs, worn with a belt)",
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
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l1/a2p11q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["looking", "ketchup", "booked"],
  },
  "a2p11l1/a2p11q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l2/a2p11q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["menu", "water", "ketchup"],
  },
  "a2p11l2/a2p11q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l2/a2p11q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l2/a2p11q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l3/a2p11q10": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "We're just ___ at the menu for now, not ready to order. (reading it)",
    wrong: ["book", "booked", "included"],
  },
  "a2p11l3/a2p11q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l3/a2p11q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l3/a2p11q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["credit", "water", "window"],
  },
  "a2p11l3/a2p11q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l4/a2p11q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["tip", "book", "bill"],
  },
  "a2p11l4/a2p11q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l4/a2p11q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l4/a2p11q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["book", "ketchup", "credit"],
  },
  "a2p11l4/a2p11q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["cards", "ketchup", "credit"],
  },
  "a2p11l5/a2p11q20": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l5/a2p11q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l5/a2p11q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["book", "order", "doggy"],
  },
  "a2p11l5/a2p11q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p11l5/a2p11q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Go ___ at the traffic lights. (don't turn)",
  },
  "a2p13l1/a2p13q1": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Turn ___ at the next corner. (the opposite of right)",
  },
  "a2p13l1/a2p13q2": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Turn ___ at the bank. (the opposite of left)",
  },
  "a2p13l1/a2p13q3": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The supermarket is ___ from the bakery. (on the other side of the street)",
    wrong: ["next", "near", "behind"],
  },
  "a2p13l1/a2p13q4": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The park is ___ to the school. (right beside it)",
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
  "a2p13l2/a2p13q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["in", "down", "walk"],
  },
  "a2p13l4/a2p13q18": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The pharmacy is ___ the corner from here. (just out of sight, past the bend)",
    wrong: ["over", "through", "into"],
  },
  "a2p13l4/a2p13q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l1/a2p14q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l1/a2p14q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l1/a2p14q3": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["keep", "planning", "forward"],
  },
  "a2p14l1/a2p14q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l2/a2p14q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l2/a2p14q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["let", "pick", "forward"],
  },
  "a2p14l2/a2p14q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["make it", "looking", "pick"],
  },
  "a2p14l2/a2p14q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l2/a2p14q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["go", "pick", "looking"],
  },
  "a2p14l3/a2p14q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l3/a2p14q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l3/a2p14q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["set", "check", "manage"],
  },
  "a2p14l3/a2p14q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l3/a2p14q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l4/a2p14q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["meet", "let", "planning"],
  },
  "a2p14l4/a2p14q16": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["does", "did", "doing"],
  },
  "a2p14l4/a2p14q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l4/a2p14q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["check", "pick", "manage"],
  },
  "a2p14l4/a2p14q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["call", "forward", "pick"],
  },
  "a2p14l5/a2p14q20": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l5/a2p14q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["agree", "planning", "looking"],
  },
  "a2p14l5/a2p14q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p14l5/a2p14q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["set", "make it", "pick"],
  },
  "a2p14l5/a2p14q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["pick", "manage", "looking"],
  },
  "a2p15l1/a2p15q0": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l1/a2p15q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l1/a2p15q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l1/a2p15q3": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l1/a2p15q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l2/a2p15q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l2/a2p15q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["bank", "ATM", "branch"],
  },
  "a2p15l2/a2p15q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l2/a2p15q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l2/a2p15q9": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "receipt",
  },
  "a2p15l3/a2p15q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l3/a2p15q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l3/a2p15q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l3/a2p15q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["stamp", "PIN", "balance"],
  },
  "a2p15l3/a2p15q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l4/a2p15q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["renew", "fill in", "stamp"],
  },
  "a2p15l4/a2p15q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l4/a2p15q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l4/a2p15q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["package", "cost", "stamp"],
  },
  "a2p15l4/a2p15q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l5/a2p15q20": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["withdraw", "deposit", "fill in"],
  },
  "a2p15l5/a2p15q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l5/a2p15q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p15l5/a2p15q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["renew", "withdraw", "deposit"],
  },
  "a2p15l5/a2p15q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The ___ next door always says hello. (a person who lives beside you)",
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "My area has lots of ___ shops. (near to where I live)",
    wrong: ["shopping", "bus", "train"],
  },
  "a2p16l2/a2p16q6": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The ___ centre is a ten-minute walk away. (where all the shops are)",
    wrong: ["bus", "train", "school"],
  },
  "a2p16l2/a2p16q7": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I live in a ___ area, not the city. (mostly houses, few shops)",
    wrong: ["shopping", "bus", "train"],
  },
  "a2p16l2/a2p16q8": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "There's a nice ___ where I walk my dog. (open and green)",
    wrong: ["café", "market", "school"],
  },
  "a2p16l2/a2p16q9": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The bus ___ is right outside my house. (where the bus waits for people)",
  },
  "a2p16l3/a2p16q10": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "My street is very ___ at night. (there is almost no noise)",
  },
  "a2p16l3/a2p16q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "market",
  },
  "a2p16l3/a2p16q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p16l3/a2p16q13": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "There's a lovely ___ near my flat. (I go there for coffee and cake)",
    wrong: ["school", "park", "market"],
  },
  "a2p16l3/a2p16q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["years", "clean", "quiet"],
  },
  "a2p16l4/a2p16q15": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The area has lots of green ___. (parks and open land)",
  },
  "a2p16l4/a2p16q16": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "There's a friendly ___ atmosphere here. (neighbours know each other)",
  },
  "a2p16l4/a2p16q17": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The ___ near my house has great restaurants. (the district around it)",
    wrong: ["bus", "train", "road"],
  },
  "a2p16l4/a2p16q18": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "We live in a ___ that's popular with families. (a quiet area outside the city)",
  },
  "a2p16l4/a2p16q19": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The streets here are very ___ and safe. (no rubbish)",
  },
  "a2p16l5/a2p16q20": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "My building is close to the ___ stop. (where the bus waits)",
    wrong: ["train", "leisure", "community"],
  },
  "a2p16l5/a2p16q21": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "There's a good ___ centre nearby for sports. (a place for exercise)",
  },
  "a2p16l5/a2p16q22": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The area gets quite ___ during rush hour. (full of cars and people)",
  },
  "a2p16l5/a2p16q23": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "My neighbourhood has changed a lot over the ___. (a long period of time)",
  },
  "a2p16l5/a2p16q24": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "I really like living in this part of ___. (the city or the village)",
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
  "a2p17l2/a2p17q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
  "a2p17l5/a2p17q22": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The car is parked ___ the garage. (next to it, not inside)",
    wrong: ["in", "behind", "inside"],
  },
  "a2p17l5/a2p17q23": {
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "The plane flew ___ the city. (it went by without stopping)",
    wrong: ["into", "towards", "onto"],
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["write", "wrote", "writes"],
  },
  "a2p18l4/a2p18q16": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["swim", "swam", "swims"],
  },
  "a2p18l4/a2p18q17": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
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
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "This bag is as ___ as that one. (they weigh the same)",
  },
  "a2p20l1/a2p20q1": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "She is as ___ as her sister. (the same height)",
  },
  "a2p20l1/a2p20q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p20l1/a2p20q3": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "His car is as ___ as mine. (they go at the same speed)",
  },
  "a2p20l1/a2p20q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p20l2/a2p20q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p20l2/a2p20q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p20l2/a2p20q7": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "This hotel is as ___ as the other one. (it costs the same)",
  },
  "a2p20l2/a2p20q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p20l2/a2p20q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p20l3/a2p20q10": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "This restaurant is as ___ as the one downtown. (it has as many customers)",
  },
  "a2p20l3/a2p20q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p20l3/a2p20q12": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "This coffee is as ___ as the one at home. (it wakes you up just as much)",
  },
  "a2p20l3/a2p20q13": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The journey was as ___ as we expected. (it took the same time)",
  },
  "a2p20l3/a2p20q14": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "His new phone is as ___ as the old one. (it never breaks down)",
  },
  "a2p20l4/a2p20q15": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "This road is as ___ as the motorway. (the same amount of traffic)",
  },
  "a2p20l4/a2p20q16": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The party was as ___ as last year's. (everyone enjoyed it as much)",
  },
  "a2p20l4/a2p20q17": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Her cooking is as ___ as a professional chef's. (it tastes just as good)",
  },
  "a2p20l4/a2p20q18": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The city is as ___ as the countryside. (just as quiet and calm)",
  },
  "a2p20l4/a2p20q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p20l5/a2p20q20": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "My flat is as ___ as yours. (the same size, tiny)",
  },
  "a2p20l5/a2p20q21": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The lesson was as ___ as the last one. (it kept me awake just as much)",
  },
  "a2p20l5/a2p20q22": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "This wine is as ___ as the other bottle. (the same amount of sugar)",
  },
  "a2p20l5/a2p20q23": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "Her plan is as ___ as mine. (just as easy to follow)",
  },
  "a2p20l5/a2p20q24": {
    why: "topic word: several words of the topic fit without a clue; the bracketed context clue picks one",
    prompt: "The bridge is as ___ as the old one. (it won't break)",
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["was talking", "were talk", "talked"],
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["start", "starts", "starting"],
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["finish", "finishes", "finishing"],
  },
  "a2p2l3/a2p2q14": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["was playing", "were play", "played"],
  },
  "a2p2l4/a2p2q15": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "We ___ hear anything last night.",
    wrong: ["don't", "weren't", "wasn't"],
  },
  "a2p2l4/a2p2q16": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["close", "closes", "closing"],
  },
  "a2p2l4/a2p2q17": {
    why: "no time cue: the present form was also correct; the cue picks the past",
    prompt: "What ___ you doing at six yesterday?",
    wrong: ["was", "are", "did"],
  },
  "a2p2l4/a2p2q18": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["arrive", "arrives", "arriving"],
  },
  "a2p2l4/a2p2q19": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["use", "uses", "using"],
  },
  "a2p2l5/a2p2q20": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["know", "knows", "knowed"],
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["go", "goes", "goed"],
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
    why: 'other adjectives\' comparatives are too easy to rule out; "more + short adjective" and -er errors are the real mistakes',
    wrong: ["gooder", "more good", "well"],
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
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l1/a2p4q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["write", "catch", "fit"],
  },
  "a2p4l1/a2p4q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l1/a2p4q3": {
    why: "the wrong options were other verbs from the pack; now the agreement and tense errors a learner makes",
    wrong: ["do", "is", "are"],
  },
  "a2p4l1/a2p4q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l2/a2p4q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["fit", "looking", "delayed"],
  },
  "a2p4l2/a2p4q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l2/a2p4q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l2/a2p4q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l2/a2p4q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l3/a2p4q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l3/a2p4q11": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l3/a2p4q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l3/a2p4q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l3/a2p4q14": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "cash machine",
  },
  "a2p4l4/a2p4q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l4/a2p4q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l4/a2p4q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l4/a2p4q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l4/a2p4q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["bill", "fit", "size"],
  },
  "a2p4l5/a2p4q20": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l5/a2p4q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p4l5/a2p4q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["write", "looking", "delayed"],
  },
  "a2p4l5/a2p4q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["out", "fit", "write"],
  },
  "a2p4l5/a2p4q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p5l3/a2p5q11": {
    why: "the wrong options were filler from outside the slot's pool",
    wrong: ["many", "few", "several"],
  },
  "a2p5l4/a2p5q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
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
  "a2p6l1/a2p6q4": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["go", "gone"],
  },
  "a2p6l2/a2p6q5": {
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
    slot: "inflection",
    wrong: ["start", "starting", "started"],
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
    why: "verb slot: the wrong options were other verbs from the pack; now forms of the same verb",
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
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["hook", "mat", "driveway"],
  },
  "a2p7l1/a2p7q2": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "living room",
  },
  "a2p7l1/a2p7q3": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["cupboard", "ceiling", "driveway"],
  },
  "a2p7l1/a2p7q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["ceiling", "driveway", "mat"],
  },
  "a2p7l2/a2p7q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p7l2/a2p7q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["light", "mattress", "hook"],
  },
  "a2p7l2/a2p7q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["hallway", "wardrobe", "attic"],
  },
  "a2p7l2/a2p7q8": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "sofa",
  },
  "a2p7l2/a2p7q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p7l3/a2p7q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["light", "mattress", "hook"],
  },
  "a2p7l3/a2p7q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "garage",
  },
  "a2p7l3/a2p7q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["table", "mattress", "ceiling"],
  },
  "a2p7l3/a2p7q13": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "window",
  },
  "a2p7l3/a2p7q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p7l4/a2p7q15": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["cupboard", "mattress", "ceiling"],
  },
  "a2p7l4/a2p7q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["window", "mat", "driveway"],
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
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p7l5/a2p7q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["bathroom", "dining room", "mat"],
  },
  "a2p7l5/a2p7q22": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "ceiling",
  },
  "a2p7l5/a2p7q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["sofa", "driveway", "mat"],
  },
  "a2p7l5/a2p7q24": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "mat",
  },
  "a2p8l4/a2p8q18": { why: "sewing also uses a needle", wrong: ["swimming", "badminton", "golf"] },
  "a2p8l4/a2p8q19": {
    why: "tennis also uses a court and net",
    wrong: ["cricket", "music", "golf"],
  },
  "a2p9l1/a2p9q0": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p9l1/a2p9q1": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p9l1/a2p9q2": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["medicine", "spray", "fever"],
  },
  "a2p9l1/a2p9q3": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["pulse", "throat", "fever"],
  },
  "a2p9l1/a2p9q4": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["nuts", "injured", "bruise"],
  },
  "a2p9l2/a2p9q5": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["ankle", "finger", "dentist"],
  },
  "a2p9l2/a2p9q6": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p9l2/a2p9q7": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p9l2/a2p9q8": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p9l2/a2p9q9": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p9l3/a2p9q10": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["bruise", "throat", "ankle"],
  },
  "a2p9l3/a2p9q11": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "dentist",
  },
  "a2p9l3/a2p9q12": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p9l3/a2p9q13": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["nuts", "spray", "tooth"],
  },
  "a2p9l3/a2p9q14": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["nuts", "injured", "wrist"],
  },
  "a2p9l4/a2p9q15": {
    why: "topic word: the photo shows the answer, so no other option fits",
    imageKey: "finger",
  },
  "a2p9l4/a2p9q16": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["cough", "dentist", "fever"],
  },
  "a2p9l4/a2p9q17": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["upset", "faint", "nuts"],
  },
  "a2p9l4/a2p9q18": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["faint", "cold", "sick"],
  },
  "a2p9l4/a2p9q19": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["throat", "arm", "ankle"],
  },
  "a2p9l5/a2p9q20": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p9l5/a2p9q21": {
    why: "topic word reviewed: the sentence's own context excludes the other options",
    context: "the sentence already rules out the other options",
  },
  "a2p9l5/a2p9q22": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["dentist", "spray", "medicine"],
  },
  "a2p9l5/a2p9q23": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["migraine", "cough", "fever"],
  },
  "a2p9l5/a2p9q24": {
    why: "topic word reviewed: the sentence's own context excludes the other options; wrong options kept inside the topic",
    context: "the sentence already rules out the other options",
    wrong: ["arm", "throat", "ankle"],
  },
  "u1l1/q4": {
    why: "Fine/Nice evening are also fine greetings; the clue says which",
    prompt: "___ evening, everyone. (a formal greeting)",
    wrong: ["Well", "Fine", "Nice"],
  },
  "u1l1/q5": {
    why: '"Good day." is also a farewell',
    wrong: ["Good morning.", "Good hello.", "Good time."],
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
    why: "several pool members fit without a clue; the bracketed clue picks one",
    prompt: "___ you help me? (a polite request)",
    wrong: ["Must", "Shall", "Might"],
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
};
