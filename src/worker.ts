import Domains from "./models/domains";
import type { Env } from "./types";
import {
  cleanDomain,
  getCleanedSubdomains,
  verifyDomain,
  verifySubdomains,
} from "./utils/domainUtils";

const API_BASE_URL = "https://anubisdb.com/subdomains";
const GITHUB_URL = "https://github.com/jonluca/Anubis-DB";
const ANUBIS_GITHUB_URL = "https://github.com/jonluca/anubis";

const homePage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Anubis DB is a free, open subdomain enumeration database API backed by Cloudflare Workers and D1.">
    <title>Anubis DB | Open Subdomain Enumeration API</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #f7faf8;
            --bg-strong: #ebf4ef;
            --ink: #10231f;
            --muted: #5a6f68;
            --line: #d8e5df;
            --brand: #0f7a63;
            --brand-strong: #075844;
            --accent: #d7fff2;
            --panel: #ffffff;
            --shadow: 0 24px 70px rgba(16, 35, 31, 0.12);
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            color: var(--ink);
            background:
                radial-gradient(circle at top left, rgba(15, 122, 99, 0.18), transparent 34rem),
                linear-gradient(180deg, var(--bg), #ffffff 42rem);
            font-family:
                Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
                sans-serif;
            line-height: 1.5;
        }

        a {
            color: inherit;
        }

        .page {
            width: min(1120px, calc(100% - 40px));
            margin: 0 auto;
        }

        header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            padding: 28px 0;
        }

        .brand {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            font-weight: 800;
        }

        .brand-mark {
            display: grid;
            width: 36px;
            height: 36px;
            place-items: center;
            border: 1px solid rgba(15, 122, 99, 0.28);
            border-radius: 8px;
            background: var(--accent);
            color: var(--brand-strong);
            font-size: 18px;
        }

        nav {
            display: flex;
            align-items: center;
            gap: 16px;
            color: var(--muted);
            font-size: 14px;
            font-weight: 700;
        }

        nav a {
            text-decoration: none;
        }

        nav a:hover {
            color: var(--brand-strong);
        }

        .hero {
            display: grid;
            grid-template-columns: minmax(0, 1.08fr) minmax(340px, 0.92fr);
            gap: 44px;
            align-items: center;
            padding: 72px 0 64px;
        }

        .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 18px;
            padding: 8px 12px;
            border: 1px solid rgba(15, 122, 99, 0.22);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.74);
            color: var(--brand-strong);
            font-size: 13px;
            font-weight: 800;
        }

        .eyebrow::before {
            content: "";
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #18b38f;
            box-shadow: 0 0 0 5px rgba(24, 179, 143, 0.14);
        }

        h1 {
            max-width: 780px;
            margin: 0;
            font-size: clamp(48px, 8vw, 92px);
            line-height: 0.94;
        }

        .lede {
            max-width: 660px;
            margin: 24px 0 0;
            color: var(--muted);
            font-size: clamp(18px, 2vw, 22px);
        }

        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 34px;
        }

        .button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 48px;
            padding: 0 18px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--panel);
            color: var(--ink);
            font-weight: 800;
            text-decoration: none;
            box-shadow: 0 8px 24px rgba(16, 35, 31, 0.08);
        }

        .button.primary {
            border-color: var(--brand);
            background: var(--brand);
            color: #ffffff;
        }

        .button:hover {
            transform: translateY(-1px);
        }

        .terminal {
            overflow: hidden;
            border: 1px solid rgba(16, 35, 31, 0.1);
            border-radius: 8px;
            background: #10231f;
            color: #eafff8;
            box-shadow: var(--shadow);
        }

        .terminal-bar {
            display: flex;
            align-items: center;
            gap: 7px;
            min-height: 42px;
            padding: 0 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.06);
        }

        .dot {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            background: #44d7b6;
            opacity: 0.8;
        }

        pre {
            margin: 0;
            overflow-x: auto;
            padding: 22px;
            font-size: 14px;
            line-height: 1.65;
        }

        code {
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        }

        .section {
            padding: 30px 0 72px;
        }

        .section h2 {
            margin: 0 0 14px;
            font-size: clamp(28px, 4vw, 44px);
        }

        .section-intro {
            max-width: 720px;
            margin: 0 0 28px;
            color: var(--muted);
            font-size: 18px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 16px;
        }

        .card {
            min-height: 190px;
            padding: 22px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.86);
        }

        .card h3 {
            margin: 0 0 10px;
            font-size: 18px;
        }

        .card p {
            margin: 0;
            color: var(--muted);
        }

        .tag {
            display: inline-flex;
            margin-bottom: 18px;
            padding: 5px 9px;
            border-radius: 999px;
            background: var(--bg-strong);
            color: var(--brand-strong);
            font-size: 12px;
            font-weight: 900;
        }

        .endpoint {
            display: grid;
            grid-template-columns: 88px minmax(0, 1fr);
            gap: 12px;
            align-items: center;
            margin-top: 12px;
            padding: 14px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--panel);
        }

        .method {
            display: inline-flex;
            justify-content: center;
            padding: 6px 8px;
            border-radius: 8px;
            background: var(--accent);
            color: var(--brand-strong);
            font-size: 12px;
            font-weight: 900;
        }

        .path {
            overflow-wrap: anywhere;
            color: var(--muted);
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
            font-size: 14px;
        }

        .callout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 24px;
            align-items: center;
            margin-bottom: 56px;
            padding: 28px;
            border: 1px solid rgba(15, 122, 99, 0.22);
            border-radius: 8px;
            background: var(--ink);
            color: #ffffff;
        }

        .callout h2 {
            margin: 0 0 8px;
            font-size: 28px;
        }

        .callout p {
            margin: 0;
            color: rgba(255, 255, 255, 0.76);
        }

        footer {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            padding: 28px 0 42px;
            border-top: 1px solid var(--line);
            color: var(--muted);
            font-size: 14px;
        }

        footer a {
            color: var(--brand-strong);
            font-weight: 800;
            text-decoration: none;
        }

        @media (max-width: 820px) {
            header,
            footer {
                align-items: flex-start;
                flex-direction: column;
            }

            .hero,
            .grid,
            .callout {
                grid-template-columns: 1fr;
            }

            .hero {
                padding-top: 36px;
            }

            .callout {
                padding: 24px;
            }
        }

        @media (max-width: 540px) {
            .page {
                width: min(100% - 28px, 1120px);
            }

            nav {
                width: 100%;
                justify-content: space-between;
            }

            h1 {
                font-size: 46px;
            }

            .terminal {
                margin-inline: -4px;
            }

            pre {
                padding: 18px;
                font-size: 13px;
            }

            .endpoint {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="page">
        <header>
            <a class="brand" href="/" aria-label="Anubis DB home">
                <span class="brand-mark">A</span>
                <span>Anubis DB</span>
            </a>
            <nav aria-label="Primary navigation">
                <a href="#api">API</a>
                <a href="#about">About</a>
                <a href="${GITHUB_URL}">GitHub</a>
            </nav>
        </header>

        <main>
            <section class="hero">
                <div>
                    <p class="eyebrow">Free and open subdomain intelligence</p>
                    <h1>Anubis DB</h1>
                    <p class="lede">
                        A public API for collecting and retrieving known subdomains by root domain.
                        It is built for security tooling, recon workflows, and open contributions from
                        the wider Anubis ecosystem.
                    </p>
                    <div class="actions">
                        <a class="button primary" href="#api">View API</a>
                        <a class="button" href="${GITHUB_URL}">Open on GitHub</a>
                    </div>
                </div>

                <div class="terminal" aria-label="Example request">
                    <div class="terminal-bar" aria-hidden="true">
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                    </div>
                    <pre><code>fetch("${API_BASE_URL}/reddit.com")
  .then((response) =&gt; response.json())
  .then((subdomains) =&gt; {
    console.log(subdomains);
  });</code></pre>
                </div>
            </section>

            <section id="about" class="section">
                <h2>What it does</h2>
                <p class="section-intro">
                    Anubis DB fills the gap for a simple, free, open API dedicated to subdomain
                    enumeration data. Query a domain to retrieve known subdomains, or submit valid
                    findings so the database gets better for everyone.
                </p>

                <div class="grid">
                    <article class="card">
                        <span class="tag">Lookup</span>
                        <h3>Retrieve known subdomains</h3>
                        <p>Use a GET request to fetch the current stored list for a valid root domain.</p>
                    </article>
                    <article class="card">
                        <span class="tag">Contribute</span>
                        <h3>Submit discoveries</h3>
                        <p>Use a POST request to add cleaned, validated subdomains for a domain.</p>
                    </article>
                    <article class="card">
                        <span class="tag">Edge native</span>
                        <h3>Powered by Workers and D1</h3>
                        <p>The service runs on Cloudflare Workers with D1 for lightweight global access.</p>
                    </article>
                </div>
            </section>

            <section id="api" class="section">
                <h2>API</h2>
                <p class="section-intro">
                    There is one resource: <code>/subdomains/:domain</code>. Responses are JSON, and the
                    legacy <code>/anubis/subdomains/:domain</code> path is also supported.
                </p>

                <div class="endpoint">
                    <span class="method">GET</span>
                    <span class="path">${API_BASE_URL}/:domain</span>
                </div>
                <div class="endpoint">
                    <span class="method">POST</span>
                    <span class="path">${API_BASE_URL}/:domain</span>
                </div>

                <div class="terminal" style="margin-top: 18px;" aria-label="Example post request">
                    <div class="terminal-bar" aria-hidden="true">
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                    </div>
                    <pre><code>await fetch("${API_BASE_URL}/reddit.com", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    subdomains: ["www.reddit.com", "old.reddit.com"]
  })
});</code></pre>
                </div>
            </section>

            <section class="callout">
                <div>
                    <h2>Open source and ready for contributions.</h2>
                    <p>
                        Review the Worker, D1 migrations, and import tooling on GitHub, or use Anubis
                        to feed new discoveries into the database.
                    </p>
                </div>
                <a class="button primary" href="${GITHUB_URL}">View repository</a>
            </section>
        </main>

        <footer>
            <span>Built as the database companion to <a href="${ANUBIS_GITHUB_URL}">Anubis</a>.</span>
            <a href="${GITHUB_URL}">github.com/jonluca/Anubis-DB</a>
        </footer>
    </div>
