/**
 * The rollback half of "publish copies a private file into a public bucket, then flips the row".
 *
 * If the flip fails, the public copy must go again, or a draft (private until published) stays reachable by URL. That
 * removal used to be unchecked: a storage error was ignored and the caller rethrew the flip error as if everything was
 * undone. Now a failed removal is never silent. It is logged as one structured line, reported to the caller's hook (the
 * admin function writes an ops_events row, which the System health page and the owner alert read), and thrown with
 * `operator: cleanup_failed <bucket>/<path>` so the person publishing sees exactly what to remove by hand.
 */
export const CLEANUP_FAILED = "operator: cleanup_failed";

export type CleanupFailure = { bucket: string; paths: string[]; message: string };
/** Called once when a rollback removal failed. Must not be relied on to succeed: its own errors are swallowed. */
export type CleanupReporter = (failure: CleanupFailure) => void | Promise<void>;

type RemoveClient = {
  from(bucket: string): {
    remove(paths: string[]): Promise<{ error: { message: string } | null }>;
  };
};

/**
 * Removes `paths` from `bucket` after a failed publish. Returns normally when they are gone. When the removal fails
 * (an error result or a throw) it reports and throws an Error that names every path left behind and carries the
 * original failure, so the caller never rethrows a flip error while a draft sits in public storage.
 */
export async function removeAfterFailedPublish(args: {
  storage: RemoveClient;
  bucket: string;
  paths: string[];
  cause: unknown;
  onCleanupFailed?: CleanupReporter;
}): Promise<void> {
  const { storage, bucket, paths, cause } = args;
  if (paths.length === 0) return;
  let removeMessage: string | null = null;
  try {
    const { error } = await storage.from(bucket).remove(paths);
    if (error) removeMessage = error.message;
  } catch (e) {
    removeMessage = e instanceof Error ? e.message : "remove threw";
  }
  if (removeMessage === null) return;

  const failure: CleanupFailure = { bucket, paths, message: removeMessage };
  console.error(JSON.stringify({ event: "publish_cleanup_failed", bucket, paths }));
  try {
    await args.onCleanupFailed?.(failure);
  } catch {
    // The report is best effort; the thrown error below is what the operator sees.
  }
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  throw new Error(
    `${CLEANUP_FAILED} ${paths.map((p) => `${bucket}/${p}`).join(", ")}: publishing failed (${causeMessage}) and removing the public copy also failed (${removeMessage}). Remove it by hand: it is a draft that is now publicly reachable.`,
  );
}
