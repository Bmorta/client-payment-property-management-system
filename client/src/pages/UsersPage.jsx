import { useEffect, useMemo, useState } from "react";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";

const initialForm = {
  username: "",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  role: "STAFF",
  isActive: true
};

const UserModal = ({ open, editingUser, onClose, onSaved }) => {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setForm(
      editingUser
        ? {
            username: editingUser.username,
            firstName: editingUser.firstName,
            lastName: editingUser.lastName,
            email: editingUser.email,
            password: "",
            role: editingUser.role,
            isActive: editingUser.isActive
          }
        : initialForm
    );
    setError("");
  }, [open, editingUser]);

  if (!open) return null;

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError("First name, last name and email are required.");
      return;
    }

    if (!editingUser && (!form.username.trim() || !form.password)) {
      setError("Username and password are required for a new user.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        role: form.role,
        isActive: form.isActive
      };

      if (!editingUser) {
        payload.username = form.username;
        payload.password = form.password;
      } else if (form.password) {
        payload.password = form.password;
      }

      if (editingUser) {
        await api.patch("/users/" + editingUser._id, payload);
      } else {
        await api.post("/users", payload);
      }

      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save the user.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop fade show" />
      <div className="modal fade show d-block" tabIndex="-1" role="dialog">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content border-0 shadow">
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-header">
                <h2 className="modal-title fs-5">
                  {editingUser ? "Edit User" : "Add User"}
                </h2>
                <button type="button" className="btn-close" onClick={onClose} />
              </div>

              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}

                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="username">Username</label>
                    <input
                      id="username"
                      name="username"
                      className="form-control"
                      value={form.username}
                      onChange={handleChange}
                      disabled={Boolean(editingUser)}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label" htmlFor="email">Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      className="form-control"
                      value={form.email}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label" htmlFor="firstName">First Name</label>
                    <input
                      id="firstName"
                      name="firstName"
                      className="form-control"
                      value={form.firstName}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label" htmlFor="lastName">Last Name</label>
                    <input
                      id="lastName"
                      name="lastName"
                      className="form-control"
                      value={form.lastName}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label" htmlFor="password">
                      Password {editingUser && <span className="text-secondary">(leave blank to keep)</span>}
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      className="form-control"
                      value={form.password}
                      onChange={handleChange}
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="col-md-3">
                    <label className="form-label" htmlFor="role">Role</label>
                    <select id="role" name="role" className="form-select" value={form.role} onChange={handleChange}>
                      <option value="ADMIN">ADMIN</option>
                      <option value="STAFF">STAFF</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                  </div>

                  <div className="col-md-3 d-flex align-items-end">
                    <div className="form-check mb-2">
                      <input
                        id="isActive"
                        name="isActive"
                        type="checkbox"
                        className="form-check-input"
                        checked={form.isActive}
                        onChange={handleChange}
                      />
                      <label className="form-check-label" htmlFor="isActive">
                        Active
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-light" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving..." : editingUser ? "Save Changes" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get("/users");
      setUsers(response.data.data);
      setPageError("");
    } catch (err) {
      setPageError(err.response?.data?.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;

    return users.filter((item) =>
      [item.username, item.fullName, item.email, item.role]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [users, search]);

  const openCreate = () => {
    setEditingUser(null);
    setModalOpen(true);
    setSuccess("");
  };

  const openEdit = (item) => {
    setEditingUser(item);
    setModalOpen(true);
    setSuccess("");
  };

  const handleSaved = async () => {
    setModalOpen(false);
    setEditingUser(null);
    setSuccess("User saved successfully.");
    await loadUsers();
  };

  return (
    <main className="container-fluid py-4 px-4">
      <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4">
        <div>
          <p className="text-uppercase small fw-semibold text-secondary mb-1">Administration</p>
          <h1 className="h3 fw-bold mb-1">Users</h1>
          <p className="text-secondary mb-0">Manage system accounts, roles and account status.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>Add User</button>
      </div>

      {pageError && <div className="alert alert-danger">{pageError}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label" htmlFor="userSearch">Search users</label>
            <input
              id="userSearch"
              className="form-control"
              placeholder="Search username, name, email or role"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="text-center py-4">Loading users...</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-4 text-secondary">No users found.</td></tr>
                ) : (
                  filteredUsers.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <div className="fw-semibold">{item.fullName}</div>
                        <div className="small text-secondary">@{item.username}</div>
                      </td>
                      <td>{item.email}</td>
                      <td><span className="badge text-bg-light">{item.role}</span></td>
                      <td>
                        <span className={`badge ${item.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                          {item.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : "Never"}</td>
                      <td className="text-end">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(item)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="small text-secondary mt-3">
            Signed in as {currentUser?.fullName} ({currentUser?.role})
          </div>
        </div>
      </div>

      <UserModal
        open={modalOpen}
        editingUser={editingUser}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </main>
  );
}
