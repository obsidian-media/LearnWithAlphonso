import type { QuestionFix } from "./question-fixes";

/** Phase 1 rewrites for English A1/A2. Review table: docs/content-fixes-a1a2-phase1.md */
export const FIXES_A1A2: Record<string, QuestionFix> = {
  "a1p10l1/a1p10q2": {
    why: "chilly and windy are also fine with a coat",
    wrong: ["sunny", "hot", "brown"],
  },
  "a1p10l3/a1p10q10": { why: '"a loud wind" is also correct', wrong: ["ice", "weather", "fog"] },
  "a1p10l3/a1p10q11": {
    why: '"windy" can also stop you seeing',
    wrong: ["cold", "sunny", "clear"],
  },
  "a1p10l3/a1p10q12": { why: '"very foggy" is also correct', wrong: ["hot", "brown", "hottest"] },
  "a1p10l3/a1p10q14": {
    why: '"warmer sun/wind" are also correct',
    wrong: ["ice", "fog", "thunder"],
  },
  "a1p10l4/a1p10q15": {
    why: "harsh/clear/sunny can all be said of icy ground",
    wrong: ["mild", "snow", "hottest"],
  },
  "a1p10l4/a1p10q16": {
    why: '"A storm crossed the sky" is also correct',
    wrong: ["weather", "fall", "ice"],
  },
  "a1p10l4/a1p10q17": {
    why: '"a rainy day" is a correct picnic day',
    wrong: ["fall", "brown", "thunder"],
  },
  "a1p10l4/a1p10q18": {
    why: "snow and sun also make it hard to drive",
    wrong: ["brown", "fall", "clear"],
  },
  "a1p10l4/a1p10q19": {
    why: '"before the snow began" is also correct',
    wrong: ["clear", "brown", "fall"],
  },
  "a1p10l5/a1p10q20": {
    why: '"too chilly/sunny to go swimming" are also correct',
    wrong: ["hottest", "brown", "fall"],
  },
  "a1p10l5/a1p10q23": {
    why: '"a hot day, perfect for a walk" is arguable',
    wrong: ["freezing", "fall", "thunder"],
  },
  "a1p10l5/a1p10q24": {
    why: '"it\'s rainy this evening" is also a reason for a jacket',
    wrong: ["sunny", "brown", "hottest"],
  },
  "a1p11l1/a1p11q0": {
    why: "fifty/fifteen are also correct without the number",
    prompt: "This shirt costs ___ dollars. (20)",
    wrong: ["fifty", "fifteen", "up"],
  },
  "a1p11l1/a1p11q2": {
    why: '"change some money from the machine" is also heard',
    wrong: ["more", "up", "enough"],
  },
  "a1p11l1/a1p11q3": {
    why: "three/fifty are also correct without the number",
    prompt: "The bill comes to ___ euros. (15)",
    wrong: ["three", "change", "fifty"],
  },
  "a1p11l2/a1p11q5": {
    why: '"change some money for the trip" is also correct',
    wrong: ["up", "more", "enough"],
  },
  "a1p11l2/a1p11q6": {
    why: '"saved ten dollars on the gift" is also correct',
    wrong: ["save", "more", "enough"],
  },
  "a1p11l2/a1p11q9": {
    why: '"enough change" is also correct',
    wrong: ["up", "contactless", "spent"],
  },
  "a1p11l3/a1p11q10": {
    why: "fifteen/twenty are also correct without the number",
    prompt: "The total is ___ pounds and fifty pence. (3.50)",
    wrong: ["fifteen", "twenty", "up"],
  },
  "a1p11l3/a1p11q13": {
    why: 'receipt/sale can also be "included"',
    wrong: ["amount", "balance", "wallet"],
  },
  "a1p11l3/a1p11q14": {
    why: '"counted the receipt" is also correct',
    wrong: ["sale", "tax", "wallet"],
  },
  "a1p11l4/a1p11q16": {
    why: '"borrowed more/enough dollars" are correct',
    wrong: ["change", "up", "contactless"],
  },
  "a1p11l4/a1p11q17": {
    why: '"exact/enough payments" are correct',
    wrong: ["up", "sale", "change"],
  },
  "a1p11l4/a1p11q19": {
    why: '"forgot my receipt" is also correct',
    wrong: ["sale", "balance", "tax"],
  },
  "a1p11l5/a1p11q21": {
    why: '"saved more money" is also correct',
    wrong: ["contactless", "up", "sale"],
  },
  "a1p11l5/a1p11q23": {
    why: '"paid the money in full" is also correct',
    wrong: ["discount", "change", "wallet"],
  },
  "a1p11l5/a1p11q24": { why: '"bank notes" is also correct', wrong: ["more", "up", "wallet"] },
  "a1p14l2/a1p14q8": {
    why: '"in the month of October" is also correct',
    wrong: ["noon", "afternoon", "week"],
  },
  "a1p14l3/a1p14q13": {
    why: '"weekday afternoons" is also correct',
    wrong: ["noon", "January", "year"],
  },
  "a1p14l4/a1p14q16": {
    why: '"start in December" is correct in the southern hemisphere',
    wrong: ["October", "minute", "night"],
  },
  "a1p15l1/a1p15q2": {
    why: "a sphere is also perfectly round",
    wrong: ["oval", "rectangle", "hexagon"],
  },
  "a1p15l5/a1p15q21": {
    why: "a triangle also has a pointed top",
    wrong: ["rectangle", "octagon", "circle"],
  },
  "a1p16l1/a1p16q3": {
    why: '"We have breakfast together" is also correct',
    wrong: ["gets", "get", "eats"],
  },
  "a1p16l2/a1p16q6": {
    why: '"He gets his email" is also correct',
    wrong: ["eat", "watch", "pack"],
  },
  "a1p16l4/a1p16q17": {
    why: '"She takes the kids to school" is also correct',
    wrong: ["watch", "walk", "pack"],
  },
  "a1p16l4/a1p16q19": {
    why: '"We watch/get the dog" are also correct',
    wrong: ["arrives", "drives", "spends"],
  },
  "a1p16l5/a1p16q24": {
    why: '"I always have my alarm" is arguable',
    wrong: ["gets", "glances at", "arrives"],
  },
  "a1p17l1/a1p17q1": {
    why: '"write on the page" is also correct',
    wrong: ["down", "desks", "bell"],
  },
  "a1p17l1/a1p17q2": {
    why: '"a book/board to write my answer" are also correct',
    wrong: ["bell", "map", "desks"],
  },
  "a1p17l2/a1p17q9": { why: '"a new rubber" is also correct', wrong: ["up", "down", "bell"] },
  "a1p17l3/a1p17q10": {
    why: '"I forgot my textbooks" is also correct',
    wrong: ["whiteboard", "bell", "map"],
  },
  "a1p17l4/a1p17q18": {
    why: '"hand in your ruler/map" are arguable',
    wrong: ["bell", "desk", "board"],
  },
  "a1p17l5/a1p17q21": {
    why: '"the next notebook" is arguable',
    wrong: ["ruler", "rubber", "bell"],
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
    why: '"buy some lettuce for dinner" is also correct',
    wrong: ["list", "bag", "price"],
  },
  "a1p19l1/a1p19q2": { why: '"in the freezer" is also correct', wrong: ["date", "eggs", "price"] },
  "a1p19l1/a1p19q4": {
    why: '"check the price" is also correct',
    wrong: ["trolley", "debit", "till"],
  },
  "a1p19l2/a1p19q5": {
    why: '"vegetables at the front of the shop" is also correct',
    wrong: ["discount", "bag", "debit"],
  },
  "a1p19l2/a1p19q7": {
    why: '"This bag/soap is on sale" are also correct',
    wrong: ["checkout", "cashier", "debit"],
  },
  "a1p19l3/a1p19q11": {
    why: '"more bread for breakfast" is also correct',
    wrong: ["cashier", "freezer", "trolley"],
  },
  "a1p19l3/a1p19q12": {
    why: '"The eggs are in aisle five" is also correct',
    wrong: ["price", "trolley", "debit"],
  },
  "a1p19l4/a1p19q19": {
    why: '"check the date" is also correct',
    wrong: ["eggs", "freezer", "soap"],
  },
  "a1p19l5/a1p19q20": {
    why: '"ran out of eggs, so buy some soap" is also correct',
    wrong: ["date", "freezer", "till"],
  },
  "a1p19l5/a1p19q22": {
    why: '"a basket to carry the bags" is also correct',
    wrong: ["debit", "oil", "till"],
  },
  "a1p19l5/a1p19q23": {
    why: '"some bread for the salad" is also correct',
    wrong: ["bag", "soap", "freezer"],
  },
  "a1p19l5/a1p19q24": {
    why: '"the total discount" is also correct',
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
  "a1p20l1/a1p20q0": { why: '"by jet" is also correct', wrong: ["walk", "airport", "carriage"] },
  "a1p20l1/a1p20q2": {
    why: '"catch a plane/ferry" are also correct',
    wrong: ["timetable", "seatbelt", "petrol"],
  },
  "a1p20l1/a1p20q3": {
    why: '"ride my subway" was too easy; "ride the metro" is also correct',
    wrong: ["keys", "petrol", "timetable"],
  },
  "a1p20l2/a1p20q7": {
    why: '"coach station" is also correct',
    wrong: ["carriage", "jet", "ticket"],
  },
  "a1p20l2/a1p20q9": {
    why: '"The taxi was late" is also correct',
    wrong: ["carriage", "keys", "petrol"],
  },
  "a1p20l3/a1p20q11": {
    why: '"The bike takes you across the river" is arguable',
    wrong: ["timetable", "keys", "petrol"],
  },
  "a1p20l3/a1p20q14": {
    why: '"take the coach to avoid traffic" is also correct',
    wrong: ["seatbelt", "carriage", "petrol"],
  },
  "a1p20l4/a1p20q15": {
    why: '"Our subway leaves at six" is also correct',
    wrong: ["walk", "petrol", "keys"],
  },
  "a1p20l4/a1p20q18": {
    why: '"we took a bus/metro" are also correct',
    wrong: ["seatbelt", "petrol", "timetable"],
  },
  "a1p20l5/a1p20q20": {
    why: '"The plane/ferry was full" are also correct',
    wrong: ["detour", "keys", "petrol"],
  },
  "a1p20l5/a1p20q21": {
    why: '"check the airport/coach/flight" are also correct',
    wrong: ["petrol", "keys", "seatbelt"],
  },
  "a1p21l4/a1p21q19": { why: "hair is also above the eyes", wrong: ["fingers", "ears", "toes"] },
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
  "a1p8l1/a1p8q0": { why: '"a cup of sugar" is also correct', wrong: ["soap", "bill", "bread"] },
  "a1p8l1/a1p8q1": {
    why: '"some cheese with my tea" is arguable',
    wrong: ["meat", "soap", "bill"],
  },
  "a1p8l1/a1p8q2": { why: '"tomato and eggs" is also correct', wrong: ["slice", "lemon", "bill"] },
  "a1p8l1/a1p8q4": {
    why: '"Pass the cheese and pepper" is also correct',
    wrong: ["bill", "menu", "soap"],
  },
  "a1p8l2/a1p8q5": { why: '"black bread" is also correct', wrong: ["still", "rare", "orange"] },
  "a1p8l2/a1p8q6": {
    why: '"peanuts/butter on your salad" are correct',
    wrong: ["check", "bill", "menu"],
  },
  "a1p8l2/a1p8q7": { why: '"sugar for dessert" is arguable', wrong: ["salt", "bill", "menu"] },
  "a1p8l2/a1p8q8": {
    why: '"the jam/dressing/tomato for the table" are correct',
    wrong: ["soap", "wallet", "shirt"],
  },
  "a1p8l2/a1p8q9": {
    why: "steak/lemon/bacon can all be allergies",
    wrong: ["menu", "bill", "check"],
  },
  "a1p8l3/a1p8q11": {
    why: '"more lemon/bacon for the sandwiches" are correct',
    wrong: ["slice", "bill", "soap"],
  },
  "a1p8l3/a1p8q12": {
    why: "unchanged idea; salt replaced by a clearly wrong noun",
    wrong: ["bill", "cheese", "soap"],
  },
  "a1p8l3/a1p8q14": {
    why: '"spread some tomato on toast" is arguable',
    wrong: ["meat", "coffee", "soap"],
  },
  "a1p8l4/a1p8q15": {
    why: '"I prefer orange tea" is arguable',
    wrong: ["still", "rare", "wooden"],
  },
  "a1p8l4/a1p8q16": {
    why: '"the bill, or the menu" is a correct sentence',
    wrong: ["milk", "black", "sugar"],
  },
  "a1p8l4/a1p8q17": {
    why: '"famous for its jam/salt" are correct',
    wrong: ["wallet", "soap", "shirt"],
  },
  "a1p8l4/a1p8q18": { why: '"no jam/cake for her" are correct', wrong: ["bill", "menu", "check"] },
  "a1p8l4/a1p8q19": {
    why: '"ran out of tomato/steak/coffee" are correct',
    wrong: ["bill", "menu", "soap"],
  },
  "a1p8l5/a1p8q20": {
    why: '"a squeeze of tomato" is arguable',
    wrong: ["steak", "coffee", "soap"],
  },
  "a1p8l5/a1p8q22": {
    why: '"split the sugar/butter/bread" are correct',
    wrong: ["soap", "shirt", "wallet"],
  },
  "a1p8l5/a1p8q23": {
    why: '"made with real meat/cheese/milk" are correct',
    wrong: ["soap", "bill", "paper"],
  },
  "a1p9l1/a1p9q0": { why: '"a red bag/sock" are correct', wrong: ["trousers", "jeans", "cheese"] },
  "a1p9l1/a1p9q1": {
    why: '"a black dress/lace" are correct',
    wrong: ["shorts", "jeans", "trousers"],
  },
  "a1p9l1/a1p9q3": {
    why: '"your hat/sunglasses" are correct',
    wrong: ["sleeves", "lace", "cheese"],
  },
  "a1p9l2/a1p9q5": {
    why: '"a blue ribbon/umbrella" are correct',
    wrong: ["jeans", "socks", "trousers"],
  },
  "a1p9l2/a1p9q6": {
    why: '"wears a hat/jacket to bed" are correct',
    wrong: ["cheese", "bread", "soap"],
  },
  "a1p9l2/a1p9q7": { why: '"my left watch" is correct', wrong: ["trainers", "boots", "jeans"] },
  "a1p9l2/a1p9q8": { why: '"wear a hat" is correct', wrong: ["sleeves", "jeans", "trousers"] },
  "a1p9l2/a1p9q9": {
    why: '"without her suit/boots/tie" are correct',
    wrong: ["cheese", "soap", "bread"],
  },
  "a1p9l3/a1p9q10": {
    why: '"wore a bag to the wedding" is arguable',
    wrong: ["pyjamas", "socks", "cheese"],
  },
  "a1p9l3/a1p9q12": {
    why: '"your green jeans/blouse" are correct',
    wrong: ["cheese", "bread", "soap"],
  },
  "a1p9l3/a1p9q14": {
    why: '"a leather tie/boots" are correct',
    wrong: ["sunglasses", "boots", "sleeves"],
  },
  "a1p9l4/a1p9q15": { why: '"Take your hat" is correct', wrong: ["sleeves", "cheese", "soap"] },
  "a1p9l4/a1p9q16": {
    why: '"a yellow dress/bag" are correct',
    wrong: ["jeans", "trousers", "shorts"],
  },
  "a1p9l4/a1p9q17": {
    why: '"loosened his watch/coat" are correct',
    wrong: ["cheese", "bread", "soap"],
  },
  "a1p9l4/a1p9q19": { why: '"a white scarf" is correct', wrong: ["shorts", "sleeves", "jeans"] },
  "a1p9l5/a1p9q20": {
    why: '"put on his trousers/watch" are correct',
    wrong: ["cheese", "soap", "bread"],
  },
  "a1p9l5/a1p9q22": {
    why: '"tied her hair with a lace" is correct',
    wrong: ["socks", "jeans", "trousers"],
  },
  "a1p9l5/a1p9q24": {
    why: '"ironed my suit/coat/tie" are correct',
    wrong: ["cheese", "soap", "bread"],
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
  "a2p11l1/a2p11q1": {
    why: '"have a table for two" is also correct',
    wrong: ["looking", "ketchup", "booked"],
  },
  "a2p11l1/a2p11q4": {
    why: "ketchup/cards/order all fit without the clue",
    prompt: "Could we have the ___ when you're ready? (we want to pay)",
    wrong: ["ketchup", "cards", "order"],
  },
  "a2p11l2/a2p11q6": { why: '"kids dishes" is arguable', wrong: ["menu", "water", "ketchup"] },
  "a2p11l3/a2p11q10": {
    why: '"just looking a table" is not English; the sentence needed "at the menu"',
    prompt: "We're just ___ at the menu for now, not ready to order.",
    wrong: ["book", "booked", "included"],
  },
  "a2p11l3/a2p11q13": {
    why: '"a dinner/vegetarian menu" are correct',
    wrong: ["credit", "water", "window"],
  },
  "a2p11l4/a2p11q15": { why: '"sit by the water" is correct', wrong: ["tip", "book", "bill"] },
  "a2p11l4/a2p11q18": {
    why: '"The dish/water was excellent" are correct',
    wrong: ["book", "ketchup", "credit"],
  },
  "a2p11l4/a2p11q19": { why: '"the same order" is correct', wrong: ["cards", "ketchup", "credit"] },
  "a2p11l5/a2p11q22": { why: '"fully included" is correct', wrong: ["book", "order", "doggy"] },
  "a2p11l5/a2p11q24": {
    why: '"Enjoy your menu" is arguable',
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
    why: '"Go round/up at the lights" are correct',
    wrong: ["near", "behind", "opposite"],
  },
  "a2p13l1/a2p13q1": { why: '"Turn right" is correct', wrong: ["walk", "turning", "straight"] },
  "a2p13l2/a2p13q5": { why: '"Walk up two blocks" is correct', wrong: ["around", "on", "near"] },
  "a2p13l2/a2p13q9": {
    why: '"walking in the river" is arguable',
    wrong: ["right", "between", "for"],
  },
  "a2p13l3/a2p13q11": { why: '"Go up the bridge" is arguable', wrong: ["walk", "left", "for"] },
  "a2p13l4/a2p13q17": { why: '"reach the end" is correct', wrong: ["in", "down", "walk"] },
  "a2p13l5/a2p13q21": {
    why: '"Go over/round this road" are correct',
    wrong: ["next", "walk", "for"],
  },
  "a2p13l5/a2p13q24": {
    why: '"it\'s outside/opposite the town square" are correct',
    wrong: ["turning", "walk", "straight"],
  },
  "a2p14l1/a2p14q3": {
    why: '"Let\'s go up at the cinema" is arguable',
    wrong: ["keep", "planning", "forward"],
  },
  "a2p14l2/a2p14q6": {
    why: '"I can\'t arrange/change" are correct',
    wrong: ["let", "pick", "forward"],
  },
  "a2p14l2/a2p14q7": { why: '"set a date" is correct', wrong: ["make it", "looking", "pick"] },
  "a2p14l2/a2p14q9": { why: '"fix my schedule" is correct', wrong: ["go", "pick", "looking"] },
  "a2p14l3/a2p14q12": { why: '"write you up" is arguable', wrong: ["set", "check", "manage"] },
  "a2p14l4/a2p14q15": {
    why: '"leave me an invite" is correct',
    wrong: ["meet", "let", "planning"],
  },
  "a2p14l4/a2p14q16": { why: '"manage this again" is correct', wrong: ["does", "is", "planning"] },
  "a2p14l4/a2p14q18": {
    why: '"do/change it for Thursday" are correct',
    wrong: ["check", "pick", "manage"],
  },
  "a2p14l4/a2p14q19": { why: '"book that day" is correct', wrong: ["call", "forward", "pick"] },
  "a2p14l5/a2p14q21": {
    why: '"keep it for another day" is correct',
    wrong: ["agree", "planning", "looking"],
  },
  "a2p14l5/a2p14q23": {
    why: '"arrange the tickets" is correct',
    wrong: ["set", "make it", "pick"],
  },
  "a2p14l5/a2p14q24": {
    why: '"We\'re all free to meet" is correct',
    wrong: ["pick", "manage", "looking"],
  },
  "a2p15l2/a2p15q6": { why: '"weigh this parcel" is correct', wrong: ["bank", "ATM", "branch"] },
  "a2p15l3/a2p15q13": {
    why: '"the queue at the ATM/branch" are correct',
    wrong: ["stamp", "PIN", "balance"],
  },
  "a2p15l4/a2p15q15": {
    why: '"deposit/change a cheque" are correct',
    wrong: ["renew", "fill in", "stamp"],
  },
  "a2p15l4/a2p15q18": {
    why: '"transfer money to the post office" is arguable',
    wrong: ["package", "cost", "stamp"],
  },
  "a2p15l5/a2p15q20": {
    why: '"change my bank card" is correct',
    wrong: ["withdraw", "deposit", "fill in"],
  },
  "a2p15l5/a2p15q23": {
    why: '"fill in the form" is correct',
    wrong: ["renew", "withdraw", "deposit"],
  },
  "a2p15l5/a2p15q24": {
    why: '"collect a package" is correct',
    wrong: ["stamps", "balance", "PIN"],
  },
  "a2p16l1/a2p16q0": {
    why: '"My neighbour is very quiet and friendly" is also correct',
    wrong: ["train", "clean", "bus"],
  },
  "a2p16l1/a2p16q1": {
    why: '"a small field/suburb at the end of my street" are correct',
    wrong: ["train", "bus", "years"],
  },
  "a2p16l1/a2p16q3": {
    why: '"a good area near our house" is correct',
    wrong: ["neighbour", "years", "clean"],
  },
  "a2p16l1/a2p16q4": {
    why: '"a busy neighbourhood" is correct',
    wrong: ["years", "clean", "leisure"],
  },
  "a2p16l2/a2p16q5": {
    why: '"clean/busy shops" are correct',
    wrong: ["shopping", "years", "stop"],
  },
  "a2p16l2/a2p16q6": { why: '"quiet centre" is correct', wrong: ["neighbour", "years", "clean"] },
  "a2p16l2/a2p16q7": { why: '"local/quiet area" are correct', wrong: ["café", "bus", "train"] },
  "a2p16l2/a2p16q8": {
    why: '"a nice café where I walk my dog" is correct',
    wrong: ["bus", "neighbour", "years"],
  },
  "a2p16l3/a2p16q13": {
    why: '"a lovely school near my flat" is correct',
    wrong: ["leisure", "quiet", "years"],
  },
  "a2p16l3/a2p16q14": {
    why: '"the city town/area" are correct',
    wrong: ["years", "clean", "quiet"],
  },
  "a2p16l4/a2p16q16": {
    why: '"friendly park/market atmosphere" are correct',
    wrong: ["clean", "years", "stop"],
  },
  "a2p16l4/a2p16q17": {
    why: "area/neighbourhood/centre/road all fit",
    wrong: ["years", "stop", "clean"],
  },
  "a2p16l5/a2p16q20": {
    why: '"close to the train stop" is correct',
    wrong: ["years", "clean", "local"],
  },
  "a2p16l5/a2p16q21": {
    why: '"community/town centre" are correct',
    wrong: ["stop", "years", "clean"],
  },
  "a2p16l5/a2p16q22": {
    why: '"quite clean/local" are correct',
    wrong: ["residential", "years", "stop"],
  },
  "a2p17l1/a2p17q0": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The cat is sitting ___ the table. (below it)",
    wrong: ["above", "behind", "beside"],
  },
  "a2p17l1/a2p17q1": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The book is ___ the shelf. (on its top surface)",
    wrong: ["in", "by", "into"],
  },
  "a2p17l1/a2p17q2": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "She is standing ___ the door. (hidden on the other side of it)",
    wrong: ["in front of", "beside", "against"],
  },
  "a2p17l1/a2p17q3": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The keys are ___ the drawer. (inside it)",
    wrong: ["near", "above", "under"],
  },
  "a2p17l1/a2p17q4": {
    why: "another place word also fits without a clue (past/through/by/in/alongside the same noun)",
    wrong: ["into", "down", "through"],
  },
  "a2p17l2/a2p17q5": {
    why: "another place word also fits without a clue (past/through/by/in/alongside the same noun)",
    wrong: ["inside", "behind", "down"],
  },
  "a2p17l2/a2p17q6": {
    why: "another place word also fits without a clue (past/through/by/in/alongside the same noun)",
    wrong: ["through", "down", "into"],
  },
  "a2p17l2/a2p17q7": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The dog is running ___ the garden. (in circles)",
    wrong: ["through", "into", "across"],
  },
  "a2p17l2/a2p17q8": {
    why: "another place word also fits without a clue (past/through/by/in/alongside the same noun)",
    wrong: ["through", "into", "alongside"],
  },
  "a2p17l2/a2p17q9": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "She parked the car ___ the building. (not inside it)",
    wrong: ["down", "through", "into"],
  },
  "a2p17l3/a2p17q10": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The ball rolled ___ the stairs. (from the top to the bottom)",
    wrong: ["up", "over", "across"],
  },
  "a2p17l3/a2p17q11": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The plane flew ___ the clouds. (higher than them)",
    wrong: ["through", "below", "into"],
  },
  "a2p17l3/a2p17q12": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The cat hid ___ the sofa cushions. (underneath them)",
    wrong: ["on top of", "behind", "in front of"],
  },
  "a2p17l3/a2p17q13": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The children are playing ___ the swings. (next to them)",
    wrong: ["into", "towards", "among"],
  },
  "a2p17l3/a2p17q14": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The bridge goes ___ the river. (above the water, from bank to bank)",
    wrong: ["through", "down", "into"],
  },
  "a2p17l4/a2p17q16": {
    why: "another place word also fits without a clue (past/through/by/in/alongside the same noun)",
    wrong: ["among", "by", "on"],
  },
  "a2p17l4/a2p17q17": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The lamp is ___ the desk. (right next to it)",
    wrong: ["into", "down", "under"],
  },
  "a2p17l4/a2p17q18": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "She placed the vase ___ the window. (close to it)",
    wrong: ["down", "into", "through"],
  },
  "a2p17l4/a2p17q19": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The tunnel goes ___ the mountain. (from one side to the other, inside it)",
    wrong: ["over", "around", "in"],
  },
  "a2p17l5/a2p17q20": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The cinema is ___ the shopping centre. (within the building)",
    wrong: ["alongside", "down", "past"],
  },
  "a2p17l5/a2p17q21": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "He stood ___ the crowd, watching. (in the middle of the people)",
    wrong: ["into", "down", "alongside"],
  },
  "a2p17l5/a2p17q22": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The car is parked ___ the garage. (next to it, not inside)",
    wrong: ["in", "round", "down"],
  },
  "a2p17l5/a2p17q23": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The plane flew ___ the city. (it went by without stopping)",
    wrong: ["in", "round", "down"],
  },
  "a2p17l5/a2p17q24": {
    why: "several place words fit without a clue; the bracketed clue picks the one",
    prompt: "The path leads ___ the forest. (in the direction of it)",
    wrong: ["into", "down", "past"],
  },
  "a2p18l1/a2p18q0": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["watch", "watched", "watches"],
  },
  "a2p18l1/a2p18q1": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["play", "played", "plays"],
  },
  "a2p18l1/a2p18q2": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["cook", "cooked", "cooks"],
  },
  "a2p18l1/a2p18q3": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["talk", "talked", "talks"],
  },
  "a2p18l1/a2p18q4": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["sleep", "slept", "sleeps"],
  },
  "a2p18l2/a2p18q5": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["read", "readed", "reads"],
  },
  "a2p18l2/a2p18q6": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["drive", "drove", "drives"],
  },
  "a2p18l2/a2p18q7": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["study", "studied", "studies"],
  },
  "a2p18l2/a2p18q8": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["walk", "walked", "walks"],
  },
  "a2p18l2/a2p18q9": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["work", "worked", "works"],
  },
  "a2p18l3/a2p18q10": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["wait", "waited", "waits"],
  },
  "a2p18l3/a2p18q11": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["have", "had", "has"],
  },
  "a2p18l3/a2p18q12": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["listen", "listened", "listens"],
  },
  "a2p18l3/a2p18q13": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["shop", "shopped", "shops"],
  },
  "a2p18l3/a2p18q14": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["jog", "jogged", "jogs"],
  },
  "a2p18l4/a2p18q15": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["write", "wrote", "writes"],
  },
  "a2p18l4/a2p18q16": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["swim", "swam", "swims"],
  },
  "a2p18l4/a2p18q17": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["sing", "sang", "sings"],
  },
  "a2p18l4/a2p18q18": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["camp", "camped", "camps"],
  },
  "a2p18l4/a2p18q19": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["paint", "painted", "paints"],
  },
  "a2p18l5/a2p18q20": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["dream", "dreamed", "dreams"],
  },
  "a2p18l5/a2p18q21": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["argue", "argued", "argues"],
  },
  "a2p18l5/a2p18q22": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["dance", "danced", "dances"],
  },
  "a2p18l5/a2p18q23": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["chat", "chatted", "chats"],
  },
  "a2p18l5/a2p18q24": {
    why: "other -ing verbs from the pack often fit the sentence too; the lesson is the form, so the wrong options are the same verb in the wrong form",
    wrong: ["ride", "rode", "rides"],
  },
  "a2p19l1/a2p19q0": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    wrong: ["can", "may", "will"],
  },
  "a2p19l1/a2p19q1": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "___ I open the window, please? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l1/a2p19q2": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "She ___ speak three languages fluently. (she has the skill)",
    wrong: ["must", "might", "would"],
  },
  "a2p19l1/a2p19q3": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "___ you help me carry this bag? (a polite request)",
    wrong: ["must", "shall", "might"],
  },
  "a2p19l1/a2p19q4": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "We ___ leave early if we finish the work. (it is possible)",
    wrong: ["would", "ought", "used"],
  },
  "a2p19l2/a2p19q5": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "___ I use your phone for a moment? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l2/a2p19q6": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    wrong: ["can", "may", "will"],
  },
  "a2p19l2/a2p19q8": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "___ I ask you a question? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l3/a2p19q10": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "She ___ drive, but she doesn't have a car. (she has the skill)",
    wrong: ["must", "would", "ought"],
  },
  "a2p19l3/a2p19q11": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "___ you pass me the salt, please? (a polite request)",
    wrong: ["must", "shall", "might"],
  },
  "a2p19l3/a2p19q12": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "We ___ not enter without a ticket. (it is not allowed)",
    wrong: ["cans", "can to", "used"],
  },
  "a2p19l3/a2p19q14": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "___ I sit here, or is this seat taken? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l4/a2p19q15": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    wrong: ["cans", "can to", "used"],
  },
  "a2p19l4/a2p19q17": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "___ we borrow your umbrella, please? (a polite request)",
    wrong: ["must", "will", "ought"],
  },
  "a2p19l4/a2p19q18": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "He ___ lift very heavy weights at the gym. (he is strong enough)",
    wrong: ["must", "would", "ought"],
  },
  "a2p19l4/a2p19q19": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "___ I leave the room for a moment? (asking for permission)",
    wrong: ["will", "would", "must"],
  },
  "a2p19l5/a2p19q21": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "We ___ finish the project by Friday. (it is possible)",
    wrong: ["would", "ought", "used"],
  },
  "a2p19l5/a2p19q22": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "___ you show me the way to the station? (a polite request)",
    wrong: ["must", "shall", "might"],
  },
  "a2p19l5/a2p19q23": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "She ___ not attend school last week due to illness.",
    wrong: ["can", "may", "ought"],
  },
  "a2p19l5/a2p19q24": {
    why: "Modal pack: all of can/could/may fit without a function clue; the bracketed clue picks one and the wrong options are other functions (or learner errors)",
    prompt: "I ___ help you with your homework if you want. (I am able to)",
    wrong: ["must", "would", "ought"],
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
    why: "a bag can also be popular or sturdy",
    wrong: ["delicious", "fluent", "peaceful"],
  },
  "a2p20l1/a2p20q1": {
    why: "quick/simple/small all fit without the clue",
    prompt: "She is as ___ as her sister. (the same height)",
    wrong: ["quick", "simple", "small"],
  },
  "a2p20l1/a2p20q3": {
    why: '"His car is as heavy as mine" is correct',
    wrong: ["fluent", "busy", "delicious"],
  },
  "a2p20l2/a2p20q7": {
    why: '"as interesting as the other one" is correct',
    wrong: ["fluent", "sweet", "delicious"],
  },
  "a2p20l3/a2p20q10": {
    why: '"as busy as the one downtown" is correct',
    wrong: ["sweet", "fluent", "tall"],
  },
  "a2p20l3/a2p20q12": {
    why: '"as cold as the one at home" is correct',
    wrong: ["small", "difficult", "fluent"],
  },
  "a2p20l3/a2p20q13": {
    why: '"as warm as we expected" is correct',
    wrong: ["fluent", "tall", "delicious"],
  },
  "a2p20l3/a2p20q14": {
    why: '"as popular/heavy as the old one" are correct',
    wrong: ["peaceful", "fluent", "delicious"],
  },
  "a2p20l4/a2p20q15": {
    why: '"as sturdy/interesting/quick as the motorway" are correct',
    wrong: ["fluent", "delicious", "sweet"],
  },
  "a2p20l4/a2p20q16": {
    why: '"as busy as last year\'s" is correct',
    wrong: ["fluent", "tall", "sweet"],
  },
  "a2p20l4/a2p20q17": {
    why: '"as sweet/spicy as a chef\'s" are correct',
    wrong: ["tall", "fluent", "peaceful"],
  },
  "a2p20l4/a2p20q18": {
    why: '"as good/simple/strong as the countryside" are correct',
    wrong: ["fluent", "delicious", "tall"],
  },
  "a2p20l5/a2p20q20": {
    why: '"as expensive as yours" is correct',
    wrong: ["sweet", "fluent", "delicious"],
  },
  "a2p20l5/a2p20q21": {
    why: '"as peaceful as the last one" is correct',
    wrong: ["tall", "fluent", "delicious"],
  },
  "a2p20l5/a2p20q22": {
    why: '"as good/strong/warm as the other bottle" are correct',
    wrong: ["tall", "fluent", "busy"],
  },
  "a2p20l5/a2p20q23": {
    why: '"as fun/quick as mine" are correct',
    wrong: ["tall", "fluent", "delicious"],
  },
  "a2p20l5/a2p20q24": {
    why: '"as tall/hard as the old one" are correct',
    wrong: ["fluent", "delicious", "sweet"],
  },
  "a2p2l1/a2p2q0": { why: '"got to the cinema" is also correct', wrong: ["go", "goed", "gone"] },
  "a2p2l1/a2p2q1": {
    why: '"She started cooking when I arrived" is also correct',
    wrong: ["were", "is", "did"],
  },
  "a2p2l2/a2p2q5": {
    why: '"Had you enjoyed...?" and others fit without a time cue',
    prompt: "___ you enjoy the concert last night?",
    wrong: ["Do", "Were", "Does"],
  },
  "a2p2l2/a2p2q7": {
    why: '"The film was at eight" is also correct',
    wrong: ["lost", "used", "kept"],
  },
  "a2p2l2/a2p2q8": {
    why: '"I arrived tired, so I left" is also correct',
    wrong: ["were", "didn't", "is"],
  },
  "a2p2l3/a2p2q10": {
    why: '"It started raining all morning" is arguable',
    wrong: ["were", "went", "are"],
  },
  "a2p2l3/a2p2q13": {
    why: '"started/had my homework before dinner" are also correct',
    wrong: ["didn't", "finish", "finishing"],
  },
  "a2p2l3/a2p2q14": {
    why: '"The children went in the garden" is also correct',
    wrong: ["Did", "was", "plays"],
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
  "a2p4l1/a2p4q1": {
    why: '"I\'d like to show a room" is also correct',
    wrong: ["write", "catch", "fit"],
  },
  "a2p4l2/a2p4q5": {
    why: '"Where do I check my luggage?" is also correct',
    wrong: ["fit", "looking", "delayed"],
  },
  "a2p4l3/a2p4q14": {
    why: '"is there a taxi near here?" is also correct',
    wrong: ["size", "book", "bill"],
  },
  "a2p4l4/a2p4q19": {
    why: '"a return to the airport" is also correct',
    wrong: ["bill", "fit", "size"],
  },
  "a2p4l5/a2p4q22": {
    why: '"I\'ll try/change it" are also correct',
    wrong: ["write", "looking", "delayed"],
  },
  "a2p4l5/a2p4q23": { why: '"take/book the bus" are also correct', wrong: ["out", "fit", "write"] },
  "a2p5l1/a2p5q4": {
    why: '"no money" and "much money" are also correct',
    wrong: ["many", "a few", "several"],
  },
  "a2p5l2/a2p5q5": { why: '"more chairs" is also correct', wrong: ["whole", "much", "little"] },
  "a2p5l2/a2p5q6": { why: '"no more bread" is also correct', wrong: ["any", "several", "many"] },
  "a2p5l2/a2p5q7": {
    why: '"some/more tickets" are also correct',
    wrong: ["much", "little", "a little"],
  },
  "a2p5l2/a2p5q8": { why: '"too little coffee" is also correct', wrong: ["more", "many", "whole"] },
  "a2p5l3/a2p5q10": { why: '"enough time" is also correct', wrong: ["too", "some", "many"] },
  "a2p5l3/a2p5q12": {
    why: '"Many/Enough of the students passed" are also correct',
    wrong: ["Much", "Little", "No"],
  },
  "a2p5l3/a2p5q13": { why: '"the most cake" is also correct', wrong: ["much", "few", "many"] },
  "a2p5l3/a2p5q14": { why: '"more/any tea" are also correct', wrong: ["much", "many", "few"] },
  "a2p5l4/a2p5q15": { why: '"some apples" is also correct', wrong: ["any", "much", "little"] },
  "a2p5l4/a2p5q17": {
    why: '"no/more homework" are also correct',
    wrong: ["many", "few", "several"],
  },
  "a2p5l4/a2p5q18": {
    why: '"enough/no books" are also correct',
    wrong: ["much", "little", "a little"],
  },
  "a2p5l5/a2p5q20": {
    why: '"much information" is also correct',
    wrong: ["few", "many", "several"],
  },
  "a2p5l5/a2p5q24": {
    why: '"some/more friends" are also correct',
    wrong: ["whole", "much", "little"],
  },
  "a2p6l1/a2p6q0": {
    why: "learner errors with will (wills, will to) instead of unrelated words",
    wrong: ["wills", "will to", "going"],
  },
  "a2p6l1/a2p6q1": { why: "agreement and will + going to errors", wrong: ["is", "am", "will"] },
  "a2p6l1/a2p6q2": { why: "agreement errors", wrong: ["are", "am", "will"] },
  "a2p6l1/a2p6q3": {
    why: '"Do you help me?" was a correct question',
    wrong: ["Are", "Is", "Wills"],
  },
  "a2p6l1/a2p6q4": { why: "learner errors with going to", wrong: ["will", "are"] },
  "a2p6l2/a2p6q5": {
    why: '"The train is at ten tomorrow" was also correct',
    wrong: ["will", "leaving", "leave"],
  },
  "a2p6l2/a2p6q6": { why: "learner errors with will", wrong: ["wills", "will to", "are"] },
  "a2p6l2/a2p6q8": { why: "learner errors with will", wrong: ["wills", "will to", "am"] },
  "a2p6l2/a2p6q9": { why: "agreement errors", wrong: ["is", "am", "do"] },
  "a2p6l3/a2p6q10": { why: "learner errors with will", wrong: ["wills", "will to", "is"] },
  "a2p6l3/a2p6q11": { why: "present continuous errors", wrong: ["have", "has", "will"] },
  "a2p6l3/a2p6q12": {
    why: '"I promise I don\'t tell anyone" was close to correct; now the common spelling errors',
    wrong: ["wont", "willn't", "won't to"],
  },
  "a2p6l3/a2p6q13": { why: "going to errors", wrong: ["will", "go", "is"] },
  "a2p6l3/a2p6q14": {
    why: "timetable present simple errors",
    wrong: ["start", "starting", "will"],
  },
  "a2p6l4/a2p6q15": {
    why: '"Will we take a taxi?" is a correct question',
    wrong: ["Are", "Is", "Shall to"],
  },
  "a2p6l4/a2p6q16": { why: "learner errors with will", wrong: ["wills", "will to", "am"] },
  "a2p6l4/a2p6q18": { why: "learner errors with will", wrong: ["wills", "will to", "are"] },
  "a2p6l4/a2p6q19": { why: "present continuous errors", wrong: ["take", "takes", "will"] },
  "a2p6l5/a2p6q20": { why: "common errors with won't", wrong: ["wont", "willn't", "won't to"] },
  "a2p6l5/a2p6q21": { why: "agreement errors", wrong: ["is", "am", "will"] },
  "a2p6l5/a2p6q22": { why: "learner errors with will", wrong: ["wills", "will to", "am"] },
  "a2p6l5/a2p6q23": { why: "agreement errors", wrong: ["are", "am", "will"] },
  "a2p6l5/a2p6q24": { why: "learner errors with will", wrong: ["wills", "will to", "are"] },
  "a2p7l1/a2p7q0": {
    why: '"cook in the bedroom" is a correct sentence',
    wrong: ["ceiling", "driveway", "wardrobe"],
  },
  "a2p7l1/a2p7q1": {
    why: '"clothes in the living room/attic" are correct',
    wrong: ["hook", "mat", "driveway"],
  },
  "a2p7l1/a2p7q2": {
    why: '"watching TV in the garden" is correct',
    wrong: ["mat", "table", "ceiling"],
  },
  "a2p7l1/a2p7q3": {
    why: '"brushing his teeth in the hallway/garage" are correct',
    wrong: ["cupboard", "ceiling", "driveway"],
  },
  "a2p7l1/a2p7q4": {
    why: '"plates in the hallway/garage/kitchen" are correct',
    wrong: ["ceiling", "driveway", "mat"],
  },
  "a2p7l2/a2p7q6": {
    why: '"garden behind the window/living room" are arguable',
    wrong: ["light", "mattress", "hook"],
  },
  "a2p7l2/a2p7q7": {
    why: '"keys on the door/mat" are correct',
    wrong: ["hallway", "wardrobe", "attic"],
  },
  "a2p7l3/a2p7q10": {
    why: '"breakfast in the living room/flat" are correct',
    wrong: ["light", "mattress", "hook"],
  },
  "a2p7l3/a2p7q11": {
    why: '"fixing a shelf in the attic/basement" are correct',
    wrong: ["sofa", "mattress", "hook"],
  },
  "a2p7l3/a2p7q12": {
    why: '"the washing machine is in the kitchen" is correct',
    wrong: ["table", "mattress", "ceiling"],
  },
  "a2p7l3/a2p7q13": { why: '"Open the door" is also correct', wrong: ["house", "bathroom", "mat"] },
  "a2p7l4/a2p7q15": {
    why: '"keep the car in the garage" is also correct',
    wrong: ["cupboard", "mattress", "ceiling"],
  },
  "a2p7l4/a2p7q16": {
    why: '"lead up to the bathroom/hallway" are correct',
    wrong: ["window", "mat", "driveway"],
  },
  "a2p7l4/a2p7q17": {
    why: '"plants in the living room" is correct',
    wrong: ["hook", "mattress", "ceiling"],
  },
  "a2p7l4/a2p7q18": {
    why: "bathroom/garden/kitchen are all cleanable",
    prompt: "He's cleaning the ___ before guests arrive. (the area just inside the front door)",
    wrong: ["bathroom", "garden", "kitchen"],
  },
  "a2p7l4/a2p7q19": { why: '"a soft mat" is also correct', wrong: ["attic", "house", "driveway"] },
  "a2p7l5/a2p7q21": {
    why: '"a small garden downtown" is arguable',
    wrong: ["bathroom", "dining room", "mat"],
  },
  "a2p7l5/a2p7q22": {
    why: "cupboard/door/garage all need painting",
    prompt: "The ___ needs painting. (the top surface of the room)",
    wrong: ["cupboard", "door", "garage"],
  },
  "a2p7l5/a2p7q23": {
    why: '"old boxes in the wardrobe" is correct',
    wrong: ["sofa", "driveway", "mat"],
  },
  "a2p8l4/a2p8q18": { why: "sewing also uses a needle", wrong: ["swimming", "badminton", "golf"] },
  "a2p8l4/a2p8q19": {
    why: "tennis also uses a court and net",
    wrong: ["cricket", "music", "golf"],
  },
  "a2p9l1/a2p9q2": {
    why: '"My arm hurts after running" is correct',
    wrong: ["medicine", "spray", "fever"],
  },
  "a2p9l1/a2p9q3": { why: '"broke his wrist" is correct', wrong: ["pulse", "throat", "fever"] },
  "a2p9l1/a2p9q4": { why: '"I feel sick" is correct', wrong: ["nuts", "injured", "bruise"] },
  "a2p9l2/a2p9q5": { why: '"She has a cough" is correct', wrong: ["ankle", "finger", "dentist"] },
  "a2p9l3/a2p9q10": { why: '"some spray" is correct', wrong: ["bruise", "throat", "ankle"] },
  "a2p9l3/a2p9q13": {
    why: '"been cold/dizzy since Monday" are correct',
    wrong: ["nuts", "spray", "tooth"],
  },
  "a2p9l3/a2p9q14": { why: '"she felt sick" is correct', wrong: ["nuts", "injured", "wrist"] },
  "a2p9l4/a2p9q16": {
    why: '"checked my temperature" is correct',
    wrong: ["cough", "dentist", "fever"],
  },
  "a2p9l4/a2p9q17": { why: '"his cold leg" is arguable', wrong: ["upset", "faint", "nuts"] },
  "a2p9l4/a2p9q18": { why: '"an injured stomach" is arguable', wrong: ["faint", "cold", "sick"] },
  "a2p9l4/a2p9q19": {
    why: '"recovering from a bruise" is correct',
    wrong: ["throat", "arm", "ankle"],
  },
  "a2p9l5/a2p9q22": {
    why: '"see a doctor about my headache/ankle" are correct',
    wrong: ["dentist", "spray", "medicine"],
  },
  "a2p9l5/a2p9q23": {
    why: '"sprained her finger" is correct',
    wrong: ["migraine", "cough", "fever"],
  },
  "a2p9l5/a2p9q24": {
    why: '"recommended this medicine" is correct',
    wrong: ["arm", "throat", "ankle"],
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
  "u5l1/q4": { why: '"paid by cash" and "with cash" are also heard', wrong: ["on", "at", "of"] },
  "u5l1/q6": {
    why: '"anything cheap" is also correct',
    wrong: ["cheapest", "more cheap", "cheaply"],
  },
};
