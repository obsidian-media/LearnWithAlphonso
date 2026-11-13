import { createFileRoute } from "@tanstack/react-router";
import { RoadScreen } from "../../components/path/PathScreens";

export const Route = createFileRoute("/_authenticated/path")({
  component: RoadScreen,
  head: () => ({ meta: [{ title: "My path — Alphonso" }] }),
});
