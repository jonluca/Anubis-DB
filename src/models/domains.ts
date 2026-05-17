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
  async getSubdomains(
    db: D1Database,
    writesDb: D1Database,
    domain: string,
  ): Promise<string[]> {
    const query = `
      SELECT s.subdomain
      FROM subdomains s
      JOIN domains d ON s.domain_id = d.id
      WHERE d.domain = ?
    `;

    const [baseResult, writeResult] = await Promise.all([
      db.prepare(query).bind(domain).all<SubdomainRecord>(),
      writesDb.prepare(query).bind(domain).all<SubdomainRecord>(),
    ]);
    return [
      ...new Set(
        [...(baseResult.results || []), ...(writeResult.results || [])].map(
          (row) => row.subdomain,
        ),
      ),
    ];
  }

  /**
   * Add subdomains to a domain (creates domain if doesn't exist)
   */
  async addSubdomainsToDomain(
    db: D1Database,
    writesDb: D1Database,
    domain: string,
    subdomains: string[],
  ): Promise<DomainResult> {
    if (subdomains.length === 0) {
      // If no subdomains to add, just get existing ones
      const existingSubdomains = await this.getSubdomains(db, writesDb, domain);
      return {
        domain,
        subdomains: existingSubdomains,
        created: false,
      };
    }

    const baseDomainExists = await this.domainExists(db, domain);
    const domainRecord = await this.upsertDomain(writesDb, domain);
    await this.insertSubdomains(writesDb, domainRecord.id, subdomains);

    // Get all subdomains for this domain
    const allSubdomains = await this.getSubdomains(db, writesDb, domain);

    return {
      domain,
      subdomains: allSubdomains,
      created: !baseDomainExists && domainRecord.created,
    };
  }

  private async domainExists(db: D1Database, domain: string) {
    const record = await db
      .prepare("SELECT id FROM domains WHERE domain = ?")
      .bind(domain)
      .first<DomainRecord>();

    return Boolean(record);
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
  ) {
    const prefix =
      "INSERT OR IGNORE INTO subdomains (domain_id, subdomain) VALUES ";
    const maxStatementBytes = 90_000;
    let values: string[] = [];
    let statementBytes = prefix.length + 1;

    const flush = async () => {
      if (values.length === 0) {
        return;
      }

      await db.prepare(`${prefix}${values.join(",")}`).run();
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
  }
}

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

// Export singleton instance
const Domains = new DomainsModel();
export default Domains;
