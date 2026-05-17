import Domains from "./models/domains";
import type { Env } from "./types";
import {
  cleanDomain,
  getCleanedSubdomains,
  verifyDomain,
  verifySubdomains,
} from "./utils/domainUtils";

const homePage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anubis DB</title>
</head>
<body>
    <h1>Anubis DB API</h1>
    <p>Subdomain enumeration database API</p>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = stripAnubisPrefix(url.pathname);

    if (request.method === "GET" && (pathname === "/" || pathname === "")) {
      return html(homePage);
    }

    const subdomainsMatch = pathname.match(/^\/subdomains\/([^/]+)\/?$/);
    if (!subdomainsMatch) {
      return text("404", { status: 404 });
    }

    const domain = cleanDomain(decodeURIComponent(subdomainsMatch[1]));

    if (request.method === "GET") {
      return handleGetSubdomains(env, domain);
    }

    if (request.method === "POST") {
      return handlePostSubdomains(request, env, domain);
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  },
};

const handleGetSubdomains = async (env: Env, domain: string) => {
  if (!verifyDomain(domain)) {
    return sendErrorResponse(403, "Invalid domain");
  }

  try {
    const subdomains = await Domains.getSubdomains(env.DB, domain);
    return json(subdomains);
  } catch (error) {
    console.error("Error fetching subdomains:", error);
    return sendErrorResponse(500, `Error retrieving domain: ${domain}`);
  }
};

const handlePostSubdomains = async (
  request: Request,
  env: Env,
  domain: string,
) => {
  let subdomains = (await parseBody(request)).subdomains;

  // Parse subdomains if it's a string
  if (typeof subdomains === "string") {
    try {
      subdomains = JSON.parse(subdomains);
    } catch {
      return sendErrorResponse(400, "Invalid JSON format for subdomains");
    }
  }

  // Basic validation
  if (!verifyDomain(domain) || !verifySubdomains(subdomains)) {
    return sendErrorResponse(403, "Invalid domain or subdomains");
  }

  try {
    const validSubdomains = getCleanedSubdomains(subdomains);
    const validSubdomainsForDomain = validSubdomains.filter((subdomain) =>
      subdomain.endsWith(`.${domain}`),
    );
    const result = await Domains.addSubdomainsToDomain(
      env.DB,
      domain,
      validSubdomainsForDomain,
    );

    // Use 201 for new domain, 200 for existing
    const statusCode = result.created ? 201 : 200;

    console.log(
      result.created
        ? `Created new domain: ${domain}`
        : `Updated domain: ${domain}`,
    );

    return json(
      {
        domain: result.domain,
        created: result.created,
        acceptedSubdomainCount: result.acceptedSubdomainCount,
        insertedSubdomainCount: result.insertedSubdomainCount,
      },
      { status: statusCode },
    );
  } catch (error) {
    console.error("Error processing domain:", error);
    return sendErrorResponse(500, `Server error processing domain: ${domain}`);
  }
};

const parseBody = async (request: Request) => {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }

  const textBody = await request.text();
  if (!textBody) {
    return {};
  }

  try {
    return JSON.parse(textBody) as Record<string, unknown>;
  } catch {
    return { subdomains: textBody };
  }
};

const stripAnubisPrefix = (pathname: string) =>
  pathname === "/anubis" ? "/" : pathname.replace(/^\/anubis(?=\/)/, "");

const sendErrorResponse = (statusCode: number, errorMessage: string) => {
  console.error(errorMessage);
  return json({ error: errorMessage }, { status: statusCode });
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: withContentType(init.headers, "application/json; charset=utf-8"),
  });

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    ...init,
    headers: withContentType(init.headers, "text/html; charset=utf-8"),
  });

const text = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    ...init,
    headers: withContentType(init.headers, "text/plain; charset=utf-8"),
  });

const withContentType = (
  headers: HeadersInit | undefined,
  contentType: string,
) => {
  const nextHeaders = new Headers(headers);
  if (!nextHeaders.has("content-type")) {
    nextHeaders.set("content-type", contentType);
  }
  return nextHeaders;
};
