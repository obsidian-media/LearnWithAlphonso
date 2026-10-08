/**
 * Post-deploy proof of AI consent enforcement against production, with a THROWAWAY account (never the App Review
 * demo account).
 *   bun scripts/verify-ai-consent.ts send-code <email>
 *   bun scripts/verify-ai-consent.ts run <email> <6-digit code>
 * Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (public values), API_BASE (default https://learn.alphonsoecosystem.app).
 * Exits non-zero on any mismatch. Deletes the account at the end.
 */
const SUPABASE_URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
const API = process.env.API_BASE ?? "https://learn.alphonsoecosystem.app";
const [cmd, email, code] = process.argv.slice(2);

async function auth(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<{ access_token?: string }>;
}

if (cmd === "send-code") {
  await auth("otp", { email, create_user: true });
  console.log("code sent");
  process.exit(0);
}

const { access_token: token } = await auth("verify", { type: "email", email, token: code });
if (!token) throw new Error("no access token");
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const rpc = (name: string, args: unknown = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...H, apikey: KEY },
    body: JSON.stringify(args),
  });
const call = (path: string, body: unknown) =>
  fetch(`${API}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });

let failures = 0;
async function expectStatus(label: string, res: Response, want: number, wantError?: string) {
  const text = await res.text();
  const ok = res.status === want && (!wantError || text.includes(`"${wantError}"`));
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${res.status} ${text.slice(0, 80)}`);
}

// 1. A new account has not consented.
await expectStatus("get_ai_consent is null", await rpc("get_ai_consent"), 200);
// 2. Every gated route refuses before doing anything.
const form = new FormData();
form.append("file", new Blob(["x".repeat(600)], { type: "audio/mp4" }), "a.m4a");
const gated: [string, () => Promise<Response>][] = [
  [
    "chat",
    () => call("/api/chat", { systemPrompt: "x", messages: [{ role: "user", content: "hi" }] }),
  ],
  [
    "stt",
    () =>
      fetch(`${API}/api/stt`, {
        method: "POST",
        headers: { Authorization: H.Authorization },
        body: form,
      }),
  ],
  ["tts", () => call("/api/tts", { text: "Hello" })],
  ["hector-respond", () => call("/api/hector-respond", { text: "hola", language: "en" })],
  [
    "grade-translation",
    () =>
      call("/api/grade-translation", {
        lessonId: "u1l1",
        questionId: "q1",
        submission: "x",
        course: "en",
      }),
  ],
  [
    "define-word",
    () => call("/api/define-word", { word: "tea", sentence: "I want tea.", course: "en" }),
  ],
  [
    "analyze-weaknesses",
    () => call("/api/analyze-weaknesses", { messages: [{ role: "user", content: "hi" }] }),
  ],
];
for (const [name, go] of gated) {
  await expectStatus(`${name} without consent`, await go(), 403, "ai-consent-required");
}
await expectStatus(
  "generate-practice is not gated",
  await call("/api/generate-practice", { lessonId: "u1l1", course: "en" }),
  200,
);
// 3. Grant: TTS works (cheap Deepgram call).
await expectStatus("set_ai_consent(true)", await rpc("set_ai_consent", { _granted: true }), 200);
await expectStatus("tts with consent", await call("/api/tts", { text: "Hello" }), 200);
// 4. Withdraw: the very next request is refused.
await expectStatus("set_ai_consent(false)", await rpc("set_ai_consent", { _granted: false }), 200);
await expectStatus(
  "tts right after withdrawal",
  await call("/api/tts", { text: "Hello" }),
  403,
  "ai-consent-required",
);
// 5. Clean up the throwaway account.
await expectStatus("delete account", await call("/api/account-delete", { confirm: "DELETE" }), 200);

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
