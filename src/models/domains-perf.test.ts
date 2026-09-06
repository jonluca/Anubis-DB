import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { getPlatformProxy } from "wrangler";
import Domains, { SubdomainLimitError } from "./domains";

const measureDatabase = (db: D1Database) => {
  const metrics = {
    bindingBytes: 0,
    resultBytes: 0,
    rowsRead: 0,
    rowsWritten: 0,
  };
  const record = (results: D1Result[]) => {
    metrics.resultBytes += Buffer.byteLength(JSON.stringify(results));
    for (const result of results) {
      metrics.rowsRead += result.meta.rows_read;
      metrics.rowsWritten += result.meta.rows_written;
    }
  };
  const measuredDb = {
    prepare(query: string) {
      const statement = db.prepare(query);
      let bound = statement;
      return {
        bind(...values: unknown[]) {
          metrics.bindingBytes += values.reduce<number>(
            (sum, value) =>
              sum + (typeof value === "string" ? Buffer.byteLength(value) : 0),
            0,
          );
          bound = statement.bind(...values);
          return this;
        },
        async first() {
          const result = await bound.all();
          record([result]);
          return result.results[0] ?? null;
        },
        get statement() {
          return bound;
        },
      };
    },
    async batch(statements: { statement: D1PreparedStatement }[]) {
      const results = await db.batch(statements.map((item) => item.statement));
      record(results);
      return results;
    },
  } as unknown as D1Database;
  return { db: measuredDb, metrics };
};

