import express from "express";
import Domains from "../models/domains";
import {
  cleanDomain,
  getCleanedSubdomains,
  verifyDomain,
  verifySubdomains,
} from "../utils/domainUtils";

const router = express.Router();

router.get("/", (req, res) => {
  res.render("index");
});

router.get("/subdomains/:domain", async ({ params }, res) => {
  const domainParam = params.domain;
  const domain = cleanDomain(domainParam);

  if (!verifyDomain(domain)) {
    console.log(`Invalid domain: ${domain}`);
    res.status(403);
    res.send({ error: "Invalid domain!" });
    res.end();
    return;
  }

  try {
    const docs = await Domains.findOne({ domain }).exec();
    // Domain not found
    if (!docs) {
      res.status(300);
      res.send([]);
      res.end();
      return;
    }
    res.status(200);
    const cleanedSubdomains = getCleanedSubdomains(docs.validSubdomains || []);
    const response = cleanedSubdomains.filter((newSub) =>
      newSub.endsWith(`.${domain}`),
    );
    res.send(response);
    res.end();
  } catch {
    console.log(`Error finding domain for post: ${domain}`);
    res.status(500);
    res.end();
    return;
  }
});

router.post("/subdomains/:domain", async ({ body, params }, res) => {
  let subdomains = body.subdomains;
  const domainParam = params.domain;
  if (typeof subdomains != "object") {
    try {
      subdomains = JSON.parse(subdomains);
    } catch {
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

  const validSubdomains = getCleanedSubdomains(subdomains).filter((newSub) =>
    newSub.endsWith(`.${domain}`),
  );

  try {
    const doc = await Domains.findOne({
      domain: { $regex: `.*${domain}` },
    }).exec();

    if (!doc) {
      console.log(`Domain ${domain} not found, creating domain`);
      const newDomain = new Domains({
        domain,
        validSubdomains,
      });
      try {
        const newDoc = await newDomain.save();
        console.log(`Succesfully created ${domain}`);
        res.send({
          domain: newDoc.domain,
          validSubdomains: newDoc.validSubdomains,
        });
        res.status(200);
        res.end();
      } catch {
        console.log(`Error creating ${domain}`);
        res.status(500);
        res.end();
        return;
      }
    } else {
      doc.validSubdomains ??= [];
      doc.validSubdomains.push(...validSubdomains);
      doc.validSubdomains = getCleanedSubdomains(doc.validSubdomains);
      console.log(`Appended new subdomains to ${domain}`);
      doc.markModified("validSubdomains");
      try {
        const savedDoc = await doc.save();
        res.status(200);
        res.send({
          domain: savedDoc.domain,
          validSubdomains: savedDoc.validSubdomains,
        });
        res.end();
      } catch {
        console.log(`Error appending to ${domain}`);
        res.status(500);
        res.end();
      }
    }
  } catch (err) {
    console.error(err);
    console.log(`Error finding domain for post: ${domain}`);
    res.status(500);
    res.end();
    return;
  }
});

export default router;
