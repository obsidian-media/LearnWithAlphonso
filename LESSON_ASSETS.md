# English Buddy App — Complete Lesson Asset List

> **Status (2026-09-13):** this file's premise — a uniform 300-lesson
> curriculum (60/level) — is stale. Actual counts, hand-counted from the
> real curriculum bundles: **English 534 lessons across uneven per-level
> counts (122/104/104/102/102), French 125 lessons (25/level)**. See
> `AGENTS.md`'s Content Structure table for the authoritative numbers.
>
> **The IMAGE ASSETS section below (§2) is superseded.** It describes a
> planned category-based approach (`public/images/a1/greetings/`, stock
> photos per topic) that was never built. What's actually implemented is
> a completely different, working pipeline: `scripts/fetch-vocab-images.ts`
> fetches a real image **per vocabulary term** (not per category) from
> Pexels/Pixabay, and the results live in `src/data/vocab-images.ts`
> (thousands of real URLs already in the codebase). Treat §2 as
> historical context for the original plan, not a live checklist.
>
> **Audio (§1), Animations (§3), Icons (§4), Textures (§5), and Sound FX
> (§6) all remain aspirational** — none of these have been built as of
> this writing (no `public/audio/`, `public/animations/`, or per-topic
> icon files exist in the repo; the app's only audio is live Deepgram TTS
> for conversation practice, not pre-generated pronunciation files). The
> detailed per-lesson word lists below were written against the original
> 60-lessons-per-level plan and have **not** been reconciled against the
> real generated lesson content (`src/data/lesson-bank.ts`) — treat them
> as illustrative of the intended format, not a verified list of what
> today's actual lessons need.

This file lists ALL assets needed for the expanded lesson curriculum. Generate these assets and provide file paths for integration.

---

## Asset Categories

### 1. AUDIO ASSETS (TTS/Pronunciation)

Each lesson needs pronunciation audio for key vocabulary. Generate using the existing TTS API or external TTS service.

#### A1 — Beginner (60 lessons × ~8 key words = ~480 audio files)

| Lesson                    | Key Words to Record                                                        | Path Pattern                                      |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| u1l1 - Saying Hello       | hello, goodbye, morning, afternoon, evening, please, thank, welcome        | `public/audio/a1/u1l1/{word}.mp3`                 |
| u1l2 - About Me           | name, from, student, doctor, friend, years, old, nice                      | `public/audio/a1/u1l2/{word}.mp3`                 |
| u1l3 - Numbers & Time     | quarter, past, half, midnight, noon, thirteen, fifteen, twenty             | `public/audio/a1/u1l3/{word}.mp3`                 |
| u1l4 - Small Talk         | raining, boiling, freezing, warm, lovely, weekend, going, care             | `public/audio/a1/u1l4/{word}.mp3`                 |
| u2l1 - Morning Habits     | drink, coffee, wakes, teeth, usually, breakfast, together, meat            | `public/audio/a1/u2l1/{word}.mp3`                 |
| u2l2 - At Work            | email, bank, colleague, meeting, report, discuss, Friday, offline          | `public/audio/a1/u2l2/{word}.mp3`                 |
| u2l3 - Free Time          | enjoy, playing, guitar, football, weekend, interested, hiking, photography | `public/audio/a1/u2l3/{word}.mp3`                 |
| u2l4 - Evening & Sleep    | bed, dinner, evening, book, sleeping, alarm, clock, nap                    | `public/audio/a1/u2l4/{word}.mp3`                 |
| u3l1 - Please & Thank You | could, mind, opening, window, excuse, interrupt, help, welcome             | `public/audio/a1/u3l1/{word}.mp3`                 |
| u3l2 - At a Café          | coffee, latte, bill, card, delicious, change, recommend, order             | `public/audio/a1/u3l2/{word}.mp3`                 |
| u3l3 - Asking Directions  | station, straight, turn, left, right, corner, next, lost                   | `public/audio/a1/u3l3/{word}.mp3`                 |
| u3l4 - Making Plans       | dinner, tonight, movies, Saturday, free, forward, meet, about              | `public/audio/a1/u3l4/{word}.mp3`                 |
| u4-u9                     | _(Same pattern: 8 key words per lesson)_                                   | `public/audio/{level}/{unit}/{lesson}/{word}.mp3` |

