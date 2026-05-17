import type { DomainResult } from "../types";

interface SubdomainRecord {
  subdomain: string;
}

interface DomainRecord {
  id: number;
}

class DomainsModel {
  /**
   * Get all subdomains for a domain
   */
  async getSubdomains(db: D1Database, domain: string): Promise<string[]> {
    const query = `
      SELECT s.subdomain
      FROM subdomains s
      JOIN domains d ON s.domain_id = d.id
      WHERE d.domain = ?
    `;

    const result = await db.prepare(query).bind(domain).all<SubdomainRecord>();
    return (result.results || []).map((row) => row.subdomain);
  }

  /**
   * Add subdomains to a domain (creates domain if doesn't exist)
   */
  async addSubdomainsToDomain(
    db: D1Database,
    domain: string,
    subdomains: string[],
  ): Promise<DomainResult> {
    if (subdomains.length === 0) {
      return {
        domain,
        acceptedSubdomainCount: 0,
        insertedSubdomainCount: 0,
        created: false,
      };
    }

    const domainRecord = await this.upsertDomain(db, domain);
    const insertedSubdomainCount = await this.insertSubdomains(
      db,
      domainRecord.id,
      subdomains,
    );

    return {
      domain,
      acceptedSubdomainCount: subdomains.length,
      insertedSubdomainCount,
      created: domainRecord.created,
    };
  }

  private async upsertDomain(
    db: D1Database,
    domain: string,
  ): Promise<DomainRecord & { created: boolean }> {
    const existing = await db
      .prepare("SELECT id FROM domains WHERE domain = ?")
      .bind(domain)
      .first<DomainRecord>();

    if (existing) {
      await db
        .prepare(
          "UPDATE domains SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(existing.id)
        .run();
      return { ...existing, created: false };
    }

    const insertResult = await db
      .prepare("INSERT OR IGNORE INTO domains (domain) VALUES (?)")
      .bind(domain)
      .run();

    if (insertResult.meta.changes > 0) {
      return { id: insertResult.meta.last_row_id as number, created: true };
    }

    const insertedByAnotherRequest = await db
      .prepare("SELECT id FROM domains WHERE domain = ?")
      .bind(domain)
      .first<DomainRecord>();

    if (!insertedByAnotherRequest) {
      throw new Error(`Unable to create or find domain: ${domain}`);
    }

    return { ...insertedByAnotherRequest, created: false };
  }

  private async insertSubdomains(
    db: D1Database,
    domainId: number,
    subdomains: string[],
  ): Promise<number> {
    const prefix =
      "INSERT OR IGNORE INTO subdomains (domain_id, subdomain) VALUES ";
    const maxStatementBytes = 90_000;
    let values: string[] = [];
    let statementBytes = prefix.length + 1;
    let insertedCount = 0;

    const flush = async () => {
      if (values.length === 0) {
        return;
      }

      const result = await db.prepare(`${prefix}${values.join(",")}`).run();
      insertedCount += result.meta.changes;
      values = [];
      statementBytes = prefix.length + 1;
    };

    for (const subdomain of subdomains) {
      const value = `(${domainId},${sqlString(subdomain)})`;
      const nextBytes = statementBytes + value.length + (values.length ? 1 : 0);

      if (nextBytes > maxStatementBytes) {
        await flush();
      }

      values.push(value);
      statementBytes += value.length + (values.length > 1 ? 1 : 0);
    }

    await flush();
    return insertedCount;
  }
}

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

// Export singleton instance
const Domains = new DomainsModel();
export default Domains;
