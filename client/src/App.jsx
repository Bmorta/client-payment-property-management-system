import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import ClientsPage from "./pages/ClientsPage.jsx";
import ClientsPage from "./pages/ClientsPage.jsx";

const DashboardPage = () => (
  <main className="container-fluid py-4 px-4">
    <div className="mb-4">
      <p className="text-uppercase small fw-semibold text-secondary mb-1">Overview</p>
      <h1 className="h3 fw-bold mb-1">Dashboard</h1>
      <p className="text-secondary mb-0">Core financial and property modules will be added phase by phase.</p>
    </div>
    <div className="row g-3">
      {["Projects", "Clients", "Properties", "Collections"].map((item) => (
        <div className="col-12 col-sm-6 col-xl-3" key={item}>
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="small text-secondary">{item}</div>
              <div className="fs-3 fw-bold mt-2">—</div>
              <div className="small text-secondary mt-1">Coming in a later phase</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </main>
);

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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
