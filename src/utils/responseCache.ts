interface ResponseData {
  body: ArrayBuffer | null;
  status: number;
  statusText: string;
  headers: [string, string][];
}

interface PendingResponse {
  response: Promise<ResponseData>;
  invalidated: boolean;
  cacheWrite?: Promise<void>;
}

// Only retain pending work; completed responses belong in the edge cache.
const pendingResponses = new Map<string, PendingResponse>();

export const getCachedResponse = async (
  cacheKey: Request,
  ctx: ExecutionContext,
  createResponse: () => Promise<Response>,
): Promise<Response> => {
  const cache = caches.default;
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  let pending = pendingResponses.get(cacheKey.url);
  if (!pending) {
    const entry: PendingResponse = {
      invalidated: false,
      // Workers streams belong to their creating request. Share only buffered
      // data, then construct each response in its caller's request context.
      response: Promise.resolve().then(async () => {
        const response = await createResponse();
        return {
          body: response.body === null ? null : await response.arrayBuffer(),
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers],
        };
      }),
    };
    pending = entry;
    pendingResponses.set(cacheKey.url, entry);

    ctx.waitUntil(
      (async () => {
        try {
          const response = await entry.response;
          if (
            response.status >= 200 &&
            response.status < 300 &&
            !entry.invalidated
          ) {
            entry.cacheWrite = cache.put(
              cacheKey,
              new Response(response.body, response),
            );
            await entry.cacheWrite;
          }
        } finally {
          if (pendingResponses.get(cacheKey.url) === entry) {
            pendingResponses.delete(cacheKey.url);
          }
        }
      })(),
    );
  }

  const response = await pending.response;
  return new Response(response.body, response);
};

export const invalidateCachedResponse = async (cacheKey: Request) => {
  const pending = pendingResponses.get(cacheKey.url);
  if (pending) {
    pending.invalidated = true;
    pendingResponses.delete(cacheKey.url);
    // An already-started cache write must finish before it can be purged.
    await pending.cacheWrite?.catch(() => {});
  }
  await caches.default.delete(cacheKey);
};
