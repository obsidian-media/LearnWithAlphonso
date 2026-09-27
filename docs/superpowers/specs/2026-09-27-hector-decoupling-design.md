# Hector decoupling — bring the tutor into our own backend (2026-09-27)

## Why
Hector today calls AlphonsoEcosystem's Cloud Voice backend
(`POST voice.obsidianmedia.online/v1/voice/respond`) using a SEPARATE
account in a SEPARATE Supabase project. That coupling is the root of every
Hector problem: account deletion cannot reach the Cloud Voice account (the
audits' one real P0), the privacy policy needs a "separate system, email
us" caveat, the demo account can't cleanly enroll, and `hector_links` /
the shadow account / `/api/hector-link` / cross-project revocation all
exist only to bridge the two systems.

## Key finding that makes this small
Hector is **turn-based** (`respond()` is a single POST; no streaming),
the conversation `history` is passed by the client each turn, and the
durable "memory" (CEFR level + weakness categories) is ALREADY ours
(`TutorMemoryContext`, built from `weakness_events`). Internally Cloud
Voice does only: LLM turn + TTS. We already run both (NVIDIA `/api/chat`,
Deepgram `/api/tts`). So decoupling is a new route in the backend we
already own, not a new service.

## Design
- **New route `/api/hector-respond`** (this repo's TanStack backend),
  matching Cloud Voice's request/response contract exactly so the iOS
  client is a one-line endpoint change:
  - in:  `{ session_id, text, language, agent_id?, history: [{role,content}] }`
  - out: `TutorReply` = `{ request_id, session_id, agent, reply,
    audio_base64, tts_model, tts_provider, language, state, timings_ms }`
- **Auth = the MAIN app's Supabase token.** `supabaseAdmin.auth.getUser`,
  same as the other hector routes. No separate account, no enrollment.
- **Pro-gated**, reusing `isProSubscriber` (fail closed if unconfigured),
  the same gate as `/api/hector-shadow-account`.
- **Reply** from NVIDIA (reuse the `/api/chat` call shape + a Hector
  system prompt; the client's `history` already carries the priming
  context). **Audio** from Deepgram TTS → base64 (the piper voice params
  are ignored; we report the Deepgram model we actually used).
- **Stateless for v1.** The current design never recalls transcripts, so
  we store nothing server-side. Nothing to store => nothing to delete =>
  the deletion P0 stops existing by construction, not by patch.
- Rate-limited via the existing `consumeQuota`.

## Rollout
1. Server route + pure helpers + tests (this PR). Mergeable alone.
2. iOS: repoint `TutorConversationClient` to `AppConfig.apiBaseURL` +
   `/api/hector-respond`, use the main session token, delete the separate
   Cloud Voice enrollment/account path. Verified only by ios-app-build.
3. Cleanup: remove `hector_links`, shadow account, `/api/hector-link`,
   `hector-revocation`; simplify `deleteMyAccount` (nothing separate to
   revoke); drop the privacy policy's "separate system" caveat.

Steps 2 and 3 land after step 1 is green. Nothing here gates the App
Store submission; it is the permanent fix that replaces the disclosed
manual-deletion path.
