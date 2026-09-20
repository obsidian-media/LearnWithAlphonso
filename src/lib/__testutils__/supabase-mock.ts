import { vi } from "vitest";

/**
 * A Supabase query-builder chain (`.from(t).select().eq().eq()...`) is
 * itself a thenable that resolves to `{ data, error, count }` whether or
 * not a terminal like `.maybeSingle()`/`.single()` is called. This proxy
 * lets a test set the *final* resolved value for one `.from()`/`.rpc()`
 * call without re-implementing every chain method the real client
 * exposes: any property access returns a function that returns the same
 * proxy again, and awaiting it (or calling `.then`) resolves to `result`.
 */
export type ChainCall = { method: string; args: unknown[] };

/** A chain built by `chainable()` also records every method call it
 * received (name + args) on `calls`, so a test can assert what a handler
 * actually sent to `.upsert()`/`.update()`/etc. without a bespoke spy per
 * call site. */
export function chainable(result: unknown, calls: ChainCall[] = []) {
  const target = () => {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      if (prop === "catch") {
        return (reject: (e: unknown) => unknown) => Promise.resolve(result).catch(reject);
      }
      if (prop === "calls") return calls;
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  });
  return proxy as { calls: ChainCall[] };
}

/**
 * A fake Supabase client whose `.from`/`.rpc` are `vi.fn()`s the test
 * queues per-call results onto (via `mockReturnValueOnce(chainable(...))`),
 * matching the exact call order a handler under test makes -- this keeps
 * assertions honest about what each handler actually reads/writes instead
 * of stubbing a single blanket response for every table.
 */
/**
 * The real `createServerFn().handler(fn)` export types as a client fetcher
 * (`data` only -- no `context`, that's server-internal) even though the
 * `createServerFn` mock in these tests makes it callable with `{ data,
 * context }` at runtime. Casts a module namespace so its members can be
 * invoked that way without an `as unknown as ...` at every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyServerFn = (opts: any) => Promise<any>;

export function asTestFns<T extends Record<string, AnyServerFn>>(
  mod: T,
): { [K in keyof T]: (opts: { data?: unknown; context?: unknown }) => ReturnType<T[K]> } {
  return mod as never;
}

export function createSupabaseMock() {
  return {
    // Defaults to an empty-but-valid response so a handler's trailing
    // .from() calls a test doesn't care about (e.g. a conditional
    // achievements upsert) don't throw "undefined" -- override the ones
    // that matter with .mockReturnValueOnce(chainable(...)).
    from: vi.fn().mockReturnValue(chainable({ data: null, error: null })),
    rpc: vi.fn(),
  };
}
