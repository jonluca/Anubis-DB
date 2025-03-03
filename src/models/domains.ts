import mongoose from "mongoose";

const schema = new mongoose.Schema({
  domain: {
    type: String,
    required: true,
    unique: true, // Ensures domains are unique in the collection
    index: true, // Maintains the default index
  },
  validSubdomains: {
    type: [String],
    default: [],
    index: true,
  },
});
// Create a custom index on validSubdomains with options
// This can help with queries that search for specific subdomains
schema.index(
  { validSubdomains: 1 },
  {
    name: "subdomains_lookup",
    background: true,
    // Sparse option makes this more efficient if some documents have empty arrays
    sparse: true,
  },
);

export default mongoose.model("Domains", schema);