**Total A1 audio: ~480 files**

#### A2 — Elementary (60 lessons × 8 words = ~480 audio files)

**Path pattern: `public/audio/a2/{unit}/{lesson}/{word}.mp3`**

| Unit | Lesson Topics | Key Words Examples |
| ---- | ---------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| u1 | Past Tense Mastery | went, ate, bought, brought, thought, didn't, yesterday, ago |
| u2 | Storytelling | first, then, suddenly, while, finally, however, because, started |
| u3 | Comparisons | bigger, smaller, better, worse, most, least, than, as |
| u4 | Future Plans | will, going, tomorrow, next, shall, perhaps, probably, promise |
| u5 | Modals of Ability | can, could, may, might, must, should, able, permission |
| u6 | Describing Places | town, building, corner, opposite, next, between, bridge, market |
| u7 | Shopping & Services | price, cheap, expensive, size, colour, receipt, refund, exchange |
| u8 | Travel & Transport | ticket, platform, departure, delay, gate, terminal, customs, visa |
| u9 | Work & Study | job, interview, skill, experience, degree, salary, apply, resume |
| u10 | Health & Wellness | doctor, headache, fever, medicine, appointment, exercise, diet, rest |
| u11 | Entertainment | movie, cinema, concert, novel, album, favourite, genre, recommend |
| u12 | Review & Consolidation | _(mixed from above)_ | `public/audio/a2/review/{word}.mp3` |

**Total A2 audio: ~480 files**

#### B1 — Intermediate (60 lessons × 8 words = ~480 audio files)

**Path pattern: `public/audio/b1/{unit}/{lesson}/{word}.mp3`**

| Unit | Lesson Topics | Key Words Examples |
| ---- | ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| u1 | Opinions & Debate | agree, disagree, argue, convinced, however, although, perhaps, personally |
| u2 | Conditionals | if, would, could, might, unless, provided, hypothetical, imaginary |
| u3 | Email & Writing | dear, attached, following, regards, apology, proposal, clarify, appreciate |
| u4 | Meetings & Calls | elaborate, summarize, interrupt, clarify, agenda, action, parking, lead |
| u5 | Phrasal Verbs | give up, look after, put off, run out, turn down, find out, carry on, break down |
| u6 | Relative Clauses | who, which, that, whose, where, when, whom, wherever |
| u7 | Passive Voice | was built, is being, will be, has been, were made, been, getting, got |
| u8 | Reported Speech | said, told, asked, admitted, refused, promised, warned, suggested |
| u9 | News & Media | headline, article, reporter, source, bias, claim, evidence, interview |
| u10 | Environment | climate, pollution, recycling, sustainable, carbon, renewable, ecosystem |
| u11 | Technology & Society | algorithm, privacy, digital, innovation, artificial, automation, cybersecurity |
| u12 | Review & Consolidation | _(mixed)_ | `public/audio/b1/review/{word}.mp3` |

**Total B1 audio: ~480 files**

#### B2 — Upper Intermediate (60 lessons × 8 words = ~480 audio files)

**Path pattern: `public/audio/b2/{unit}/{lesson}/{word}.mp3`**

