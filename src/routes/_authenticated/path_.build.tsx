import { createFileRoute } from "@tanstack/react-router";
import { BuildScreen } from "../../components/path/PathScreens";

export const Route = createFileRoute("/_authenticated/path_/build")({
  component: BuildScreen,
  head: () => ({ meta: [{ title: "Build my path — Alphonso" }] }),
});
