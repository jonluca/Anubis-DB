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
  res.render("index");
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
    const domainDoc = await Domains.findOne({ domain }).exec();

    // Domain not found
    if (!domainDoc) {
      return res.status(204).json([]).end();
    }

    const cleanedSubdomains = getCleanedSubdomains(
      domainDoc.validSubdomains || [],
    );
    const response = cleanedSubdomains.filter((subdomain) =>
      subdomain.endsWith(`.${domain}`),
    );

    return res.status(200).json(response).end();
  } catch {
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

  // Validate domain and subdomains
  if (!verifyDomain(domain) || !verifySubdomains(subdomains)) {
    return sendErrorResponse(res, 403, "Invalid domain or subdomains");
  }

  // Filter valid subdomains for this domain
  const validSubdomains = getCleanedSubdomains(subdomains).filter((subdomain) =>
    subdomain.endsWith(`.${domain}`),
  );

  try {
    // Find domain or create new one
    const domainDoc = await Domains.findOne({ domain }).exec();

    if (!domainDoc) {
      return await createNewDomain(domain, validSubdomains, res);
    } else {
      return await updateExistingDomain(domainDoc, validSubdomains, res);
    }
  } catch {
    return sendErrorResponse(
      res,
      500,
      `Server error processing domain: ${domain}`,
    );
  }
});

/**
 * Create a new domain with subdomains
 */
async function createNewDomain(domain, validSubdomains, res) {
  try {
    const newDomain = new Domains({
      domain,
      validSubdomains,
    });

    const newDoc = await newDomain.save();
    console.log(`Successfully created domain: ${domain}`);

    return res
      .status(201)
      .json({
        domain: newDoc.domain,
        validSubdomains: newDoc.validSubdomains,
      })
      .end();
  } catch {
    return sendErrorResponse(res, 500, `Error creating domain: ${domain}`);
  }
}

/**
 * Update an existing domain with new subdomains
 */
async function updateExistingDomain(domainDoc, validSubdomains, res) {
  try {
    // Ensure validSubdomains exists
    domainDoc.validSubdomains = domainDoc.validSubdomains || [];

    // Add new subdomains and remove duplicates
    domainDoc.validSubdomains.push(...validSubdomains);
    domainDoc.validSubdomains = getCleanedSubdomains(domainDoc.validSubdomains);

    domainDoc.markModified("validSubdomains");
    const savedDoc = await domainDoc.save();

    console.log(`Updated subdomains for domain: ${savedDoc.domain}`);

    return res
      .status(200)
      .json({
        domain: savedDoc.domain,
        validSubdomains: savedDoc.validSubdomains,
      })
      .end();
  } catch {
    return sendErrorResponse(
      res,
      500,
      `Error updating domain: ${domainDoc.domain}`,
    );
  }
}

export default router;
