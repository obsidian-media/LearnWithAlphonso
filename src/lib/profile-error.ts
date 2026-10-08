/** confirm_display_name raises P0001 with the code as the message; anything else is a server failure. */
export function profileErrorCode(
  error: { message?: string } | null,
): "blocked-content" | "invalid-name" | "server-error" {
  if (error?.message === "blocked-content") return "blocked-content";
  if (error?.message === "invalid-name") return "invalid-name";
  return "server-error";
}
