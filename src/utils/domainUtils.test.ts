import assert from "node:assert/strict";
import test from "node:test";
import { cacheKeyFor } from "../worker";
import { cleanDomain, getCleanedSubdomains, verifyDomain } from "./domainUtils";

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

test("root domains normalize the parsed hostname and terminal DNS dot", () => {
  for (const domain of [
    "Example.COM.",
    "https://WWW.Example.COM./path",
    "https://user:password@www.example.com:443/path",
    "https://ｗｗｗ.example.com/path",
  ]) {
    assert.equal(cleanDomain(domain), "example.com", domain);
  }
});

test("subdomain cleaning deduplicates dotted and undotted names", () => {
  assert.deepEqual(
    getCleanedSubdomains([
      "API.Example.com.",
      "api.example.com",
      "*.api.example.com.",
      "https://www.example.com./path",
    ]),
    ["api.example.com", "www.example.com"],
  );
});

test("bulk subdomain line breaks remain separate hostnames", () => {
  assert.deepEqual(
    getCleanedSubdomains([
      "a.example.com\nb.example.com\r\nc.example.com\rd.example.com",
      "e.example.com<BR>f.example.com<br/>g.example.com<BR />h.example.com,i.example.com",
    ]),
    [
      "a.example.com",
      "b.example.com",
      "c.example.com",
      "d.example.com",
      "e.example.com",
      "f.example.com",
      "g.example.com",
      "h.example.com",
      "i.example.com",
    ],
  );
});

test("malformed hostnames are not repaired into valid domain names", () => {
  for (const domain of [
    "exa\tmple.com",
    "exa\nmple.com",
    "exa\rmple.com",
    "example.com..",
    "example..com",
  ]) {
    assert.equal(verifyDomain(cleanDomain(domain)), false, domain);
  }

  assert.deepEqual(
    getCleanedSubdomains(["a.exa\tmple.com", "a.example.com.."]),
    [],
  );
});

test("current and legacy routes share one cache key", () => {
  const current = cacheKeyFor(
    new Request("https://anubisdb.com/subdomains/example.com"),
  );
  const legacy = cacheKeyFor(
    new Request("https://anubisdb.com/anubis/subdomains/WWW.Example.COM/"),
  );
  const fullyQualified = cacheKeyFor(
    new Request("https://anubisdb.com/subdomains/example.com."),
  );

  assert.equal(current.url, "https://anubisdb.com/subdomains/example.com");
  assert.equal(legacy.url, current.url);
  assert.equal(fullyQualified.url, current.url);
});
