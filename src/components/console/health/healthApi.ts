import type { HealthData } from "../../../lib/health-core";

/**
 * Everything the Health screen calls, as one object the route fills with the real server function. The screen never
 * imports a server function itself, so a test can hand it fakes. The function runs the live checks on the server
 * (each call is a fresh check), gated by numbers.read.
 */
export type HealthApi = {
  get: () => Promise<HealthData>;
};
