import { URL } from "url";
import { uniq } from "lodash-es";
import isValidDomain from "is-valid-domain";

export const verifyDomain = (domain: string) => {
  if (!domain) {
    return false;
  }

  const isValid = isValidDomain(domain, { allowUnicode: true, wildcard: true });
  if (!isValid) {
    console.log(`Domain ${domain} is invalid`);
    return false;
  }
  return true;
};

export const verifySubdomains = (subdomains: unknown): boolean =>
  Array.isArray(subdomains);

export const cleanDomain = (domain: string) => {
  if (!domain) {
    return "";
  }
  const cleanedDomain = (domain || "")
    .replace("https://", "")
    .replace("http://", "")
    .replace(/^www\./, "")
    .replace(/^\*\./, "")
    .toLowerCase()
    .trim();
  try {
    const host = new URL(`https://${cleanedDomain}`);
    return (host.hostname || "").trim();
  } catch {
    console.log(`Invalid domain: ${cleanedDomain}`);
  }

  return cleanedDomain;
};
export const getCleanedSubdomains = (subdomains: string[]): string[] => {
  const cleaned = (subdomains || [])
    .flatMap((subdomain) =>
      subdomain.split(/,|<br>/).map((splitSub) => {
        const newSub = cleanDomain(splitSub);
        if (verifyDomain(newSub)) {
          return newSub;
        }
        return null;
      }),
    )
    .filter(Boolean);
  return uniq(cleaned);
};
