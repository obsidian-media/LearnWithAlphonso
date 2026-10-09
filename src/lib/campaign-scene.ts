/**
 * The scene a campaign message belongs to: scenes start at their opener, so it is the number of openers up to and
 * including the message, minus one. A report records this, not the scene the learner is on now. Mirrors
 * `ConversationSnapshot.sceneIndex(ofTurnAt:)` on iOS.
 */
export function sceneIndexOfMessage(
  messages: readonly { opener?: boolean }[],
  index: number,
): number {
  let openers = 0;
  for (let i = 0; i <= index && i < messages.length; i++) if (messages[i].opener) openers += 1;
  return Math.max(0, openers - 1);
}
