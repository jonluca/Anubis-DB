export const verifyDomain = (domain: string) => {
  if (!domain) {
    return false;
  }

  const normalized = domain.endsWith(".") ? domain.slice(0, -1) : domain;

  if (normalized.length > 253) {
    console.log(`Domain ${domain} is invalid`);
    return false;
  }

  const labels = normalized.split(".");
  if (labels.length < 2 || labels.some((label) => label.length === 0)) {
    console.log(`Domain ${domain} is invalid`);
    return false;
  }

  const tld = labels.at(-1);
  if (!tld || /^\d+$/.test(tld)) {
    console.log(`Domain ${domain} is invalid`);
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
  if (!domain) {
    return "";
  }
  const cleanedDomain = (domain || "")
    .replaceAll("https://", "")
    .replaceAll("http://", "")
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
    .filter((subdomain): subdomain is string => Boolean(subdomain));
  return [...new Set(cleaned)];
};
