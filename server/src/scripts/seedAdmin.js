import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/User.js";

const required = ["MONGODB_URI", "ADMIN_USERNAME", "ADMIN_EMAIL", "ADMIN_PASSWORD"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} is required.`);
  }
}

const seedAdmin = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({
    $or: [
      { username: process.env.ADMIN_USERNAME.toLowerCase() },
      { email: process.env.ADMIN_EMAIL.toLowerCase() }
    ]
  });

  if (existing) {
    console.log("An admin username or email already exists. No changes made.");
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);

  await User.create({
    username: process.env.ADMIN_USERNAME,
    firstName: "System",
    lastName: "Administrator",
    email: process.env.ADMIN_EMAIL,
    passwordHash,
    role: "ADMIN",
    isActive: true
  });

  console.log("Initial ADMIN user created.");
  await mongoose.disconnect();
};

seedAdmin().catch(async (error) => {
  console.error("Admin seed failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
