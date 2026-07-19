import assert from "node:assert/strict";
import test from "node:test";

import { cleanDomain, getCleanedSubdomains } from "../src/utils/domainUtils";
import { cacheKeyFor } from "../src/worker";

test("normalizes root domains without case-dependent www handling", () => {
  assert.equal(cleanDomain("www.Example.COM"), "example.com");
  assert.equal(cleanDomain("WWW.EXAMPLE.COM"), "example.com");
  assert.equal(cleanDomain("https://WWW.EXAMPLE.COM./path"), "example.com");
});

test("preserves www when cleaning submitted subdomains", () => {
  assert.deepEqual(
    getCleanedSubdomains(["www.reddit.com", "OLD.Reddit.Com."]),
    ["www.reddit.com", "old.reddit.com"],
  );
});

test("uses one cache key for canonical and legacy route aliases", () => {
  const canonical = cacheKeyFor(
    new Request("https://anubisdb.com/subdomains/reddit.com"),
  );
  const legacy = cacheKeyFor(
    new Request("https://anubisdb.com/anubis/subdomains/reddit.com?ignored=1"),
  );
  const post = cacheKeyFor(
    new Request("https://anubisdb.com/anubis/subdomains/reddit.com", {
      method: "POST",
    }),
  );

  assert.equal(canonical.url, legacy.url);
  assert.equal(canonical.url, post.url);
  assert.equal(canonical.method, "GET");
});
