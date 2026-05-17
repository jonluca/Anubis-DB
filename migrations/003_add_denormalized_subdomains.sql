ALTER TABLE domains ADD COLUMN subdomains_json TEXT NOT NULL DEFAULT '[]';

UPDATE domains
SET subdomains_json = COALESCE(
  (
    SELECT json_group_array(subdomain)
    FROM subdomains
    WHERE subdomains.domain_id = domains.id
  ),
  '[]'
);
