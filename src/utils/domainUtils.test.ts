import assert from "node:assert/strict";
import test from "node:test";
import { cacheKeyFor } from "../worker";
import { cleanDomain, getCleanedSubdomains } from "./domainUtils";

test("root domains normalize DNS casing before removing www", () => {
  assert.equal(cleanDomain("WWW.Example.COM"), "example.com");
  assert.equal(cleanDomain("www.example.com"), "example.com");
});

test("subdomain cleaning preserves the www label", () => {
  assert.deepEqual(getCleanedSubdomains(["www.reddit.com", "old.reddit.com"]), [
    "www.reddit.com",
    "old.reddit.com",
  ]);
});

test("current and legacy routes share one cache key", () => {
  const current = cacheKeyFor(
    new Request("https://anubisdb.com/subdomains/example.com"),
  );
  const legacy = cacheKeyFor(
    new Request("https://anubisdb.com/anubis/subdomains/WWW.Example.COM/"),
  );

  assert.equal(current.url, "https://anubisdb.com/subdomains/example.com");
  assert.equal(legacy.url, current.url);
});
