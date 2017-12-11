var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var Domains = require('../models/domains');
Domains.create;
router.get('/', function (req, res, next) {
    res.render('index', {title: 'Express'});
});
router.get('/subdomains/:domain', function (req, res, next) {
    var domain = req.param.domain;
    Domains.findOne({"domain": domain}, (err, docs) => {
        if (err) {
            res.status(500);
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
    var domain = req.param.domain;
    Domains.findOne({"domain": domain}, (err, doc) => {
        if (err) {
            res.status(500);
            res.end();
            return;
        }
        for (var sub of subdomains) {
            if (doc.validSubdomains.indexOf(sub) == -1) {
                doc.validSubdomains.push(sub);
            }
        }
        doc.markModified('validSubdomains');
        res.status(200);
        res.send(doc.validSubdomains);
        res.end();
    });
});
module.exports = router;
