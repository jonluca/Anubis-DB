var express = require('express');
var router = express.Router();
var Domains = require('../models/domains');
var tlds = require('../config/tlds');
router.get('/', function (req, res, next) {
    res.render('index', {title: 'Express'});
});

function verifyDomain(domain) {
    var lowerDomain = domain.toLowerCase();
    for (var tld of tlds) {
        if (lowerDomain.endsWith(tld)) {
            return true;
        }
    }
    return false;
}

router.get('/subdomains/:domain', function (req, res, next) {
    var domain = req.params.domain;
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
    try {
        subdomains = JSON.parse(subdomains);
    } catch (e) {
        res.status(500);
        res.end();
        return;
    }
    var domain = req.params.domain;
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
