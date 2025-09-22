import { pool } from "./db";

interface SubdomainRecord {
  subdomain: string;
}

class DomainsModel {
  /**
   * Get all subdomains for a domain
   */
  async getSubdomains(domain: string): Promise<string[]> {
    const query = `
      SELECT s.subdomain
      FROM subdomains s
      JOIN domains d ON s.domain_id = d.id
      WHERE d.domain = $1
    `;

    const result = await pool.query<SubdomainRecord>(query, [domain]);
    return result.rows.map((row) => row.subdomain);
  }

  /**
   * Add subdomains to a domain (creates domain if doesn't exist)
   * Single atomic query handles everything
   */
  async addSubdomainsToDomain(
    domain: string,
    subdomains: string[],
  ): Promise<{
    domain: string;
    subdomains: string[];
    created: boolean;
  }> {
    if (subdomains.length === 0) {
      // If no subdomains to add, just get existing ones
      const existingSubdomains = await this.getSubdomains(domain);
      return {
        domain,
        subdomains: existingSubdomains,
        created: false,
      };
    }

    // Single query that:
    // 1. Inserts domain if it doesn't exist (or updates timestamp)
    // 2. Inserts all valid subdomains (database filters by domain suffix)
    // 3. Returns whether domain was created
    const query = `
      WITH domain_upsert AS (
        INSERT INTO domains (domain)
        VALUES ($1)
        ON CONFLICT (domain) DO NOTHING
        RETURNING id, (xmax = 0) as created
      ),
      subdomain_insert AS (
        INSERT INTO subdomains (domain_id, subdomain)
        SELECT
          du.id,
          sub.value
        FROM domain_upsert du
        CROSS JOIN unnest($2::text[]) AS sub(value)
        ON CONFLICT DO NOTHING
      )
      SELECT created FROM domain_upsert
    `;

    const result = await pool.query<{ created: boolean }>(query, [
      domain,
      subdomains,
    ]);

    const created = result.rows[0]?.created || false;

    // Get all subdomains for this domain
    const allSubdomains = await this.getSubdomains(domain);

    return {
      domain,
      subdomains: allSubdomains,
      created,
    };
  }
}

// Export singleton instance
const Domains = new DomainsModel();
export default Domains;
