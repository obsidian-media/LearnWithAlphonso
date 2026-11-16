/**
 * Sign out of the console: end the Supabase session first, then leave for the sign-in page. The page is left even
 * when ending the session fails, because staying on a console page after pressing Sign out reads as "still signed in".
 */
export async function signOutAndLeave(
  auth: { signOut: () => Promise<unknown> },
  go: (path: string) => void,
): Promise<void> {
  try {
    await auth.signOut();
  } catch {
    // The page is left either way; a session that survived is picked up again by the sign-in page.
  }
  go("/signin");
}