| Unit | Lesson Topics | Key Words Examples |
| ---- | ---------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| u1 | Nuance & Precision | arguably, virtually, marginally, broadly, ostensibly, inherently, ostensibly |
| u2 | Advanced Linking | nevertheless, furthermore, consequently, albeit, notwithstanding, hence |
| u3 | Word Formation | analysis, achievement, behaviour, conclusion, departure, knowledge, maintenance |
| u4 | Essay Structure | thesis, argument, evidence, paragraph, coherence, cohesion, conclusion |
| u5 | Debate & Argument | claim, rebuttal, fallacy, rhetoric, premise, inference, conclusion |
| u6 | Business English | negotiation, stakeholder, revenue, leverage, portfolio, benchmark, synergy |
| u7 | Science & Research | hypothesis, methodology, variables, correlation, sample, peer, journal |
| u8 | Culture & Society | heritage, diversity, tradition, globalization, identity, diaspora, migration |
| u9 | Advanced Grammar | inversion, cleft, subjunctive, ellipsis, fronting, emphasis, structure |
| u10 | Idiomatic Language | idiom, proverb, collocation, expression, metaphor, simile, irony |
| u11 | Creative Writing | narrative, descriptive, dialogue, imagery, tone, mood, perspective |
| u12 | Review & Consolidation | _(mixed)_ | `public/audio/b2/review/{word}.mp3` |

**Total B2 audio: ~480 files**

#### C1 — Advanced (60 lessons × 8 words = ~480 audio files)

**Path pattern: `public/audio/c1/{unit}/{lesson}/{word}.mp3`**

| Unit | Lesson Topics | Key Words Examples |
| ---- | -------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| u1 | Academic Register | ascertain, substantiate, corroborate, delineate, synthesise, scrutinise |
| u2 | Complex Structures | inversion, cleft, emphatic, fronted, subordinate, elliptical, variation |
| u3 | Precise Vocabulary | synonym, antonym, connotation, denotation, nuance, precision, register |
| u4 | Discourse Management | signpost, transition, frame, pivot, foreground, background, scaffold |
| u5 | Professional Communication | boardroom, litigation, prognosis, specification, protocol, compliance |
| u6 | Literature & Style | metaphor, allegory, motif, irony, satire, allusion, rhetoric |
| u7 | Current Affairs | geopolitics, inflation, sovereignty, legislation, referendum, diplomacy |
| u8 | Advanced Idioms | phrasal, idiomatic, colloquial, vernacular, jargon, argot, cant |
| u9 | Research Writing | abstract, methodology, longitudinal, qualitative, quantitative, peer |
| u10 | Presentation Skills | discourse, delivery, projection, emphasis, cadence, rhetorical |
| u11 | Critical Thinking | analysis, evaluation, synthesis, inference, deduction, induction |
| u12 | Review & Consolidation | _(mixed)_ | `public/audio/c1/review/{word}.mp3` |

**Total C1 audio: ~480 files**

---

### 2. IMAGE ASSETS

Images for visual context in lessons. Generate using DALL-E, Midjourney, or stock photos.

#### A1 — Beginner (~120 images)

| Category      | Images Needed                                                                                | Path Pattern                  |
| ------------- | -------------------------------------------------------------------------------------------- | ----------------------------- |
| **Greetings** | Handshake, wave, formal greeting, casual greeting, group hello, goodbye kiss, bow, hug       | `public/images/a1/greetings/` |
| **Numbers**   | Clock faces (3:00, 3:15, 6:30, 9:45), calendar, number cards 1-20                            | `public/images/a1/numbers/`   |
| **People**    | Family tree diagram, age groups, nationalities flags, professions (doctor, teacher, student) | `public/images/a1/people/`    |
| **Food**      | Breakfast items, lunch items, dinner items, fruits, vegetables, drinks                       | `public/images/a1/food/`      |
| **Home**      | Living room, bedroom, kitchen, bathroom, garden, office                                      | `public/images/a1/home/`      |
| **Weather**   | Sunny, rainy, cloudy, snowy, windy, hot, cold, mild                                          | `public/images/a1/weather/`   |
| **Time**      | Morning routine, afternoon activities, evening activities, night                             | `public/images/a1/time/`      |
| **Travel**    | Airport, train station, bus stop, hotel, map, suitcase                                       | `public/images/a1/travel/`    |
| **Body**      | Body parts diagram, doctor's office, medicine, exercise poses                                | `public/images/a1/body/`      |
| **Shopping**  | Store, market, clothes, sizes, price tags, shopping bags                                     | `public/images/a1/shopping/`  |

