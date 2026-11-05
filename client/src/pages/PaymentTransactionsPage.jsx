import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api.js";
import PaymentTable from "../components/PaymentTable.jsx";
import { pesos, clientName, lotName, downloadCsv } from "../utils/finance.js";
export default function PaymentTransactionsPage() {
  const [rows,setRows]=useState([]),[query,setQuery]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{let cancelled=false;api.get("/finance/payments").then(({data})=>{if(!cancelled)setRows(data.data)}).catch(e=>{if(!cancelled)setError(e.response?.data?.message||"Unable to load transactions.")}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[]);
  const visible=rows.filter(p=>(!from||p.paymentDate>=from)&&(!to||p.paymentDate<=to)&&[p.paymentId,clientName(p.client),p.client?.clientId,p.project?.projectName,lotName(p.property),p.receiptNumber,p.reference].join(" ").toLowerCase().includes(query.toLowerCase()));
  const exportRows=()=>downloadCsv("payment-transactions.csv",[["Payment ID","Internal Receipt","Client ID","Status","Date","Client","Project","Lot","Amount PHP","Method","Reference"],...visible.map(p=>[p.paymentId,p.receiptNumber,p.client?.clientId,p.status,p.paymentDate,clientName(p.client),p.project?.projectName,lotName(p.property),(p.amountCents/100).toFixed(2),p.method,p.reference])]);
  return <main className="container-fluid p-4"><div className="d-flex flex-wrap justify-content-between gap-2 mb-4"><div><h1 className="h3 fw-bold">Payment Transactions</h1><p className="text-secondary mb-0">All recorded client payments.</p></div><Link className="btn btn-primary align-self-start" to="/payment">Accept Payment</Link></div>
    {error&&<div role="alert" className="alert alert-danger">{error}</div>}
    <div className="card border-0 shadow-sm"><div className="card-body"><div className="row g-3 mb-3"><div className="col-md-5"><label className="form-label w-100">Search<input className="form-control" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Client, project, lot, payment ID or reference"/></label></div><div className="col-md-3"><label className="form-label w-100">From<input type="date" className="form-control" value={from} onChange={e=>setFrom(e.target.value)}/></label></div><div className="col-md-3"><label className="form-label w-100">To<input type="date" className="form-control" min={from} value={to} onChange={e=>setTo(e.target.value)}/></label></div></div>
    <div className="d-flex flex-wrap justify-content-between gap-2 mb-3"><span>{visible.length} payments · Total {pesos(visible.reduce((n,p)=>n+p.amountCents,0))}</span><button className="btn btn-sm btn-outline-primary" disabled={loading||!!error} onClick={exportRows}>Export CSV</button></div>
    {loading?<p role="status">Loading payments...</p>:<PaymentTable rows={visible}/>}</div></div>
  </main>;
}
