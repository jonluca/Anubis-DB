#!/usr/bin/env node

/**
 * Migration script from MongoDB to PostgreSQL
 *
 * Usage:
 * yarn tsx scripts/migrate-mongo-to-postgres.ts
 *
 * Environment variables:
 * - MONGO_URL: MongoDB connection string (default: mongodb://127.0.0.1/admin)
 * - DB_URL: PostgreSQL connection string (default: postgresql://localhost/anubis_db)
 * - BATCH_SIZE: Number of domains to process at once (default: 100)
 * - DRY_RUN: If set to "true", shows what would be migrated without actually migrating
 */

import "dotenv/config";
import { MongoClient, Db } from "mongodb";
import { Pool } from "pg";
import runMigrations from "../src/models/migrate";

// Configuration
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1/admin";
const POSTGRES_URL = process.env.DB_URL || "postgresql://localhost/anubis_db";
const BATCH_SIZE = 10_000;
const DRY_RUN = process.env.DRY_RUN === "true";

// MongoDB document interface
interface MongoDomain {
  _id: string;
  domain: string;
  validSubdomains?: string[];
  __v?: number;
}

// Progress tracking
const stats = {
  totalDomains: 0,
  processedDomains: 0,
  totalSubdomains: 0,
  errors: 0,
  skipped: 0,
};

class MigrationTool {
  private mongoClient: MongoClient;
  private pgPool: Pool;
  private mongoDb: Db | null = null;

  constructor() {
    this.mongoClient = new MongoClient(MONGO_URL);
    this.pgPool = new Pool({ connectionString: POSTGRES_URL });
  }

  async connect() {
    console.log("🔌 Connecting to databases...");

    // Connect to MongoDB
    await this.mongoClient.connect();
    this.mongoDb = this.mongoClient.db("admin");
    console.log("✅ Connected to MongoDB");

    // Connect to PostgreSQL and run migrations
    await this.pgPool.query("SELECT 1");
    console.log("✅ Connected to PostgreSQL");

    // Run migrations to ensure schema exists
    console.log("🔧 Running PostgreSQL migrations...");
    await runMigrations();
    console.log("✅ Migrations complete");
  }

  async getMongoStats() {
    if (!this.mongoDb) {
      throw new Error("Not connected to MongoDB");
    }

    const collection = this.mongoDb.collection<MongoDomain>("domains");
    const totalDomains = await collection.countDocuments();

    // Get sample to estimate total subdomains
    const sample = await collection
      .aggregate([
        { $sample: { size: Math.min(100, totalDomains) } },
        {
          $project: { count: { $size: { $ifNull: ["$validSubdomains", []] } } },
        },
        { $group: { _id: null, avgSubdomains: { $avg: "$count" } } },
      ])
      .toArray();

    const avgSubdomains = sample[0]?.avgSubdomains || 0;
    const estimatedSubdomains = Math.round(totalDomains * avgSubdomains);

    return {
      totalDomains,
      estimatedSubdomains,
    };
  }