</body>
</html>`;

const CACHE_TTL_SECONDS = 300;
const PUBLIC_CACHE_CONTROL = `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`;

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = stripAnubisPrefix(url.pathname);
    const isHomePage = pathname === "/" || pathname === "";

    if (request.method === "GET" && isHomePage) {
      return getCachedResponse(request, ctx, () =>
        Promise.resolve(html(homePage, withPublicCache())),
      );
    }

    if (request.method === "HEAD" && isHomePage) {
      return html("", withPublicCache());
    }

    const subdomainsMatch = pathname.match(/^\/subdomains\/([^/]+)\/?$/);
    if (!subdomainsMatch) {
      return text("404", { status: 404 });
    }

    const domain = cleanDomain(decodeDomainParam(subdomainsMatch[1]));

    if (request.method === "GET") {
      return handleGetSubdomains(request, env, ctx, domain);
    }

    if (request.method === "POST") {
      return handlePostSubdomains(request, env, ctx, domain);
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  },
};

const handleGetSubdomains = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  domain: string,
) => {
  if (!verifyDomain(domain)) {
    return sendErrorResponse(403, "Invalid domain");
  }

  return getCachedResponse(request, ctx, async () => {
    try {
      const subdomains = await Domains.getSubdomains(env.DB, domain);
      return json(subdomains, withPublicCache());
    } catch (error) {
      return sendErrorResponse(
        500,
        `Error retrieving domain: ${domain}`,
        error,
      );
    }
  });
};

const handlePostSubdomains = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  domain: string,
) => {
  let body: Record<string, unknown>;
  try {
    body = await parseBody(request);
  } catch {
    return sendErrorResponse(400, "Invalid request body");
  }

  let subdomains = body.subdomains;

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

    ctx.waitUntil(caches.default.delete(cacheKeyFor(request)));

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
    return sendErrorResponse(
      500,
      `Server error processing domain: ${domain}`,
      error,
    );
  }
};

const parseBody = async (
  request: Request,
): Promise<Record<string, unknown>> => {
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

const decodeDomainParam = (domainParam: string) => {
  try {
    return decodeURIComponent(domainParam);
  } catch {
    return "";
  }
};

const sendErrorResponse = (
  statusCode: number,
  errorMessage: string,
  error?: unknown,
) => {
  if (statusCode >= 500) {
    console.error(errorMessage, error);
  }

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

const getCachedResponse = async (
  request: Request,
  ctx: ExecutionContext,
  createResponse: () => Promise<Response>,
) => {
  const cache = caches.default;
  const cacheKey = cacheKeyFor(request);
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await createResponse();
  if (response.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
};

export const cacheKeyFor = (request: Request) => {
  const url = new URL(request.url);
  const pathname = stripAnubisPrefix(url.pathname);
  const subdomainsMatch = pathname.match(/^\/subdomains\/([^/]+)\/?$/);

  if (subdomainsMatch) {
    const domain = cleanDomain(decodeDomainParam(subdomainsMatch[1]));
    url.pathname = `/subdomains/${encodeURIComponent(domain)}`;
    url.search = "";
  } else if (pathname === "/" || pathname === "") {
    url.pathname = "/";
  }

  return new Request(url, { method: "GET" });
};

const withPublicCache = (init: ResponseInit = {}): ResponseInit => ({
  ...init,
  headers: withHeader(init.headers, "cache-control", PUBLIC_CACHE_CONTROL),
});

const withHeader = (
  headers: HeadersInit | undefined,
  name: string,
  value: string,
) => {
  const nextHeaders = new Headers(headers);
  nextHeaders.set(name, value);
  return nextHeaders;
};

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
