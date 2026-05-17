export interface Env {
  DB: D1Database;
}

export interface DomainResult {
  domain: string;
  subdomains: string[];
  created: boolean;
}