test(
  "atomic merges run in the local D1 runtime",
  { timeout: 60_000 },
  async (t) => {
    const proxy = await getPlatformProxy<{ DB: D1Database }>({
      configPath: fileURLToPath(
        new URL("../../wrangler.toml", import.meta.url),
      ),
      persist: false,
      remoteBindings: false,
      envFiles: [],
    });
    t.after(() => proxy.dispose());
    const db = proxy.env.DB;
    for (const migration of [
      "001_create_tables.sql",
      "002_drop_rate_limits.sql",
      "003_add_denormalized_subdomains.sql",
      "004_drop_subdomains.sql",
    ]) {
      const sql = readFileSync(
        new URL(`../../migrations/${migration}`, import.meta.url),
        "utf8",
      );
      for (const statement of sql.split(";").filter((part) => part.trim())) {
        await db.prepare(statement).run();
      }
    }

    await t.test(
      "twenty concurrent writers preserve values and count each addition once",
      async () => {
        const submissions = Array.from({ length: 20 }, (_, index) => [
          "shared.concurrent.test",
          `writer${index}.concurrent.test`,
        ]);
        const results = await Promise.all(
          submissions.map((subdomains) =>
            Domains.addSubdomainsToDomain(db, "concurrent.test", subdomains),
          ),
        );
        assert.equal(results.filter((result) => result.created).length, 1);
        assert.equal(
          results.reduce(
            (sum, result) => sum + result.insertedSubdomainCount,
            0,
          ),
          21,
        );
        assert.deepEqual(
          new Set(await Domains.getSubdomains(db, "concurrent.test")),
          new Set(submissions.flat()),
        );
      },
    );

    await t.test(
      "existing domains retain order and duplicate no-ops do not write",
      async () => {
        const original =
          '["z.order.test", "a.order.test", "z.order.test"] \t\r\n';
        await db
          .prepare(
            "INSERT INTO domains (domain, subdomains_json, updated_at) VALUES (?, ?, ?)",
          )
          .bind("order.test", original, "2000-01-01 00:00:00")
          .run();
        const before = await db
          .prepare("SELECT * FROM domains WHERE domain = ?")
          .bind("order.test")
          .first();
        const result = await Domains.addSubdomainsToDomain(db, "order.test", [
          "z.order.test",
          "a.order.test",
        ]);
        assert.equal(result.insertedSubdomainCount, 0);
        assert.deepEqual(
          await db
            .prepare("SELECT * FROM domains WHERE domain = ?")
            .bind("order.test")
            .first(),
          before,
        );
        await Domains.addSubdomainsToDomain(db, "order.test", [
          "y.order.test",
          "b.order.test",
          "y.order.test",
        ]);
        assert.deepEqual(await Domains.getSubdomains(db, "order.test"), [
          "z.order.test",
          "a.order.test",
          "z.order.test",
          "y.order.test",
          "b.order.test",
        ]);
      },
    );

    await t.test(
      "one append transfers only its input and metadata for a large domain",
      async () => {
        const original = Array.from(
          { length: 9_999 },
          (_, index) => `sub${index}.transport.test`,
        );
        await db
          .prepare(
            "INSERT INTO domains (domain, subdomains_json) VALUES (?, ?)",
          )
          .bind("transport.test", JSON.stringify(original))
          .run();
        const { db: measuredDb, metrics } = measureDatabase(db);
        const result = await Domains.addSubdomainsToDomain(
          measuredDb,
          "transport.test",
          ["new.transport.test"],
        );
        assert.equal(result.insertedSubdomainCount, 1);
        assert.ok(
          metrics.bindingBytes < 500,
          `sent ${metrics.bindingBytes} bytes of bindings`,
        );
        assert.ok(
          metrics.resultBytes < 2_000,
          `received ${metrics.resultBytes} bytes of results`,
        );
        assert.deepEqual(await Domains.getSubdomains(db, "transport.test"), [
          ...original,
          "new.transport.test",
        ]);
      },
    );

    for (const count of [10_000, 12_000]) {
      await t.test(
        `duplicate and rejected submissions to ${count} stored values cost one read and no writes`,
        async () => {
          const domain = `cost${count}.test`;
          const original = Array.from(
            { length: count },
            (_, index) => `s${index}.${domain}`,
          );
          await db
            .prepare(
              "INSERT INTO domains (domain, subdomains_json, updated_at) VALUES (?, ?, ?)",
            )
            .bind(domain, JSON.stringify(original), "2000-01-01 00:00:00")
            .run();
          const before = await db
            .prepare("SELECT * FROM domains WHERE domain = ?")
            .bind(domain)
            .first();

          for (const submission of [[original[0]], original]) {
            const { db: measuredDb, metrics } = measureDatabase(db);
            assert.deepEqual(
              await Domains.addSubdomainsToDomain(
                measuredDb,
                domain,
                submission,
              ),
              {
                domain,
                acceptedSubdomainCount: submission.length,
                insertedSubdomainCount: 0,
                created: false,
              },
            );
            assert.equal(metrics.rowsRead, 1);
            assert.equal(metrics.rowsWritten, 0);
          }

          const { db: measuredDb, metrics } = measureDatabase(db);
          await assert.rejects(
            Domains.addSubdomainsToDomain(measuredDb, domain, [
              `new.${domain}`,
            ]),
            SubdomainLimitError,
          );
          assert.equal(metrics.rowsRead, 1);
          assert.equal(metrics.rowsWritten, 0);
          assert.deepEqual(
            await db
              .prepare("SELECT * FROM domains WHERE domain = ?")
              .bind(domain)
              .first(),
            before,
          );
        },
      );
    }

    await t.test(
      "large legacy arrays with duplicate entries still accept unique additions atomically",
      async () => {
        const domain = "duplicates.test";
        const original = Array.from(
          { length: 9_999 },
          (_, index) => `s${index}.${domain}`,
        );
        original.push(original[0], original[0]);
        await db
          .prepare(
            "INSERT INTO domains (domain, subdomains_json) VALUES (?, ?)",
          )
          .bind(domain, JSON.stringify(original))
          .run();
        const results = await Promise.allSettled([
          Domains.addSubdomainsToDomain(db, domain, [`a.${domain}`]),
          Domains.addSubdomainsToDomain(db, domain, [`b.${domain}`]),
        ]);
        const successes = results.filter(
          (result) => result.status === "fulfilled",
        );
        assert.equal(successes.length, 1);
        assert.equal(successes[0].value.insertedSubdomainCount, 1);
        const failure = results.find((result) => result.status === "rejected");
        assert.ok(failure && failure.reason instanceof SubdomainLimitError);
        const stored = await Domains.getSubdomains(db, domain);
        assert.deepEqual(stored.slice(0, original.length), original);
        assert.equal(new Set(stored).size, 10_000);
      },
    );

    await t.test(
      "competing additions cannot both take the last available slot",
      async () => {
        const original = Array.from(
          { length: 9_999 },
          (_, index) => `s${index}.limit.test`,
        );
        await db
          .prepare(
            "INSERT INTO domains (domain, subdomains_json) VALUES (?, ?)",
          )
          .bind("limit.test", JSON.stringify(original))
          .run();
        const results = await Promise.allSettled([
          Domains.addSubdomainsToDomain(db, "limit.test", ["a.limit.test"]),
          Domains.addSubdomainsToDomain(db, "limit.test", ["b.limit.test"]),
        ]);
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        const failure = results.find((result) => result.status === "rejected");
        assert.ok(failure && failure.reason instanceof SubdomainLimitError);
        const stored = new Set(await Domains.getSubdomains(db, "limit.test"));
        assert.equal(stored.size, 10_000);
        assert.ok(original.every((subdomain) => stored.has(subdomain)));
      },
    );

    await t.test(
      "corruption and UTF-8 byte-limit failures preserve stored rows",
      async () => {
        await db
          .prepare(
            "INSERT INTO domains (domain, subdomains_json) VALUES (?, ?)",
          )
          .bind("corrupt.test", '["kept.corrupt.test", null]')
          .run();
        await assert.rejects(
          Domains.addSubdomainsToDomain(db, "corrupt.test", [
            "new.corrupt.test",
          ]),
          /Invalid subdomains JSON/,
        );
        assert.equal(
          await db
            .prepare("SELECT subdomains_json FROM domains WHERE domain = ?")
            .bind("corrupt.test")
            .first("subdomains_json"),
          '["kept.corrupt.test", null]',
        );

        // Each request fits, but the UTF-8 encoded merged array exceeds 2 MB.
        const original = `${"é".repeat(510_000)}.bytes.test`;
        const incoming = `${"ø".repeat(510_000)}.bytes.test`;
        await db
          .prepare(
            "INSERT INTO domains (domain, subdomains_json) VALUES (?, ?)",
          )
          .bind("bytes.test", JSON.stringify([original]))
          .run();
        await assert.rejects(
          Domains.addSubdomainsToDomain(db, "bytes.test", [incoming]),
          SubdomainLimitError,
        );
        assert.deepEqual(await Domains.getSubdomains(db, "bytes.test"), [
          original,
        ]);

        // Preserve the old merge behavior when compacting existing escapes frees space.
        const escaped = `"${"\\u00e9".repeat(320_000)}"`;
        await db
          .prepare(
            "INSERT INTO domains (domain, subdomains_json) VALUES (?, ?)",
          )
          .bind("escaped.test", `[${escaped}]`)
          .run();
        const additional = "a".repeat(90_000);
        assert.equal(
          (
            await Domains.addSubdomainsToDomain(db, "escaped.test", [
              additional,
            ])
          ).insertedSubdomainCount,
          1,
        );
        assert.deepEqual(await Domains.getSubdomains(db, "escaped.test"), [
          "é".repeat(320_000),
          additional,
        ]);
      },
    );
  },
);
