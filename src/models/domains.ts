import type { DomainResult } from "../types";

interface SubdomainRecord {
  subdomain: string;
}

interface DomainSubdomainsRecord {
  subdomains_json: string | null;
}

const MAX_SUBDOMAINS = 10_000;
const MAX_SUBDOMAINS_JSON_BYTES = 2_000_000;

interface MergeState {
  created: number;
  valid: number;
  inserted_count: number;
  exceeds_count_limit: number;
}

// IN builds an indexed input set once, avoiding a stored-array scan per input.
// Materialize only scalar metadata and additions, keeping stored JSON scans bounded.
const MERGE_INPUTS_SQL = `
  WITH existing AS MATERIALIZED (
    SELECT id, subdomains_json,
      CASE WHEN json_valid(subdomains_json) AND instr(subdomains_json, char(0)) = 0
        THEN json_type(subdomains_json) = 'array' ELSE 0 END AS is_array
    FROM domains WHERE domain = ?1
  ), stored_entries AS NOT MATERIALIZED (
    SELECT value, type, CAST(key AS INTEGER) AS position
    FROM json_each(COALESCE(
      (SELECT CASE WHEN is_array THEN subdomains_json ELSE '[]' END FROM existing),
      '[]'
    ))
  ), incoming AS NOT MATERIALIZED (
    SELECT value, CAST(key AS INTEGER) AS position FROM json_each(?2)
  ), stored_summary AS MATERIALIZED (
    SELECT COUNT(*) AS stored_count,
      COALESCE(MIN(type = 'text'), 1) AS valid,
      json_group_array(DISTINCT value) FILTER (
        WHERE type = 'text' AND value IN (SELECT value FROM incoming)
      ) AS matches_json
    FROM stored_entries
  ), additions AS MATERIALIZED (
    SELECT value, position FROM incoming WHERE value NOT IN (
      SELECT value FROM json_each((SELECT matches_json FROM stored_summary))
    )
  ), merge_counts AS (
    SELECT stored_count, valid,
      json_array_length(?2) - json_array_length(matches_json) AS inserted_count
    FROM stored_summary
  ), merge_state AS MATERIALIZED (
    SELECT
      NOT EXISTS (SELECT 1 FROM existing) AS created,
      NOT EXISTS (SELECT 1 FROM existing WHERE NOT is_array)
        AND valid AS valid,
      inserted_count,
      CASE WHEN inserted_count = 0 OR stored_count + inserted_count <= ?3 THEN 0
      ELSE (SELECT COUNT(DISTINCT value) FROM stored_entries)
        + inserted_count > ?3 END AS exceeds_count_limit
    FROM merge_counts
  )
`;

const MERGE_SUBDOMAINS_SQL = `${MERGE_INPUTS_SQL}, candidate AS MATERIALIZED (
  SELECT CASE WHEN (SELECT stored_count FROM stored_summary) > 0 THEN
    substr(
      rtrim((SELECT subdomains_json FROM existing), char(9) || char(10) || char(13) || ' '),
      1,
      length(rtrim((SELECT subdomains_json FROM existing), char(9) || char(10) || char(13) || ' ')) - 1
    ) || ',' || substr((
      SELECT json_group_array(value) FROM (SELECT value FROM additions ORDER BY position)
    ), 2)
  ELSE (
    SELECT json_group_array(value) FROM (SELECT value FROM additions ORDER BY position)
  ) END AS subdomains_json
  FROM merge_state
  WHERE valid AND inserted_count > 0 AND NOT exceeds_count_limit
), merged AS MATERIALIZED (
  SELECT CASE WHEN length(CAST(subdomains_json AS BLOB)) <= ?4 THEN subdomains_json
  ELSE (
    -- Compact only when preserved whitespace/escapes could put the row over the limit.
    SELECT json_group_array(value) FROM (
      SELECT value FROM (
        SELECT value, position, 0 AS source FROM stored_entries
        UNION ALL
        SELECT value, position, 1 AS source FROM additions
      ) ORDER BY source, position
    )
  ) END AS subdomains_json FROM candidate
)
INSERT INTO domains (id, domain, subdomains_json)
SELECT (SELECT id FROM existing), ?1, subdomains_json FROM merged
WHERE length(CAST(subdomains_json AS BLOB)) <= ?4
ON CONFLICT(domain) DO UPDATE SET
  subdomains_json = excluded.subdomains_json,
  updated_at = CURRENT_TIMESTAMP
`;

