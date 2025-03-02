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

A sample AJAX POST request looks like:

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

### Status Codes

| Status | Endpoint                                         |
| ------ | ------------------------------------------------ |
| 200    | Success                                          |
| 300    | Domain did/does not exist in database            |
| 403    | Invalid domain or subdomains                     |
| 500    | Server error saving or retrieving new subdomains |

## Limits

You're limited to 2000 requests per 15 minute period.

There is also a 10,000 subdomain limit per domain.

## Contributing

The most straightforward way of contributing is just to use [Anubis](https://github.com/jonluca/anubis) and have it sends its results to AnubisDB.

Contributions to AnubisDB are always appreciated, as well. Currently parsing and over-use protections are lacking. Take a look at the issues and see if there is anything that you'd like to contribute to.
