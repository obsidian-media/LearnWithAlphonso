import { createFileRoute, redirect } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import {
  staffAddNote,
  staffBanUser,
  staffBlockUser,
  staffDeleteUser,
  staffGetUser,
  staffGrantPro,
  staffRevokePro,
  staffSearchUsers,
  staffUnbanUser,
  staffUnblockUser,
} from "@/lib/staff-users.functions";
import { classifyStaffError } from "@/lib/staff-route-errors";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { UsersScreen } from "@/components/console/users/UsersScreen";
import type { UsersApi } from "@/components/console/users/usersApi";

/** The Users screen's calls: the existing server functions, each of which checks its own scope and asks for its reason. */
const api: UsersApi = {
  search: (q) => staffSearchUsers({ data: { q } }),
  getUser: (id) => staffGetUser({ data: { id } }),
  addNote: (id, body) => staffAddNote({ data: { id, body } }),
  grantPro: (id, days, reason) => staffGrantPro({ data: { id, days, reason } }),
  revokePro: (id, reason) => staffRevokePro({ data: { id, reason } }),
  block: (id, reason) => staffBlockUser({ data: { id, reason } }),
  unblock: (id, reason) => staffUnblockUser({ data: { id, reason } }),
  ban: (id, reason, confirmEmail) => staffBanUser({ data: { id, reason, confirmEmail } }),
  unban: (id, reason) => staffUnbanUser({ data: { id, reason } }),
  deleteUser: (id, reason, confirmEmail) => staffDeleteUser({ data: { id, reason, confirmEmail } }),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/users")({
  // No server-side render for this page: who is signed in lives in the browser (a server render has no session), so the
  // identity check in the loader runs there, never on the server. Otherwise every full load looked signed out.
  ssr: false,
  // `u` is the open learner, so a link to one learner (the old /users/<id>) lands on the same screen.
  validateSearch: (search: Record<string, unknown>): { u?: string } =>
    typeof search.u === "string" && UUID.test(search.u) ? { u: search.u } : {},
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("users.read")) return { forbidden: true as const };
      return {
        forbidden: false as const,
        me: { displayName: me.displayName, role: me.role, scopes: me.scopes },
      };
    } catch (e) {
      if (classifyStaffError(e) === "forbidden") return { forbidden: true as const };
      throw redirect({ to: "/signin" });
    }
  },
  component: Users,
});

function Users() {
  const data = Route.useLoaderData();
  const { u } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (data.forbidden) return <ForbiddenCard title="Users" scope="users.read" />;
  return (
    <UsersScreen
      me={data.me}
      api={api}
      selectedId={u ?? null}
      onSelect={(id) => void navigate({ search: id ? { u: id } : {} })}
    />
  );
}
