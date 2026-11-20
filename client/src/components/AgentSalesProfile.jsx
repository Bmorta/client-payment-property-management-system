import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import DateRangeFilter from './DateRangeFilter.jsx';
import SalesReportActions from './SalesReportActions.jsx';
import {SalesDataTable} from './SalesAgentPerformance.jsx';
import {salesReportView} from '../../../shared/salesReportViews.js';
import {localDate,presetRange,pesos} from '../utils/finance.js';
import api from '../services/api.js';
import {usePageState} from '../hooks/usePageState.js';

const tabs=['Overview','Sales records','Collections & receivables','Commission records','Targets & achievement','Reports'];
const types=['DIRECT','RESERVATION','TRANSFER','ASSUMPTION','REACTIVATION'],statuses=['INSTALLMENT','FULLY_PAID','SETTLEMENT_PENDING','PRINCIPAL_FULLY_PAID','CANCELLATION_PENDING','CANCELLED','FORFEITED','TRANSFERRED','ASSUMED','SUPERSEDED','CLOSED','REVIEW_REQUIRED'];
export default function AgentSalesProfile({agentId,initialFilters,initialTab,commissionPanel,refreshKey}){
 const [tab,setTab]=usePageState('agent.sales.tab',initialTab||'Overview',agentId);
 const [filter,setFilter]=usePageState('agent.sales.filter',()=>({...presetRange('monthly',localDate(),true),project:'',type:'',status:'',...initialFilters}),agentId);
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[projects,setProjects]=useState([]);
 const key=JSON.stringify(filter);
 useEffect(()=>{let active=true;const controller=new AbortController();setData(null);setBusy(true);setError('');api.get('/finance/reports/sales',{params:{...filter,agent:agentId},signal:controller.signal}).then(r=>{if(active){setData(r.data.data);setProjects(r.data.data.projectOptions)}}).catch(e=>{if(active&&!controller.signal.aborted)setError(e.response?.data?.message||'Unable to load agent performance.')} ).finally(()=>{if(active)setBusy(false)});return()=>{active=false;controller.abort()}},[key,agentId,refreshKey]);
 const sections=data?salesReportView(data,'INDIVIDUAL').sections:[];
 const show=(match)=>sections.filter(s=>match(s.title)).map(s=><section className="mt-3" key={s.title}><h3 className="h6">{s.title}</h3><SalesDataTable headers={s.headers} rows={s.rows}/></section>);
 const agent=data?.agents.find(a=>a.id===agentId);
 return <div className="mt-3"><div className="d-flex flex-wrap gap-2 mb-3">{tabs.map(t=><button key={t} className={'btn btn-sm '+(t===tab?'btn-primary':'btn-outline-primary')} aria-pressed={t===tab} onClick={()=>setTab(t)}>{t}</button>)}</div><DateRangeFilter value={filter} throughToday onChange={r=>setFilter(f=>({...f,...r}))}/><div className="row g-2 my-2">{[['project','Project',projects],['type','Contract type',types.map(x=>({id:x,label:x.replaceAll('_',' ')}))],['status','Contract status',statuses.map(x=>({id:x,label:x.replaceAll('_',' ')}))]].map(([k,l,options])=><label className="col-md-4" key={k}>{l}<select className="form-select" value={filter[k]} onChange={e=>setFilter(f=>({...f,[k]:e.target.value}))}><option value="">All</option>{options.map(o=><option value={o.id} key={o.id}>{o.label}</option>)}</select></label>)}</div>{busy&&<p role="status">Loading performance…</p>}{error&&<p role="alert" className="alert alert-danger">{error}</p>}
 {data&&<><p className="small text-secondary">Associated sales, receipts and receivables may overlap when agents share a contract. Approved weighted results are separate. {data.from} to {data.to} · Current snapshot {data.today}</p>{data.warnings.length>0&&<details className="alert alert-warning"><summary>Reconciliation warnings ({data.warnings.length})</summary>{data.warnings.map(w=><p key={w}>{w}</p>)}</details>}
 {tab==='Overview'&&agent&&<div className="summary-grid">{[['Properties participated',agent.propertiesSold],['Approved weighted sales',agent.weightedUnits],['Approved credited sales',pesos(agent.creditedSalesCents)],['Associated actual receipts',pesos(agent.periodCollectionsCents)],['Current principal',agent.currentReceivableCents==null?'Unavailable':pesos(agent.currentReceivableCents)],['Earned unreleased',pesos(agent.unreleasedCents)]].map(([l,v])=><div className="summary-tile" key={l}><span>{l}</span><strong>{v}</strong></div>)}</div>}
 {tab==='Sales records'&&<>{show(t=>t.startsWith('Sales performance'))}<p className="mt-3">Open an associated contract:</p><ul>{data.register.map(r=><li key={r.id}><Link to={'/clients/'+r.clientId+'/accounts?tab=properties&account='+r.id}>{r.contractId} · {r.client} · {r.property}</Link></li>)}</ul>{show(t=>t==='Contract register')}</>}
 {tab==='Collections & receivables'&&show(t=>t.startsWith('Collections')||t==='Actual receipts in period')}
 {tab==='Commission records'&&show(t=>t==='Commission performance'||t.startsWith('Actual commission')||t.startsWith('Commission adjustment'))}
 {tab==='Targets & achievement'&&<><p className="small">{data.performance.scope}</p><label>Planning year<input className="form-control" type="number" min="2000" max="2099" value={filter.planningYear||data.performance.year} onChange={e=>{if(/^20\d{2}$/.test(e.target.value))setFilter(f=>({...f,planningYear:e.target.value}))}}/></label>{show(t=>t==='Approved calendar targets')}</>}
 {tab==='Reports'&&<><p>Preview and export an individual agent report with the selected filters.</p><SalesReportActions data={data} defaultType="INDIVIDUAL" disabled={busy}/></>}
 </>}
 {tab==='Commission records'&&<><hr/><p className="small text-secondary">Existing commission register and actions (use its own filters).</p>{commissionPanel}</>}
 </div>;
}
