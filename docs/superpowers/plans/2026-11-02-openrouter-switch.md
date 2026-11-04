# OpenRouter Switch Implementation Plan

> Status (2026-11-04): implemented and merged (#338).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every AI text call off NVIDIA's hosted trial API (`integrate.api.nvidia.com`, whose terms forbid production use) to OpenRouter. The model list is configurable and ordered (default: Claude Haiku 5.5 on the owner's own Anthropic key, BYOK), so a fallback model is a config change, not a code change. Same speed, same safety rules.

**Architecture:** All AI text already goes through two chokepoints: `src/lib/nvidia-chat.server.ts` (web server) and `supabase/functions/_shared/nvidia-chat.ts` (edge functions), guarded by `src/lib/ai-call-sites.test.ts`. They become provider-neutral `llm-chat` modules that call OpenRouter's OpenAI-compatible endpoint with:
- reasoning off;
- an ordered `models` list from config, which OpenRouter tries in turn on any error;
- training on learner data refused.

Callers keep their own error handling. The chokepoint normalizes OpenRouter's two new failure shapes (402, and a 200 response that carries an error) into statuses callers already handle. The native apps never call the AI provider, so the switch itself needs no app build; only the consent wording does.

**Tech Stack:** TanStack Start on Vercel (Node), Supabase Edge Functions (Deno), Vitest, Deno test, OpenRouter Chat Completions API (BYOK).

**Spec:** Decisions D1-D7 below, agreed with the owner 2026-11-02. Evidence:
- NVIDIA API Trial Terms §1.2 and §1.4: trial only, no production use without a paid Subscription.
- OpenRouter Terms (2026-08-31) §5.1 and §7.
- OpenRouter BYOK docs: a 5% fee inside a $25,000/month free allowance; data policies apply to BYOK.
- Anthropic Privacy Center (2026-07-01): API inputs and outputs are deleted within 30 days (up to 2 years if flagged for a Usage Policy violation), and are not used for training by default.
- Anthropic guidelines for organizations serving minors (2026-03-16): age verification, content moderation, a child-safety system prompt, AI disclosure, and a public compliance statement.

## Decisions

- **D1.** Use OpenRouter because of model fallback (owner, 2026-11-02: "if we want only anthropic and haiku why we go through openrouter"). Nothing hardcodes one model or one provider. The owner's BYOK keys (Anthropic, Mistral) are set to "Never use shared capacity", so a failing BYOK key never silently spends credit. A fallback model without BYOK is paid from OpenRouter credit; the key's $50 limit caps that. The free models were rejected: 50 requests a day, and the free Nemotron is served by NVIDIA without ZDR.
- **D2.** Models come from env `LLM_CHAT_MODELS`: a comma-separated list in priority order, sent as OpenRouter's `models` array. The code default is `anthropic/claude-haiku-5.5`. Which fallback to add (recommended: `nvidia/nemotron-3.5-lightning`, paid, about 0.2 s, benchmarked; or Mistral once its account is upgraded) is the OWNER's choice before Task 5. The privacy wording must name every provider in the default list, and a guard test enforces that.
- **D3.** Routing: `provider: { data_collection: "deny" }`, with no provider pinning, so each model keeps OpenRouter's own provider fallback. There is no `zdr` flag: a BYOK Anthropic key has no ZDR declaration, and Anthropic keeps API data for up to 30 days.
- **D4.** Reasoning off: `reasoning: { effort: "none" }`. The benchmark measured 0 reasoning tokens.
- **D5.** No forced re-consent: same purpose, same data types. The consent sheet, privacy policy, terms and review notes name Anthropic, reached through OpenRouter.
- **D6.** The new consent wording reaches the apps in the next builds (iOS build 52, Android's first Play build). Until then, TestFlight build 51 still names NVIDIA; the owner accepts this short window (the app is not on the App Store or Play yet).
- **D7.** Of Anthropic's minors guidance, the app already has the safety preamble, the output filter with reporting, AI disclosure, and the 13+ notice. This plan adds the public compliance sentence. Age confirmation at sign-up (today only buddy matching asks) is an open owner decision, out of scope here.

## Benchmark result (Task 1, done 2026-11-02)

`scripts/benchmark-llm.ts`, run with a French A2 café tutoring prompt and `max_tokens` 600:
- `anthropic/claude-haiku-5.5` on BYOK Anthropic: 10/10 succeeded, p50 586-664 ms, 0 reasoning tokens. The billing record showed `is_byok: true` and $0 of OpenRouter credit.
- `mistralai/mistral-small-2603` on BYOK Mistral: 4/10. The owner's Mistral account is rate-limited (429), so it is not used.
- Paid Nemotron on DeepInfra, Fireworks or CoreWeave: about 200 ms, 0 reasoning tokens. Not chosen: it spends OpenRouter credit.

## Global Constraints

- Every AI text request passes `applySafety(body.messages)` in a chokepoint. No other file may reach the provider (`ai-call-sites.test.ts`).
- Reasoning must stay off. NVIDIA prod logs showed 17-88 s replies and save-word (`max_tokens` 600) returning nothing when it was on.
- Default deadlines stay as they are: `30_000` ms by default, `120_000` ms for authoring.
- The OpenRouter key lives only in Vercel env, Supabase function secrets and `D:\Credentials\Learn With Alphonso\openrouter_api_key.txt` (one bare `sk-or-v1-` line). Read it with Python `.strip()`: `tr` mangles it. It is never printed, logged or committed. The owner's Anthropic key lives only inside OpenRouter.
- `docs/BACKLOG.md` is local-only and is never committed.
- Copy is identical on web, iOS and Android (`src/lib/ai-consent-copy-parity.test.ts`).
- Main needs green CI. Squash-merge. Merging deploys the edge functions (`deploy-supabase`).

## Review Focus

1. **Every configured model fails** (for example the Anthropic key is revoked and there is no fallback, or all fallbacks fail too). Every AI feature then fails at once. Expected:
   - an upstream 429 stays 429 (learners see "Rate limited, please try again shortly");
   - a 402 becomes 503 and logs `[llm] provider unavailable` with the upstream message;
   - a 401/403 coming from the provider also becomes 503 with that log line.

   Pinned in Task 3. The owner turns on Anthropic usage alerts in Task 7.
2. **A 200 response that carries `{error}` and no `choices`.** Callers would read `""` and show an empty Hector reply. Expected: treated as 502. Pinned in Task 3.
3. **Haiku returns a JSON feature in a shape a parser rejects** (translation verdict, save-word definition, practice questions, weakness list). Expected: each feature returns a valid parsed result against the live model. Task 6 runs every one.
4. **A caller overrides routing or reasoning** (for example passes its own `provider` allowing data collection), or the model list in env names a provider the privacy policy does not. Expected: the chokepoint's `reasoning` and `data_collection` always win (Task 3). The default list's providers are all named in the privacy policy (Task 5 guard test). `.env.example` states that rule for overrides.
5. **The new key is missing at deploy time.** Callers treat a missing key as "AI not configured", which silently disables AI in prod. Expected: Task 7 sets both secrets BEFORE merge, and smoke-tests prod right after.

---

### Task 1: Benchmark (DONE, see "Benchmark result")

`scripts/benchmark-llm.ts` is committed with this plan. `BENCH_SET=byok` runs the owner-key rows.

### Task 2: Make the chokepoints provider-neutral (rename only, no behavior change)

**Files:**
- Rename: `src/lib/nvidia-chat.server.ts` → `src/lib/llm-chat.server.ts`
- Rename: `src/lib/nvidia-chat-model.server.ts` → `src/lib/llm-chat-model.server.ts`
- Rename: `supabase/functions/_shared/nvidia-chat.ts` → `supabase/functions/_shared/llm-chat.ts`, and its `.test.ts`
- Rename: `src/lib/nvidia-no-thinking.test.ts` → `src/lib/llm-no-reasoning.test.ts`
- Modify: every importer of the old names in `src/`, `supabase/functions/`, `scripts/` and `admin/`, plus `src/lib/ai-call-sites.test.ts` (`CHOKEPOINTS`)

**Interfaces:**
- Produces:
  - `llmChatCompletion(args: { apiKey: string; body: LlmChatBody; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<Response>`
  - `LLM_CHAT_URL`, `LLM_DEFAULT_TIMEOUT_MS = 30_000`, `LLM_AUTHORING_TIMEOUT_MS = 120_000`
  - `type LlmChatBody = { model: string; messages: LlmMessage[] } & Record<string, unknown>`
  - `resolveLlmChatModel(): string`, `LLM_CHAT_MODEL_DEFAULT`

- [ ] **Step 1: Rename with `git mv` and update imports and identifiers.** Values stay unchanged.
- [ ] **Step 2: Run the suite.** Run: `bun x tsc --noEmit && bun x vitest run src/lib/ai-call-sites.test.ts src/lib/llm-no-reasoning.test.ts src/routes/api && deno test --no-lock --no-check supabase/functions/`
  Expected: all PASS, same counts as before the rename.
- [ ] **Step 3: Commit.** Message: `refactor(llm): provider-neutral chat chokepoint names`

### Task 3: Call OpenRouter from both chokepoints, and normalize its failures

**Files:**
- Modify: `src/lib/llm-chat.server.ts`, `supabase/functions/_shared/llm-chat.ts`, `src/lib/ai-call-sites.test.ts`
- Test: `src/lib/llm-chat.server.test.ts` (create), `supabase/functions/_shared/llm-chat.test.ts`, `src/lib/llm-no-reasoning.test.ts`

**Interfaces:**
- Produces, from both twins, with identical literals:
  - `LLM_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"`
  - `LLM_PROVIDER_PREFS = { data_collection: "deny" } as const`
  - Body field `models: string[]`, built as `dedupe([body.model, ...configuredModels])`. `configuredModels` comes from Task 4's resolver; the body's own `model` key is removed, because OpenRouter takes the list.
  - `LLM_NO_REASONING = { effort: "none" } as const`
  - `normalizeLlmResponse(res: Response): Promise<Response>`

- [ ] **Step 1: Write the failing tests** in `src/lib/llm-chat.server.test.ts`, using a fake `fetchImpl`. Mirror the same cases in the Deno test.
  - `"sends OpenRouter the model list, safety-wrapped messages, reasoning off and the provider prefs"`: with configured models `["a/x", "b/y"]` and `body.model` `"a/x"`, the sent `models` equals `["a/x", "b/y"]` and there is no `model` key; the URL equals `LLM_CHAT_URL`; `body.reasoning` deep-equals `{ effort: "none" }`; `body.provider` deep-equals `LLM_PROVIDER_PREFS`; `messages[0]` is the safety preamble.
  - `"a caller's own model goes first, without duplicates"`: with `body.model` `"b/y"` and configured `["a/x", "b/y"]`, the sent `models` equals `["b/y", "a/x"]`.
  - `"a caller cannot turn reasoning on or allow data collection"`: an input with `reasoning: { effort: "high" }` and `provider: { data_collection: "allow" }` is sent with `LLM_NO_REASONING` and `LLM_PROVIDER_PREFS`.
  - `"402 becomes 503 and is logged"`: the fake returns 402 `{"error":{"code":402,"message":"Insufficient credits"}}`; the status is 503; `console.error` was called with a string containing `[llm] provider unavailable`.
  - `"a provider 401 becomes 503 and is logged"`: the fake returns 401 `{"error":{"code":401,"message":"invalid x-api-key"}}`; the status is 503; the same log line is written.
  - `"an upstream 429 stays 429"`: the fake returns 429; the status is 429.
  - `"a 200 carrying an error and no choices becomes 502"`: the fake returns 200 `{"error":{"code":502,"message":"upstream"}}`; the status is 502.
  - `"a normal 200 passes through untouched"`: `choices[0].message.content === "hola"`, status 200.
- [ ] **Step 2: Run the tests to verify they fail.** Run: `bun x vitest run src/lib/llm-chat.server.test.ts`
  Expected: FAIL. The URL is still NVIDIA's, and `normalizeLlmResponse` is not defined.
- [ ] **Step 3: Implement in both twins.**
  - The body is `{ ...bodyWithoutModel, models, reasoning: LLM_NO_REASONING, provider: LLM_PROVIDER_PREFS, messages: applySafety(body.messages) }`, with the chokepoint's values spread last.
  - `llmChatCompletion` takes an optional `models?: string[]` argument (tests pass it). It defaults to the Task 4 resolver: `resolveLlmChatModels()` on the web, and the Deno env read in the edge twin.
  - `llmChatCompletion` returns `normalizeLlmResponse(await fetchImpl(...))`.
  - Normalization reads the body only for status 401, 402 or 403, or for a 200 with a JSON content-type. Every other response passes through untouched.
  - Remove `withNoThinking` and `NVIDIA_NO_THINKING`; `chat_template_kwargs` was NVIDIA-specific.
- [ ] **Step 4: Update the guard tests.**
  - The `ai-call-sites.test.ts` pattern becomes `/openrouter\.ai|integrate\.api\.nvidia\.com|\bapi\.nvidia\.com|LLM_CHAT_URL/`.
  - Its self-test gains `expect(NVIDIA.test('fetch("https://openrouter.ai/api/v1/x")')).toBe(true)`.
  - `llm-no-reasoning.test.ts` asserts that both twins carry identical `LLM_NO_REASONING` and `LLM_PROVIDER_PREFS` literals.
- [ ] **Step 5: Run and mutation-check.**
  - Run: `bun x vitest run src/lib && deno test --no-lock --no-check supabase/functions/`. Expected: PASS.
  - Then temporarily change `data_collection: "deny"` to `"allow"` in the web twin. Expected: the prefs test and the twin-parity test go red. Restore it.
- [ ] **Step 6: Commit.** Message: `feat(llm): route AI text through OpenRouter with a model fallback list, reasoning off`

### Task 4: One key and one model id

**Files:**
- Modify: `src/lib/llm-chat-model.server.ts`
- Modify: every reader of `process.env.NVIDIA_API_KEY` (web routes and libs, `src/lib/sync.functions.ts`, `scripts/pack-tool.ts`)
- Modify: `supabase/functions/_shared/answer-correctness.ts`, `supabase/functions/_shared/translation-grader.ts`
- Modify: `.env.example`, `.github/workflows/ci.yml:289` comment
- Test: `src/lib/llm-chat-model.server.test.ts` (create); extend `src/lib/ai-call-sites.test.ts`

**Interfaces:**
- Produces:
  - `resolveLlmApiKey(): string | undefined`, which returns `process.env.OPENROUTER_API_KEY`
  - `LLM_CHAT_MODELS_DEFAULT: readonly string[] = ["anthropic/claude-haiku-5.5"]`, plus the owner's fallback once chosen (D2)
  - `resolveLlmChatModels(): string[]`: env `LLM_CHAT_MODELS` split on commas, trimmed, empty entries dropped; falls back to the default when the result is empty
  - `resolveLlmChatModel(): string`: the first entry, kept for callers and logs
  - The edge twin mirrors the same list and parsing via `Deno.env.get("LLM_CHAT_MODELS")`, with `Deno.env.get("OPENROUTER_API_KEY")`

- [ ] **Step 1: Write the failing tests.**
  - `"the key comes from OPENROUTER_API_KEY only"`: with both env names stubbed, `resolveLlmApiKey()` returns the OpenRouter value. With only `NVIDIA_API_KEY` set, it returns `undefined`.
  - `"no source reads the old NVIDIA env names"`: nothing under `src`, `supabase/functions`, `admin` or `scripts` matches `/NVIDIA_API_KEY|NVIDIA_CHAT_MODEL/`.
  - `"the model list parses from env"`: `" a/x , ,b/y "` gives `["a/x", "b/y"]`; `""` and unset both give `LLM_CHAT_MODELS_DEFAULT`.
  - `"the edge default list matches the web default"`: a text check that the edge twin's default array literal equals the web one.
- [ ] **Step 2: Run to verify they fail.** Run: `bun x vitest run src/lib/llm-chat-model.server.test.ts src/lib/ai-call-sites.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Replace each inline env read with `resolveLlmApiKey()`.
  - Update the edge env names, `.env.example` (`OPENROUTER_API_KEY=""`, `LLM_CHAT_MODELS=""`, with a note: "ordered, comma-separated; every provider you list must be named in the privacy policy") and the `pack-tool.ts` error text.
- [ ] **Step 4: Run the full suites.** Run: `bun x tsc --noEmit && bun x vitest run && deno test --no-lock --no-check supabase/functions/`
  Expected: PASS. Re-run any single unexpected failure alone before believing it, because this machine is RAM-starved.
- [ ] **Step 5: Commit.** Message: `feat(llm): OPENROUTER_API_KEY and a configurable model list`

### Task 5: Say who processes the text (consent, legal pages, review notes)

**Files:**
- Modify: `src/lib/ai-consent-copy.ts`, `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AIConsentCopy.swift`, `android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/logic/AiConsent.kt`
- Modify: `src/routes/privacy.tsx` (processor entry ~174, lines ~206/211, the "Children" section, the "Last updated" date)
- Modify: `src/routes/terms.tsx:129` and its date
- Modify: `src/lib/app-store/review-notes.ts:46,73,85`
- Modify: comments naming NVIDIA (`SaveWordSheet.swift`, `SaveWordFlow.kt`, `TranslationGradingPolicy.swift`, `AIConversationClient.swift`, `TutorError.swift`, `Info.plist:22`, `TutorErrorTests.swift:56`) and `ARCHITECTURE.md`, `AGENTS.md`, `README.md`
- Test: `src/routes/legal-pages.test.tsx`, `src/lib/ai-consent-copy-parity.test.ts`, `src/lib/app-store/review-notes.test.ts`, `src/lib/legal-required-phrases.ts` (if it pins NVIDIA wording)

Exact copy (the owner may edit it before merge):
- `sheetBody`: "To transcribe your speech, reply to you and check your answers, Alphonso sends your voice recordings to Deepgram (speech recognition and spoken replies) and your conversation text and written answers to an AI model through OpenRouter, currently Anthropic's Claude (AI replies and grading; our Privacy Policy lists every AI provider we use). Nothing is sent until you allow it, and you can turn this off at any time in Settings."
- `settingsFooter`: "When this is on, Alphonso sends your voice to Deepgram and your conversation text and written answers to an AI model through OpenRouter (currently Anthropic's Claude) so the tutor can reply, transcribe and grade. When it's off, nothing is sent, and lessons, review and placement keep working."
- Privacy processor entries: one for OpenRouter ("routes your text to the AI model that answers and does not store it") and one per provider in `LLM_CHAT_MODELS_DEFAULT`. Anthropic's entry: "Anthropic (Claude), reached through OpenRouter: generates AI replies for Hector and the practice scenarios, grades written translation answers, writes the meaning and answer choices when you save a word, and finds practice items in your conversation mistakes. It receives only the text needed for each task. OpenRouter passes the text on without storing it; Anthropic does not use it to train its models and deletes it within 30 days, or keeps it longer only when it is flagged for breaking Anthropic's usage policy."
- Children section, added sentence: "Every AI reply follows safety rules written for learners aged 13 and up, is checked by a content filter before you see it, and can be reported from the reply itself; we follow our AI provider's requirements for apps used by teenagers and the child-privacy laws that apply to us."

- [ ] **Step 1: Update the tests first.**
  - `legal-pages.test.tsx` expects `/Anthropic/` and `/OpenRouter/` where it expected `/NVIDIA/`, plus `/within 30 days/`.
  - `review-notes.test.ts` expects `"Anthropic"` and `"OpenRouter"` in the services line.
  - New guard in `legal-pages.test.tsx`: `"every default AI model's provider is named in the privacy policy"`. It maps each `LLM_CHAT_MODELS_DEFAULT` prefix to a company name (`anthropic`→Anthropic, `mistralai`→Mistral, `nvidia`→NVIDIA, `openai`→OpenAI, `google`→Google; an unknown prefix fails the test) and expects that name in the rendered privacy page.
  - Run: `bun x vitest run src/routes/legal-pages.test.tsx src/lib/app-store`. Expected: FAIL.
- [ ] **Step 2: Apply the copy** to all three consent sources, the legal pages (today's date in "Last updated"), the review notes, the comments and the docs.
- [ ] **Step 3: Verify.**
  - Run: `bun x vitest run src/lib/ai-consent-copy-parity.test.ts src/routes/legal-pages.test.tsx src/lib/app-store`. Expected: PASS.
  - `Grep "NVIDIA"` in user-facing copy (`src/routes`, `src/lib/ai-consent-copy.ts`, `AIConsentCopy.swift`, `AiConsent.kt`, `review-notes.ts`) returns nothing.
- [ ] **Step 4: Commit.** Message: `docs(privacy): name Anthropic (via OpenRouter) as the AI text processor`

### Task 6: Run every AI feature against the live model (owner key, BYOK)

**Files:**
- Create: `scripts/smoke-llm-features.ts`

**Interfaces:**
- Consumes the real server functions:
  - the translation grader (`src/lib/translation-grader.server.ts`)
  - the save-word definition (`src/lib/saved-word.server.ts` and `parseDefinition`)
  - practice generation (`parsePracticeQuestions`)
  - weakness detection (`parseWeaknesses`)
  - the Hector chat reply
  - the vocab and pack authoring parsers (`parseVocabCandidates`, `parseDraftPack`)

- [ ] **Step 1: Write the script.** It calls each feature once in French and once in Spanish, through `llmChatCompletion` with `OPENROUTER_API_KEY` from env. For each call it prints PASS when the feature's own parser returns a non-null, non-empty result, plus the latency. It exits 1 on any FAIL. It never prints the key.
- [ ] **Step 2: Run it.** Run: `OPENROUTER_API_KEY=$(python -I -c "import sys;print(open(sys.argv[1],encoding='utf-8-sig').read().strip())" "/d/Credentials/Learn With Alphonso/openrouter_api_key.txt") bun scripts/smoke-llm-features.ts`
  Expected: every line PASS, and each call under 5 s (authoring under 60 s). If any fails, fix that feature's prompt or parser with a regression test before moving on.
- [ ] **Step 3: Commit.** Message: `chore(llm): live smoke test for every AI feature`

### Task 7: Roll out (owner steps marked OWNER)

- [ ] **Step 1 (OWNER): Set the Anthropic account guardrails.** In the Anthropic console, set a monthly spend limit (suggested $20) and an email alert.
- [ ] **Step 2 (OWNER, BEFORE merge): Set `OPENROUTER_API_KEY` in both places.**
  - Vercel project `learnwithalphonso`, Production and Preview.
  - Supabase → Edge Functions → Secrets.
  - Then verify: the agent confirms the variable NAMES exist (Vercel MCP `filter_project_envs`; Supabase secrets list), never the values.
- [ ] **Step 3: Merge and watch.** Squash-merge the PR, then watch `main` CI until `deploy-supabase` succeeds.
- [ ] **Step 4: Smoke-test prod.**
  - Run: `bun scripts/check-legal-live.ts`. Expected: the new "Last updated" date is live.
  - With a test account on learn.alphonsoecosystem.app, send one Hector message and one save-word.
  - Expected: Vercel logs show `[ai-timing]` `llm=` under 2,500 ms, and no `[llm] provider unavailable`.
  - Expected: OpenRouter activity shows `is_byok` true and $0 credit spent.
- [ ] **Step 5 (OWNER): Retire NVIDIA.**
  - Remove `NVIDIA_API_KEY` and `NVIDIA_CHAT_MODEL` from Vercel and from Supabase secrets.
  - Revoke the key at build.nvidia.com.
  - Delete `~/.alphonso-secrets/nvidia.env`.
- [ ] **Step 6: Record it.** Add a dated entry to the local `docs/BACKLOG.md` (not committed), to `Hackaton/SESSION-CONTEXT.md` and to memory: switch done, model, benchmark numbers, that builds 52 and Android carry the new consent copy, and the open sign-up age-confirmation decision (D7).
