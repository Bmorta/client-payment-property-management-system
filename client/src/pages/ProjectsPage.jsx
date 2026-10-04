import { useEffect, useState } from "react";
import api from "../services/api.js";

const initialForm = { projectId:"", projectName:"", projectCode:"", description:"", location:"", startDate:"", status:"PLANNING" };

export default function ProjectsPage() {
  const [projects,setProjects]=useState([]), [form,setForm]=useState(initialForm);
  const [editingId,setEditingId]=useState(null), [message,setMessage]=useState(""), [error,setError]=useState(""), [loading,setLoading]=useState(true);
  const loadProjects=async()=>{try{setLoading(true);const {data}=await api.get("/projects");setProjects(data.data)}catch(e){setError(e.response?.data?.message||"Unable to load projects.")}finally{setLoading(false)}};
  useEffect(()=>{loadProjects()},[]);
  const reset=()=>{setForm(initialForm);setEditingId(null)};
  const submit=async e=>{e.preventDefault();setMessage("");setError("");try{const payload={...form,startDate:form.startDate||null};if(editingId){await api.put(`/projects/${editingId}`,payload);setMessage("Project updated successfully.")}else{await api.post("/projects",payload);setMessage("Project created successfully.")}reset();await loadProjects()}catch(err){setError(err.response?.data?.message||"Unable to save project.")}};
  const edit=p=>{setEditingId(p._id);setForm({projectId:p.projectId||"",projectName:p.projectName||"",projectCode:p.projectCode||"",description:p.description||"",location:p.location||"",startDate:p.startDate?p.startDate.slice(0,10):"",status:p.status||"PLANNING"});window.scrollTo({top:0,behavior:"smooth"})};
  const archive=async id=>{setMessage("");setError("");try{await api.patch(`/projects/${id}/archive`);setMessage("Project archived successfully.");await loadProjects()}catch(e){setError(e.response?.data?.message||"Unable to archive project.")}};
  return <main className="container-fluid py-4 px-4">
    <div className="mb-4"><p className="text-uppercase small fw-semibold text-secondary mb-1">Management</p><h1 className="h3 fw-bold mb-1">Projects</h1><p className="text-secondary mb-0">Create and manage projects before assigning clients and properties.</p></div>
    {message&&<div className="alert alert-success">{message}</div>}{error&&<div className="alert alert-danger">{error}</div>}
    <div className="row g-4"><div className="col-12 col-xl-4"><div className="card border-0 shadow-sm"><div className="card-body"><h2 className="h5 fw-bold">{editingId?"Edit Project":"Add Project"}</h2><form onSubmit={submit} className="mt-3">
      {[["projectId","Project ID",true],["projectName","Project Name",true],["projectCode","Project Code",true],["location","Location",false],["startDate","Start Date",false]].map(([key,label,required])=><div className="mb-3" key={key}><label className="form-label">{label}</label><input className="form-control" type={key==="startDate"?"date":"text"} value={form[key]} required={required} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}
      <div className="mb-3"><label className="form-label">Status</label><select className="form-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>PLANNING</option><option>ACTIVE</option><option>COMPLETED</option><option>ARCHIVED</option></select></div>
      <div className="mb-3"><label className="form-label">Description</label><textarea className="form-control" rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
      <div className="d-flex gap-2"><button className="btn btn-primary" type="submit">{editingId?"Update Project":"Add Project"}</button>{editingId&&<button className="btn btn-outline-secondary" type="button" onClick={reset}>Cancel</button>}</div>
    </form></div></div></div>
    <div className="col-12 col-xl-8"><div className="card border-0 shadow-sm"><div className="card-body"><div className="d-flex justify-content-between align-items-center mb-3"><h2 className="h5 fw-bold mb-0">Project List</h2><span className="badge text-bg-light">{projects.length} project(s)</span></div>
      {loading?<p className="text-secondary">Loading projects...</p>:<div className="table-responsive"><table className="table align-middle"><thead><tr><th>Project</th><th>Code</th><th>Location</th><th>Status</th><th className="text-end">Actions</th></tr></thead><tbody>{projects.length===0?<tr><td colSpan="5" className="text-center text-secondary py-4">No projects yet.</td></tr>:projects.map(p=><tr key={p._id}><td><div className="fw-semibold">{p.projectName}</div><div className="small text-secondary">{p.projectId}</div></td><td>{p.projectCode}</td><td>{p.location||"—"}</td><td><span className="badge text-bg-secondary">{p.status}</span></td><td className="text-end"><button className="btn btn-sm btn-outline-primary me-2" onClick={()=>edit(p)}>Edit</button>{p.status!=="ARCHIVED"&&<button className="btn btn-sm btn-outline-danger" onClick={()=>archive(p._id)}>Archive</button>}</td></tr>)}</tbody></table></div>}
    </div></div></div></div>
  </main>;
}
