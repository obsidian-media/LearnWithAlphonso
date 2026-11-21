/**
 * Calls a database function by name without the generated types knowing it yet. A migration's new function is not in
 * src/integrations/supabase/types.ts until the PR's types job regenerates that file (never edited by hand), so the typed
 * rpc() would refuse the name. Once regenerated the typed call would also compile; this stays correct either way.
 */
export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

export function callRpc(client: unknown, name: string, args: Record<string, unknown>) {
  return (
    client as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult> }
  ).rpc(name, args);
}
