import assert from "node:assert/strict";
import test from "node:test";
import { InputLimitError } from "./inputLimits";
import { parseBody } from "./requestBody";

test("body decoding preserves UTF-8 characters split between chunks", async () => {
  const expected = { subdomains: ["é.example.com"] };
  const bytes = new TextEncoder().encode(JSON.stringify(expected));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) {
        controller.enqueue(Uint8Array.of(byte));
      }
      controller.close();
    },
  });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit);
  assert.deepEqual(await parseBody(request), expected);
});

test("form parsing preserves encoded separators and last-value semantics", async () => {
  const subdomains = JSON.stringify(["www.example.com"]);
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "Application/X-Www-Form-Urlencoded" },
    body: new URLSearchParams([
      ["subdomains", "[]"],
      ["note", "a&b=c"],
      ["subdomains", subdomains],
    ]),
  });
  const parsed = await parseBody(request);
  assert.deepEqual(
    { ...(parsed as Record<string, string>) },
    { subdomains, note: "a&b=c" },
  );
});

test("form field expansion is bounded independently of body bytes", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "x=1&".repeat(101),
  });
  await assert.rejects(parseBody(request), InputLimitError);
});
