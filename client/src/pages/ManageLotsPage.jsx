import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import PropertyInventory from "./PropertyInventory.jsx";

export default function ManageLotsPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setLoading(true);
    setError("");

    api.get(`/projects/${projectId}`)
      .then(({ data }) => {
        if (!cancelled) setProject(data.data);
      })
      .catch(e => {
        if (!cancelled) {
          setError(e.response?.data?.message || "Unable to load project. Please try again from the Project List.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [projectId]);

  return <main className="container-fluid py-4 px-4">
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
      <div>
        <p className="text-uppercase small fw-semibold text-secondary mb-1">Management</p>
        <h1 className="h3 fw-bold mb-1">Manage Lots</h1>
        {project && <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="text-secondary">{project.projectName} · {project.projectCode}</span>
          <StatusBadge status={project.status} />
        </div>}
      </div>
      <Link className="btn btn-outline-secondary" to="/projects">Back to Project List</Link>
    </div>

    {loading && <p className="text-secondary" role="status">Loading project...</p>}
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {!loading && !error && project && <PropertyInventory key={project._id} project={project} />}
  </main>;
}
