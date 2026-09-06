import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { URL } from "node:url";

test("dropping the duplicate domain index preserves rows and indexed uniqueness", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  for (const migration of [
    "001_create_tables.sql",
    "002_drop_rate_limits.sql",
    "003_add_denormalized_subdomains.sql",
    "004_drop_subdomains.sql",
  ]) {
    db.exec(
      readFileSync(
        new URL(`../../migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  }
  db.prepare("INSERT INTO domains (domain, subdomains_json) VALUES (?, ?)").run(
    "example.com",
    '["www.example.com","api.example.com"]',
  );
  const before = db.prepare("SELECT * FROM domains ORDER BY id").all();
  const migration = readFileSync(
    new URL(
      "../../migrations/005_drop_redundant_domain_index.sql",
      import.meta.url,
    ),
    "utf8",
  );
  db.exec(migration);
  db.exec(migration);

  assert.deepEqual(
    db.prepare("SELECT * FROM domains ORDER BY id").all(),
    before,
  );
  const indexes = db.prepare("PRAGMA index_list(domains)").all();
  assert.equal(
    indexes.some((index) => index.name === "idx_domains_domain"),
    false,
  );
  assert.equal(
    indexes.some((index) => index.unique === 1 && index.origin === "u"),
    true,
  );
  assert.throws(
    () =>
      db.prepare("INSERT INTO domains (domain) VALUES (?)").run("example.com"),
    /UNIQUE constraint failed/,
  );
  const plan = db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT subdomains_json FROM domains WHERE domain = ?",
    )
    .all("example.com");
  assert.equal(
    plan.some((step) => /SEARCH domains USING INDEX/.test(String(step.detail))),
    true,
  );
});
