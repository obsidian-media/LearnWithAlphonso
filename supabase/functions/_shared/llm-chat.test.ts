import { assertEquals } from "jsr:@std/assert@1";
import { llmChatCompletion, normalizeLlmResponse, parseLlmChatModels, LLM_CHAT_MODELS_DEFAULT } from "./llm-chat.ts";
import { SAFETY_PREAMBLE } from "./ai-safety.ts";

function capture(response: () => Response = () => new Response("{}")) {
  const sent: Record<string, unknown>[] = [];
  const fetchImpl = ((_u: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Promise.resolve(response());
  }) as typeof fetch;
  return { sent, fetchImpl };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.test("the edge chokepoint adds the safety preamble as the system message", async () => {
  const { sent, fetchImpl } = capture();
  await llmChatCompletion({ apiKey: "k", body: { model: "m", messages: [{ role: "user", content: "mark this" }] }, models: ["m"], fetchImpl });
  const messages = sent[0].messages as { role: string; content: string }[];
  assertEquals(messages[0], { role: "system", content: SAFETY_PREAMBLE });
  assertEquals(messages[1], { role: "user", content: "mark this" });
});

Deno.test("the edge chokepoint sends the model list, reasoning off and no data collection", async () => {
  const { sent, fetchImpl } = capture();
  await llmChatCompletion({
    apiKey: "k",
    body: { model: "b/y", messages: [{ role: "user", content: "x" }], max_tokens: 50, reasoning: { effort: "high" }, provider: { data_collection: "allow" } },
    models: ["a/x", "b/y"],
    providers: ["anthropic"],
    fetchImpl,
  });
  assertEquals(sent[0].models, ["b/y", "a/x"]);
  assertEquals("model" in sent[0], false);
  assertEquals(sent[0].reasoning, { effort: "none" });
  assertEquals(sent[0].provider, { data_collection: "deny", only: ["anthropic"] });
  assertEquals(sent[0].max_tokens, 50);
});

Deno.test("the edge model list parses from env text, falling back to the default", () => {
  assertEquals(parseLlmChatModels(" a/x , ,b/y "), ["a/x", "b/y"]);
  assertEquals(parseLlmChatModels(""), [...LLM_CHAT_MODELS_DEFAULT]);
  assertEquals(parseLlmChatModels(undefined), [...LLM_CHAT_MODELS_DEFAULT]);
});

Deno.test("the edge chokepoint maps OpenRouter failures onto statuses callers handle", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const status of [401, 402, 403]) {
      assertEquals((await normalizeLlmResponse(json(status, { error: { code: status } }))).status, 503);
    }
    assertEquals((await normalizeLlmResponse(json(429, { error: { code: 429 } }))).status, 429);
    assertEquals((await normalizeLlmResponse(json(200, { error: { code: 502 } }))).status, 502);
    const ok = await normalizeLlmResponse(json(200, { choices: [{ message: { content: "hola" } }] }));
    assertEquals(ok.status, 200);
    assertEquals((await ok.json()).choices[0].message.content, "hola");
  } finally {
    console.error = quiet;
  }
});
