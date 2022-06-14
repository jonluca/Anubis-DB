import mongoose from "mongoose";

const connectToDb = async () => {
  console.log("Connecting to mongo");
  await mongoose.connect("mongodb://127.0.0.1/admin");
  console.log("Connected to mongo");
};

export default connectToDb;
