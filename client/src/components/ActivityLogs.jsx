import ListReportActions from "./ListReportActions.jsx";
import {default as FieldLabel,RequiredNote} from "./FieldLabel.jsx";
import { useEffect, useState } from "react";
import api from "../services/api.js";
import { manilaTimestamp } from "../utils/manilaTime.js";
const blank = { q: "", user: "", module: "", action: "", from: "", to: "" };
export default function ActivityLogs({ users }) {
  const [version,setVersion]=useState(0);
  const [draft, setDraft] = useState(blank), [filters, setFilters] = useState(blank), [page, setPage] = useState(1), [result, setResult] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false; setLoading(true); setError("");
    const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)), page, limit: 20 });
    api.get(`/activity-logs?${params}`).then(({data}) => { if(!cancelled)setResult(data); }).catch(e => { if(!cancelled)setError(e.response?.data?.message || "Unable to load activity logs."); }).finally(() => { if(!cancelled)setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, page,version]);
  const set = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  return <section className="card border-0 shadow-sm"><div className="card-body"><h2 className="h5">User Activity Logs</h2><p className="small text-secondary">Times are Philippine Standard Time. Pending entries are durable requests whose completion needs review; they are not confirmed successful changes.</p>
    <form onSubmit={e => {e.preventDefault();setPage(1);setFilters({...draft});}} className="row g-3 mb-4"><RequiredNote/>
      <div className="col-md-4"><FieldLabel className="form-label w-100">Search<input className="form-control" value={draft.q} maxLength="100" onChange={e => set("q",e.target.value)} placeholder="User, record ID or description" /></FieldLabel></div>
      <div className="col-md-4"><FieldLabel className="form-label w-100">User<select className="form-select" value={draft.user} onChange={e=>set("user",e.target.value)}><option value="">All users</option>{users.map(u=><option key={u._id} value={u._id}>{u.username}</option>)}</select></FieldLabel></div>
      <div className="col-md-4"><FieldLabel className="form-label w-100">Module<select className="form-select" value={draft.module} onChange={e=>set("module",e.target.value)}><option value="">All modules</option>{["Projects","Phases","Blocks","Lots","Clients","Payment Agreements","Payment Transactions","Expenses","Agents","Commissions","Users","Authentication","Settings"].map(m=><option key={m}>{m}</option>)}</select></FieldLabel></div>
      <div className="col-md-4"><FieldLabel className="form-label w-100">Action<select className="form-select" value={draft.action} onChange={e=>set("action",e.target.value)}><option value="">All actions</option>{["CREATED","UPDATED","DELETED","ARCHIVED","LOGIN","LOGOUT"].map(a=><option key={a}>{a}</option>)}</select></FieldLabel></div>
      {["from","to"].map(key=><div className="col-md-4" key={key}><FieldLabel className="form-label w-100">{key === "from" ? "From" : "To"}<input className="form-control" type="date" value={draft[key]} min={key==="to"?draft.from:undefined} onChange={e=>set(key,e.target.value)} /></FieldLabel></div>)}
      <div className="d-flex gap-2"><button className="btn btn-primary" disabled={loading}>Apply Filters</button><button type="button" className="btn btn-outline-secondary" onClick={()=>{setDraft(blank);setFilters({...blank});setPage(1);}}>Reset</button></div>
    </form>
    <ListReportActions module="activity-logs" filters={filters} onRefresh={()=>setVersion(v=>v+1)} disabled={loading}/>
    {error&&<p className="alert alert-danger" role="alert">{error}</p>}
    {loading?<p role="status">Loading activity...</p>:!error&&<><div className="table-responsive"><table className="table align-middle"><thead><tr><th>Date / Time (PHT)</th><th>User / Role</th><th>Module / Action</th><th>Record</th><th>Activity / Changes</th><th>Outcome</th></tr></thead><tbody>{result?.data.length?result.data.map(log=><tr key={log._id}><td>{manilaTimestamp(log.createdAt)}</td><td>{log.username||log.userId?.username||"Historical user"}<div className="small text-secondary">{log.userRole||"Role not recorded"}</div></td><td>{log.module||log.entityType}<div className="small">{log.action}</div></td><td className="text-break">{log.entityId||"—"}</td><td>{log.description||log.action}<details className="mt-1"><summary>Previous / Updated Values</summary><div className="mt-2"><strong>Previous</strong><pre className="small text-wrap text-break">{JSON.stringify(log.previousValues??null,null,2)}</pre><strong>Updated</strong><pre className="small text-wrap text-break">{JSON.stringify(log.updatedValues??log.metadata??null,null,2)}</pre></div></details></td><td>{log.outcome||"Historical entry"}</td></tr>):<tr><td colSpan="6" className="text-center text-secondary">No activity matches the filters.</td></tr>}</tbody></table></div>
      <div className="d-flex flex-wrap justify-content-between gap-2 mt-3"><span>{result?.pagination.total||0} entries · Page {page} of {result?.pagination.pages||1}</span><div className="d-flex gap-2"><button className="btn btn-sm btn-outline-secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><button className="btn btn-sm btn-outline-secondary" disabled={page>=(result?.pagination.pages||1)} onClick={()=>setPage(p=>p+1)}>Next</button></div></div></>}
  </div></section>;
}
