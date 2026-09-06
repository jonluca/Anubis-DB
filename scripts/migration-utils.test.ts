import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Pool, PoolClient } from "pg";
import { createImportDirectory, withSourceSnapshot } from "./migration-utils";

test("import runs preserve existing files and remain isolated during cleanup", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "anubis-import-test-"));
  try {
    const existingFile = path.join(root, "0000_reset.sql");
    await writeFile(existingFile, "previous export");

    const firstRun = await createImportDirectory(root);
    const secondRun = await createImportDirectory(root);
    assert.notEqual(firstRun, secondRun);
    assert.equal(path.dirname(firstRun), root);
    assert.equal(path.dirname(secondRun), root);

    const secondRunFile = path.join(secondRun, "0000_reset.sql");
    await writeFile(secondRunFile, "second export");
    await rm(firstRun, { recursive: true });

    assert.equal(await readFile(existingFile, "utf8"), "previous export");
    assert.equal(await readFile(secondRunFile, "utf8"), "second export");
    assert.equal((await readdir(root)).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function sourceFixture(failStatement?: string) {
  const events: string[] = [];
  const failure = new Error("source query failed");
  const client = {
    async query(statement: string) {
      events.push(statement);
      if (statement === failStatement) {
        throw failure;
      }
    },
    release() {
      events.push("release");
    },
  } as unknown as PoolClient;
  const pool = {
    async connect() {
      events.push("connect");
      return client;
    },
  } as Pool;
  return { pool, client, events, failure };
}

test("source export keeps every read on one read-only repeatable snapshot", async () => {
  const fixture = sourceFixture();
  const result = await withSourceSnapshot(fixture.pool, async (client) => {
    assert.equal(client, fixture.client);
    await client.query("SELECT * FROM domains");
    await client.query("SELECT * FROM subdomains");
    return "exported";
  });

  assert.equal(result, "exported");
  assert.deepEqual(fixture.events, [
    "connect",
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "SELECT * FROM domains",
    "SELECT * FROM subdomains",
    "COMMIT",
    "release",
  ]);
});

test("failed source exports roll back and release the connection", async () => {
  const fixture = sourceFixture("SELECT * FROM subdomains");
  await assert.rejects(
    withSourceSnapshot(fixture.pool, async (client) => {
      await client.query("SELECT * FROM subdomains");
    }),
    fixture.failure,
  );
  assert.deepEqual(fixture.events, [
    "connect",
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "SELECT * FROM subdomains",
    "ROLLBACK",
    "release",
  ]);
});

test("failed snapshot setup releases the connection without exporting", async () => {
  const fixture = sourceFixture(
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  let exported = false;
  await assert.rejects(
    withSourceSnapshot(fixture.pool, async () => {
      exported = true;
    }),
    fixture.failure,
  );
  assert.equal(exported, false);
  assert.deepEqual(fixture.events, [
    "connect",
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "release",
  ]);
});
