import { describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "./inventory";
import {
  ANTHROPIC_VERSION,
  RejectedError,
  buildRequest,
  createBatch,
  getResults,
  parseResultsJsonl,
  resultText,
  splitBatches,
  thinkingParams,
} from "./anthropic-batch";
import {
  buildMistralRequest,
  createMistralJob,
  parseMistralLine,
  parseMistralOutput,
} from "./mistral-batch";
import { chunk, parseChunkReply, userMessage } from "./review";

// No test here touches a network: every call goes to a mocked fetch.

const it_ = (
  id: string,
  kind: ReviewItem["kind"] = "question",
  course: ReviewItem["course"] = "fr",
): ReviewItem => ({
  id,
  course,
  kind,
  level: "A1",
  source: "x",
  text: `text of ${id}`,
  hash: "h",
  data: {},
});

const reply = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("chunks", () => {
  const items = Array.from({ length: 30 }, (_, i) => it_(`fr:question:fra1p1/fra1p1q${i}`));
  const chunks = chunk([...items, it_("es:card:x/y", "card", "es")], "review");

  it("never mixes courses or kinds in one request (one rubric per request)", () => {
    for (const c of chunks)
      expect(new Set(c.items.map((i) => `${i.course}${i.kind}`)).size).toBe(1);
  });

  it("custom ids are unique and valid for both APIs", () => {
    const ids = chunks.map((c) => c.customId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });

  it("an item's flags are shown to the reviewer", () => {
    const c = chunk([{ ...it_("fr:question:a/b"), flags: ["generic-explanation"] }], "x")[0]!;
    expect(userMessage(c)).toContain("known flags: generic-explanation");
  });
});

describe("reading verdicts", () => {
  const c = chunk(
    [it_("fr:question:a/q1"), it_("fr:question:a/q2"), it_("fr:question:a/q3")],
    "r",
  )[0]!;

  it("maps local keys back to item ids", () => {
    const r = parseChunkReply(
      c,
      '```json\n{"items":[{"key":"i1","verdict":"ok","confidence":0.9},{"key":"i2","verdict":"defect","category":"second-answer","severity":"blocker","problem":"p","fix":"f","confidence":0.8},{"key":"i3","verdict":"ok","confidence":1}]}\n```',
    );
    expect(r.verdicts.map((v) => [v.id, v.verdict])).toEqual([
      ["fr:question:a/q1", "ok"],
      ["fr:question:a/q2", "defect"],
      ["fr:question:a/q3", "ok"],
    ]);
    expect(r.missing).toEqual([]);
  });

  it("a left-out, repeated or garbled entry is missing, never ok", () => {
    const r = parseChunkReply(
      c,
      '{"items":[{"key":"i1","verdict":"ok"},{"key":"i1","verdict":"ok"},{"key":"i2","verdict":"fine"}]}',
    );
    expect(r.missing).toEqual(["fr:question:a/q2", "fr:question:a/q3"]);
    expect(r.errors.join(" ")).toMatch(/repeated key i1/);
  });

  it("unknown categories and severities fall back, never vanish", () => {
    const r = parseChunkReply(
      c,
      '{"items":[{"key":"i1","verdict":"defect","category":"weird","severity":"huge"}]}',
    );
    expect(r.verdicts[0]).toMatchObject({ category: "other", severity: "major" });
  });

  it("no JSON at all: every item missing", () => {
    expect(parseChunkReply(c, "I cannot help with that.").missing).toHaveLength(3);
  });
});

describe("Anthropic batch requests", () => {
  const c = chunk([it_("fr:question:a/q1")], "review")[0]!;

  it("caches the rubric for an hour", () => {
    const r = buildRequest(c, { model: "claude-sonnet-5-5" });
    const sys = (r.params.system as { cache_control: unknown }[])[0]!;
    expect(sys.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("Sonnet 5.5 turns up-front thinking off with between_tools (it rejects disabled); Opus sets only effort", () => {
    expect(thinkingParams("claude-sonnet-5-5", "low")).toEqual({
      thinking: { type: "between_tools" },
      output_config: { effort: "low" },
    });
    expect(thinkingParams("claude-opus-5-5", "medium")).toEqual({
      output_config: { effort: "medium" },
    });
  });

  it("splits at the request-count limit", () => {
    const reqs = Array.from({ length: 100_001 }, (_, i) => ({ custom_id: `r${i}`, params: {} }));
    expect(splitBatches(reqs).map((b) => b.length)).toEqual([100_000, 1]);
  });

  it("sends the key in a header and the pinned API version", async () => {
    const f = vi.fn(async () => reply(200, { id: "msgbatch_1", processing_status: "in_progress" }));
    await createBatch(f, "sk-test", [buildRequest(c, { model: "claude-sonnet-5-5" })]);
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages/batches");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(String(init.body)).not.toContain("sk-test");
  });

  it("a 4xx is a rejection (nothing accepted); a 5xx is unknown (the reservation stays)", async () => {
    await expect(
      createBatch(async () => reply(400, { error: { message: "bad" } }), "k", []),
    ).rejects.toBeInstanceOf(RejectedError);
    const e = await createBatch(async () => reply(529, {}), "k", []).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(RejectedError);
  });

  it("reads results and skips thinking blocks", async () => {
    const jsonl = [
      JSON.stringify({
        custom_id: "a",
        result: {
          type: "succeeded",
          message: {
            content: [
              { type: "thinking", thinking: "hmm" },
              { type: "text", text: '{"items":[]}' },
            ],
            usage: { input_tokens: 5 },
          },
        },
      }),
      JSON.stringify({ custom_id: "b", result: { type: "errored", error: {} } }),
    ].join("\n");
    const lines = await getResults(async () => new Response(jsonl), "k", {
      id: "x",
      processing_status: "ended",
      results_url: "https://r",
    });
    expect(lines).toHaveLength(2);
    expect(resultText(lines[0]!)).toBe('{"items":[]}');
    expect(parseResultsJsonl("\n")).toEqual([]);
  });

  it("refuses to read a batch that has not ended", async () => {
    await expect(
      getResults(async () => new Response(""), "k", { id: "x", processing_status: "in_progress" }),
    ).rejects.toThrow(/not ended/);
  });
});

describe("Mistral batch", () => {
  const c = chunk([it_("es:question:a/q1", "question", "es")], "second")[0]!;

  it("creates an inline chat-completions job", async () => {
    const f = vi.fn(async () => reply(200, { id: "job1", status: "QUEUED" }));
    await createMistralJob(f, "mk", "mistral-large-latest", [buildMistralRequest(c)], {
      phase: "second",
    });
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mistral.ai/v1/batch/jobs");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ endpoint: "/v1/chat/completions", model: "mistral-large-latest" });
    expect(body.requests[0].custom_id).toBe(c.customId);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer mk");
  });

  it("reads both OpenAI-style output shapes and skips reasoning chunks", () => {
    const a = parseMistralLine(
      JSON.stringify({
        custom_id: "x",
        response: {
          status_code: 200,
          body: {
            choices: [{ message: { content: "A" } }],
            usage: { prompt_tokens: 1, completion_tokens: 2 },
          },
        },
      }),
    );
    const b = parseMistralLine(
      JSON.stringify({
        custom_id: "y",
        response: {
          choices: [
            {
              message: {
                content: [
                  { type: "thinking", thinking: [] },
                  { type: "text", text: "B" },
                ],
              },
            },
          ],
        },
      }),
    );
    expect(a).toEqual({
      customId: "x",
      text: "A",
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    expect(b).toMatchObject({ customId: "y", text: "B", usage: null });
  });

  it("an unreadable line is dropped (its items stay missing), never an ok", () => {
    expect(parseMistralOutput('not json\n{"no_id":1}\n')).toEqual([]);
  });
});
