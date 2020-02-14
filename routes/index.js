var express = require('express');
var router = express.Router();
var Domains = require('../models/domains');
var tlds = require('../config/tlds');
router.get('/', function (req, res, next) {
    res.render('index', {title: 'Anubis'});
});

function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
}

function verifyDomain(domain) {
    var invalid = ["'", "+", ",", "|", "!", "\"", "£", "$", "%", "&", "/", "(", ")", "=", "?", "^", "*", "ç", "°", "§", ";", ":", "_", ">", "]", "[", "@", ")"];
    for (var char of invalid) {
        if (domain.indexOf(char) != -1) {
            console.log(`Domain ${domain} failed with char ${char}`);
            return false;
        }
    }
    var lowerDomain = domain.toLowerCase();
    for (var tld of tlds) {
        if (lowerDomain.endsWith(tld)) {
            return true;
        }
    }
    console.log(`Domain ${domain} does not end with any known TLD`);
    return false;
}

function verifySubdomains(subdomains) {
    if (!Array.isArray(subdomains)) {
        console.log(`Subdomains is not an array`);
        return false;
    }
    return true;
}

function cleanDomain(domain) {
    try{
        const url = new URL(domain.startsWith('http') ? domain : `https://${domain}`);
        return domain.hostname;
    }catch(e){
        console.log(`Invalid domain: ${domain}`);
    }
    domain = domain.replace("https://", "");
    domain = domain.replace("http://", "");
    domain = domain.replace(/^www\./, "");
    return domain;
}

var remove_sub_domain = function (v) {
    return domain;
};
router.get('/subdomains/:domain', function (req, res, next) {
    var domain = req.params.domain;
    domain = cleanDomain(domain);
    if (!verifyDomain(domain) || domain == undefined) {
        console.log(`Invalid domain: ${domain}`);
        res.status(403);
        res.send({"error": "Invalid domain!"});
        res.end();
        return;
    }
    Domains.findOne({"domain": domain}, (err, docs) => {
        if (err) {
            console.log(`Error finding domain for post: ${domain}`);
            res.status(500);
            res.end();
            return;
        }
        // Domain not found
        if (docs == undefined) {
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
router.post('/subdomains/:domain', function (req, res, next) {
    var subdomains = req.body.subdomains;
    var domain = req.params.domain;
    if (typeof(subdomains) != "object") {
        try {
            subdomains = JSON.parse(subdomains);
        } catch (e) {
            console.log(`Error parsing JSON for ${domain}`);
            res.status(500);
            res.end();
            return;
        }
    }
    domain = cleanDomain(domain);
    if (!verifyDomain(domain) || !verifySubdomains(subdomains) || domain == undefined || subdomains == undefined) {
        console.log(`Invalid domain: ${domain}`);
        res.status(403);
        res.send({"error": "Error with domains sent!"});
        res.end();
        return;
    }
    Domains.findOne({"domain": domain}, (err, doc) => {
        if (err) {
            console.log(`Error finding domain for post: ${domain}`);
            res.status(500);
            res.end();
            return;
        }
        if (doc == undefined) {
            console.log(`Domain ${domain} not found, creating domain`);
            var new_domain = new Domains({
                domain: domain, validSubdomains: subdomains
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
        }
        else {
            for (var sub of subdomains) {
                if (doc.validSubdomains.indexOf(sub) == -1) {
                    doc.validSubdomains.push(sub);
                }
            }
            doc.validSubdomains = doc.validSubdomains.filter(onlyUnique); // Sanity check for only unique addresses
            console.log(`Appended new subdomains to ${domain}`);
            doc.markModified('validSubdomains');
            doc.save((err, doc) => {
                if (err) {
                    console.log(`Error appending to ${domain}`);
                    res.status(500);
                    res.end();
                    return;
                }
                res.status(200);
                res.send(doc.validSubdomains);
                res.end();
            });
        }
    });
});
module.exports = router;
