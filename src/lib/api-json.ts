/**
 * The JSON response every authenticated /api/* route builds. It carries `Cache-Control: no-store`, so a browser, a
 * proxy or a CDN never keeps (or serves to someone else) an answer that is about one signed-in learner. A route that
 * sets its own Cache-Control keeps it (the helper only fills the gap). Pure, so route tests that mock the server
 * modules keep the real header.
 *
 * src/lib/api-no-store.test.ts reads every authenticated route and fails if one builds its JSON any other way.
 */
export function noStoreJson(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}
