import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import Domains from "../models/domains";
import type { Env } from "../types";
import { MAX_REQUEST_BODY_BYTES } from "../utils/inputLimits";
import worker, { cacheKeyFor } from "../worker";

const setup = (t: TestContext) => {
  const entries = new Map<string, Response>();
  const pending: Promise<unknown>[] = [];
  const cache = {
    match: async (key: Request) => entries.get(key.url)?.clone(),
    put: async (key: Request, response: Response) => {
      entries.set(key.url, response);
    },
    delete: async (key: Request) => entries.delete(key.url),
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { default: cache },
  });
  t.after(() => {
    if (original) {
      Object.defineProperty(globalThis, "caches", original);
    } else {
      Reflect.deleteProperty(globalThis, "caches");
    }
  });
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  } as unknown as ExecutionContext;
  const env = {} as Env;
  const url = "https://anubisdb.com/subdomains/example.com";
  return {
    cache,
    flush: () => Promise.all(pending.splice(0)),
    get: () => worker.fetch(new Request(url), env, ctx),
    post: (subdomains: string[]) =>
      worker.fetch(
        new Request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subdomains }),
        }),
        env,
        ctx,
      ),
    request: (request: Request) => worker.fetch(request, env, ctx),
    url,
  };
};

test("production origin aliases share cached reads and POST invalidation", async (t) => {
  const { request, flush } = setup(t);
  let values = ["old.example.com"];
  const read = t.mock.method(Domains, "getSubdomains", async () => values);
  t.mock.method(
    Domains,
    "addSubdomainsToDomain",
    async (_db, domain, subdomains) => {
      values = [...values, ...subdomains];
      return {
        domain,
        created: false,
        acceptedSubdomainCount: subdomains.length,
        insertedSubdomainCount: subdomains.length,
      };
    },
  );
  const aliases = [
    "https://anubisdb.com/subdomains/example.com",
    "https://www.anubisdb.com/anubis/subdomains/Example.COM./?source=www",
    "http://anubisdb.com/subdomains/example.com?source=http",
    "http://www.anubisdb.com/subdomains/example.com",
  ];
  for (const url of aliases) {
    assert.deepEqual(await (await request(new Request(url))).json(), values);
    await flush();
  }
  assert.equal(read.mock.callCount(), 1);

  const submitted = await request(
    new Request(aliases[1], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subdomains: ["new.example.com"] }),
    }),
  );
  assert.equal(submitted.status, 200);
  await flush();

  for (const url of aliases) {
    assert.deepEqual(await (await request(new Request(url))).json(), values);
    await flush();
  }
  assert.equal(read.mock.callCount(), 2);
});

test("static homepage aliases and query strings share one cached response", async (t) => {
  const { cache, request, flush } = setup(t);
  const put = t.mock.method(cache, "put");
  let homepage: string | undefined;
  for (const url of [
    "https://anubisdb.com/",
    "https://www.anubisdb.com/?source=www",
    "http://anubisdb.com/anubis?source=legacy",
    "http://www.anubisdb.com/anubis/?source=http",
  ]) {
    const response = await request(new Request(url));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type") ?? "", /text\/html/);
    const body = await response.text();
    homepage ??= body;
    assert.equal(body, homepage);
    await flush();
  }
  assert.equal(put.mock.callCount(), 1);
});

test("custom origins retain independent cache namespaces", () => {
  for (const origin of [
    "http://localhost:8787",
    "https://custom.example",
    "https://anubisdb.com.other.example",
    "http://anubisdb.com:8787",
  ]) {
    assert.equal(
      cacheKeyFor(
        new Request(`${origin}/anubis/subdomains/Example.COM./?source=test`),
      ).url,
      `${origin}/subdomains/example.com`,
    );
  }
});

test("empty, duplicate, and unrelated submissions retain a warm cache", async (t) => {
  const { get, post, flush } = setup(t);
  const read = t.mock.method(Domains, "getSubdomains", async () => [
    "www.example.com",
  ]);
  t.mock.method(
    Domains,
    "addSubdomainsToDomain",
    async (_db, domain, values) => ({
      domain,
      created: false,
      acceptedSubdomainCount: values.length,
      insertedSubdomainCount: 0,
    }),
  );
  await get();
  await flush();
  for (const values of [[], ["www.example.com"], ["www.unrelated.com"]]) {
    assert.equal((await post(values)).status, 200);
    await flush();
    assert.deepEqual(await (await get()).json(), ["www.example.com"]);
  }
  assert.equal(read.mock.callCount(), 1);
});