export class SubdomainLimitError extends Error {
  name = "SubdomainLimitError";
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

    const uniqueSubdomains = [...new Set(subdomains)];
    const incomingJson = JSON.stringify(uniqueSubdomains);
    if (
      new TextEncoder().encode(incomingJson).length > MAX_SUBDOMAINS_JSON_BYTES
    ) {
      throw new SubdomainLimitError(
        "Subdomains JSON is too large for D1: limit is 2,000,000 bytes",
      );
    }

    // A scalar JSON length check reads one indexed domain row. Only full arrays
    // leave D1, avoiding repeated billable JSON scans for requests that cannot add.
    const fullDomain = await db
      .prepare(
        `SELECT subdomains_json FROM domains WHERE domain = ?
         AND CASE WHEN json_valid(subdomains_json)
           THEN json_array_length(subdomains_json) >= ? ELSE 0 END`,
      )
      .bind(domain, MAX_SUBDOMAINS)
      .first<DomainSubdomainsRecord>();
    if (fullDomain) {
      const storedSubdomains = parseSubdomainsJson(fullDomain.subdomains_json);
      if (!storedSubdomains) {
        throw new Error(`Invalid subdomains JSON for domain: ${domain}`);
      }
      const stored = new Set(storedSubdomains);
      if (uniqueSubdomains.every((subdomain) => stored.has(subdomain))) {
        return {
          domain,
          acceptedSubdomainCount: subdomains.length,
          insertedSubdomainCount: 0,
          created: false,
        };
      }
      if (stored.size >= MAX_SUBDOMAINS) {
        throw new SubdomainLimitError(
          "Subdomain limit exceeded: domains support at most 10,000 unique subdomains",
        );
      }
      // Legacy duplicate entries can fill an array while unique values still fit.
    }

    // D1 executes a batch as one transaction. The metadata and conditional write
    // share a snapshot, so counts stay exact without client-side reads or retries.
    const [preflight, write] = await db.batch<MergeState>([
      db
        .prepare(`${MERGE_INPUTS_SQL} SELECT * FROM merge_state`)
        .bind(domain, incomingJson, MAX_SUBDOMAINS),
      db
        .prepare(MERGE_SUBDOMAINS_SQL)
        .bind(domain, incomingJson, MAX_SUBDOMAINS, MAX_SUBDOMAINS_JSON_BYTES),
    ]);
    const state = preflight.results[0];

    if (!state?.valid) {
      throw new Error(`Invalid subdomains JSON for domain: ${domain}`);
    }

    if (state.inserted_count > 0 && write.meta.changes === 0) {
      if (state.exceeds_count_limit) {
        throw new SubdomainLimitError(
          "Subdomain limit exceeded: domains support at most 10,000 unique subdomains",
        );
      }
      throw new SubdomainLimitError(
        "Subdomains JSON is too large for D1: limit is 2,000,000 bytes",
      );
    }

    return {
      domain,
      acceptedSubdomainCount: subdomains.length,
      insertedSubdomainCount: state.inserted_count,
      created: Boolean(state.created),
    };
  }
}

const parseSubdomainsJson = (value: string | null): string[] | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.every((subdomain) => typeof subdomain === "string")
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
};

const isMissingSubdomainsJsonColumnError = (error: unknown) =>
  String(error).includes("no such column: subdomains_json");

// Export singleton instance
const Domains = new DomainsModel();
export default Domains;
