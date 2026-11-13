import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { adminWhoAmI } from "@/lib/admin.functions";
import {
  staffAddNote,
  staffBanUser,
  staffBlockUser,
  staffDeleteUser,
  staffGetUser,
  staffGrantPro,
  staffRevokePro,
  staffUnbanUser,
  staffUnblockUser,
} from "@/lib/staff-users.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import type { UserAction } from "@/lib/staff-actions";
import type { ActionInput } from "@/components/staff/ActionDialog";
import { LearnerView } from "@/components/staff/LearnerView";

export const Route = createFileRoute("/users/$id")({
  loader: async ({ params }) => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("users.read")) return { forbidden: true as const };
      // Opening the page is recorded in the action record before any facts come back.
      return {
        forbidden: false as const,
        facts: await staffGetUser({ data: { id: params.id } }),
        scopes: me.scopes,
      };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Learner,
});

function Learner() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [dialog, setDialog] = useState<UserAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (data.forbidden) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-ink-soft">You do not have access to this page.</p>
      </main>
    );
  }
  const { facts, scopes } = data;

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      const partial = (result as { partial?: string[] } | undefined)?.partial ?? [];
      setNotice(
        partial.length > 0
          ? `${done} These steps need follow-up (see the action record): ${partial.join(", ")}.`
          : done,
      );
      setDialog(null);
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  function submit(input: ActionInput) {
    const id = facts.id;
    const { reason, confirmEmail, days } = input;
    switch (dialog) {
      case "gift":
        return run(
          () => staffGrantPro({ data: { id, days, reason } }),
          `Gave Pro for ${days} days.`,
        );
      case "revoke_gift":
        return run(() => staffRevokePro({ data: { id, reason } }), "Ended the gifted Pro.");
      case "block":
        return run(() => staffBlockUser({ data: { id, reason } }), "Blocked.");
      case "unblock":
        return run(() => staffUnblockUser({ data: { id, reason } }), "Block lifted.");
      case "ban":
        return run(() => staffBanUser({ data: { id, reason, confirmEmail } }), "Banned.");
      case "unban":
        return run(() => staffUnbanUser({ data: { id, reason } }), "Ban lifted.");
      case "delete":
        return run(async () => {
          const result = await staffDeleteUser({ data: { id, reason, confirmEmail } });
          window.location.assign("/users");
          return result;
        }, "Deleted.");
      default:
        return undefined;
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <LearnerView
        facts={facts}
        scopes={scopes}
        dialog={dialog}
        busy={busy}
        error={error}
        notice={notice}
        onAction={(action) => {
          setError(null);
          setDialog(action);
        }}
        onCancelDialog={() => setDialog(null)}
        onSubmitDialog={submit}
        onAddNote={(body) =>
          run(() => staffAddNote({ data: { id: facts.id, body } }), "Note added.")
        }
      />
    </main>
  );
}
