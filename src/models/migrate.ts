import fs from "fs/promises";
import path from "path";
import { pool } from "./db";

const runMigrations = async () => {
  try {
    console.log("Running database migrations...");

    const migrationsDir = path.join(process.cwd(), "migrations");
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith(".sql")).sort();

    for (const file of sqlFiles) {
      console.log(`Running migration: ${file}`);
      const sql = await fs.readFile(path.join(migrationsDir, file), "utf-8");
      await pool.query(sql);
      console.log(`Completed: ${file}`);
    }

    console.log("All migrations completed successfully");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
};

export default runMigrations;