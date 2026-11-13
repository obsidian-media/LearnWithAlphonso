import { createFileRoute } from "@tanstack/react-router";
import { WeekScreen } from "../../components/path/PathScreens";

export const Route = createFileRoute("/_authenticated/path_/week")({
  component: WeekScreen,
  head: () => ({ meta: [{ title: "My week — Alphonso" }] }),
});
