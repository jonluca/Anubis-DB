import mongoose from "mongoose";

const schema = new mongoose.Schema({
  domain: {
    type: String,
    index: true,
  },
  validSubdomains: {
    type: [String],
    default: [],
  },
});

export default mongoose.model("Domains", schema);
