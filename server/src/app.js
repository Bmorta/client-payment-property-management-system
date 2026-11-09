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

app.use(notFound);
app.use(errorHandler);

export default app;
