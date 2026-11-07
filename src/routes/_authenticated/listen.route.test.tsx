// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/AppShell", () => ({
  MobileFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../components/PodcastQuizLauncher", () => ({ PodcastQuizLauncher: () => null }));

afterEach(cleanup);

async function renderAt(path: string) {
  const { ListenPage } = await import("./listen");
  const root = createRootRoute();
  const listen = createRoute({ getParentRoute: () => root, path: "listen", component: ListenPage });
  const folder = createRoute({
    getParentRoute: () => listen,
    path: "$",
    component: () => <p>folder page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([listen.addChildren([folder])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

describe("the Listen parent route", () => {
  it("renders the folder route for a folder URL, so a folder opens", async () => {
    await renderAt("/listen/en");
    expect(await screen.findByText("folder page")).toBeInTheDocument();
  });
});
