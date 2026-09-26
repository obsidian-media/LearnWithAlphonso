import { createFileRoute } from "@tanstack/react-router";
import { exportMyData } from "@/lib/account.functions";

function statusFor(message: string): number {
  if (message.startsWith("Unauthorized")) return 401;
  return 500;
}

// Plain HTTP wrapper around exportMyData (src/lib/account.functions.ts) --
// same shape as api/chat.ts/api/analyze-weaknesses.ts, added so iOS (which
// has no access to the web app's internal server-function RPC layer) can
// call the *same* GDPR export the web profile page already uses, instead of
// a second implementation. requireSupabaseAuth (inside exportMyData) reads
// the Authorization header off this same in-flight request via
// @tanstack/react-start's getRequest(), so no auth wiring is needed here.
//
// Reshapes the result the same way profile.tsx's download() already does
// client-side -- {exported_at, user_id, ...tables} -- so iOS gets one flat,
// ready-to-save JSON document instead of having to re-parse the nested
// `tables` string itself.
export const Route = createFileRoute("/api/account-export")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await exportMyData();
          const tables = JSON.parse(result.tables) as Record<string, unknown>;
          return Response.json({
            exported_at: result.exported_at,
            user_id: result.user_id,
            ...tables,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Export failed";
          return Response.json({ error: message }, { status: statusFor(message) });
        }
      },
    },
  },
});
