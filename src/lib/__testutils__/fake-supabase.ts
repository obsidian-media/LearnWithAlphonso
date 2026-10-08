/**
 * A permissive fake Supabase client for route-level integration tests: auth resolves one user, the AI quota RPCs
 * allow, ai_output_blocked says "clean", profiles.ai_consent_at comes from `state`, every other read is empty and
 * every write succeeds. Only the consent value varies between tests.
 */
export type FakeSupabaseState = {
  userId: string;
  consentAt: string | null;
  rpcCalls: string[];
  consentReads: number;
  /** When true the consent read fails, like a database timeout. */
  consentReadError?: boolean;
};

export function makeFakeSupabase(state: FakeSupabaseState) {
  const query = (table: string) => {
    let columns = "";
    let countMode = false;
    const chain: Record<string, unknown> = {};
    const terminal = async () => {
      if (table === "profiles" && columns.includes("ai_consent_at")) {
        state.consentReads += 1;
        if (state.consentReadError) return { data: null, error: { message: "timeout" } };
        return { data: { ai_consent_at: state.consentAt }, error: null };
      }
      return { data: null, error: null, count: countMode ? 0 : null };
    };
    for (const name of [
      "eq",
      "neq",
      "in",
      "order",
      "limit",
      "insert",
      "update",
      "upsert",
      "delete",
      "gte",
      "lte",
      "is",
    ]) {
      chain[name] = () => chain;
    }
    chain.select = (cols: string, opts?: { count?: string }) => {
      columns = cols ?? "";
      countMode = !!opts?.count;
      return chain;
    };
    chain.maybeSingle = terminal;
    chain.single = terminal;
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      terminal().then(resolve, reject);
    return chain;
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: state.userId } }, error: null }),
      getClaims: async () => ({ data: { claims: { sub: state.userId } }, error: null }),
    },
    rpc: async (name: string, args?: { _texts?: string[] }) => {
      state.rpcCalls.push(name);
      if (name === "consume_ai_rate_limit" || name === "consume_ai_quota") {
        return { data: [{ allowed: true, used: 1 }], error: null };
      }
      if (name === "ai_output_blocked") {
        return { data: (args?._texts ?? []).map(() => false), error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => query(table),
  };
}
