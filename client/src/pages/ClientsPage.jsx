import PaymentSchedulePrint from "../components/PaymentSchedulePrint.jsx";
import ListReportActions from "../components/ListReportActions.jsx";
import SearchInput from "../components/SearchInput.jsx";
import {Link,useSearchParams} from "react-router-dom";
import {revealTarget} from "../utils/navigation.js";
import {default as FieldLabel} from "../components/FieldLabel.jsx";
import RequiredMark from "../components/RequiredMark.jsx";
import { useEffect, useState } from "react";
import api from "../services/api.js";
import AssignmentFields, { blankAssignment } from "../components/AssignmentFields.jsx";

import CenterPopup from "../components/CenterPopup.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const blank={clientId:"",firstName:"",middleName:"",lastName:"",suffix:"",contactNumber:"",email:"",address:"",notes:"",status:"ACTIVE"};

export default function ClientsPage(){
 const [params]=useSearchParams();
 const [assignment,setAssignment]=useState(blankAssignment),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
 const [clients,setClients]=useState([]),[form,setForm]=useState(blank),[editing,setEditing]=useState(null),[query,setQuery]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const load=async()=>{try{setLoading(true);const {data}=await api.get("/clients");setClients(data.data)}catch(e){setError(e.response?.data?.message||"Unable to load clients.")}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const reset=()=>{setForm(blank);setEditing(null)};
 const submit=async e=>{e.preventDefault();setMessage("");setError("");setBusy(true);let saved=null;try{if(editing){const {data}=await api.put(`/clients/${editing}`,form);setSelected(data.data);setMessage("Client updated successfully.")}else{if(form.status==="ACTIVE"&&!assignment.propertyId)throw Error("Choose the client's project, phase, block and lot.");const {data}=await api.post("/clients",form);saved=data.data;setSelected(saved);setEditing(saved._id);if(form.status==="ACTIVE")await api.post(`/clients/${saved._id}/assignments`,assignment);setMessage(form.status==="ACTIVE"?"Client created, lot assigned and payment schedule generated.":"Inactive client created. Activate the client before assigning properties.");setAssignment(blankAssignment())}setVersion(v=>v+1);reset();await load()}catch(e){setError((saved?"Client was saved. The assignment could not be confirmed. Check Properties / Accounts before retrying. ":"")+(e.response?.data?.message||e.message||"Unable to save client."));if(saved){setVersion(v=>v+1);await load()}}finally{setBusy(false)}};
 const edit=c=>{setSelected(c);setEditing(c._id);setForm({clientId:c.clientId||"",firstName:c.firstName||"",middleName:c.middleName||"",lastName:c.lastName||"",suffix:c.suffix||"",contactNumber:c.contactNumber||"",email:c.email||"",address:c.address||"",notes:c.notes||"",status:c.status||"ACTIVE"});setTimeout(()=>revealTarget(document.querySelector("main form")),0)};
 const filtered=clients.filter(c=>[c.clientId,c.firstName,c.lastName,c.email,c.contactNumber].join(" ").toLowerCase().includes(query.toLowerCase()));
 return <main className="container-fluid py-4 px-4">
  <div className="mb-4"><p className="text-uppercase small fw-semibold text-secondary mb-1">Management</p><h1 className="h3 fw-bold mb-1">Clients</h1><p className="text-secondary mb-0">Maintain one master client record. Assign multiple lots across projects, track installment schedules and view payment history.</p></div>
  <CenterPopup message={message} error={error} onClose={()=>{setMessage("");setError("")}} />
  <div className="row g-4">
   <div className="col-12 col-xl-4"><div className="card border-0 shadow-sm"><div className="card-body"><h2 className="h5 fw-bold">{editing?"Edit Client":"Add Client"}</h2><p className="required-note"><span aria-hidden="true">*</span> Required fields</p><form onSubmit={submit} className="mt-3"><fieldset disabled={busy}>
    {[["clientId","Client ID",false],["firstName","First Name",true],["middleName","Middle Name",false],["lastName","Last Name",true],["suffix","Suffix",false],["contactNumber","Contact Number",false],["email","Email",false],["address","Address",false]].map(([k,l,r])=><div className="mb-3" key={k}><FieldLabel className="form-label">{l}{r&&<RequiredMark/>}<input className="form-control" type={k==="email"?"email":"text"} value={form[k]} readOnly={k==="clientId"} placeholder={k==="clientId"?"Assigned automatically when saved":undefined} required={r} onChange={e=>setForm({...form,[k]:e.target.value})}/></FieldLabel></div>)}
    <div className="mb-3"><FieldLabel className="form-label">Status<select className="form-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></FieldLabel></div>
    <div className="mb-3"><FieldLabel className="form-label">Notes<textarea className="form-control" rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></FieldLabel></div>
    {editing&&<p className="small text-secondary">Payment terms belong to each property. Use Edit Payment Agreement on the Properties / Accounts page to review its saved terms.</p>}
    {!editing&&form.status==="ACTIVE"&&<div className="border-top pt-3 mt-3"><h3 className="h6 fw-bold">Initial property & installment account</h3><AssignmentFields value={assignment} onChange={setAssignment} refreshKey={version} /></div>}
    <div className="d-flex gap-2"><button className="btn btn-primary" type="submit">{busy?"Saving...":editing?"Update Client":"Add Client & Assign Lot"}</button>{editing&&<button className="btn btn-outline-secondary" type="button" onClick={reset}>Cancel</button>}</div>
   </fieldset></form></div></div></div>
   <div className="col-12 col-xl-8"><div className="card border-0 shadow-sm"><div className="card-body"><div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h2 className="h5 fw-bold mb-0">Client List</h2><PaymentSchedulePrint/><SearchInput label="Search clients" value={query} onChange={value=>{setQuery(value);}} items={clients.map(c=>({key:c._id,label:c.fullName||[c.firstName,c.lastName].filter(Boolean).join(" "),detail:`${c.clientId} ${c.email||""} ${c.contactNumber||""}`}))}/></div>
   <ListReportActions module="clients" filters={{q:query}} onRefresh={load} disabled={loading}/>{loading?<p className="text-secondary">Loading clients...</p>:<div className="table-responsive"><table className="table align-middle"><thead><tr><th>Client</th><th>Contact</th><th>Email</th><th>Status</th><th className="text-end">Action</th></tr></thead><tbody>{filtered.length===0?<tr><td colSpan="5" className="text-center text-secondary py-4">No clients found.</td></tr>:filtered.map(c=><tr key={c._id} className={params.get("selected")===c._id?"table-primary":undefined}><td><div className="fw-semibold">{c.fullName}</div><div className="small text-secondary">{c.clientId}</div></td><td>{c.contactNumber||"—"}</td><td>{c.email||"—"}</td><td><StatusBadge status={c.status} /></td><td className="text-end"><div className="d-flex flex-wrap gap-2 justify-content-end"><button className="btn btn-sm btn-outline-primary" onClick={()=>edit(c)}>Edit</button><Link className="btn btn-sm btn-outline-secondary" to={`/clients/${c._id}/accounts`}>Properties / Accounts</Link></div></td></tr>)}</tbody></table></div>}
   </div></div></div>
  </div>

 </main>;
}
