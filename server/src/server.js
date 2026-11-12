import {startBackupScheduler} from "./services/databaseMaintenance.js";
import {inspectDatabaseReadiness} from "./services/databaseReadiness.js";
import "dotenv/config";
import {startMonitoring} from "./services/monitoringService.js";
import {repairClosedContractStatuses} from "./services/clientLifecycleSync.js";
import mongoose from "mongoose";
import app from "./app.js";

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required.");
}

const startServer = async () => {
  try {
    // Managed services wait for MongoDB rather than failing during Windows boot.
    const deadline=Date.now()+(process.env.REMS_MANAGED_SERVICE==='true'?90000:0);
    while(true){try{await mongoose.connect(MONGODB_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:5000});break}catch(error){if(Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,1500))}}
    console.log("MongoDB connected.");
    try {
      const readiness=await inspectDatabaseReadiness({record:true,probe:true});
      console.log('Database readiness: '+readiness.status);
      if(!readiness.ready)console.warn(readiness.issues.join(' ')+' Open Administration → System Health & Database Readiness. No migration ran.');
      if(readiness.contractReady){const repair=await repairClosedContractStatuses();if(repair.repaired||repair.lotsReturnedToReview)console.log(`Repaired ${repair.repaired} legacy closed-contract status record(s) and returned ${repair.lotsReturnedToReview} legacy cancelled lot(s) to property-release review.`)}
      else console.warn('Closed-contract status reconciliation deferred until contract schema readiness is verified.');
    } catch {console.warn('Database readiness could not be verified. Open System Health & Database Readiness. No migration ran.');}
    startMonitoring();
    startBackupScheduler();

    const server=app.listen(PORT, process.env.HOST||'0.0.0.0', () => {
      console.log("API listening on port " + PORT);
    });
    server.on('error',error=>{console.error('Server listener failed:',error.code||error.name);process.exit(1)});
    let stopping=false;const shutdown=()=>{if(stopping)return;stopping=true;server.close(async()=>{await mongoose.disconnect();process.exit(0)});setTimeout(()=>process.exit(1),25000).unref()};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
