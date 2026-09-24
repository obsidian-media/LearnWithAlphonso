import { createFileRoute } from "@tanstack/react-router";
import { MobileFrame } from "../../components/AppShell";
import { ListenBrowser } from "./listen";

/**
 * One splat route serves the whole folder tree at any depth -- which is
 * what the arbitrary-nesting data model buys. `/listen/en/a1/cafe` and
 * `/listen/en` both land here and differ only in their segments.
 */
export const Route = createFileRoute("/_authenticated/listen/$")({
  component: ListenFolderPage,
  head: () => ({
    meta: [
      { title: "Listen — Alphonso" },
      {
        name: "description",
        content: "Short audio episodes to practise listening, organised by course and level.",
      },
    ],
  }),
});

function ListenFolderPage() {
  const { _splat } = Route.useParams();
  const segments = (_splat ?? "").split("/").filter(Boolean);
  return (
    <MobileFrame>
      <ListenBrowser segments={segments} />
    </MobileFrame>
  );
}
