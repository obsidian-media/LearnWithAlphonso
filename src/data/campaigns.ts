/**
 * V4 candidate #4: multi-turn conversation campaigns. Deliberately a
 * distinct shape from src/data/scenarios.ts's flat `Scenario` -- a
 * campaign is an ordered sequence of scenes (each one is roughly a
 * "Scenario" on its own: its own character, its own systemPrompt, its own
 * opener) that share one continuous chat transcript, so a later scene's
 * model call sees everything said in earlier scenes and can reference it.
 * See docs/superpowers/specs/2026-09-21-conversation-campaigns-design.md
 * for the full design writeup (scene-completion, retry, and persistence
 * decisions).
 */
export type CampaignScene = {
  id: string;
  title: string;
  /** Sent to /api/chat as part of the composed systemPrompt once this
   * scene is active -- see campaign_.$campaignId.tsx's `systemPromptFor`. */
  systemPrompt: string;
  /** Assistant's first line when this scene begins. */
  opener: string;
  /** Minimum number of learner turns in this scene before the "Continue"
   * action unlocks. This is the scene-completion gate (design decision:
   * an explicit user action, floored by a minimum, not a fixed cutoff and
   * not an AI self-reported "done" signal -- see the design doc for why). */
  minTurns: number;
};

export type Campaign = {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  /** Framing shared by every scene -- establishes the one continuous
   * setting/story (same day, same city) that scenes are chained within. */
  premise: string;
  scenes: CampaignScene[];
};

// One real campaign, shipped as proof of the architecture (see the V4
// task's scope note) -- converting the rest of scenarios.ts into
// campaigns is explicitly out of scope for this slice.
export const CAMPAIGNS: Campaign[] = [
  {
    id: "city-day",
    title: "A day in a new city",
    emoji: "🧭",
    blurb: "Coffee, directions, and a new friend — all in one morning.",
    level: "Beginner",
    premise:
      "You've just arrived in a new city for the first time. It's a bright Saturday morning and you have the whole day free to explore. This roleplay follows one continuous morning: you'll grab a coffee, ask a local for directions to the weekend market, and strike up a conversation with someone you meet there. It's all the same day, the same city -- feel free to notice or mention things that happened earlier if it comes up naturally, but don't force it.",
    scenes: [
      {
        id: "coffee-stop",
        title: "Coffee stop",
        systemPrompt:
          "You are Nora, a cheerful barista at Maple & Bean, a small café near the learner's hotel. Roleplay a natural coffee-order conversation. Keep replies short (1-2 sentences), ask one thing at a time (size, milk, dairy or non-dairy, to stay or go, payment). Gently rephrase awkward English without lecturing. Never break character.",
        opener: "Morning! Welcome to Maple & Bean — what can I get started for you?",
        minTurns: 3,
      },
      {
        id: "directions",
        title: "Ask for directions",
        systemPrompt:
          "You are Theo, a friendly local walking his dog near the café. The learner (a stranger to you) stops you to ask for directions to the Saturday weekend market a few streets away. Give short, simple directions (turn left, go two blocks, it's past the fountain), and check they understood. If the learner mentions coffee or a café, you can react naturally (e.g. 'Maple & Bean, nice choice'), but don't force it. Stay in character.",
        opener: "Oh, hey — you look like you're looking for something. Can I help?",
        minTurns: 2,
      },
      {
        id: "small-talk",
        title: "Small talk at the market",
        systemPrompt:
          "You are Priya, a friendly stranger browsing the same stall as the learner at the weekend market. Strike up casual small talk (what brought them to the city, what they're looking for, weekend plans). Ask short, warm follow-up questions. If it fits naturally you can mention that markets get busy on weekend mornings, but don't force continuity. Stay in character.",
        opener: "This stall has the best honey in the city — have you tried it yet?",
        minTurns: 3,
      },
    ],
  },
];

export function getCampaign(id: string) {
  return CAMPAIGNS.find((c) => c.id === id);
}
