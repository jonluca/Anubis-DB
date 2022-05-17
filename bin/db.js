const mongoose = require("mongoose");
const connectToDb = async () => {
  console.log("Connecting to mongo");
  await mongoose.connect("mongodb://127.0.0.1/admin", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("Connected to mongo");
  return true;
};
module.exports = connectToDb;
