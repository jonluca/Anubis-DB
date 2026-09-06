import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

export async function createImportDirectory(root: string): Promise<string> {
  await mkdir(root, { recursive: true });
  return mkdtemp(path.join(root, "run-"));
}

export async function withSourceSnapshot<T>(
  pool: Pool,
  exportSnapshot: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      const result = await exportSnapshot(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}