**Total A1 images: ~120**

#### A2 — Elementary (~120 images)

| Category          | Images Needed                                       | Path Pattern                      |
| ----------------- | --------------------------------------------------- | --------------------------------- |
| **Past Events**   | Historical photos, old vs new, timeline             | `public/images/a2/past/`          |
| **Comparisons**   | Size comparisons, quality comparisons, before/after | `public/images/a2/comparisons/`   |
| **Future**        | Calendar, plans, goals, predictions                 | `public/images/a2/future/`        |
| **Places**        | Town map, buildings, landmarks, directions arrows   | `public/images/a2/places/`        |
| **Work**          | Office, meeting room, interview, resume, laptop     | `public/images/a2/work/`          |
| **Health**        | Symptoms chart, doctor, pharmacy, gym, healthy food | `public/images/a2/health/`        |
| **Entertainment** | Cinema, concert, books, sports, games               | `public/images/a2/entertainment/` |

**Total A2 images: ~120**

#### B1 — Intermediate (~120 images)

| Category        | Images Needed                                             | Path Pattern                    |
| --------------- | --------------------------------------------------------- | ------------------------------- |
| **Debate**      | Discussion groups, podium, thumbs up/down, speech bubbles | `public/images/b1/debate/`      |
| **Email**       | Email interface, formal letter, business card             | `public/images/b1/email/`       |
| **Meetings**    | Conference room, whiteboard, presentation, handshake      | `public/images/b1/meetings/`    |
| **News**        | Newspaper, reporter, camera, headline                     | `public/images/b1/news/`        |
| **Environment** | Recycling, pollution, nature, solar panels, factory       | `public/images/b1/environment/` |
| **Technology**  | Smartphone, laptop, AI robot, social media icons          | `public/images/b1/technology/`  |

**Total B1 images: ~120**

#### B2 — Upper Intermediate (~120 images)

| Category     | Images Needed                                           | Path Pattern                 |
| ------------ | ------------------------------------------------------- | ---------------------------- |
| **Academic** | Library, research lab, thesis document, graduation      | `public/images/b2/academic/` |
| **Business** | Boardroom, negotiation table, charts, strategy diagram  | `public/images/b2/business/` |
| **Science**  | Laboratory, microscope, data visualization, peer review | `public/images/b2/science/`  |
| **Culture**  | World map, festivals, traditions, museums               | `public/images/b2/culture/`  |
| **Writing**  | Notebook, pen, manuscript, publishing                   | `public/images/b2/writing/`  |

**Total B2 images: ~120**

#### C1 — Advanced (~120 images)

| Category              | Images Needed                                                  | Path Pattern                     |
| --------------------- | -------------------------------------------------------------- | -------------------------------- |
| **Academic**          | University, research paper, conference, symposium              | `public/images/c1/academic/`     |
| **Professional**      | Legal document, medical chart, technical diagram               | `public/images/c1/professional/` |
| **Literature**        | Classic books, poetry, theatre, opera                          | `public/images/c1/literature/`   |
| **Current Affairs**   | Parliament, economy graph, protest, diplomacy                  | `public/images/c1/current/`      |
| **Critical Thinking** | Logic puzzle, Socratic method, debate stage, Scales of justice | `public/images/c1/thinking/`     |

**Total C1 images: ~120**

---

### 3. ANIMATION ASSETS

Lottie/Rive animations for gamification and engagement.

