import "dotenv/config";
import { Pool } from "pg";

const connectionString =
  process.env.DB_URL || "postgresql://localhost/anubis_db";

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
const connectToDb = async () => {
  console.log("Connecting to PostgreSQL");
  try {
    // Simple query to test connection
    await pool.query("SELECT 1");
    console.log("Connected to PostgreSQL");
  } catch (error) {
    console.error("Error connecting to PostgreSQL:", error);
    throw error;
  }
};

// Handle pool errors
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

export { pool };
export default connectToDb;