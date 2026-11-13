import { createFileRoute } from "@tanstack/react-router";
import { WhyScreen } from "../../components/path/PathScreens";

export const Route = createFileRoute("/_authenticated/path_/why")({
  component: WhyScreen,
  head: () => ({ meta: [{ title: "Why this mix — Alphonso" }] }),
});
