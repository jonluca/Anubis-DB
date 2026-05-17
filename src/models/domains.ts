import type { DomainResult } from "../types";

interface SubdomainRecord {
  subdomain: string;
}

interface DomainRecord {
  id: number;
  subdomains_json: string | null;
}

interface DomainSubdomainsRecord {
  subdomains_json: string | null;
}

class DomainsModel {
  /**
   * Get all subdomains for a domain
   */
  async getSubdomains(db: D1Database, domain: string): Promise<string[]> {
    try {
      const record = await db
        .prepare("SELECT subdomains_json FROM domains WHERE domain = ?")
        .bind(domain)
        .first<DomainSubdomainsRecord>();

      if (!record) {
        return [];
      }

      const subdomains = parseSubdomainsJson(record.subdomains_json);
      if (subdomains) {
        return subdomains;
      }

      throw new Error(`Invalid subdomains JSON for domain: ${domain}`);
    } catch (error) {
      if (!isMissingSubdomainsJsonColumnError(error)) {
        throw error;
      }
    }

    return this.getSubdomainsFromRows(db, domain);
  }

  private async getSubdomainsFromRows(
    db: D1Database,
    domain: string,
  ): Promise<string[]> {
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
    const insertedSubdomainCount = await this.mergeSubdomainsJson(
      db,
      domainRecord.id,
      domainRecord.subdomains_json,
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
      .prepare("SELECT id, subdomains_json FROM domains WHERE domain = ?")
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
      return {
        id: insertResult.meta.last_row_id as number,
        subdomains_json: "[]",
        created: true,
      };
    }

    const insertedByAnotherRequest = await db
      .prepare("SELECT id, subdomains_json FROM domains WHERE domain = ?")
      .bind(domain)
      .first<DomainRecord>();

    if (!insertedByAnotherRequest) {
      throw new Error(`Unable to create or find domain: ${domain}`);
    }

    return { ...insertedByAnotherRequest, created: false };
  }

  private async mergeSubdomainsJson(
    db: D1Database,
    domainId: number,
    initialSubdomainsJson: string | null,
    subdomains: string[],
  ): Promise<number> {
    let currentSubdomainsJson = initialSubdomainsJson || "[]";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const currentSubdomains = parseSubdomainsJson(currentSubdomainsJson);
      if (!currentSubdomains) {
        throw new Error(`Invalid subdomains JSON for domain id: ${domainId}`);
      }

      const nextSubdomains = [...currentSubdomains];
      const seenSubdomains = new Set(currentSubdomains);

      for (const subdomain of subdomains) {
        if (!seenSubdomains.has(subdomain)) {
          seenSubdomains.add(subdomain);
          nextSubdomains.push(subdomain);
        }
      }

      const insertedCount = nextSubdomains.length - currentSubdomains.length;
      if (insertedCount === 0) {
        return 0;
      }

      const nextSubdomainsJson = JSON.stringify(nextSubdomains);
      assertD1StringSize(nextSubdomainsJson);

      const result = await db
        .prepare(
          `
            UPDATE domains
            SET subdomains_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND subdomains_json = ?
          `,
        )
        .bind(nextSubdomainsJson, domainId, currentSubdomainsJson)
        .run();

      if (result.meta.changes > 0) {
        return insertedCount;
      }

      const latest = await db
        .prepare("SELECT subdomains_json FROM domains WHERE id = ?")
        .bind(domainId)
        .first<DomainSubdomainsRecord>();

      if (!latest) {
        throw new Error(`Unable to find domain id: ${domainId}`);
      }

      currentSubdomainsJson = latest.subdomains_json || "[]";
    }

    throw new Error(
      `Unable to update subdomains JSON after concurrent changes for domain id: ${domainId}`,
    );
  }
}

const parseSubdomainsJson = (value: string | null): string[] | null => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (subdomain): subdomain is string => typeof subdomain === "string",
      );
    }
  } catch {
    return null;
  }

  return null;
};

const isMissingSubdomainsJsonColumnError = (error: unknown) =>
  String(error).includes("no such column: subdomains_json");

const assertD1StringSize = (value: string) => {
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > 2_000_000) {
    throw new Error(`Subdomains JSON is too large for D1: ${bytes} bytes`);
  }
};

// Export singleton instance
const Domains = new DomainsModel();
export default Domains;
