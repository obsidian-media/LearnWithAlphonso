// Run with `deno test supabase/functions/_shared/apns-token.test.ts`.
import { assertEquals } from "jsr:@std/assert@1";
import { isValidApnsToken } from "./apns-token.ts";

const hex64 = "ab12".repeat(16);

Deno.test("accepts a real-shaped 64-char hex token (either case)", () => {
  assertEquals(isValidApnsToken(hex64), true);
  assertEquals(isValidApnsToken(hex64.toUpperCase()), true);
});

Deno.test("accepts longer hex tokens up to the bound, rejects beyond it", () => {
  assertEquals(isValidApnsToken("a".repeat(200)), true);
  assertEquals(isValidApnsToken("a".repeat(201)), false);
});

Deno.test("rejects tokens that are too short", () => {
  assertEquals(isValidApnsToken(""), false);
  assertEquals(isValidApnsToken("a".repeat(63)), false);
});

Deno.test("rejects path / query / host tricks", () => {
  for (const bad of [
    `${hex64}/../../x`,
    `../${hex64}`,
    `${hex64}?x=1`,
    `${hex64}#frag`,
    `${hex64}\n`,
    ` ${hex64}`,
    `${hex64}%2f..`,
    `${hex64.slice(0, 60)}/../`,
    "g".repeat(64),
  ]) {
    assertEquals(isValidApnsToken(bad), false, bad);
  }
});

Deno.test("rejects non-strings", () => {
  for (const bad of [null, undefined, 42, {}, [hex64]]) {
    assertEquals(isValidApnsToken(bad), false);
  }
});