test("50 simultaneous cache misses share one read and separate response bodies", async (t) => {
  const { get, flush } = setup(t);
  const gate = Promise.withResolvers<string[]>();
  const read = t.mock.method(Domains, "getSubdomains", () => gate.promise);
  const requests = Array.from({ length: 50 }, () => get());
  await setImmediate();
  assert.equal(read.mock.callCount(), 1);
  gate.resolve(["www.example.com"]);
  const bodies = await Promise.all(
    requests.map(async (request) => (await request).json()),
  );
  assert.ok(
    bodies.every((body) => JSON.stringify(body) === '["www.example.com"]'),
  );
  await flush();
  assert.deepEqual(await (await get()).json(), ["www.example.com"]);
  assert.equal(read.mock.callCount(), 1);
});

test("failed cache fills release their pending entry for a later retry", async (t) => {
  const { get, flush } = setup(t);
  t.mock.method(console, "error", () => {});
  let fail = true;
  const read = t.mock.method(Domains, "getSubdomains", async () => {
    if (fail) {
      throw new Error("Temporary database failure");
    }
    return ["www.example.com"];
  });
  assert.equal((await get()).status, 500);
  await flush();
  fail = false;
  assert.equal((await get()).status, 200);
  await flush();
  assert.equal(read.mock.callCount(), 2);
});

test("cache write failures do not leave a pending response retained", async (t) => {
  const { cache, get, flush } = setup(t);
  const originalPut = cache.put;
  let fail = true;
  t.mock.method(cache, "put", async (key, response) => {
    if (fail) {
      throw new Error("Cache unavailable");
    }
    return originalPut(key, response);
  });
  const read = t.mock.method(Domains, "getSubdomains", async () => [
    "www.example.com",
  ]);
  assert.equal((await get()).status, 200);
  await assert.rejects(flush(), /Cache unavailable/);
  fail = false;
  assert.equal((await get()).status, 200);
  await flush();
  assert.deepEqual(await (await get()).json(), ["www.example.com"]);
  assert.equal(read.mock.callCount(), 2);
});

test("a POST invalidates an older pending GET without letting it refill the cache", async (t) => {
  const { get, post, flush } = setup(t);
  const oldRead = Promise.withResolvers<string[]>();
  let current = ["old.example.com"];
  let calls = 0;
  t.mock.method(Domains, "getSubdomains", async () => {
    calls += 1;
    return calls === 1 ? oldRead.promise : current;
  });
  t.mock.method(
    Domains,
    "addSubdomainsToDomain",
    async (_db, domain, values) => {
      current = [...current, ...values];
      return {
        domain,
        created: false,
        acceptedSubdomainCount: values.length,
        insertedSubdomainCount: values.length,
      };
    },
  );
  const oldResponse = get();
  await setImmediate();
  assert.equal((await post(["new.example.com"])).status, 200);
  assert.deepEqual(await (await get()).json(), current);
  oldRead.resolve(["old.example.com"]);
  await oldResponse;
  await flush();
  assert.deepEqual(await (await get()).json(), current);
  assert.equal(calls, 2);
});

test("invalidation waits for an already-started cache write before purging it", async (t) => {
  const { cache, get, post, flush } = setup(t);
  const writeGate = Promise.withResolvers<void>();
  const originalPut = cache.put;
  t.mock.method(cache, "put", async (key, response) => {
    await writeGate.promise;
    await originalPut(key, response);
  });
  let current = ["old.example.com"];
  const read = t.mock.method(Domains, "getSubdomains", async () => current);
  t.mock.method(
    Domains,
    "addSubdomainsToDomain",
    async (_db, domain, values) => {
      current = [...current, ...values];
      return {
        domain,
        created: false,
        acceptedSubdomainCount: values.length,
        insertedSubdomainCount: values.length,
      };
    },
  );
  await get();
  await post(["new.example.com"]);
  writeGate.resolve();
  await flush();
  assert.deepEqual(await (await get()).json(), current);
  await flush();
  assert.equal(read.mock.callCount(), 2);
});

test("oversized bodies are rejected before submission even with a false Content-Length", async (t) => {
  const { request, url } = setup(t);
  const write = t.mock.method(Domains, "addSubdomainsToDomain");
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1_000_001));
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = await request(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "1" },
      body,
      duplex: "half",
    } as RequestInit),
  );
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.equal(write.mock.callCount(), 0);
});

test("declared oversized bodies are cancelled before reading them", async (t) => {
  const { request, url } = setup(t);
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const response = await request(
    new Request(url, {
      method: "POST",
      headers: { "Content-Length": String(MAX_REQUEST_BODY_BYTES + 1) },
      body,
      duplex: "half",
    } as RequestInit),
  );
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
});

test("source items, expanded values, and individual token lengths are bounded", async (t) => {
  const { post } = setup(t);
  const write = t.mock.method(Domains, "addSubdomainsToDomain");
  for (const values of [
    Array.from({ length: 10_001 }, () => "www.example.com"),
    [",".repeat(10_000)],
    ["x".repeat(2_049)],
  ]) {
    assert.equal((await post(values)).status, 413);
  }
  assert.equal(write.mock.callCount(), 0);
});
