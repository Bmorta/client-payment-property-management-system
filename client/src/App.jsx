import FeedbackHost from "./components/FeedbackHost.jsx";
import DialogNavigation from "./components/DialogNavigation.jsx";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import ManageLotsPage from "./pages/ManageLotsPage.jsx";
import PaymentTransactionsPage from "./pages/PaymentTransactionsPage.jsx";
const CompaniesPage=lazy(()=>import("./pages/CompaniesPage.jsx"));
const HistoricalMigrationPage=lazy(()=>import("./pages/HistoricalMigrationPage.jsx"));
const ClientAccountsPage=lazy(()=>import("./pages/ClientAccountsPage.jsx"));
const InventoryPage=lazy(()=>import("./pages/InventoryPage.jsx"));
const PaymentPage=lazy(()=>import("./pages/PaymentPage.jsx"));
const ApprovalRequestsPage=lazy(()=>import("./pages/ApprovalRequestsPage.jsx"));
const ExpensesPage=lazy(()=>import("./pages/ExpensesPage.jsx"));
const ReportsPage=lazy(()=>import("./pages/ReportsPage.jsx"));
const AgentsPage=lazy(()=>import("./pages/AgentsPage.jsx"));
const CommissionsPage=lazy(()=>import("./pages/CommissionsPage.jsx"));
const ClientsPage=lazy(()=>import("./pages/ClientsPage.jsx"));

const PaymentMonitoringPage=lazy(()=>import("./pages/PaymentMonitoringPage.jsx"));
const DashboardPage=()=> <PaymentMonitoringPage dashboard/>;

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (user?.role !== "ADMIN") {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter><DialogNavigation/><FeedbackHost/><Suspense fallback={<p className="p-4">Loading...</p>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/companies" element={<CompaniesPage/>}/>
              <Route path="/historical-migration" element={<HistoricalMigrationPage />} />
              <Route path="/property-inventory" element={<InventoryPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId/lots" element={<ManageLotsPage />} />
              <Route path="/agents" element={<AgentsPage/>}/>
              <Route path="/commissions" element={<CommissionsPage/>}/>
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/:clientId/accounts" element={<ClientAccountsPage/>}/>
              <Route path="/payment-transactions" element={<PaymentTransactionsPage />} />
              <Route path="/payment-monitoring" element={<PaymentMonitoringPage />} />
              <Route path="/approval-requests" element={<AdminRoute><ApprovalRequestsPage /></AdminRoute>} />
              <Route path="/payment" element={<PaymentPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense></BrowserRouter>
    </AuthProvider>
  );
}
