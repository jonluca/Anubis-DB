import mongoose from "mongoose";

const schema = new mongoose.Schema({
  domain: {
    type: String,
    index: true,
  },
  validSubdomains: {
    type: [String],
    default: [],
    index: true,
  },
});

export default mongoose.model("Domains", schema);
