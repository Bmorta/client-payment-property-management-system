import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute() {
  const { user, loading,sessionError,retrySession,clearSession } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="d-flex min-vh-100 align-items-center justify-content-center">
        <div className="spinner-border" role="status" aria-label="Loading" />
      </div>
    );
  }

  if(sessionError)return <main className="min-vh-100 d-flex align-items-center justify-content-center p-4"><section className="card shadow-sm" style={{maxWidth:520}} role="alert"><div className="card-body"><h1 className="h4">Connection needs attention</h1><p>{sessionError}</p><div className="d-flex flex-wrap gap-2"><button type="button" className="btn btn-primary" onClick={retrySession}>Retry Session Check</button><button type="button" className="btn btn-outline-secondary" onClick={()=>clearSession()}>Return to Sign In</button></div></div></section></main>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
