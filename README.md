# Anubis-DB

Sister project to [Anubis](https://github.com/jonluca/Anubis)

## About

This project came about due to a lack of free and open APIs for subdomain enumeration.

## Usage

There is only one endpoint - `https://anubisdb.com/anubis/subdomains/:domain`, where `:domain` is the domain.

| Method | Endpoint                                             | Parameters                                                |
| ------ | ---------------------------------------------------- | --------------------------------------------------------- |
| GET    | `https://anubisdb.com/anubis/subdomains/` + `domain` | `domain`: Valid domain (e.g. google.com, reddit.com, etc) |
| POST   | `https://anubisdb.com/anubis/subdomains/` + `domain` | `subdomains`: Array of submitted subdomains               |

GET returns the full list of known subdomains for the domain. POST stores valid
submitted subdomains and returns counts only; it does not return the full stored
subdomain list. Use GET after POST if you need the current full list.

The API supports cross-origin browser requests, including JSON POST preflights.

A sample AJAX GET request looks like:

```js
fetch("https://anubisdb.com/subdomains/reddit.com", {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
  },
})
  .then((response) => response.json())
  .then((data) => {
    // Handle data here
    console.log(data);
  })
  .catch((error) => {
    // Handle error here
    console.error("Error:", error);
  });
```

A sample AJAX POST request looks like:

```js
fetch("https://anubisdb.com/subdomains/reddit.com", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    subdomains: ["www.reddit.com", "old.reddit.com"],
  }),
})
  .then((response) => response.json())
  .then((data) => {
    // {
    //   domain: "reddit.com",
    //   created: false,
    //   acceptedSubdomainCount: 2,
    //   insertedSubdomainCount: 1
    // }
    console.log(data);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
```

### Status Codes

| Status | Endpoint                                          |
| ------ | ------------------------------------------------- |
| 200    | Success                                           |
| 201    | New domain created                                |
| 400    | Malformed request body                            |
| 403    | Invalid domain or subdomains                      |
| 413    | Submission exceeds input or domain storage limits |
| 429    | Rate limit exceeded                               |
| 500    | Server error saving or retrieving new subdomains  |

## Limits

You're limited to 60 requests per 10 seconds per source IP. This is enforced at
Cloudflare's edge before requests reach the Worker.

IPs or prefixes found trying to bypass the rate limit by rotating addresses or
otherwise evading enforcement may be challenged or blocked.

There is also a 10,000 unique subdomain limit per domain and a 2,000,000-byte
limit for its stored JSON array. Submissions that exceed either limit return
413 without partially adding subdomains.

POST bodies are limited to 3,000,000 bytes, including streamed requests. Each
request may contain up to 10,000 array items and 10,000 values after splitting
commas, line breaks, or HTML breaks. Empty, invalid, and duplicate values count
toward these input limits. Each value may contain at most 2,048 characters;
URL-encoded requests may contain at most 100 form fields. Split larger submissions
into separate requests. Rejected submissions do not partially add data.

Additions are merged atomically in D1, so concurrent submissions preserve each
other's values. Empty or duplicate-only POSTs retain cached GET results. Concurrent
GET cache misses share a read within each Worker isolate; the edge cache retains
the existing five-minute lifetime.

## Cloudflare Workers and D1

This service runs as a Cloudflare Worker backed by the `anubis-db` D1 database.

Useful commands:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm migrate:postgres
pnpm run deploy
```

Use Node.js 22.12 or newer and the pnpm version pinned in `package.json`.
Run `pnpm lint` for Oxlint, `pnpm format` to format with Oxfmt, and
`pnpm format:check` to check formatting. Validate changes with `pnpm typecheck`
and `pnpm test`.

`pnpm migrate:postgres` reads the source PostgreSQL URL from `DB_URL` or
`SOURCE_DB_URL`, exports a consistent read-only snapshot into a unique
`.d1-import/run-<unique>/` directory, and applies the SQL chunks to the remote D1
database with Wrangler. `D1_IMPORT_DIR` overrides the parent directory; existing
files and other export runs are preserved. Keep `CLOUDFLARE_API_TOKEN` in the shell
environment when running remote D1 or deploy commands.

## Contributing

The most straightforward way of contributing is just to use [Anubis](https://github.com/jonluca/anubis) and have it sends its results to AnubisDB.

Contributions to AnubisDB are always appreciated, as well. Currently parsing and over-use protections are lacking. Take a look at the issues and see if there is anything that you'd like to contribute to.