| Asset                     | Purpose                       | Path                                        |
| ------------------------- | ----------------------------- | ------------------------------------------- |
| `confetti.json`           | Lesson completion celebration | `public/animations/confetti.json`           |
| `streak-fire.json`        | Streak milestone animation    | `public/animations/streak-fire.json`        |
| `level-up.json`           | Level promotion animation     | `public/animations/level-up.json`           |
| `achievement-unlock.json` | Achievement badge reveal      | `public/animations/achievement-unlock.json` |
| `hearts-refill.json`      | Hearts refilling animation    | `public/animations/hearts-refill.json`      |
| `correct-answer.json`     | Green checkmark bounce        | `public/animations/correct-answer.json`     |
| `wrong-answer.json`       | Red X shake                   | `public/animations/wrong-answer.json`       |
| `loading-dots.json`       | Loading indicator             | `public/animations/loading-dots.json`       |

**Total animations: ~8**

---

### 4. ICON ASSETS

Custom icons for lesson categories and features.

| Icon                    | Purpose                   | Format | Path                                |
| ----------------------- | ------------------------- | ------ | ----------------------------------- |
| `greetings.svg`         | A1 Greetings unit         | SVG    | `public/icons/a1/greetings.svg`     |
| `numbers.svg`           | A1 Numbers unit           | SVG    | `public/icons/a1/numbers.svg`       |
| `food.svg`              | A1 Food unit              | SVG    | `public/icons/a1/food.svg`          |
| `home.svg`              | A1 Home unit              | SVG    | `public/icons/a1/home.svg`          |
| `weather.svg`           | A1 Weather unit           | SVG    | `public/icons/a1/weather.svg`       |
| `travel.svg`            | A1 Travel unit            | SVG    | `public/icons/a1/travel.svg`        |
| `shopping.svg`          | A1 Shopping unit          | SVG    | `public/icons/a1/shopping.svg`      |
| `body.svg`              | A1 Body unit              | SVG    | `public/icons/a1/body.svg`          |
| `past.svg`              | A2 Past unit              | SVG    | `public/icons/a2/past.svg`          |
| `comparisons.svg`       | A2 Comparisons unit       | SVG    | `public/icons/a2/comparisons.svg`   |
| `future.svg`            | A2 Future unit            | SVG    | `public/icons/a2/future.svg`        |
| `places.svg`            | A2 Places unit            | SVG    | `public/icons/a2/places.svg`        |
| `work.svg`              | A2 Work unit              | SVG    | `public/icons/a2/work.svg`          |
| `health.svg`            | A2 Health unit            | SVG    | `public/icons/a2/health.svg`        |
| `entertainment.svg`     | A2 Entertainment unit     | SVG    | `public/icons/a2/entertainment.svg` |
| `debate.svg`            | B1 Debate unit            | SVG    | `public/icons/b1/debate.svg`        |
| `email.svg`             | B1 Email unit             | SVG    | `public/icons/b1/email.svg`         |
| `meetings.svg`          | B1 Meetings unit          | SVG    | `public/icons/b1/meetings.svg`      |
| `news.svg`              | B1 News unit              | SVG    | `public/icons/b1/news.svg`          |
| `environment.svg`       | B1 Environment unit       | SVG    | `public/icons/b1/environment.svg`   |
| `technology.svg`        | B1 Technology unit        | SVG    | `public/icons/b1/technology.svg`    |
| `academic.svg`          | B2/C1 Academic unit       | SVG    | `public/icons/b2/academic.svg`      |
| `business.svg`          | B2 Business unit          | SVG    | `public/icons/b2/business.svg`      |
| `science.svg`           | B2 Science unit           | SVG    | `public/icons/b2/science.svg`       |
| `culture.svg`           | B2 Culture unit           | SVG    | `public/icons/b2/culture.svg`       |
| `writing.svg`           | B2 Writing unit           | SVG    | `public/icons/b2/writing.svg`       |
| `literature.svg`        | C1 Literature unit        | SVG    | `public/icons/c1/literature.svg`    |
| `current-affairs.svg`   | C1 Current Affairs unit   | SVG    | `public/icons/c1/current.svg`       |
| `critical-thinking.svg` | C1 Critical Thinking unit | SVG    | `public/icons/c1/thinking.svg`      |
| `professional.svg`      | C1 Professional unit      | SVG    | `public/icons/c1/professional.svg`  |
| `review.svg`            | Review/SRS feature        | SVG    | `public/icons/review.svg`           |
| `spaced-rep.svg`        | Spaced repetition feature | SVG    | `public/icons/spaced-rep.svg`       |
| `timer.svg`             | Review timer              | SVG    | `public/icons/timer.svg`            |
| `brain.svg`             | Memory/learning           | SVG    | `public/icons/brain.svg`            |

