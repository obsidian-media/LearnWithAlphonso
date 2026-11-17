# Say it right: word-level pronunciation feedback

Status: owner-approved design, 2026-11-17. First increment is web only; iOS and Android follow.

## What it is

A standalone Practice Hub drill, "Say it right". The learner sees a word they have already learned, can hear a model say it, records themselves, and is told whether they were clearly understood. It is practice, not a test: no hearts, no penalty.

## Placement

A card in the Practice Hub (`src/components/practice/PracticeHub.tsx`), alongside the other activities (Say the picture, campaigns, scenarios). Web first; iOS and Android are a follow-up.

## A round

1. Show the WORD (written) and a "Hear it" button that plays the model through `/api/tts`.
2. The learner taps to record. `/api/stt` (Deepgram nova-3) returns `{ text, confidence }`: the transcript and an utterance confidence between 0 and 1.
3. Judge the attempt (see "Verdict bands").
4. "Hear it" is ALWAYS available, in every state, so a microphone, consent or STT failure is never a dead end: the learner can still listen and move on.

### Verdict bands

Matching reuses the existing per-course spoken-answer normalisers (`normaliseSpoken`, `normaliseSpokenFr`, `normaliseSpokenEs`) through the same forgiving whole-word comparison as Say the picture. Matching is not reinvented.

| Transcript | Confidence | Verdict | What happens |
| --- | --- | --- | --- |
| matches the target | at or above HIGH | Great | "Great!", a star, next word |
| matches the target | at or above LOW, below HIGH | Almost | "Almost, say it a touch clearer", the model replays, one retry |
| no match | any | Try again | "Let's try again", the model replays, one retry |
| matches | below LOW | Try again | same as above |

A matching transcript with no confidence value (null) is treated as Great: there is nothing to say it was unclear.

After the one retry the round moves on whatever the result. A retry that is Great says "Great!" but only a first-attempt Great earns the round's star.

### Thresholds

Two tunable constants in `src/lib/pronunciation.ts`, one each, nothing else encodes them:

- `HIGH_CONFIDENCE = 0.85`
- `LOW_CONFIDENCE = 0.6`

Both bounds are inclusive on the higher band (a confidence exactly at HIGH is Great; exactly at LOW is Almost).

## Session

8 rounds, then a summary with `PracticeStars` (stars by share of first-attempt Greats, never below one: finishing is the point) and "Practised N words".

## The word pool: learned words only, live

Pronunciation practice on words never taught is odd, so the pool is the words the learner has met.

- On every session start the pool is derived LIVE: for each lesson the learner has completed (from the progress store, `completedLessons`), take that lesson's vocabulary via the existing `deriveVocab`.
- It is NOT a hardcoded list and NOT a snapshot. Nothing is cached across calls. As the learner completes more lessons, the next session's pool grows by itself.
- Words with no usable target are excluded: an empty term, a term that normalises to nothing, or a long phrase (more than four words).
- De-duplicated by term. 8 distinct words are drawn at random.
- Fewer than 4 learned words: the drill shows "Learn a few words first" and a way back, not a half-empty session.

## Reuse

- `/api/stt` through `useSpeechCapture`: counts against the existing speaking daily quota (kind `stt`). No new quota kind.
- `/api/tts` through `useModelSpeech` (device voice as its fallback).
- `PracticeStars`, `edgeButtonClass`, the design-system tokens, and the AI-consent gate used by Say the picture.
- No new vendor. No migration.

## Honest limit

The verdict reflects whether the learner was clearly UNDERSTOOD by the recogniser, not which exact sound was off. Per-phoneme feedback ("your r was off") needs a pronunciation-assessment vendor and is a future upgrade. The copy never claims more than "clear" or "a touch clearer".

## Guardrails

- Needs a microphone, AI consent and the network to record; without them the drill still shows the word, "Hear it" and Next, and says why recording is off.
- Accessible: labelled controls, live status text, phone width, Royal light, Royal night and Meadow, reduced motion respected.
- Not changed: pricing, paywall, hearts, the lesson engine, the existing speaking exercises, Say the picture.

## Follow-up

iOS and Android versions of the drill, on the same `/api/stt` and `/api/tts` and the same two thresholds.
