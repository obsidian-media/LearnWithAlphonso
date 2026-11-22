import type { NumbersResponse, WindowDays } from "../../../lib/numbers-core";

/**
 * Everything the Numbers screen calls, as one object the route fills with the real server function. The screen never
 * imports a server function itself, so a test can hand it fakes. The function checks the person's scopes on the server
 * and returns only the groups they may see; a group that is absent here is not hidden by the page, it was never sent.
 */
export type NumbersApi = {
  get: (windowDays: WindowDays, refresh: boolean) => Promise<NumbersResponse>;
};
