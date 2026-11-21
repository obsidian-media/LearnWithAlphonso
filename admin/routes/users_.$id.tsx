import { createFileRoute, redirect } from "@tanstack/react-router";

// The old address of one learner. The learner now opens inside the Users screen (/users?u=<id>), so a saved link or a
// bookmark keeps working. The trailing underscore keeps this from nesting under users.tsx.
export const Route = createFileRoute("/users_/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/users", search: { u: params.id } });
  },
});
