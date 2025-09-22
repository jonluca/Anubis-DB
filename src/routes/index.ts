import express from "express";
import Domains from "../models/domains";
import {
  cleanDomain,
  getCleanedSubdomains,
  verifyDomain,
  verifySubdomains,
} from "../utils/domainUtils";

const router = express.Router();

// Helper functions
const sendErrorResponse = (res, statusCode, errorMessage) => {
  console.error(errorMessage);
  return res.status(statusCode).json({ error: errorMessage }).end();
};

/**
 * Render index page
 */
router.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
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
</html>`);
});

/**
 * Get subdomains for a specified domain
 */
router.get("/subdomains/:domain", async (req, res) => {
  const domain = cleanDomain(req.params.domain);

  if (!verifyDomain(domain)) {
    return sendErrorResponse(res, 403, "Invalid domain");
  }

  try {
    const subdomains = await Domains.getSubdomains(domain);
    return res.status(200).json(subdomains).end();
  } catch (error) {
    console.error("Error fetching subdomains:", error);
    return sendErrorResponse(res, 500, `Error retrieving domain: ${domain}`);
  }
});

/**
 * Add subdomains to a specified domain
 */
router.post("/subdomains/:domain", async (req, res) => {
  const domain = cleanDomain(req.params.domain);
  let subdomains = req.body.subdomains;

  // Parse subdomains if it's a string
  if (typeof subdomains === "string") {
    try {
      subdomains = JSON.parse(subdomains);
    } catch {
      return sendErrorResponse(res, 400, `Invalid JSON format for subdomains`);
    }
  }

  // Basic validation
  if (!verifyDomain(domain) || !verifySubdomains(subdomains)) {
    return sendErrorResponse(res, 403, "Invalid domain or subdomains");
  }

  try {
    // Let the database handle everything in a single query
    // Database will filter subdomains and handle duplicates
    const validSubdomains = getCleanedSubdomains(subdomains);
    const validSubdomainsForDomain = validSubdomains.filter((sub) =>
      sub.endsWith(`.${domain}`),
    );
    const result = await Domains.addSubdomainsToDomain(
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

    return res
      .status(statusCode)
      .json({
        domain: result.domain,
        validSubdomains: result.subdomains,
      })
      .end();
  } catch (error) {
    console.error("Error processing domain:", error);
    return sendErrorResponse(
      res,
      500,
      `Server error processing domain: ${domain}`,
    );
  }
});

export default router;
