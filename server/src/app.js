import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {applicationIdentity} from './services/systemHealth.js';
import maintenanceRoutes from "./routes/maintenanceRoutes.js";
import {maintenanceWriteGate} from "./services/maintenanceGate.js";
import officePayoutRoutes from "./routes/officePayoutRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import migrationRoutes from "./routes/migrationRoutes.js";
import listReportRoutes from "./routes/listReportRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import commissionRoutes from "./routes/commissionRoutes.js";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import financeRoutes from "./routes/financeRoutes.js";
import clientRoutes from "./routes/clientRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));

app.use("/api/projects/:projectId/map",express.json({limit:"6mb"}));
app.use("/api/companies",express.json({limit:"4mb"}));
app.use("/api/migration",express.json({limit:"6mb"}));
app.use(express.json({ limit: "1mb" }));
app.use(maintenanceWriteGate);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    ...applicationIdentity,
    instanceId:process.env.REMS_INSTANCE_ID||null,
    message: "Client Payment & Property Management API is running."
  });
});

app.use("/api/maintenance",maintenanceRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/agents",agentRoutes);
app.use("/api/companies",companyRoutes);
app.use("/api/commissions",commissionRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/office-payouts",officePayoutRoutes);
app.use("/api/migration", migrationRoutes);
app.use("/api/activity-logs", activityRoutes);

app.use("/api/list-reports", listReportRoutes);

// Production serves the existing frontend from the same origin as its API.
// Unknown API routes remain JSON errors, never the login HTML.
app.use('/api',notFound);
if(process.env.NODE_ENV==='production'){
 const root=path.resolve(process.env.REMS_FRONTEND_DIR||fileURLToPath(new URL('../../client/dist',import.meta.url)));
 if(fs.existsSync(path.join(root,'index.html'))){const assets=express.static(root,{dotfiles:'deny',index:false});app.use((req,res,next)=>{const allowed=req.path==='/index.html'||/^\/(?:assets|branding)\/[^?]+\.(?:js|css|png|jpe?g|webp|gif|svg|ico|woff2?|ttf)$/i.test(req.path);if(!allowed)return next();assets(req,res,next)});app.get('/{*page}',(req,res,next)=>{if(!req.accepts('html')||path.extname(req.path)||req.path.split('/').some(part=>part.startsWith('.')))return next();res.sendFile(path.join(root,'index.html'))})}
}
app.use(notFound);
app.use(errorHandler);

export default app;
