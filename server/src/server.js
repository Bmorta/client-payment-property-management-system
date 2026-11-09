import {startBackupScheduler} from "./services/databaseMaintenance.js";
import {inspectActiveContracts} from "./services/activeContractUpgrade.js";
import "dotenv/config";
import {startMonitoring} from "./services/monitoringService.js";
import mongoose from "mongoose";
import app from "./app.js";

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required.");
}

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected.");
    try {
      const readiness=await inspectActiveContracts(mongoose.connection.db);
      if(readiness.legacyIndexes.length||readiness.legacyAccounts||!readiness.activeIndexPresent)console.warn("Database setup needs administrator review. Open Administration → Database & Backups. No active-contract upgrade was applied automatically.");
    } catch { console.warn("Database readiness could not be checked. Open Administration → Database & Backups for administrator review."); }
    startMonitoring();
    startBackupScheduler();

    app.listen(PORT, () => {
      console.log("API listening on port " + PORT);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
