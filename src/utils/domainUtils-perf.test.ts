import assert from "node:assert/strict";
import test from "node:test";
import { getCleanedSubdomains } from "./domainUtils";
import {
  InputLimitError,
  MAX_SUBDOMAIN_ITEMS,
  MAX_SUBDOMAIN_TOKENS,
  MAX_SUBDOMAIN_TOKEN_LENGTH,
} from "./inputLimits";

test("the source item limit includes duplicates and invalid values", () => {
  for (const token of ["www.example.com", ":", ""]) {
    assert.throws(
      () => getCleanedSubdomains(Array(MAX_SUBDOMAIN_ITEMS + 1).fill(token)),
      InputLimitError,
    );
  }
});

test("separator expansion is bounded even when every token is empty", () => {
  assert.deepEqual(
    getCleanedSubdomains([",".repeat(MAX_SUBDOMAIN_TOKENS - 1)]),
    [],
  );
  assert.throws(
    () => getCleanedSubdomains([",".repeat(MAX_SUBDOMAIN_TOKENS)]),
    InputLimitError,
  );
});

test("the expanded token limit applies across source items and duplicates", () => {
  const repeated = Array(MAX_SUBDOMAIN_TOKENS)
    .fill("www.example.com")
    .join("<BR />");
  assert.deepEqual(getCleanedSubdomains([repeated]), ["www.example.com"]);
  assert.throws(
    () => getCleanedSubdomains([repeated, "www.example.com"]),
    InputLimitError,
  );
});

test("long tokens are rejected before URL parsing can discard their paths", () => {
  const prefix = "https://www.example.com/";
  const token = prefix + "x".repeat(MAX_SUBDOMAIN_TOKEN_LENGTH - prefix.length);
  assert.deepEqual(getCleanedSubdomains([token]), ["www.example.com"]);
  assert.throws(() => getCleanedSubdomains([`${token}x`]), InputLimitError);
});

test("duplicate raw tokens are normalized only once", (t) => {
  const originalUrl = URL;
  let parsed = 0;
  Object.defineProperty(globalThis, "URL", {
    value: class extends originalUrl {
      constructor(...args: ConstructorParameters<typeof URL>) {
        super(...args);
        parsed += 1;
      }
    },
  });
  t.after(() => {
    Object.defineProperty(globalThis, "URL", { value: originalUrl });
  });
  assert.deepEqual(
    getCleanedSubdomains(Array(MAX_SUBDOMAIN_ITEMS).fill("www.example.com")),
    ["www.example.com"],
  );
  assert.equal(parsed, 1);
});

test("normalization preserves order and canonical deduplication", () => {
  assert.deepEqual(
    getCleanedSubdomains([
      "API.Example.com.,api.example.com\r\nwww.example.com",
      "*.api.example.com<br/>https://other.example.com/path",
    ]),
    ["api.example.com", "www.example.com", "other.example.com"],
  );
});
