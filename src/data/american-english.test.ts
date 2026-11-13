import { describe, expect, it } from "vitest";
import { americanize, britishFindings } from "../lib/american-english";
import { fullInventory } from "../lib/content-review/inventory";

/**
 * The English course is American English (owner decision 2026-11-06, BACKLOG 0.0-bl;
 * docs/CONTENT-PLAYBOOK.md section 2). This gate fails on a British spelling or a British-only word
 * in any English learner-facing text: lesson questions, word cards, placement, titles, story
 * campaigns, speaking scenarios (including the instructions the partner follows) and podcast quizzes.
 *
 * The word lists are in src/lib/american-english.ts. A word both varieties use (autumn, cinema, shop,
 * trousers) is not on them.
 *
 * ALLOWED is the only way past: an item id and the British forms it may keep, each with the reason.
 * An entry that no longer matches anything fails too, so the list cannot rot.
 */
const ALLOWED: Record<string, { words: string[]; why: string }> = {};

describe("English learner-facing text is American English", () => {
  const items = fullInventory().filter((i) => i.course === "en");

  it("has no British spelling or British-only word", () => {
    const found: string[] = [];
    for (const it of items) {
      const allowed = new Set(ALLOWED[it.id]?.words ?? []);
      const words = britishFindings(it.text).filter((w) => !allowed.has(w));
      if (words.length) found.push(`${it.id}: ${words.join(", ")}`);
    }
    expect(found.slice(0, 40), `${found.length} items; first 40`).toEqual([]);
  });

  it("every allow-list entry is still needed", () => {
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const [id, a] of Object.entries(ALLOWED)) {
      const it = byId.get(id);
      expect(it, `${id} no longer exists`).toBeDefined();
      const hits = britishFindings(it!.text);
      for (const w of a.words) expect(hits, `${id}: "${w}" is no longer found`).toContain(w);
      expect(a.why.length, `${id} needs a reason`).toBeGreaterThan(10);
    }
  });

  it("the detector catches what it claims to and spares American uses", () => {
    for (const bad of [
      "What is your favourite colour?",
      "She lives in the neighbourhood centre.",
      "We apologised and organised the trip.",
      "I rent a flat near the tube.",
      "Join the queue at the till.",
      "He is on holiday at the weekend.",
      "Her mum was in hospital.",
      "Fill the car with petrol; park in the car park.",
    ])
      expect(britishFindings(bad), bad).not.toEqual([]);
    for (const ok of [
      "What is your favorite color?",
      "The tire is flat.",
      "Happy holidays, and enjoy the holidays.",
      "The coach talked to the team.",
      "My mom took me to the movie theater.",
      "She works at a flat-pack furniture company.",
    ])
      expect(britishFindings(ok), ok).toEqual([]);
  });

  it("americanize turns a British line into one the detector accepts", () => {
    const line =
      "My flat is near the centre; my mum waits in the queue at the till on holiday, and the neighbours apologise.";
    expect(britishFindings(line).length).toBeGreaterThan(3);
    const out = americanize(line);
    expect(out).toBe(
      "My apartment is near the center; my mom waits in the line at the register on vacation, and the neighbors apologize.",
    );
    expect(britishFindings(out)).toEqual([]);
  });
});
