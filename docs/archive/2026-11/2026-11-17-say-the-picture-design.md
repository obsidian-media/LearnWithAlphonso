> Historical record. Delivered in #609 web (2026-11-17), #613 iOS+Android (2026-11-17); reshaped by #658, #660, #665 (2026-11-19 to 2026-11-20). Current behaviour: ARCHITECTURE.md § Say the picture.

# Say the picture: a Practice Hub activity

Status: owner-approved design, 2026-11-17. First increment is web only.

## What it is

A new Practice Hub activity. The learner sees a picture of a vocabulary word, with no text, and practises saying the word aloud in the course's target language. It is practice, not a test: nothing is lost on a miss.

## Placement

A new activity card in the existing Practice Hub (`src/components/practice/PracticeHub.tsx`), alongside the current activities. Web first; iOS and Android are a follow-up.

## Word pool

Any word in the learner's target language that has an image, learned or not. A session is 8 rounds.

### The pool is a live query (owner requirement)

The pool is computed at runtime from the live vocabulary: every term whose image is set (the vocabulary's `image`, the `image_url` of the brief) is in the pool. It is NOT a static or snapshot list baked into the build and there is no curation or config step. When a new batch of vocabulary photos is added and more terms get an image, those words become available in "Say the picture" automatically.

Implementation: `imageWordPool(course)` in `src/lib/say-the-picture.ts` walks the course's lessons, derives each lesson's vocabulary with the existing `deriveVocab` (which attaches the image from the image table at call time), keeps the items that have an image, and de-duplicates by term. Nothing is cached across calls. A test adds an image for a previously image-less term and asserts that the term appears in the pool.

## A round (forgiving, teaches on a miss)

1. Show the word's image only (no text).
2. The learner taps to record. The recording is graded through the existing speak path: `/api/stt` (Deepgram, course language) and the existing course-selected spoken-answer matcher. Grading is forgiving: the same normalisation as speak exercises, and the word counts when it is said on its own or inside a short phrase ("el abogado" for "abogado").
3. Correct: a star and the next round.
4. Miss or unsure: reveal the written word and play the model pronunciation through the existing speech path. The learner repeats it once, then the session continues whatever they said.
5. No penalty, no hearts. A learner who cannot use the microphone can always press "Show me the word" and learn the word.

## End

A summary reusing the existing `PracticeStars` component: stars earned for the session and "Practised N words". At least one star is always shown, because finishing a session is the goal.

## Reuse and cost

- Speech to text: `src/routes/api/stt.ts` through `useSpeechCapture`. It counts against the existing speaking daily AI quota (kind `stt`). No new quota kind.
- Model audio: `src/routes/api/tts.ts` (existing), with the on-device `speak()` as the fallback.
- Words and images: existing vocabulary and the vocabulary image table.
- No migration in v1.

## Guardrails

- Words with no image are excluded.
- Needs a microphone, AI consent and the network. Without them the activity says so clearly and offers the word-reveal path instead of a dead button.
- An empty pool shows "not enough words with pictures yet".
- Accessible: roles and labels, phone width, Royal light, Royal night and Meadow, reduced motion respected.
- Not changed: pricing, paywall, hearts, the lesson engine, the existing speaking exercise.

## Follow-up

iOS and Android versions of the same flow on the same endpoints.
