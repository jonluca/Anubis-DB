# Anubis-DB

Sister project to [Anubis](https://github.com/jonluca/Anubis)

## About

This server came about due to a lack of free and open APIs for subdomain enumeration. 

## Usage

There is only one endpoing - `https://jonlu.ca/anubis/subdomains/:domain`, where `:domain` is the domain. 

| Method | Endpoint | Parameters | Return | 
| -------- | -------- | -------- | -------- |
| GET | `https://jonlu.ca/anubis/subdomains/:domain` | `:domain`: Valid domain (e.g. google.com, reddit.com, etc)| `["reddit.com","www.reddit.com","blog.reddit.com"...]`|
| POST | `https://jonlu.ca/anubis/subdomains/:domain` | `subdomains`: Array of submitted subdomains | Status Code (see below) |


A sample AJAX POST request looks like:

```
$.ajax({
    method: 'POST',
    url: "https://jonlu.ca/anubis/subdomains/reddit.com",
    type: 'json',
    data: { 
        "subdomains": ["reddit.com","www.reddit.com","blog.reddit.com"]
    }
    success: function(data, textStatus, jqXHR) {
        //Handle data and status code here
    }
});
```

### Status Codes

| Status | Endpoint | 
| -------- | -------- | 
| 200 | Success |
| 300 | Domain does not exist in database | 
| 403 | Invalid domain or subdomains | 
| 500 | Error saving or retrieving new subdomains | 

## Limits

You're limited to 100 requests per 15 minute period.

There is also a 10,000 subdomain limit.

## Contributing

