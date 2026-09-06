import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import { URL } from "node:url";
import Domains, { SubdomainLimitError } from "./domains";

const createDatabase = (legacy = false) => {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = legacy
    ? ["001_create_tables.sql"]
    : [
        "001_create_tables.sql",
        "002_drop_rate_limits.sql",
        "003_add_denormalized_subdomains.sql",
        "004_drop_subdomains.sql",
      ];
  for (const migration of migrations) {
    sqlite.exec(
      readFileSync(
        new URL(`../../migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  }

  // Run the model's SQL against SQLite with D1's asynchronous result shape.
  const db = {
    prepare(query: string) {
      let bindings: SQLInputValue[] = [];
      return {
        execute() {
          const before = Number(
            sqlite.prepare("SELECT total_changes() AS count").get()?.count,
          );
          const results = sqlite.prepare(query).all(...bindings);
          const after = Number(
            sqlite.prepare("SELECT total_changes() AS count").get()?.count,
          );
          return { success: true, results, meta: { changes: after - before } };
        },
        bind(...values: SQLInputValue[]) {
          bindings = values;
          return this;
        },
        async first() {
          return sqlite.prepare(query).get(...bindings) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(query).all(...bindings) };
        },
        async run() {
          const result = sqlite.prepare(query).run(...bindings);
          return {
            success: true,
            meta: {
              changes: Number(result.changes),
              last_row_id: Number(result.lastInsertRowid),
            },
          };
        },
      };
    },
    async batch(statements: { execute(): unknown }[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;

  return { db, sqlite };
};

const makeSubdomains = (count: number) =>
  Array.from({ length: count }, (_, index) => `s${index}.example.com`);

const seedDomain = (sqlite: DatabaseSync, subdomainsJson: string) => {
  sqlite
    .prepare(
      "INSERT INTO domains (domain, subdomains_json, updated_at) VALUES (?, ?, ?)",
    )
    .run("example.com", subdomainsJson, "2000-01-01 00:00:00");
};

const readDomain = (sqlite: DatabaseSync) =>
  sqlite.prepare("SELECT * FROM domains WHERE domain = ?").get("example.com");

test("create and append count only new unique subdomains", async (t) => {
  const { db, sqlite } = createDatabase();
  t.after(() => sqlite.close());

  assert.deepEqual(
    await Domains.addSubdomainsToDomain(db, "example.com", [
      "a.example.com",
      "b.example.com",
      "a.example.com",
    ]),
    {
      domain: "example.com",
      acceptedSubdomainCount: 3,
      insertedSubdomainCount: 2,
      created: true,
    },
  );
  assert.deepEqual(
    await Domains.addSubdomainsToDomain(db, "example.com", [
      "b.example.com",
      "c.example.com",
    ]),
    {
      domain: "example.com",
      acceptedSubdomainCount: 2,
      insertedSubdomainCount: 1,
      created: false,
    },
  );
  assert.deepEqual(await Domains.getSubdomains(db, "example.com"), [
    "a.example.com",
    "b.example.com",
    "c.example.com",
  ]);
});

test("empty submissions leave missing domains absent", async (t) => {
  const { db, sqlite } = createDatabase();
  t.after(() => sqlite.close());

  assert.equal(
    (await Domains.addSubdomainsToDomain(db, "example.com", [])).created,
    false,
  );
  assert.deepEqual(await Domains.getSubdomains(db, "example.com"), []);
  assert.equal(readDomain(sqlite), undefined);
});

test("oversized new submissions fail before creating a domain", async (t) => {
  const { db, sqlite } = createDatabase();
  t.after(() => sqlite.close());

  await assert.rejects(
    Domains.addSubdomainsToDomain(db, "example.com", makeSubdomains(10_001)),
    SubdomainLimitError,
  );
  assert.equal(readDomain(sqlite), undefined);
});

test("the limit counts unique subdomains and preserves a full domain on rejection", async (t) => {
  const { db, sqlite } = createDatabase();
  t.after(() => sqlite.close());
  const subdomains = makeSubdomains(10_000);

  assert.equal(
    (
      await Domains.addSubdomainsToDomain(db, "example.com", [
        ...subdomains,
        subdomains[0],
      ])
    ).insertedSubdomainCount,
    10_000,
  );
  const original = readDomain(sqlite);
  assert.equal(
    (await Domains.addSubdomainsToDomain(db, "example.com", [subdomains[0]]))
      .insertedSubdomainCount,
    0,
  );
  await assert.rejects(
    Domains.addSubdomainsToDomain(db, "example.com", ["new.example.com"]),
    SubdomainLimitError,
  );
  assert.deepEqual(readDomain(sqlite), original);
});

test("legacy over-limit domains allow duplicates and retain every stored value", async (t) => {
  const { db, sqlite } = createDatabase();
  t.after(() => sqlite.close());
  const subdomains = makeSubdomains(10_001);
  seedDomain(sqlite, JSON.stringify(subdomains));
  const original = readDomain(sqlite);

  assert.equal(
    (await Domains.addSubdomainsToDomain(db, "example.com", subdomains))
      .insertedSubdomainCount,
    0,
  );
  await assert.rejects(
    Domains.addSubdomainsToDomain(db, "example.com", ["new.example.com"]),
    SubdomainLimitError,
  );
  assert.deepEqual(readDomain(sqlite), original);
  assert.deepEqual(await Domains.getSubdomains(db, "example.com"), subdomains);
});

test("the storage byte limit rejects both new and merged oversized JSON without mutations", async (t) => {
  const { db, sqlite } = createDatabase();
  t.after(() => sqlite.close());
  const labels = Array.from({ length: 4 }, () => "a".repeat(50)).join(".");
  const subdomains = Array.from(
    { length: 9_500 },
    (_, index) => `s${index}.${labels}.example.com`,
  );

  await assert.rejects(
    Domains.addSubdomainsToDomain(db, "example.com", subdomains),
    SubdomainLimitError,
  );
  assert.equal(readDomain(sqlite), undefined);

  seedDomain(sqlite, JSON.stringify(subdomains.slice(0, 6_000)));
  const original = readDomain(sqlite);
  await assert.rejects(
    Domains.addSubdomainsToDomain(db, "example.com", subdomains.slice(6_000)),
    SubdomainLimitError,
  );
  assert.deepEqual(readDomain(sqlite), original);
});

test("concurrent domain creation preserves both submissions and reports one creator", async (t) => {
  const { db, sqlite } = createDatabase();
  t.after(() => sqlite.close());

  const results = await Promise.all([
    Domains.addSubdomainsToDomain(db, "example.com", ["a.example.com"]),
    Domains.addSubdomainsToDomain(db, "example.com", ["b.example.com"]),
  ]);

  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(
    results.reduce((total, result) => total + result.insertedSubdomainCount, 0),
    2,
  );
  assert.deepEqual(
    new Set(await Domains.getSubdomains(db, "example.com")),
    new Set(["a.example.com", "b.example.com"]),
  );
});

test("concurrent updates do not lose subdomains or double-count shared additions", async (t) => {
  const { db, sqlite } = createDatabase();
  t.after(() => sqlite.close());
  seedDomain(sqlite, JSON.stringify(["original.example.com"]));

  const results = await Promise.all([
    Domains.addSubdomainsToDomain(db, "example.com", [
      "shared.example.com",
      "a.example.com",
    ]),
    Domains.addSubdomainsToDomain(db, "example.com", [
      "shared.example.com",
      "b.example.com",
    ]),
  ]);

  assert.equal(
    results.reduce((total, result) => total + result.insertedSubdomainCount, 0),
    3,
  );
  assert.deepEqual(
    new Set(await Domains.getSubdomains(db, "example.com")),
    new Set([
      "original.example.com",
      "shared.example.com",
      "a.example.com",
      "b.example.com",
    ]),
  );
});

test("concurrent updates competing for the final slot cannot exceed the limit", async (t) => {
  const { db, sqlite } = createDatabase();
  t.after(() => sqlite.close());
  const original = makeSubdomains(9_999);
  seedDomain(sqlite, JSON.stringify(original));

  const results = await Promise.allSettled([
    Domains.addSubdomainsToDomain(db, "example.com", ["a.example.com"]),
    Domains.addSubdomainsToDomain(db, "example.com", ["b.example.com"]),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.reason instanceof SubdomainLimitError);
  const stored = new Set(await Domains.getSubdomains(db, "example.com"));
  assert.equal(stored.size, 10_000);
  assert.ok(original.every((subdomain) => stored.has(subdomain)));
});

for (const stored of [
  "",
  "not JSON",
  "{}",
  '["kept.example.com", 7]',
  '["kept.example.com", null]',
  "[]\0trailing junk",
  '["kept.example.com"]\0trailing junk',
]) {
  test(`malformed stored JSON is rejected without silently discarding data: ${stored}`, async (t) => {
    const { db, sqlite } = createDatabase();
    t.after(() => sqlite.close());
    seedDomain(sqlite, stored);
    const original = readDomain(sqlite);

    await assert.rejects(
      Domains.getSubdomains(db, "example.com"),
      /Invalid subdomains JSON/,
    );
    await assert.rejects(
      Domains.addSubdomainsToDomain(db, "example.com", ["new.example.com"]),
      /Invalid subdomains JSON/,
    );
    assert.deepEqual(readDomain(sqlite), original);
  });
}

test("reads retain compatibility with the schema before JSON migration", async (t) => {
  const { db, sqlite } = createDatabase(true);
  t.after(() => sqlite.close());
  sqlite.prepare("INSERT INTO domains (domain) VALUES (?)").run("example.com");
  sqlite
    .prepare("INSERT INTO subdomains (domain_id, subdomain) VALUES (?, ?)")
    .run(1, "a.example.com");

  assert.deepEqual(await Domains.getSubdomains(db, "example.com"), [
    "a.example.com",
  ]);
});
