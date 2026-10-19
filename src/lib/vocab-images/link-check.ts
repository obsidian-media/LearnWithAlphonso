export type LinkResult = {
  url: string;
  ok: boolean;
  status: number | null;
  method: "HEAD" | "GET";
  detail?: string;
};
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const HEAD_UNSUPPORTED = new Set([400, 405, 501]);
const RETRYABLE_STATUSES = new Set([429]);
const MAX_RETRIES = 3;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, init);
    const retryable = RETRYABLE_STATUSES.has(response.status) || response.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) return response;

    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const delayMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
        ? Math.min(retryAfterSeconds * 1000, 5000)
        : 250 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function judge(url: string, res: Response, method: "HEAD" | "GET"): LinkResult {
  const type = res.headers.get("content-type") ?? "";
  const statusOk = res.status === 200 || (method === "GET" && res.status === 206);
  const ok = statusOk && type.startsWith("image/");
  return {
    url,
    ok,
    status: res.status,
    method,
    detail: ok ? undefined : `status ${res.status}, content-type "${type}"`,
  };
}

export async function probeUrl(url: string, fetchImpl: FetchLike = fetch): Promise<LinkResult> {
  try {
    const head = await fetchWithRetry(url, { method: "HEAD", redirect: "manual" }, fetchImpl);
    if (!HEAD_UNSUPPORTED.has(head.status)) return judge(url, head, "HEAD");
    const get = await fetchWithRetry(
      url,
      { method: "GET", redirect: "manual", headers: { Range: "bytes=0-0" } },
      fetchImpl,
    );
    await get.body?.cancel();
    return judge(url, get, "GET");
  } catch (e) {
    return {
      url,
      ok: false,
      status: null,
      method: "HEAD",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function checkAll(
  urls: string[],
  {
    concurrency = 8,
    fetchImpl = fetch as FetchLike,
  }: { concurrency?: number; fetchImpl?: FetchLike } = {},
): Promise<LinkResult[]> {
  const results: LinkResult[] = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      results[i] = await probeUrl(urls[i], fetchImpl);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}

export function summarize(results: LinkResult[]): { ok: number; failed: LinkResult[] } {
  return { ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
}
