import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell min-vh-100">
      <nav className="navbar navbar-expand-lg bg-white border-bottom">
        <div className="container-fluid px-4">
          <NavLink className="navbar-brand fw-bold" to="/">
            Client Payment System
          </NavLink>

          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#mainNav"
            aria-controls="mainNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="collapse navbar-collapse" id="mainNav">
            <div className="navbar-nav me-auto">
              <NavLink className="nav-link" to="/">
                Dashboard
              </NavLink>
            </div>

            <div className="d-flex align-items-center gap-3">
              <div className="text-end">
                <div className="fw-semibold">{user?.fullName}</div>
                <div className="small text-secondary">
                  {user?.role} · {user?.username}
                </div>
              </div>

              <button className="btn btn-outline-secondary" onClick={logout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
