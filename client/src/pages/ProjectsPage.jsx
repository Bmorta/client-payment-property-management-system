import FeedbackMessage from "../components/FeedbackMessage.jsx";
import ListReportActions from "../components/ListReportActions.jsx";
import SearchInput from "../components/SearchInput.jsx";
import {revealTarget} from "../utils/navigation.js";
import {default as FieldLabel,RequiredNote} from "../components/FieldLabel.jsx";
import { useEffect, useState } from "react";
import api from "../services/api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { Link } from "react-router-dom";

const initialForm = { projectId:"", projectName:"", projectCode:"", description:"", location:"", startDate:"", status:"PLANNING" };

export default function ProjectsPage() {
  const [query,setQuery]=useState("");
  const [projects,setProjects]=useState([]), [form,setForm]=useState(initialForm);
  const [editingId,setEditingId]=useState(null), [message,setMessage]=useState(""), [error,setError]=useState(""), [loading,setLoading]=useState(true);
  const loadProjects=async()=>{try{setLoading(true);const {data}=await api.get("/projects");setProjects(data.data)}catch(e){setError(e.response?.data?.message||"Unable to load projects.")}finally{setLoading(false)}};
  useEffect(()=>{loadProjects()},[]);
  const reset=()=>{setForm(initialForm);setEditingId(null)};
  const submit=async e=>{e.preventDefault();setMessage("");setError("");try{const {projectId,...editable}=form;const payload={...editable,startDate:form.startDate||null};if(editingId){await api.put(`/projects/${editingId}`,payload);setMessage("Project updated successfully.")}else{await api.post("/projects",payload);setMessage("Project created successfully.")}reset();await loadProjects()}catch(err){setError(err.response?.data?.message||"Unable to save project.")}};
  const edit=p=>{setEditingId(p._id);setForm({projectId:p.projectId||"",projectName:p.projectName||"",projectCode:p.projectCode||"",description:p.description||"",location:p.location||"",startDate:p.startDate?p.startDate.slice(0,10):"",status:p.status||"PLANNING"});setTimeout(()=>revealTarget(document.querySelector("main form")),0)};
  const archive=async id=>{setMessage("");setError("");try{await api.patch(`/projects/${id}/archive`);setMessage("Project archived successfully.");await loadProjects()}catch(e){setError(e.response?.data?.message||"Unable to archive project.")}};
  const visible=projects.filter(p=>[p.projectId,p.projectName,p.projectCode,p.location].join(" ").toLowerCase().includes(query.toLowerCase()));
  return <main className="container-fluid py-4 px-4">
    <div className="mb-4"><p className="text-uppercase small fw-semibold text-secondary mb-1">Management</p><h1 className="h3 fw-bold mb-1">Projects</h1><p className="text-secondary mb-0">Create and manage projects before assigning clients and properties.</p></div>
    <FeedbackMessage kind="success" message={message}/><FeedbackMessage kind="error" message={error}/>
    <div className="row g-4"><div className="col-12 col-xl-4"><div className="card border-0 shadow-sm"><div className="card-body"><h2 className="h5 fw-bold">{editingId?"Edit Project":"Add Project"}</h2><form onSubmit={submit} className="mt-3"><RequiredNote/>
      {[["projectId","Project ID",false],["projectName","Project Name",true],["projectCode","Project Code",true],["location","Location",false],["startDate","Start Date",false]].map(([key,label,required])=><div className="mb-3" key={key}><FieldLabel className="form-label">{label}<input className="form-control" type={key==="startDate"?"date":"text"} value={form[key]} readOnly={key==="projectId"} placeholder={key==="projectId"?"Assigned automatically when saved":undefined} required={required} onChange={e=>setForm({...form,[key]:e.target.value})}/></FieldLabel></div>)}
      <div className="mb-3"><FieldLabel className="form-label">Status<select className="form-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>PLANNING</option><option>ACTIVE</option><option>COMPLETED</option><option>ARCHIVED</option></select></FieldLabel></div>
      <div className="mb-3"><FieldLabel className="form-label">Description<textarea className="form-control" rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></FieldLabel></div>
      <div className="d-flex gap-2"><button className="btn btn-primary" type="submit">{editingId?"Update Project":"Add Project"}</button>{editingId&&<button className="btn btn-outline-secondary" type="button" onClick={reset}>Cancel</button>}</div>
    </form></div></div></div>
    <div className="col-12 col-xl-8"><div className="card border-0 shadow-sm"><div className="card-body"><div className="d-flex justify-content-between align-items-center mb-3"><h2 className="h5 fw-bold mb-0">Project List</h2><span className="badge text-bg-light">{visible.length} project(s)</span></div>
      <SearchInput label="Search projects" value={query} onChange={setQuery} items={projects.map(p=>({key:p._id,label:p.projectName,detail:`${p.projectId} ${p.projectCode} ${p.location||""}`}))}/><ListReportActions module="projects" filters={{q:query}} onRefresh={loadProjects} disabled={loading}/>{loading?<p className="text-secondary">Loading projects...</p>:<div className="table-responsive"><table className="table align-middle"><thead><tr><th>Project</th><th>Code</th><th>Location</th><th>Status</th><th className="text-end">Actions</th></tr></thead><tbody>{visible.length===0?<tr><td colSpan="5" className="text-center text-secondary py-4">No projects yet.</td></tr>:visible.map(p=><tr key={p._id}><td><div className="fw-semibold">{p.projectName}</div><div className="small text-secondary">{p.projectId}</div></td><td>{p.projectCode}</td><td>{p.location||"—"}</td><td><StatusBadge status={p.status} /></td><td className="text-end"><button className="btn btn-sm btn-outline-primary me-2" onClick={()=>edit(p)}>Edit</button><Link className="btn btn-sm btn-outline-secondary me-2" to={`/projects/${p._id}/lots`}>Manage Lots</Link>{p.status!=="ARCHIVED"&&<button className="btn btn-sm btn-outline-danger" onClick={()=>archive(p._id)}>Archive</button>}</td></tr>)}</tbody></table></div>}
    </div></div></div></div>
  </main>;
}
