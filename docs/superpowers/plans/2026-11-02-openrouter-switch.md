# OpenRouter Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every AI text call from NVIDIA's hosted trial API (`integrate.api.nvidia.com`, whose terms forbid production use) to OpenRouter, keeping the same model (NVIDIA Nemotron 3.5 Lightning 30B-A3B), the same speed and the same safety rules.

**Architecture:** All AI text already goes through two chokepoints: `src/lib/nvidia-chat.server.ts` (web server) and `supabase/functions/_shared/nvidia-chat.ts` (edge functions), guarded by `src/lib/ai-call-sites.test.ts`. They become provider-neutral `llm-chat` modules that call OpenRouter's OpenAI-compatible endpoint with reasoning off, a pinned provider allowlist and zero data retention. Callers keep their own error handling. The chokepoint normalizes OpenRouter's two new failure shapes (402 out of credit, and a 200 response that carries an error) into statuses callers already handle. The native apps never call the AI provider, so the switch itself needs no app build; only the consent wording does.

**Tech Stack:** TanStack Start on Vercel (Node), Supabase Edge Functions (Deno), Vitest, Deno test, OpenRouter Chat Completions API.

**Spec:** Decisions D1-D5 below (agreed with the owner 2026-11-02 in the PR #337 review session). Evidence:
- NVIDIA API Trial Terms §1.2 and §1.4: trial only, no production use without a paid Subscription.
- OpenRouter Terms (updated 2026-08-31) §5.1 and §7.
- OpenRouter docs: provider routing, reasoning tokens, errors.

## Decisions

- **D1.** Use OpenRouter, not a direct host. One key gives automatic fallback across hosts.
- **D2.** OpenRouter model id `nvidia/nemotron-3.5-lightning`. It is the same weights as the current `nvidia/nemotron-3.5-lightning-30b-a3b` (OpenRouter `hugging_face_id` = `nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16`). Use the paid variant, never `:free`.
- **D3.** Routing: `provider: { only: ["deepinfra", "fireworks", "coreweave"], allow_fallbacks: true, data_collection: "deny", zdr: true }`. Darkbloom (int4) and Io Net are excluded. Task 1 confirms these slugs and that ZDR routing returns 200; if it does not, stop and ask the owner.
- **D4.** No forced re-consent. The purpose and data types are unchanged and the model maker is still NVIDIA. The consent sheet, privacy policy and terms name OpenRouter as the processor. The owner confirms this before Task 5 merges.
- **D5.** The new consent wording reaches the apps in the next builds (iOS build 52, Android's first Play build). Until then, TestFlight build 51 still shows the NVIDIA wording; the owner accepts this short window (the app is not on the App Store or Play yet).

## Global Constraints

- Every AI text request passes `applySafety(body.messages)` in a chokepoint. No other file may reach the provider (`ai-call-sites.test.ts`).
- Reasoning must stay off. NVIDIA prod logs showed 17-88 s replies and save-word (`max_tokens` 600) returning nothing when it was on. Prompt-level switches (`/no_think`, `reasoning_effort`) did NOT work on NVIDIA; only the request body does.
- Default deadlines stay as they are: `30_000` ms by default, `120_000` ms for authoring.
- The key lives only in Vercel env, Supabase function secrets and the owner's `~/.alphonso-secrets/openrouter.env`. It is never printed, logged or committed.
- `docs/BACKLOG.md` is local-only and is never committed.
- Copy is identical on web, iOS and Android (`src/lib/ai-consent-copy-parity.test.ts`).
- Main needs green CI. Squash-merge. Merging deploys the edge functions (`deploy-supabase`).

## Review Focus

1. **OpenRouter credit runs out.** All AI features fail at once with 402. Expected: learners see the normal "AI unavailable, try again" path (503), and the server logs `[llm] out of credit` loudly. Pinned in Task 3. The owner sets a credit alert in Task 6.
2. **A 200 response that carries `{error}` and no `choices`.** Today callers would read `""` and show an empty Hector reply. Expected: treated as a 502. Pinned in Task 3.
3. **A host ignores "reasoning off".** A capped call then spends its budget thinking and returns empty or cut-off text. Expected: the request body always carries the off switch (Task 3 test), and the benchmark shows `reasoning_tokens == 0` on each allowed host (Task 1).
4. **No allowed host meets ZDR plus `data_collection: "deny"`.** OpenRouter answers 503 to every call. Expected: Task 1 proves a 200 for each allowed host before any code ships.
5. **The new key is missing at deploy time.** Callers treat a missing key as "AI not configured", which silently disables AI in prod. Expected: Task 6 sets both secrets BEFORE merge, and smoke-tests prod right after.

---

### Task 1: Benchmark OpenRouter with the exact request shape (gate)

**Files:**
- Create: `scripts/benchmark-llm.ts`

**Interfaces:**
- Produces: the measured request body that Task 3 hardcodes. Record the results in the PR body: per host, the median and p90 latency, `reasoning_tokens`, the status, and the `provider` field from the response.

- [ ] **Step 1: Write `scripts/benchmark-llm.ts`.** It reads `OPENROUTER_API_KEY` from env and exits 1 if the key is missing; it never prints the key. For each host in `["deepinfra", "fireworks", "coreweave"]` and each variant, it sends 5 Hector-shaped requests to `https://openrouter.ai/api/v1/chat/completions`. Each request uses model `nvidia/nemotron-3.5-lightning`, a ~1,500-token system prompt plus a 2-turn conversation, `max_tokens: 600`, and `provider: { only: [host], allow_fallbacks: false, data_collection: "deny", zdr: true }`. The two variants:
  - (A) `reasoning: { effort: "none" }`
  - (B) variant A plus `chat_template_kwargs: { thinking: false, enable_thinking: false }`

  The script prints one table row per host and variant: status, median and p90 ms, mean `usage.completion_tokens_details.reasoning_tokens`, and the response's `provider`.
- [ ] **Step 2: Run it with the owner's key file, without printing the key.** Run: `set -a; . ~/.alphonso-secrets/openrouter.env; set +a; bun scripts/benchmark-llm.ts`
  Expected (the gate): at least two hosts return 200 with `reasoning_tokens` 0 and a median under 2,500 ms in one variant. Pick the simplest variant that passes (A if it passes). If no host passes, stop and report to the owner.
- [ ] **Step 3: Commit.** Message: `chore(llm): OpenRouter latency/reasoning benchmark`

### Task 2: Make the chokepoints provider-neutral (rename only, no behavior change)

**Files:**
- Rename: `src/lib/nvidia-chat.server.ts` → `src/lib/llm-chat.server.ts`
- Rename: `src/lib/nvidia-chat-model.server.ts` → `src/lib/llm-chat-model.server.ts`
- Rename: `supabase/functions/_shared/nvidia-chat.ts` → `supabase/functions/_shared/llm-chat.ts`, and its `.test.ts`
- Rename: `src/lib/nvidia-no-thinking.test.ts` → `src/lib/llm-no-reasoning.test.ts`
- Modify: every importer listed by `Grep "nvidia-chat|nvidiaChatCompletion|resolveNvidiaChatModel|NVIDIA_CHAT_URL|NVIDIA_DEFAULT_TIMEOUT_MS|NVIDIA_AUTHORING_TIMEOUT_MS"` in `src/`, `supabase/functions/`, `scripts/` and `admin/` (about 20 files), plus `src/lib/ai-call-sites.test.ts` (`CHOKEPOINTS`)

**Interfaces:**
- Produces:
  - `llmChatCompletion(args: { apiKey: string; body: LlmChatBody; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<Response>`
  - `LLM_CHAT_URL`, `LLM_DEFAULT_TIMEOUT_MS = 30_000`, `LLM_AUTHORING_TIMEOUT_MS = 120_000`
  - `type LlmChatBody = { model: string; messages: LlmMessage[] } & Record<string, unknown>`
  - `resolveLlmChatModel(): string`, `LLM_CHAT_MODEL_DEFAULT`

- [ ] **Step 1: Rename with `git mv` and update imports and identifiers.** Keep every value as it is (still the NVIDIA URL and model at this point).
- [ ] **Step 2: Run the suite.** Run: `bun x tsc --noEmit && bun x vitest run src/lib/ai-call-sites.test.ts src/lib/llm-no-reasoning.test.ts src/routes/api && deno test --no-lock --no-check supabase/functions/`
  Expected: all PASS, same counts as before the rename.
- [ ] **Step 3: Commit.** Message: `refactor(llm): provider-neutral chat chokepoint names`

### Task 3: Call OpenRouter from both chokepoints, and normalize its failures

**Files:**
- Modify: `src/lib/llm-chat.server.ts`, `supabase/functions/_shared/llm-chat.ts`
- Modify: `src/lib/ai-call-sites.test.ts` (provider regex)
- Test: `src/lib/llm-chat.server.test.ts` (create), `supabase/functions/_shared/llm-chat.test.ts`, `src/lib/llm-no-reasoning.test.ts`

**Interfaces:**
- Consumes: Task 2 names. Task 1's chosen variant.
- Produces:
  - `LLM_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"`
  - `LLM_PROVIDER_PREFS = { only: ["deepinfra", "fireworks", "coreweave"], allow_fallbacks: true, data_collection: "deny", zdr: true } as const`
  - `LLM_NO_REASONING`, exported from both twins and identical in both: `{ effort: "none" }`. If Task 1 chose variant B, the chokepoint also keeps sending `chat_template_kwargs`.
  - `normalizeLlmResponse(res: Response): Promise<Response>`, exported from both twins

- [ ] **Step 1: Write the failing tests** in `src/lib/llm-chat.server.test.ts`, driving `llmChatCompletion` through a fake `fetchImpl`. Mirror the same cases in the Deno test.
  - `"sends OpenRouter the model, safety-wrapped messages, reasoning off and the provider prefs"`: the URL equals `LLM_CHAT_URL`; the parsed body has `reasoning` deep-equal to `{ effort: "none" }` and `provider` deep-equal to `LLM_PROVIDER_PREFS`; `messages[0]` is the safety preamble.
  - `"a caller cannot turn reasoning back on"`: a body with `reasoning: { effort: "high" }` is still sent with `{ effort: "none" }`.
  - `"a caller cannot drop zero data retention"`: a body with `provider: { zdr: false }` is still sent with `LLM_PROVIDER_PREFS`.
  - `"402 out of credit becomes 503 and is logged"`: the fake returns 402 `{"error":{"code":402,"message":"Insufficient credits"}}`; the response status is 503; `console.error` was called with a string containing `[llm] out of credit`.
  - `"a 200 carrying an error and no choices becomes 502"`: the fake returns 200 `{"error":{"code":502,"message":"upstream"}}`; the status is 502.
  - `"a normal 200 passes through untouched"`: a body with `choices[0].message.content === "hola"` arrives unchanged with status 200.
- [ ] **Step 2: Run the tests to verify they fail.** Run: `bun x vitest run src/lib/llm-chat.server.test.ts`
  Expected: FAIL. The URL is still NVIDIA's, and `normalizeLlmResponse` is not defined.
- [ ] **Step 3: Implement in both twins.**
  - The body is built as `{ ...body, reasoning: LLM_NO_REASONING, provider: LLM_PROVIDER_PREFS, messages: applySafety(body.messages) }`, with the chokepoint's values spread last so callers cannot override them.
  - `normalizeLlmResponse` reads the body only when the status is 402, or when it is 200 with a JSON `content-type`. Every other response passes through untouched.
  - Remove `withNoThinking` and `NVIDIA_NO_THINKING`, unless Task 1 chose variant B.
- [ ] **Step 4: Update `ai-call-sites.test.ts`.**
  - The guarded pattern becomes `/openrouter\.ai|integrate\.api\.nvidia\.com|\bapi\.nvidia\.com|LLM_CHAT_URL/`, so the old NVIDIA host is also kept out.
  - Its self-test gains `expect(NVIDIA.test('fetch("https://openrouter.ai/api/v1/x")')).toBe(true)`.
  - `llm-no-reasoning.test.ts` asserts that both twins export identical `LLM_NO_REASONING` and `LLM_PROVIDER_PREFS` literals.
- [ ] **Step 5: Run and mutation-check.**
  - Run: `bun x vitest run src/lib && deno test --no-lock --no-check supabase/functions/`. Expected: PASS.
  - Then temporarily delete `zdr: true` from the web twin. Expected: the "provider prefs" test and the twin-parity test go red. Restore it.
- [ ] **Step 6: Commit.** Message: `feat(llm): route AI text through OpenRouter with reasoning off and ZDR`

### Task 4: One key and one model id for OpenRouter

**Files:**
- Modify: `src/lib/llm-chat-model.server.ts` (default id, env names, `resolveLlmApiKey`)
- Modify: every file reading `process.env.NVIDIA_API_KEY` (web routes and libs, `src/lib/sync.functions.ts`, `scripts/pack-tool.ts`)
- Modify: `supabase/functions/_shared/answer-correctness.ts`, `supabase/functions/_shared/translation-grader.ts` (`Deno.env.get`)
- Modify: `.env.example`, `.github/workflows/ci.yml:289` comment
- Test: `src/lib/llm-chat-model.server.test.ts` (create); extend `src/lib/ai-call-sites.test.ts`

**Interfaces:**
- Produces:
  - `resolveLlmApiKey(): string | undefined`, which returns `process.env.OPENROUTER_API_KEY`
  - `LLM_CHAT_MODEL_DEFAULT = "nvidia/nemotron-3.5-lightning"`; the override env is `LLM_CHAT_MODEL`
  - The edge twin mirrors both: `Deno.env.get("OPENROUTER_API_KEY")`, `Deno.env.get("LLM_CHAT_MODEL") ?? "nvidia/nemotron-3.5-lightning"`

- [ ] **Step 1: Write the failing tests.**
  - `"the key comes from OPENROUTER_API_KEY only"`: with `vi.stubEnv` setting both `NVIDIA_API_KEY` and `OPENROUTER_API_KEY`, `resolveLlmApiKey()` returns the OpenRouter value. With only `NVIDIA_API_KEY` set, it returns `undefined`.
  - `"no source reads the old NVIDIA env names"`: in `ai-call-sites.test.ts`, no file under `src`, `supabase/functions`, `admin` or `scripts` matches `/NVIDIA_API_KEY|NVIDIA_CHAT_MODEL/`.
  - `"the edge default model matches the web default"`: a text check that `answer-correctness.ts` contains the string `"nvidia/nemotron-3.5-lightning"` and nothing ending in `-30b-a3b`.
- [ ] **Step 2: Run to verify they fail.** Run: `bun x vitest run src/lib/llm-chat-model.server.test.ts src/lib/ai-call-sites.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Replace each inline `process.env.NVIDIA_API_KEY` with `resolveLlmApiKey()`.
  - Update the edge `Deno.env.get` names, `.env.example` (`OPENROUTER_API_KEY=""`, `LLM_CHAT_MODEL=""`, with a one-line note that the key comes from openrouter.ai) and `pack-tool.ts` error text.
- [ ] **Step 4: Run the full suites.** Run: `bun x tsc --noEmit && bun x vitest run && deno test --no-lock --no-check supabase/functions/`
  Expected: PASS. Re-run any single unexpected failure alone before believing it, because this machine is RAM-starved.
- [ ] **Step 5: Commit.** Message: `feat(llm): OPENROUTER_API_KEY and the OpenRouter model id`

### Task 5: Say who processes the text (consent, legal pages, review notes)

**Files:**
- Modify: `src/lib/ai-consent-copy.ts`, `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AIConsentCopy.swift`, `android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/AiConsent.kt`
- Modify: `src/routes/privacy.tsx:174,206,211` and its "Last updated" date; `src/routes/terms.tsx:129` and its date
- Modify: `src/lib/app-store/review-notes.ts:46,73,85`
- Modify: code comments naming NVIDIA as the receiver: `SaveWordSheet.swift:129`, `SaveWordFlow.kt:63`, `TranslationGradingPolicy.swift:3`, `AIConversationClient.swift:7`, `TutorError.swift:48`, `ios/LearnWithAlphonso/Info.plist:22`
- Modify: `ARCHITECTURE.md`, `AGENTS.md`, `README.md` mentions
- Test: `src/routes/legal-pages.test.tsx:49,65-68`, `src/lib/ai-consent-copy-parity.test.ts` (unchanged, must stay green), `src/lib/app-store/review-notes.test.ts`

**Interfaces:**
- Consumes: none. Produces: the exact copy below, identical on all three platforms.

Exact copy (the owner may edit it before merge):
- `sheetBody`: "To transcribe your speech, reply to you and check your answers, Alphonso sends your voice recordings to Deepgram (speech recognition and spoken replies) and your conversation text and written answers to OpenRouter, which runs NVIDIA's Nemotron AI model for us (AI replies and grading). Nothing is sent until you allow it, and you can turn this off at any time in Settings."
- `settingsFooter`: "When this is on, Alphonso sends your voice to Deepgram and your conversation text and written answers to OpenRouter (NVIDIA's Nemotron model) so the tutor can reply, transcribe and grade. When it's off, nothing is sent, and lessons, review and placement keep working."
- Privacy processor entry (privacy.tsx:174): "OpenRouter: sends your text to NVIDIA's Nemotron AI model, run by DeepInfra, Fireworks or CoreWeave under zero-data-retention terms, to generate AI replies for Hector and the practice scenarios, grade written translation answers, write the meaning and answer choices when you save a word, and find practice items in your conversation mistakes. It receives only the text needed for each task and does not keep it."

- [ ] **Step 1: Update the tests first.**
  - `legal-pages.test.tsx` expects `/OpenRouter/` where it expected `/NVIDIA/`, and still expects `/Nemotron/` (the model is named).
  - `review-notes.test.ts` expects `"OpenRouter"` in the services line.
  - Run: `bun x vitest run src/routes/legal-pages.test.tsx src/lib/app-store`. Expected: FAIL.
- [ ] **Step 2: Apply the copy** to all three consent sources, the legal pages (with today's date in "Last updated"), the review notes, the comments and the docs.
- [ ] **Step 3: Verify.**
  - Run: `bun x vitest run src/lib/ai-consent-copy-parity.test.ts src/routes/legal-pages.test.tsx src/lib/app-store`. Expected: PASS.
  - Then `Grep "NVIDIA \(text\)|to NVIDIA|by NVIDIA"` in `src/`, `ios/` and `android/` returns nothing user-facing.
- [ ] **Step 4: Commit.** Message: `docs(privacy): name OpenRouter as the AI text processor`

### Task 6: Roll out (owner steps marked OWNER)

- [ ] **Step 1 (OWNER): Set up OpenRouter.**
  - Create the account and add $10 credit.
  - Settings → Privacy: model training off, prompt logging off.
  - Create a key named `learnwithalphonso-prod` with a monthly limit (suggested $20), and turn on the low-credit email alert.
  - Save the key to `~/.alphonso-secrets/openrouter.env` as `OPENROUTER_API_KEY=...`. Never paste it in chat.
- [ ] **Step 2 (OWNER, BEFORE merge): Set `OPENROUTER_API_KEY` in both places.**
  - Vercel project `learnwithalphonso`, Production and Preview.
  - Supabase → Edge Functions → Secrets.
  - Then verify: the agent lists the variable NAMES only (Vercel MCP `filter_project_envs`, and `supabase secrets list` in CI), and confirms both exist.
- [ ] **Step 3: Merge and watch.** Squash-merge the PR, then watch `main` CI until `deploy-supabase` succeeds.
- [ ] **Step 4: Smoke-test prod.**
  - Run: `bun scripts/check-legal-live.ts`. Expected: the new "Last updated" date is live.
  - On learn.alphonsoecosystem.app with a test account, send one Hector message and one save-word.
  - Expected: Vercel runtime logs show `[ai-timing]` with `llm=` under 2,500 ms, and no `[llm] out of credit`.
  - Expected: the OpenRouter activity page shows a host from `only`.
- [ ] **Step 5 (OWNER): Retire NVIDIA.**
  - Remove `NVIDIA_API_KEY` and `NVIDIA_CHAT_MODEL` from Vercel and from Supabase secrets.
  - Revoke the key at build.nvidia.com.
  - Delete `~/.alphonso-secrets/nvidia.env`.
- [ ] **Step 6: Record it.** Add a dated entry to the local `docs/BACKLOG.md` (not committed), to `Hackaton/SESSION-CONTEXT.md` and to memory: switch done, host list, the benchmark numbers, and that builds 52 and Android carry the new consent copy.
