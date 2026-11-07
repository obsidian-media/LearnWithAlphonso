import { beforeEach, describe, expect, it, vi } from "vitest";
import { scenarioPrompt } from "@/data/scenarios";
import { campaignScenePrompt } from "@/data/campaigns";

/**
 * Practice stars: /api/chat records each judged learner reply against the call, on the server. What it records is
 * what the stars are computed from, so these tests pin that the item, the verdict and the measured words come from
 * the server's own view of the request, never from a client field.
 */
type RpcAnswer = { data: unknown; error: unknown };
const rpc = vi.fn(async (fn: string, args: Record<string, unknown>): Promise<RpcAnswer> =>
  fn === "ai_output_blocked"
    ? { data: (args._texts as string[]).map(() => false), error: null }
    : { data: 1, error: null },
);
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));
const authorizeAiRequest = vi.fn();
vi.mock("@/lib/ai-consent.server", () => ({ authorizeAiRequest }));

const { Route } = await import("./chat");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (o: { request: Request }) => Promise<Response>;
  }
).POST;
const CALL = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

function post(body: unknown) {
  return handler({
    request: new Request("https://example.com/api/chat", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  });
}
function modelSays(content: string) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
  );
}
const recorded = () =>
  rpc.mock.calls.filter(([fn]) => fn === "record_practice_reply").map(([, a]) => a);

beforeEach(() => {
  rpc.mockClear();
  authorizeAiRequest.mockResolvedValue({ ok: true, userId: "user-1", supabase: {} });
  process.env.OPENROUTER_API_KEY = "test-key";
  global.fetch = vi.fn();
});

describe("/api/chat records judged replies for Practice stars", () => {
  it("records a right, full Spanish reply against the scenario the prompt belongs to, for the verified user", async () => {
    modelSays("¡Claro! ¿Para tomar aquí?\n[[verdict:correct]]");
    const res = await post({
      systemPrompt: scenarioPrompt("coffee", "es"),
      course: "en", // a client field: ignored, the persona decides the course
      callId: CALL,
      messages: [{ role: "user", content: "Quisiera un café con leche" }],
    });
    expect(res.status).toBe(200);
    expect(recorded()).toEqual([
      {
        _user_id: "user-1",
        _call_id: CALL,
        _course: "es",
        _kind: "scenario",
        _item_key: "coffee",
        _right: true,
        _short: false,
        _english: false,
      },
    ]);
  });

  it("a corrected reply is recorded as not right", async () => {
    modelSays("Ah, «estoy cansado».\n[[verdict:corrected]]");
    await post({
      systemPrompt: scenarioPrompt("doctor", "es"),
      callId: CALL,
      messages: [{ role: "user", content: "Soy cansado hoy doctora" }],
    });
    expect(recorded()[0]).toMatchObject({ _item_key: "doctor", _right: false });
  });

  it("a reply the safety filter replaced is never recorded as right", async () => {
    rpc.mockImplementationOnce(async (_fn, args) => ({
      data: (args._texts as string[]).map(() => true),
      error: null,
    }));
    modelSays("Something blocked\n[[verdict:correct]]");
    await post({
      systemPrompt: scenarioPrompt("coffee", "es"),
      callId: CALL,
      messages: [{ role: "user", content: "Quisiera un café con leche" }],
    });
    expect(recorded()[0]).toMatchObject({ _right: false });
  });

  it("measures the learner's words on the server: short and English replies are flagged", async () => {
    modelSays("Bien.\n[[verdict:correct]]");
    await post({
      systemPrompt: scenarioPrompt("coffee", "es"),
      callId: CALL,
      messages: [{ role: "user", content: "Yes please, a coffee" }],
    });
    expect(recorded()[0]).toMatchObject({ _right: true, _short: true, _english: true });
  });

  it("a campaign scene is recorded as that scene", async () => {
    modelSays("¡Hola!\n[[verdict:correct]]");
    await post({
      systemPrompt: campaignScenePrompt("train-trip", "train-delay-help", "es"),
      callId: CALL,
      messages: [{ role: "user", content: "¿A qué hora sale el tren?" }],
    });
    expect(recorded()[0]).toMatchObject({
      _kind: "scene",
      _item_key: "train-trip/train-delay-help",
    });
  });

  it("records nothing without a call id, with a malformed one, or when the last turn is not the learner's", async () => {
    modelSays("Hola\n[[verdict:correct]]");
    const base = { systemPrompt: scenarioPrompt("coffee", "es") };
    await post({ ...base, messages: [{ role: "user", content: "Quisiera un café con leche" }] });
    await post({
      ...base,
      callId: "1; drop table",
      messages: [{ role: "user", content: "Quisiera un café" }],
    });
    await post({
      ...base,
      callId: CALL,
      messages: [
        { role: "user", content: "Quisiera un café con leche" },
        { role: "assistant", content: "¿Algo más?" },
      ],
    });
    expect(recorded()).toEqual([]);
  });

  it("a recording failure does not cost the learner the reply", async () => {
    rpc.mockImplementation(async (fn, args) =>
      fn === "ai_output_blocked"
        ? { data: (args._texts as string[]).map(() => false), error: null }
        : { data: null, error: { message: "22023" } },
    );
    modelSays("¡Perfecto!\n[[verdict:correct]]");
    const res = await post({
      systemPrompt: scenarioPrompt("coffee", "es"),
      callId: CALL,
      messages: [{ role: "user", content: "Quisiera un café con leche" }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "¡Perfecto!", verdict: "correct" });
  });
});
