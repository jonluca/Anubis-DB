const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost/admin", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
});
const schema = new mongoose.Schema({
  domain: {
    type: String,
    index: true,
  },
  submittedSubdomains: {
    type: [String],
    default: [],
  },
  validSubdomains: {
    type: [String],
    default: [],
  },
});

module.exports = mongoose.model("Domains", schema);
