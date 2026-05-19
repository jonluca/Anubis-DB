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

| Status | Endpoint                                         |
| ------ | ------------------------------------------------ |
| 200    | Success                                          |
| 300    | Domain did/does not exist in database            |
| 403    | Invalid domain or subdomains                     |
| 429    | Rate limit exceeded                              |
| 500    | Server error saving or retrieving new subdomains |

## Limits

You're limited to 60 requests per 10 seconds per source IP. This is enforced at
Cloudflare's edge before requests reach the Worker.

IPs or prefixes found trying to bypass the rate limit by rotating addresses or
otherwise evading enforcement may be challenged or blocked.

There is also a 10,000 subdomain limit per domain.

## Cloudflare Workers and D1

This service runs as a Cloudflare Worker backed by the `anubis-db` D1 database.

Useful commands:

```sh
yarn dev
yarn db:migrate:local
yarn db:migrate:remote
yarn migrate:postgres
yarn deploy
```

`yarn migrate:postgres` reads the source PostgreSQL URL from `DB_URL` or
`SOURCE_DB_URL`, generates D1-compatible SQL chunks in `.d1-import`, and applies
them to the remote D1 database with Wrangler. Keep `CLOUDFLARE_API_TOKEN` in the
shell environment when running remote D1 or deploy commands.

## Contributing

The most straightforward way of contributing is just to use [Anubis](https://github.com/jonluca/anubis) and have it sends its results to AnubisDB.

Contributions to AnubisDB are always appreciated, as well. Currently parsing and over-use protections are lacking. Take a look at the issues and see if there is anything that you'd like to contribute to.
