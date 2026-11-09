import {useSearchParams} from "react-router-dom";
import CenterPopup from "../components/CenterPopup.jsx";
import FeedbackMessage from "../components/FeedbackMessage.jsx";
import ListReportActions from "../components/ListReportActions.jsx";
import SearchInput from "../components/SearchInput.jsx";
import {default as FieldLabel,RequiredNote} from "../components/FieldLabel.jsx";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
const ActivityLogs = lazy(() => import("../components/ActivityLogs.jsx"));
import { manilaTimestamp } from "../utils/manilaTime.js";
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
            <form onSubmit={handleSubmit} noValidate><RequiredNote/>
              <div className="modal-header">
                <h2 className="modal-title fs-5">
                  {editingUser ? "Edit User" : "Add User"}
                </h2>
                <button type="button" className="btn-close" onClick={onClose} />
              </div>

              <div className="modal-body">
                <FeedbackMessage kind="error" message={error}/>

                <div className="row g-3">
                  <div className="col-md-6">
                    <FieldLabel className="form-label" htmlFor="username">Username
                    <input
                      id="username" required={!editingUser}
                      name="username"
                      className="form-control"
                      value={form.username}
                      onChange={handleChange}
                      disabled={Boolean(editingUser)}
                    /></FieldLabel>
                  </div>

                  <div className="col-md-6">
                    <FieldLabel className="form-label" htmlFor="email">Email
                    <input
                      id="email" required
                      name="email"
                      type="email"
                      className="form-control"
                      value={form.email}
                      onChange={handleChange}
                    /></FieldLabel>
                  </div>

                  <div className="col-md-6">
                    <FieldLabel className="form-label" htmlFor="firstName">First Name
                    <input
                      id="firstName" required
                      name="firstName"
                      className="form-control"
                      value={form.firstName}
                      onChange={handleChange}
                    /></FieldLabel>
                  </div>

                  <div className="col-md-6">
                    <FieldLabel className="form-label" htmlFor="lastName">Last Name
                    <input
                      id="lastName" required
                      name="lastName"
                      className="form-control"
                      value={form.lastName}
                      onChange={handleChange}
                    /></FieldLabel>
                  </div>

                  <div className="col-md-6">
                    <FieldLabel className="form-label" htmlFor="password">
                      Password {editingUser && <span className="text-secondary">(leave blank to keep)</span>}

                    <input
                      id="password" required={!editingUser}
                      name="password"
                      type="password"
                      className="form-control"
                      value={form.password}
                      onChange={handleChange}
                      autoComplete="new-password"
                    /></FieldLabel>
                  </div>

                  <div className="col-md-3">
                    <FieldLabel className="form-label" htmlFor="role">Role
                    <select id="role" name="role" className="form-select" value={form.role} onChange={handleChange}>
                      <option value="ADMIN">ADMIN</option>
                      <option value="STAFF">STAFF</option>
                      <option value="VIEWER">VIEWER</option>
                    </select></FieldLabel>
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
                      <FieldLabel className="form-check-label" htmlFor="isActive">
                        Active
                      </FieldLabel>
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
  const [params,setParams]=useSearchParams();
  const tab=params.get("tab")==="activity"?"activity":"users",setTab=tab=>setParams({tab});
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [statusFilter,setStatusFilter]=useState(""),[statusTarget,setStatusTarget]=useState(null),[statusBusy,setStatusBusy]=useState(false);

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
    const scoped=users.filter(u=>!statusFilter||(statusFilter==="ACTIVE"?u.isActive:!u.isActive));
    if (!term) return scoped;

    return scoped.filter((item) =>
      [item.username, item.fullName, item.email, item.role]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [users, search, statusFilter]);

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
        {tab === "users" && <button className="btn btn-primary" onClick={openCreate}>Add User</button>}
      </div>

      <div className="nav nav-tabs mb-4" role="tablist" aria-label="User management tabs">
        <button className={`nav-link ${tab === "users" ? "active" : ""}`} role="tab" aria-selected={tab === "users"} onClick={() => setTab("users")}>Users</button>
        <button className={`nav-link ${tab === "activity" ? "active" : ""}`} role="tab" aria-selected={tab === "activity"} onClick={() => setTab("activity")}>User Activity Logs</button>
      </div>
      {tab === "activity" ? <Suspense fallback={<p role="status">Loading activity logs...</p>}><ActivityLogs users={users} /></Suspense> : <>
      <FeedbackMessage kind="error" message={pageError}/>
      <FeedbackMessage kind="success" message={success}/>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="mb-3">
            <SearchInput label="Search users" value={search} onChange={value=>{setSearch(value);}} items={users.map(u=>({key:u._id,label:u.username,detail:`${u.firstName} ${u.lastName} ${u.email} ${u.role}`}))}/>
          </div>

          <FieldLabel>Status<select className="form-select mb-3" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All users</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></FieldLabel><ListReportActions module="users" filters={{q:search,status:statusFilter}} onRefresh={loadUsers} disabled={loading}/>
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
                      <td>{item.lastLoginAt ? manilaTimestamp(item.lastLoginAt) : "Never"}</td>
                      <td className="text-end">
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => openEdit(item)}>
                          Edit
                        </button>
                        {String(item._id)!==String(currentUser?._id)&&<button className="btn btn-sm btn-outline-secondary ms-2" disabled={statusBusy} onClick={()=>setStatusTarget(item)}>{item.isActive?"Deactivate":"Activate"}</button>}
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
      </>}
      <CenterPopup confirm={statusTarget?`${statusTarget.isActive?'Deactivate':'Activate'} ${statusTarget.username}? Deactivation blocks access immediately; user identity and audit history remain preserved.`:''} confirmTitle="Confirm user status" confirmLabel={statusBusy?'Saving…':'Confirm Status Change'} onClose={()=>{if(!statusBusy)setStatusTarget(null)}} onConfirm={async()=>{if(statusBusy)return;setStatusBusy(true);const chosen=statusTarget;try{const r=await api.patch(`/users/${chosen._id}`,{isActive:!chosen.isActive});setStatusTarget(null);setSuccess(r.data.message);await loadUsers()}catch(e){setStatusTarget(null);setPageError(e.response?.data?.message||'Unable to change user status.')}finally{setStatusBusy(false)}}}/>
    </main>
  );
}