**Total icons: ~33**

---

### 5. BACKGROUND/TEXTURE ASSETS

| Asset                 | Purpose                                              | Path                                  |
| --------------------- | ---------------------------------------------------- | ------------------------------------- |
| `grain.svg`           | Noise texture overlay (already exists as inline SVG) | `public/textures/grain.svg`           |
| `parchment-light.svg` | Light background variant                             | `public/textures/parchment-light.svg` |
| `parchment-dark.svg`  | Dark mode background                                 | `public/textures/parchment-dark.svg`  |

**Total textures: ~3**

---

### 6. SOUND EFFECTS

| Sound             | Purpose                 | Path                            |
| ----------------- | ----------------------- | ------------------------------- |
| `correct.mp3`     | Correct answer feedback | `public/sounds/correct.mp3`     |
| `wrong.mp3`       | Wrong answer feedback   | `public/sounds/wrong.mp3`       |
| `level-up.mp3`    | Level promotion         | `public/sounds/level-up.mp3`    |
| `achievement.mp3` | Achievement unlock      | `public/sounds/achievement.mp3` |
| `streak.mp3`      | Streak milestone        | `public/sounds/streak.mp3`      |
| `click.mp3`       | Button tap feedback     | `public/sounds/click.mp3`       |
| `complete.mp3`    | Lesson completion       | `public/sounds/complete.mp3`    |

**Total sound effects: ~7**

---

## Summary Table

| Category        | A1  | A2  | B1  | B2  | C1  | Total      |
| --------------- | --- | --- | --- | --- | --- | ---------- |
| **Audio files** | 480 | 480 | 480 | 480 | 480 | **2,400**  |
| **Images**      | 120 | 120 | 120 | 120 | 120 | **600**    |
| **Animations**  | —   | —   | —   | —   | —   | **8**      |
| **Icons**       | ~8  | ~7  | ~6  | ~5  | ~5  | **~33**    |
| **Textures**    | —   | —   | —   | —   | —   | **3**      |
| **Sound FX**    | —   | —   | —   | —   | —   | **7**      |
| **GRAND TOTAL** |     |     |     |     |     | **~3,051** |

---

## Generation Instructions

### Audio (Priority: HIGH)

1. Use OpenAI TTS API (`gpt-4o-mini-tts`) or ElevenLabs
2. Voice: Clear, neutral accent (US or UK English)
3. Speed: Normal (1.0x) for vocabulary, slightly slower (0.9x) for sentences
4. Format: MP3, 128kbps, mono
5. Each file: single word or short phrase

### Images (Priority: MEDIUM)

1. Style: Flat illustration, warm color palette matching app (parchment, moss, ember)
2. Dimensions: 512×512px for cards, 1024×512px for headers
3. Format: WebP with PNG fallback
4. Must be culturally neutral and inclusive

### Icons (Priority: MEDIUM)

1. Style: Line icons, 24×24px base, scalable
2. Color: Current `ink` color (adapts to theme)
3. Format: SVG
4. Follow existing icon style in `src/components/icons.tsx`

### Animations (Priority: LOW)

1. Format: Lottie JSON or Rive
2. Duration: 1-3 seconds
3. Style: Minimal, matching app aesthetic
4. Keep file size under 50KB each

### Sound Effects (Priority: LOW)

1. Format: MP3, 128kbps
2. Duration: < 1 second
3. Style: Subtle, not jarring
4. Volume: Consistent with TTS audio
