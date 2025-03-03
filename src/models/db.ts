import "dotenv/config";
import mongoose from "mongoose";

const dbUrl = process.env.MONGO_URL || "mongodb://127.0.0.1/admin";
const connectToDb = async () => {
  console.log("Connecting to mongo");
  await mongoose.connect(dbUrl);
  console.log("Connected to mongo");
};

export default connectToDb;
