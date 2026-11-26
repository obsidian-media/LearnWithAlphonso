/**
 * Rehearsals ship dark. The flag is a server env var, off unless it is exactly "true", so web and the native apps
 * (which read it from the API) all switch together. Turned on by the launch slice, not before.
 */
export const REHEARSALS_FLAG = "REHEARSALS_ENABLED";

export const rehearsalsEnabled = (): boolean => process.env[REHEARSALS_FLAG] === "true";
