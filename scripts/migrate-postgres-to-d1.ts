#!/usr/bin/env node

/**
 * PostgreSQL to Cloudflare D1 migration tool.
 *
 * Required environment:
 * - DB_URL or SOURCE_DB_URL: source PostgreSQL connection string.
 * - CLOUDFLARE_API_TOKEN: Cloudflare token used by Wrangler when --apply is set.
 *
 * Optional environment:
 * - D1_DATABASE_NAME: target D1 database name or binding (default: anubis-db).
 * - D1_IMPORT_DIR: generated SQL chunk directory (default: .d1-import).
 * - D1_IMPORT_FILE_BYTES: approximate max bytes per generated SQL file.
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { Pool } from "pg";

const POSTGRES_URL = process.env.SOURCE_DB_URL || process.env.DB_URL;
const D1_DATABASE_NAME = process.env.D1_DATABASE_NAME || "anubis-db";
const IMPORT_DIR = process.env.D1_IMPORT_DIR || ".d1-import";
const MAX_FILE_BYTES = Number(process.env.D1_IMPORT_FILE_BYTES || 80_000_000);
const MAX_STATEMENT_BYTES = 90_000;
const SELECT_BATCH_SIZE = 10_000;

const shouldApply = process.argv.includes("--apply");
const keepFiles = process.argv.includes("--keep-files");

if (!POSTGRES_URL) {
  throw new Error("Set DB_URL or SOURCE_DB_URL before running this migration.");
}

type SqlValue = string | number | null;

interface DomainRow {
  id: number;
  domain: string;
  created_at: string | null;
  updated_at: string | null;
}

interface SubdomainRow {
  id: number;
  domain_id: number;
  subdomain: string;
  created_at: string | null;
}

class SqlChunkWriter {
  private stream: WriteStream | null = null;
  private fileIndex = 0;
  private fileBytes = 0;
  readonly files: string[] = [];

  constructor(private readonly outputDir: string) {}

  async writeStatement(statement: string) {
    const bytes = Buffer.byteLength(statement);
    if (!this.stream || this.fileBytes + bytes > MAX_FILE_BYTES) {
      await this.openNextFile();
    }

    if (!this.stream.write(statement)) {
      await once(this.stream, "drain");
    }

    this.fileBytes += bytes;
  }

  async close() {
    if (!this.stream) {
      return;
    }

    const stream = this.stream;
    this.stream = null;
    stream.end();
    await once(stream, "finish");
  }

  private async openNextFile() {
    await this.close();

    this.fileIndex += 1;
    this.fileBytes = 0;
    const file = path.join(
      this.outputDir,
      `${String(this.fileIndex).padStart(4, "0")}_data.sql`,
    );
    this.files.push(file);
    this.stream = createWriteStream(file, { flags: "w" });
  }
}

const pool = new Pool({
  connectionString: POSTGRES_URL,
  max: 4,
});

async function main() {
  console.log("Preparing PostgreSQL to D1 migration.");
  console.log(`Target D1 database: ${D1_DATABASE_NAME}`);
  console.log(`Import directory: ${IMPORT_DIR}`);

  await rm(IMPORT_DIR, { recursive: true, force: true });
  await mkdir(IMPORT_DIR, { recursive: true });

  const counts = await getCounts();
  console.log(
    `Source contains ${counts.domains.toLocaleString()} domains and ${counts.subdomains.toLocaleString()} subdomains.`,
  );

  await writeResetFile();

  const writer = new SqlChunkWriter(IMPORT_DIR);
  try {
    await exportDomains(writer);
    await exportSubdomains(writer);
    await writeDenormalizedSubdomainsBackfill(writer);
  } finally {
    await writer.close();
  }

  const files = await listSqlFiles();
  await logGeneratedFiles(files);

  if (shouldApply) {
    applySqlFiles(files);
  } else {
    console.log(
      "Generated SQL chunks only. Re-run with --apply to import them.",
    );
  }

  if (!keepFiles && shouldApply) {
    await rm(IMPORT_DIR, { recursive: true, force: true });
  }
}

async function getCounts() {
  const result = await pool.query<{
    domains: string;
    subdomains: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM domains) AS domains,
      (SELECT COUNT(*) FROM subdomains) AS subdomains
  `);

  return {
    domains: Number(result.rows[0].domains),
    subdomains: Number(result.rows[0].subdomains),
  };
}

async function writeResetFile() {
  const resetSql = `PRAGMA defer_foreign_keys = true;
DELETE FROM subdomains;
DELETE FROM domains;
DELETE FROM sqlite_sequence WHERE name IN ('domains', 'subdomains');
`;
  await writeFile(path.join(IMPORT_DIR, "0000_reset.sql"), resetSql);
}

async function exportDomains(writer: SqlChunkWriter) {
  console.log("Exporting domains...");

  let lastId = 0;
  let exported = 0;

  for (;;) {
    const result = await pool.query<DomainRow>(
      `
        SELECT id, domain, created_at::text, updated_at::text
        FROM domains
        WHERE id > $1
        ORDER BY id
        LIMIT $2
      `,
      [lastId, SELECT_BATCH_SIZE],
    );

    if (result.rows.length === 0) {
      break;
    }

    await writeInsertStatements(
      writer,
      "domains",
      ["id", "domain", "created_at", "updated_at"],
      result.rows.map((row) => [
        row.id,
        row.domain,
        row.created_at,
        row.updated_at,
      ]),
    );

    exported += result.rows.length;
    lastId = result.rows.at(-1)?.id || lastId;
    process.stdout.write(`\rDomains exported: ${exported.toLocaleString()}`);
  }

  process.stdout.write("\n");
}

async function exportSubdomains(writer: SqlChunkWriter) {
  console.log("Exporting subdomains...");

  let lastId = 0;
  let exported = 0;

  for (;;) {
    const result = await pool.query<SubdomainRow>(
      `
        SELECT id, domain_id, subdomain, created_at::text
        FROM subdomains
        WHERE id > $1
        ORDER BY id
        LIMIT $2
      `,
      [lastId, SELECT_BATCH_SIZE],
    );

    if (result.rows.length === 0) {
      break;
    }

    await writeInsertStatements(
      writer,
      "subdomains",
      ["id", "domain_id", "subdomain", "created_at"],
      result.rows.map((row) => [
        row.id,
        row.domain_id,
        row.subdomain,
        row.created_at,
      ]),
    );

    exported += result.rows.length;
    lastId = result.rows.at(-1)?.id || lastId;
    process.stdout.write(`\rSubdomains exported: ${exported.toLocaleString()}`);
  }

  process.stdout.write("\n");
}

async function writeDenormalizedSubdomainsBackfill(writer: SqlChunkWriter) {
  console.log("Writing denormalized subdomain backfill...");

  await writer.writeStatement(`UPDATE domains
SET subdomains_json = COALESCE(
  (
    SELECT json_group_array(subdomain)
    FROM subdomains
    WHERE subdomains.domain_id = domains.id
  ),
  '[]'
);
`);
}

async function writeInsertStatements(
  writer: SqlChunkWriter,
  table: string,
  columns: string[],
  rows: SqlValue[][],
) {
  const prefix = `INSERT INTO ${table} (${columns.join(", ")}) VALUES `;
  let values: string[] = [];
  let statementBytes = Buffer.byteLength(prefix) + 2;

  const flush = async () => {
    if (values.length === 0) {
      return;
    }

    await writer.writeStatement(`${prefix}${values.join(",")};\n`);
    values = [];
    statementBytes = Buffer.byteLength(prefix) + 2;
  };

  for (const row of rows) {
    const value = `(${row.map(sqlValue).join(",")})`;
    const valueBytes = Buffer.byteLength(value) + (values.length ? 1 : 0);

    if (statementBytes + valueBytes > MAX_STATEMENT_BYTES) {
      await flush();
    }

    values.push(value);
    statementBytes += valueBytes;
  }

  await flush();
}

const sqlValue = (value: SqlValue) => {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${value.replaceAll("'", "''")}'`;
};

async function listSqlFiles() {
  const files = await readdir(IMPORT_DIR);
  return files
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(IMPORT_DIR, file));
}

async function logGeneratedFiles(files: string[]) {
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += (await stat(file)).size;
  }

  console.log(
    `Generated ${files.length} SQL files (${formatBytes(totalBytes)} total).`,
  );
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
};

function applySqlFiles(files: string[]) {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error("Set CLOUDFLARE_API_TOKEN before running with --apply.");
  }

  for (const [index, file] of files.entries()) {
    console.log(`Applying ${index + 1}/${files.length}: ${file}`);
    const result = spawnSync(
      "yarn",
      [
        "wrangler",
        "d1",
        "execute",
        D1_DATABASE_NAME,
        "--remote",
        "--file",
        file,
        "-y",
      ],
      {
        stdio: "inherit",
        env: process.env,
      },
    );

    if (result.status !== 0) {
      throw new Error(`Failed to apply ${file}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