  async migrateBatch(domains: MongoDomain[]) {
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would migrate ${domains.length} domains`);
      domains.forEach((d) => {
        console.log(
          `  - ${d.domain}: ${d.validSubdomains?.length || 0} subdomains`,
        );
      });
      return;
    }

    for (const mongoDomain of domains) {
      try {
        const subdomains = mongoDomain.validSubdomains || [];

        // Use our optimized single-query method
        const query = `
          WITH domain_upsert AS (
            INSERT INTO domains (domain)
            VALUES ($1)
            ON CONFLICT (domain) DO UPDATE
            SET updated_at = CURRENT_TIMESTAMP
            RETURNING id
          ),
          subdomain_insert AS (
            INSERT INTO subdomains (domain_id, subdomain)
            SELECT
              du.id,
              unnest($2::text[])
            FROM domain_upsert du
            WHERE array_length($2::text[], 1) > 0
            ON CONFLICT DO NOTHING
          )
          SELECT 1
        `;

        if (subdomains.length > 0) {
          await this.pgPool.query(query, [mongoDomain.domain, subdomains]);
        } else {
          // Just insert the domain without subdomains
          await this.pgPool.query(
            "INSERT INTO domains (domain) VALUES ($1) ON CONFLICT (domain) DO NOTHING",
            [mongoDomain.domain],
          );
        }

        stats.processedDomains++;
        stats.totalSubdomains += subdomains.length;

        if (stats.processedDomains % 10 === 0) {
          process.stdout.write(
            `\r📊 Progress: ${stats.processedDomains}/${stats.totalDomains} domains (${Math.round((stats.processedDomains / stats.totalDomains) * 100)}%)`,
          );
        }
      } catch (error) {
        console.error(
          `\n❌ Error migrating domain ${mongoDomain.domain}:`,
          error,
        );
        stats.errors++;
      }
    }
  }

  async migrate() {
    if (!this.mongoDb) {
      throw new Error("Not connected to MongoDB");
    }

    console.log("\n📈 Analyzing MongoDB data...");
    const mongoStats = await this.getMongoStats();
    stats.totalDomains = mongoStats.totalDomains;

    console.log(
      `📊 Found ${mongoStats.totalDomains} domains with ~${mongoStats.estimatedSubdomains} subdomains`,
    );

    if (DRY_RUN) {
      console.log("\n🔍 DRY RUN MODE - No data will be migrated\n");
    } else {
      console.log("\n🚀 Starting migration...\n");
    }

    const collection = this.mongoDb.collection<MongoDomain>("domains");
    const cursor = collection.find({}).batchSize(BATCH_SIZE);

    let batch: MongoDomain[] = [];

    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        await this.migrateBatch(batch);
        batch = [];
      }
    }

    // Process remaining documents
    if (batch.length > 0) {
      await this.migrateBatch(batch);
    }

    console.log("\n");
  }

  async cleanup() {
    await this.mongoClient.close();
    await this.pgPool.end();
  }

  async verify() {
    console.log("\n🔍 Verifying migration...");

    // Check PostgreSQL counts
    const domainCountResult = await this.pgPool.query(
      "SELECT COUNT(*) as count FROM domains",
    );
    const subdomainCountResult = await this.pgPool.query(
      "SELECT COUNT(*) as count FROM subdomains",
    );

    const pgDomains = parseInt(domainCountResult.rows[0].count, 10);
    const pgSubdomains = parseInt(subdomainCountResult.rows[0].count, 10);

    console.log(`\n📊 PostgreSQL contains:`);
    console.log(`  - ${pgDomains} domains`);
    console.log(`  - ${pgSubdomains} subdomains`);

    // Sample verification - check a few random domains
    console.log("\n🔍 Sampling migrated data...");
    const sampleResult = await this.pgPool.query(`
      SELECT d.domain, COUNT(s.id) as subdomain_count
      FROM domains d
      LEFT JOIN subdomains s ON s.domain_id = d.id
      GROUP BY d.id
      ORDER BY RANDOM()
      LIMIT 5
    `);

    console.log("Sample domains:");
    sampleResult.rows.forEach((row) => {
      console.log(`  - ${row.domain}: ${row.subdomain_count} subdomains`);
    });
  }
}

// Main execution
async function main() {
  console.log("🗄️  MongoDB to PostgreSQL Migration Tool");
  console.log("=".repeat(50));
  console.log(`MongoDB URL: ${MONGO_URL}`);
  console.log(`PostgreSQL URL: ${POSTGRES_URL}`);
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log(`Dry Run: ${DRY_RUN}`);
  console.log("=".repeat(50));

  const migrationTool = new MigrationTool();

  try {
    await migrationTool.connect();
    await migrationTool.migrate();

    if (!DRY_RUN) {
      await migrationTool.verify();
    }

    console.log("\n✅ Migration Summary:");
    console.log(`  - Total Domains: ${stats.totalDomains}`);
    console.log(`  - Processed: ${stats.processedDomains}`);
    console.log(`  - Total Subdomains: ${stats.totalSubdomains}`);
    console.log(`  - Errors: ${stats.errors}`);

    if (stats.errors > 0) {
      console.log(
        "\n⚠️  Migration completed with errors. Please review the logs.",
      );
      process.exit(1);
    } else {
      console.log("\n🎉 Migration completed successfully!");
    }
  } catch (error) {
    console.error("\n💥 Fatal error during migration:", error);
    process.exit(1);
  } finally {
    await migrationTool.cleanup();
  }
}

// Run if executed directly
main();
