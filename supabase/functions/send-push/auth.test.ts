// Run with `deno test supabase/functions/send-push/auth.test.ts`.
import { assertEquals } from "jsr:@std/assert@1";
import { isAuthorizedPushCaller } from "./auth.ts";

const SECRET = "s".repeat(48);
const SERVICE = "service-role-key-value";

const req = (headers: Record<string, string>) =>
  new Request("https://x/functions/v1/send-push", { method: "POST", headers });

Deno.test("accepts the dedicated push secret header", () => {
  assertEquals(
    isAuthorizedPushCaller(req({ "x-send-push-secret": SECRET }), { pushSecret: SECRET, serviceRoleKey: SERVICE }),
    true,
  );
});

Deno.test("rejects a wrong push secret, including one that only shares a prefix", () => {
  for (const given of ["", "nope", SECRET.slice(0, -1), `${SECRET}x`]) {
    assertEquals(
      isAuthorizedPushCaller(req({ "x-send-push-secret": given }), { pushSecret: SECRET, serviceRoleKey: SERVICE }),
      false,
      given,
    );
  }
});

Deno.test("still accepts the service role bearer while the trigger is switched over", () => {
  assertEquals(
    isAuthorizedPushCaller(req({ authorization: `Bearer ${SERVICE}` }), { pushSecret: SECRET, serviceRoleKey: SERVICE }),
    true,
  );
});

Deno.test("rejects a request with no credential, or an ordinary user token", () => {
  assertEquals(isAuthorizedPushCaller(req({}), { pushSecret: SECRET, serviceRoleKey: SERVICE }), false);
  assertEquals(
    isAuthorizedPushCaller(req({ authorization: "Bearer eyJ.user.jwt" }), { pushSecret: SECRET, serviceRoleKey: SERVICE }),
    false,
  );
});

Deno.test("a push secret shorter than 32 characters is treated as not configured", () => {
  assertEquals(
    isAuthorizedPushCaller(req({ "x-send-push-secret": "short" }), { pushSecret: "short", serviceRoleKey: SERVICE }),
    false,
  );
});

Deno.test("nothing is accepted when neither credential is configured", () => {
  assertEquals(isAuthorizedPushCaller(req({ authorization: "Bearer " }), {}), false);
  assertEquals(isAuthorizedPushCaller(req({ "x-send-push-secret": "" }), {}), false);
});
