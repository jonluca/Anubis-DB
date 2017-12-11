var mongoose = require('mongoose');
var schema = new mongoose.Schema({
    domain: String, submittedSubdomains: {
        type: Array, default: []
    }, validSubdomains: {
        type: Array, default: []
    }
});
module.exports = mongoose.model('Domains', schema);