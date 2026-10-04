import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    identifier: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.identifier.trim() || !form.password) {
      setError("Enter your username/email and password.");
      return;
    }

    try {
      setSubmitting(true);
      await login(form.identifier, form.password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to sign in. Please check your credentials and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page d-flex min-vh-100 align-items-center">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-5">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-4 p-md-5">
                <div className="mb-4">
                  <p className="text-uppercase small fw-semibold text-secondary mb-2">
                    Secure workspace
                  </p>
                  <h1 className="h3 fw-bold mb-2">
                    Client Payment & Property Management
                  </h1>
                  <p className="text-secondary mb-0">
                    Sign in to manage projects, clients, properties and payments.
                  </p>
                </div>

                <form onSubmit={handleSubmit} noValidate>
                  {error && (
                    <div className="alert alert-danger" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label" htmlFor="identifier">
                      Username or Email
                    </label>
                    <input
                      id="identifier"
                      type="text"
                      className="form-control form-control-lg"
                      value={form.identifier}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          identifier: event.target.value
                        }))
                      }
                      autoComplete="username"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="form-label" htmlFor="password">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      className="form-control form-control-lg"
                      value={form.password}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          password: event.target.value
                        }))
                      }
                      autoComplete="current-password"
                    />
                  </div>

                  <button
                    className="btn btn-primary btn-lg w-100"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? "Signing in..." : "Sign in"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
