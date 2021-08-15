const express = require("express");
const router = express.Router();
const Domains = require("../models/domains");
const tlds = require("../config/tlds");
const URL = require("url").URL;
const uniq = require("lodash/uniq");

router.get("/", (req, res, next) => {
  res.render("index", { title: "Anubis" });
});
const invalidChars = [
  "*",
  "\\",
  "'",
  "+",
  ",",
  "|",
  "!",
  '"',
  "£",
  "$",
  "%",
  "&",
  "/",
  "(",
  ")",
  "=",
  "?",
  "^",
  "*",
  "ç",
  "°",
  "§",
  ";",
  ":",
  "_",
  ">",
  "]",
  "[",
  "@",
  ")",
];

const verifyDomain = (domain) => {
  if (!domain) {
    return false;
  }

  const isInvalid = invalidChars.some((char) => domain.includes(char));
  if (isInvalid) {
    console.log(`Domain ${domain} is invalid`);
    return false;
  }
  const lowerDomain = domain.toLowerCase();

  const validTld = tlds.some((tld) => lowerDomain.endsWith(tld));
  if (validTld) {
    return true;
  }
  console.log(`Domain ${domain} does not end with any known TLD`);
  return false;
};

const verifySubdomains = (subdomains) => {
  return Array.isArray(subdomains);
};

const cleanDomain = (domain) => {
  try {
    const host = new URL(
      domain.startsWith("http") ? domain : `https://${domain}`
    );
    return (host.hostname || "").trim();
  } catch (e) {
    console.log(`Invalid domain: ${domain}`);
    console.log(e);
  }
  domain = (domain || "")
    .replace("https://", "")
    .replace("http://", "")
    .replace(/^www\./, "")
    .replace(/^\*\./, "")
    .toLowerCase()
    .trim();
  return domain;
};

router.get("/subdomains/:domain", ({ params }, res, next) => {
  const domainParam = params.domain;
  const domain = cleanDomain(domainParam);
  if (!verifyDomain(domain)) {
    console.log(`Invalid domain: ${domain}`);
    res.status(403);
    res.send({ error: "Invalid domain!" });
    res.end();
    return;
  }
  Domains.findOne({ domain: domain }, (err, docs) => {
    if (err) {
      console.log(`Error finding domain for post: ${domain}`);
      res.status(500);
      res.end();
      return;
    }
    // Domain not found
    if (!docs) {
      res.status(300);
      res.send([]);
      res.end();
      return;
    }
    res.status(200);
    res.send(docs.validSubdomains);
    res.end();
  });
});
router.post("/subdomains/:domain", ({ body, params }, res, next) => {
  let subdomains = body.subdomains;
  const domainParam = params.domain;
  if (typeof subdomains != "object") {
    try {
      subdomains = JSON.parse(subdomains);
    } catch (e) {
      console.log(`Error parsing JSON for ${domainParam}`);
      res.status(500);
      res.end();
      return;
    }
  }
  const domain = cleanDomain(domainParam);
  if (!verifyDomain(domain) || !verifySubdomains(subdomains)) {
    console.log(`Invalid domain: ${domain}`);
    res.status(403);
    res.send({ error: "Error with domains sent!" });
    res.end();
    return;
  }

  const validSubdomains = subdomains
    .flatMap((subdomain) => {
      return subdomain
        .split(/,|<br>/)
        .filter(Boolean)
        .map((splitSub) => {
          const newSub = cleanDomain(splitSub);
          if (verifyDomain(newSub) && newSub.endsWith("." + domain)) {
            return newSub;
          }
          return [];
        });
    })
    .filter(Boolean);
  Domains.findOne({ domain: { $regex: `.*${domain}` } }, (err, doc) => {
    if (err) {
      console.log(`Error finding domain for post: ${domain}`);
      res.status(500);
      res.end();
      return;
    }
    if (!doc) {
      console.log(`Domain ${domain} not found, creating domain`);
      const new_domain = new Domains({
        domain,
        validSubdomains,
      });
      new_domain.save((err, doc) => {
        if (err) {
          console.log(`Error creating ${domain}`);
          res.status(500);
          res.end();
          return;
        }
        console.log(`Succesfully created ${domain}`);
        res.status(200);
        res.end();
      });
    } else {
      for (const sub of validSubdomains) {
        if (!doc.validSubdomains.includes(sub)) {
          doc.validSubdomains.push(newSub);
        }
      }
      doc.validSubdomains = uniq(doc.validSubdomains);
      console.log(`Appended new subdomains to ${domain}`);
      doc.markModified("validSubdomains");
      doc.save((err, { validSubdomains }) => {
        if (err) {
          console.log(`Error appending to ${domain}`);
          res.status(500);
          res.end();
          return;
        }
        res.status(200);
        res.send(validSubdomains);
        res.end();
      });
    }
  });
});
module.exports = router;
