// A device token goes straight into the APNs request path
// (`${host}/3/device/${token}`). Rows in device_tokens are written by the
// signed-in user, so the value is untrusted: anything that is not plain hex
// (a "/", "..", "?", "#", whitespace) could redirect the request to a
// different APNs endpoint. APNs tokens are hex; today they are 32 bytes
// (64 chars) and Apple warns the size may grow, so allow a bounded range
// instead of pinning exactly 64.
const APNS_TOKEN = /^[0-9a-fA-F]{64,200}$/;

export function isValidApnsToken(token: unknown): token is string {
  return typeof token === "string" && APNS_TOKEN.test(token);
}
