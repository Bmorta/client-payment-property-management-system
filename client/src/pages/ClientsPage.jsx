import { useEffect, useState } from "react";
import api from "../services/api.js";

const blank={clientId:"",firstName:"",middleName:"",lastName:"",suffix:"",contactNumber:"",email:"",address:"",notes:"",status:"ACTIVE"};

export default function ClientsPage(){
 const [clients,setClients]=useState([]),[form,setForm]=useState(blank),[editing,setEditing]=useState(null),[query,setQuery]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const load=async()=>{try{setLoading(true);const {data}=await api.get("/clients");setClients(data.data)}catch(e){setError(e.response?.data?.message||"Unable to load clients.")}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const reset=()=>{setForm(blank);setEditing(null)};
 const submit=async e=>{e.preventDefault();setMessage("");setError("");try{if(editing){await api.put(`/clients/${editing}`,form);setMessage("Client updated successfully.")}else{await api.post("/clients",form);setMessage("Client created successfully.")}reset();load()}catch(e){setError(e.response?.data?.message||"Unable to save client.")}};
 const edit=c=>{setEditing(c._id);setForm({clientId:c.clientId||"",firstName:c.firstName||"",middleName:c.middleName||"",lastName:c.lastName||"",suffix:c.suffix||"",contactNumber:c.contactNumber||"",email:c.email||"",address:c.address||"",notes:c.notes||"",status:c.status||"ACTIVE"});window.scrollTo({top:0,behavior:"smooth"})};
 const filtered=clients.filter(c=>[c.clientId,c.firstName,c.lastName,c.email,c.contactNumber].join(" ").toLowerCase().includes(query.toLowerCase()));
 return <main className="container-fluid py-4 px-4">
  <div className="mb-4"><p className="text-uppercase small fw-semibold text-secondary mb-1">Management</p><h1 className="h3 fw-bold mb-1">Clients</h1><p className="text-secondary mb-0">Maintain one master client record. Property assignments will be managed separately.</p></div>
  {message&&<div className="alert alert-success">{message}</div>}{error&&<div className="alert alert-danger">{error}</div>}
  <div className="row g-4">
   <div className="col-12 col-xl-4"><div className="card border-0 shadow-sm"><div className="card-body"><h2 className="h5 fw-bold">{editing?"Edit Client":"Add Client"}</h2><form onSubmit={submit} className="mt-3">
    {[["clientId","Client ID",true],["firstName","First Name",true],["middleName","Middle Name",false],["lastName","Last Name",true],["suffix","Suffix",false],["contactNumber","Contact Number",false],["email","Email",false],["address","Address",false]].map(([k,l,r])=><div className="mb-3" key={k}><label className="form-label">{l}</label><input className="form-control" type={k==="email"?"email":"text"} value={form[k]} required={r} onChange={e=>setForm({...form,[k]:e.target.value})}/></div>)}
    <div className="mb-3"><label className="form-label">Status</label><select className="form-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
    <div className="mb-3"><label className="form-label">Notes</label><textarea className="form-control" rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
    <div className="d-flex gap-2"><button className="btn btn-primary" type="submit">{editing?"Update Client":"Add Client"}</button>{editing&&<button className="btn btn-outline-secondary" type="button" onClick={reset}>Cancel</button>}</div>
   </form></div></div></div>
   <div className="col-12 col-xl-8"><div className="card border-0 shadow-sm"><div className="card-body"><div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h2 className="h5 fw-bold mb-0">Client List</h2><input className="form-control" style={{maxWidth:320}} placeholder="Search clients..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
   {loading?<p className="text-secondary">Loading clients...</p>:<div className="table-responsive"><table className="table align-middle"><thead><tr><th>Client</th><th>Contact</th><th>Email</th><th>Status</th><th className="text-end">Action</th></tr></thead><tbody>{filtered.length===0?<tr><td colSpan="5" className="text-center text-secondary py-4">No clients found.</td></tr>:filtered.map(c=><tr key={c._id}><td><div className="fw-semibold">{c.fullName}</div><div className="small text-secondary">{c.clientId}</div></td><td>{c.contactNumber||"—"}</td><td>{c.email||"—"}</td><td><span className={`badge ${c.status==="ACTIVE"?"text-bg-success":"text-bg-secondary"}`}>{c.status}</span></td><td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={()=>edit(c)}>Edit</button></td></tr>)}</tbody></table></div>}
   </div></div></div>
  </div>
 </main>;
}
