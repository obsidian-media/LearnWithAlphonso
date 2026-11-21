import { createFileRoute, redirect } from "@tanstack/react-router";

// The old address of one ticket. The ticket now opens inside the Support screen (/support?t=<id>), so a saved link or a
// bookmark keeps working. The trailing underscore keeps this from nesting under support.tsx.
export const Route = createFileRoute("/support_/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/support", search: { t: params.id } });
  },
});
