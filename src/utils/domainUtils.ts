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
    return (host.hostname || "").trim();
  } catch {
    return cleanedDomain;
  }
};
export const getCleanedSubdomains = (subdomains: string[]): string[] => {
  const cleaned = (subdomains || [])
    .flatMap((subdomain) =>
      subdomain.split(/,|<br>/).map((splitSub) => {
        const newSub = cleanHostname(splitSub, false);
        if (verifyDomain(newSub)) {
          return newSub;
        }
        return null;
      }),
    )
    .filter((subdomain): subdomain is string => Boolean(subdomain));
  return [...new Set(cleaned)];
};
