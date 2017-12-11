var mongoose = require('mongoose');
const options = {
    useMongoClient: true
};
mongoose.connect("mongodb://localhost/admin", options);
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