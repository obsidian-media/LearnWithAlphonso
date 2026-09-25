import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// The admin equivalent of src/router.tsx. No QueryClient context: the
// learner app threads one through for its caching layer, and the admin
// screens load through route loaders and invalidate on write, which is
// the whole caching story a single-operator tool needs.
export const getRouter = () => {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
};
