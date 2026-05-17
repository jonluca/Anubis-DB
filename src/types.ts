export interface Env {
  DB: D1Database;
}

export interface DomainResult {
  domain: string;
  acceptedSubdomainCount: number;
  insertedSubdomainCount: number;
  created: boolean;
}
