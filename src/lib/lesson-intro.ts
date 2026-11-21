const KINDS: [type: string, phrase: string][] = [
  ["mc", "pick"],
  ["fill", "fill in"],
  ["reorder", "put in order"],
  ["listening", "listen"],
  ["speak", "say it back"],
  ["translate", "translate"],
];

/**
 * What the lesson overview promises, from the question types the lesson really has ("pick, fill in, listen"), so the
 * intro never offers speaking or listening that the lesson does not contain.
 */
export function practiceKinds(types: readonly string[]): string {
  const present = new Set(types);
  const phrases = KINDS.filter(([t]) => present.has(t)).map(([, p]) => p);
  return phrases.length > 0 ? phrases.join(", ") : "pick";
}
