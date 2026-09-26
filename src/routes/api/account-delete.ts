import { createFileRoute } from "@tanstack/react-router";
import { deleteMyAccount } from "@/lib/account.functions";

function statusFor(message: string): number {
  if (message.startsWith("Unauthorized")) return 401;
  if (message.startsWith("Missing Supabase environment variable")) return 500;
  return 400;
}

// Plain HTTP wrapper around deleteMyAccount (src/lib/account.functions.ts)
// -- see account-export.ts's header comment for why this exists instead of
// a second, iOS-only deletion path: USER_DELETE_TABLES and the
// friendships/auth.admin.deleteUser cleanup all stay defined exactly once,
// in account.functions.ts, for both clients.
export const Route = createFileRoute("/api/account-delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { confirm?: unknown };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        try {
          // Cast, not a trust boundary: deleteMyAccount's own zod schema
          // (account.functions.ts) re-validates this is the literal
          // "DELETE" string and throws otherwise -- same "validate at the
          // real boundary" pattern its inputValidator already uses for its
          // own `(d: unknown)` parameter.
          const result = await deleteMyAccount({ data: { confirm: body.confirm as "DELETE" } });
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Deletion failed";
          return Response.json({ error: message }, { status: statusFor(message) });
        }
      },
    },
  },
});
