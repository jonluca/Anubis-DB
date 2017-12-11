var mongoose = require('mongoose');
var schema = new mongoose.Schema({
    domain: {
        type: String, index: true
    }, submittedSubdomains: {
        type: [String], default: []
    }, validSubdomains: {
        type: [String], default: []
    }
});
module.exports = mongoose.model('Domains', schema);