export const MAX_REQUEST_BODY_BYTES = 3_000_000;
export const MAX_SUBDOMAIN_ITEMS = 10_000;
export const MAX_SUBDOMAIN_TOKENS = 10_000;
export const MAX_SUBDOMAIN_TOKEN_LENGTH = 2_048;

export class InputLimitError extends Error {
  name = "InputLimitError";
}
