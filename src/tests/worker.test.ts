import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Domains, { SubdomainLimitError } from "../models/domains";
import type { Env } from "../types";
import worker from "../worker";

const createContext = (t: TestContext) => {
  const pending: Promise<unknown>[] = [];
  const entries = new Map<string, Response>();
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        match: async (key: Request) => entries.get(key.url)?.clone(),
        put: async (key: Request, response: Response) => {
          entries.set(key.url, response);
        },
        delete: async (key: Request) => entries.delete(key.url),
      },
    },
  });
  t.after(() => {
    if (originalCaches) {
      Object.defineProperty(globalThis, "caches", originalCaches);
    } else {
      Reflect.deleteProperty(globalThis, "caches");
    }
  });
  return {
    env: {} as Env,
    ctx: {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as unknown as ExecutionContext,
    flush: () => Promise.all(pending),
  };
};

test("POST rejects non-object JSON bodies without throwing", async (t) => {
  const { env, ctx } = createContext(t);
  for (const body of ["null", "[]", "false", "42", '"example.com"']) {
    for (const contentType of ["application/json", "text/plain"]) {
      const response = await worker.fetch(
        new Request("https://anubisdb.com/subdomains/example.com", {
          method: "POST",
          headers: { "Content-Type": contentType },
          body,
        }),
        env,
        ctx,
      );
      assert.equal(response.status, 400, `${contentType}: ${body}`);
      assert.deepEqual(await response.json(), {
        error: "Invalid request body",
      });
    }
  }
});

test("browser JSON POST preflights are accepted on both API routes", async (t) => {
  const { env, ctx } = createContext(t);
  for (const prefix of ["", "/anubis"]) {
    const response = await worker.fetch(
      new Request(`https://anubisdb.com${prefix}/subdomains/example.com`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://client.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      }),
      env,
      ctx,
    );
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.match(
      response.headers.get("Access-Control-Allow-Methods") ?? "",
      /POST/,
    );
    assert.match(
      response.headers.get("Access-Control-Allow-Headers") ?? "",
      /content-type/i,
    );
    assert.equal(await response.text(), "");
  }
});

test("storage limits return a JSON client error with CORS headers", async (t) => {
  const { env, ctx } = createContext(t);
  t.mock.method(Domains, "addSubdomainsToDomain", async () => {
    throw new SubdomainLimitError("Subdomain limit exceeded");
  });
  const response = await worker.fetch(
    new Request("https://anubisdb.com/subdomains/example.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subdomains: ["new.example.com"] }),
    }),
    env,
    ctx,
  );
  assert.equal(response.status, 413);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.deepEqual(await response.json(), {
    error: "Subdomain limit exceeded",
  });
});

test("API results, cache hits, and validation errors are readable across origins", async (t) => {
  const { env, ctx, flush } = createContext(t);
  const getSubdomains = t.mock.method(Domains, "getSubdomains", async () => [
    "www.example.com",
  ]);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await worker.fetch(
      new Request("https://anubisdb.com/subdomains/example.com"),
      env,
      ctx,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.deepEqual(await response.json(), ["www.example.com"]);
    await flush();
  }
  assert.equal(getSubdomains.mock.callCount(), 1);
  const invalid = await worker.fetch(
    new Request("https://anubisdb.com/subdomains/invalid"),
    env,
    ctx,
  );
  assert.equal(invalid.status, 403);
  assert.equal(invalid.headers.get("Access-Control-Allow-Origin"), "*");
});

test("POST accepts JSON and form clients and invalidates the canonical GET cache", async (t) => {
  const { env, ctx, flush } = createContext(t);
  const getSubdomains = t.mock.method(Domains, "getSubdomains", async () => []);
  const addSubdomains = t.mock.method(
    Domains,
    "addSubdomainsToDomain",
    async (_db, domain, subdomains) => ({
      domain,
      created: true,
      acceptedSubdomainCount: subdomains.length,
      insertedSubdomainCount: subdomains.length,
    }),
  );
  await worker.fetch(
    new Request("https://anubisdb.com/subdomains/example.com"),
    env,
    ctx,
  );
  await flush();
  const subdomains = ["WWW.Example.COM.", "old.example.com", "unrelated.com"];
  for (const [contentType, body] of [
    ["application/json", JSON.stringify({ subdomains })],
    [
      "application/x-www-form-urlencoded",
      new URLSearchParams({
        subdomains: JSON.stringify(subdomains),
      }).toString(),
    ],
    [
      "Application/X-Www-Form-Urlencoded; Charset=UTF-8",
      new URLSearchParams({
        subdomains: JSON.stringify(subdomains),
      }).toString(),
    ],
  ]) {
    const response = await worker.fetch(
      new Request(
        "https://anubisdb.com/anubis/subdomains/WWW.Example.COM./?source=test",
        {
          method: "POST",
          headers: { "Content-Type": contentType },
          body,
        },
      ),
      env,
      ctx,
    );
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.deepEqual(await response.json(), {
      domain: "example.com",
      created: true,
      acceptedSubdomainCount: 2,
      insertedSubdomainCount: 2,
    });
    assert.deepEqual(addSubdomains.mock.calls.at(-1)?.arguments.slice(1), [
      "example.com",
      ["www.example.com", "old.example.com"],
    ]);
    await flush();
  }
  await worker.fetch(
    new Request("https://anubisdb.com/subdomains/example.com"),
    env,
    ctx,
  );
  await flush();
  assert.equal(getSubdomains.mock.callCount(), 2);
});
