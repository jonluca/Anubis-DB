import {
  InputLimitError,
  MAX_SUBDOMAIN_ITEMS,
  MAX_SUBDOMAIN_TOKENS,
  MAX_SUBDOMAIN_TOKEN_LENGTH,
} from "./inputLimits";

export const verifyDomain = (domain: string) => {
  if (!domain) {
    return false;
  }

  const normalized = domain.endsWith(".") ? domain.slice(0, -1) : domain;

  if (normalized.length > 253) {
    return false;
  }

  const labels = normalized.split(".");
  if (labels.length < 2 || labels.some((label) => label.length === 0)) {
    return false;
  }

  const tld = labels.at(-1);
  if (!tld || /^\d+$/.test(tld)) {
    return false;
  }

  return labels.every((label, index) => {
    if (index === 0 && label === "*" && labels.length > 1) {
      return true;
    }

    const allowsUnderscore = index < labels.length - 2;
    const labelPattern = allowsUnderscore
      ? /^[a-z0-9_-]{1,63}$/i
      : /^[a-z0-9-]{1,63}$/i;

    return (
      labelPattern.test(label) && !label.startsWith("-") && !label.endsWith("-")
    );
  });
};

export const verifySubdomains = (subdomains: unknown): subdomains is string[] =>
  Array.isArray(subdomains) &&
  subdomains.every((subdomain) => typeof subdomain === "string");

export const cleanDomain = (domain: string) => {
  return cleanHostname(domain, true);
};

const cleanHostname = (domain: string, removeWww: boolean) => {
  if (!domain) {
    return "";
  }

  let cleanedDomain = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^\*\./, "");

  if (removeWww) {
    cleanedDomain = cleanedDomain.replace(/^www\./, "");
  }

  try {
    const host = new URL(`https://${cleanedDomain}`);
    return (host.hostname || "").replace(/\.$/, "").trim();
  } catch {
    return cleanedDomain.replace(/\.$/, "");
  }
};
export const getCleanedSubdomains = (subdomains: string[]): string[] => {
  if (subdomains.length > MAX_SUBDOMAIN_ITEMS) {
    throw new InputLimitError(
      "Submit at most 10,000 subdomain items per request",
    );
  }

  const cleaned = new Set<string>();
  const seenTokens = new Set<string>();
  let tokenCount = 0;

  for (const subdomain of subdomains) {
    const separator = /,|\r\n?|\n|<br\s*\/?>/gi;
    let start = 0;

    for (;;) {
      const match = separator.exec(subdomain);
      const end = match?.index ?? subdomain.length;
      tokenCount += 1;
      if (tokenCount > MAX_SUBDOMAIN_TOKENS) {
        throw new InputLimitError(
          "Submit at most 10,000 subdomain values after splitting separators",
        );
      }
      if (end - start > MAX_SUBDOMAIN_TOKEN_LENGTH) {
        throw new InputLimitError(
          "Each subdomain value must contain at most 2,048 characters",
        );
      }

      const token = subdomain.slice(start, end);
      if (!seenTokens.has(token)) {
        seenTokens.add(token);
        const hostname = cleanHostname(token, false);
        if (verifyDomain(hostname)) {
          cleaned.add(hostname);
        }
      }

      if (!match) {
        break;
      }
      start = match.index + match[0].length;
    }
  }

  return [...cleaned];
};
