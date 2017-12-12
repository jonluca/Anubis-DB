var express = require('express');
var router = express.Router();
var Domains = require('../models/domains');
var tlds = require('../config/tlds');
var parse = require('url-parse');
router.get('/', function (req, res, next) {
    res.render('index', {title: 'Anubis'});
});

function verifyDomain(domain) {
    var invalid = ["'", "+", ",", "|", "!", "\"", "£", "$", "%", "&", "/", "(", ")", "=", "?", "^", "*", "ç", "°", "§", ";", ":", "_", ">", "]", "[", "@", ")"];
    for (var char of invalid) {
        if (domain.indexOf(char) != -1) {
            return false;
        }
    }
    var lowerDomain = domain.toLowerCase();
    for (var tld of tlds) {
        if (lowerDomain.endsWith(tld)) {
            return true;
        }
    }
    return false;
}

function cleanDomain(domain) {
    domain = domain.replace("https://", "");
    domain = domain.replace("http://", "");
    domain = domain.replace(/^www\./, "");
    var url = parse(domain, true);
    return url.hostname;
}

router.get('/subdomains/:domain', function (req, res, next) {
    var domain = req.params.domain;
    domain = cleanDomain(domain);
    if (!verifyDomain(domain) || domain == undefined) {
        res.status(403);
        res.end();
        return;
    }
    Domains.findOne({"domain": domain}, (err, docs) => {
        if (err) {
            res.status(500);
            res.end();
            return;
        }
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
    domain = cleanDomain(domain);
    if (!verifyDomain(domain) || domain == undefined || subdomains == undefined) {
        res.status(403);
        res.end();
        return;
    }
    try {
        subdomains = JSON.parse(subdomains);
    } catch (e) {
        res.status(500);
        res.end();
        return;
    }
    Domains.findOne({"domain": domain}, (err, doc) => {
        if (err) {
            res.status(500);
            res.end();
            return;
        }
        if (doc == undefined) {
            var new_domain = new Domains({
                domain: domain, validSubdomains: subdomains
            });
            new_domain.save((err, doc) => {
                if (err) {
                    res.status(500);
                    res.end();
                    return;
                }
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
            doc.markModified('validSubdomains');
            res.status(200);
            res.send(doc.validSubdomains);
            res.end();
        }
    });
});
module.exports = router;
