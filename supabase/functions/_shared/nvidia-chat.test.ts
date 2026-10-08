import { assertEquals } from "jsr:@std/assert@1";
import { nvidiaChatCompletion } from "./nvidia-chat.ts";
import { SAFETY_PREAMBLE } from "./ai-safety.ts";

Deno.test("the edge chokepoint adds the safety preamble as the system message", async () => {
  let sent: { messages: { role: string; content: string }[] } | undefined;
  const fetchImpl = ((_u: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  await nvidiaChatCompletion({ apiKey: "k", body: { model: "m", messages: [{ role: "user", content: "mark this" }] }, fetchImpl });
  assertEquals(sent?.messages[0], { role: "system", content: SAFETY_PREAMBLE });
  assertEquals(sent?.messages[1], { role: "user", content: "mark this" });
});
