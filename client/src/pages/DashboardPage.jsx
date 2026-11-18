import {useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Bar,BarChart,CartesianGrid,Cell,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {usePageState} from '../hooks/usePageState.js';
import {useCashRefresh} from '../hooks/useCashRefresh.js';
import {useReviewRefresh} from '../hooks/useReviewRefresh.js';
import NavIcon from '../components/NavIcon.jsx';
import api from '../services/api.js';
import {localDate,pesos,periodDates} from '../utils/finance.js';
import './dashboard.css';

const cash='/reports?view=cash&focus=movements';
const number=value=>new Intl.NumberFormat('en-PH').format(value);
const format=(value,money)=>value==null?'Unavailable':money?pesos(value):number(value);
const path=(route,params)=>{const query=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==''&&v!=null));return query.size?route+'?'+query:route};
const statuses={AVAILABLE:'Available',RESERVED:'Reserved',SOLD:'Sold',FOR_ASSUME:'For assume',UNAVAILABLE:'Unavailable / archived'};
const chartColors=['#3276c7','#118375','#9764c5'];

function Metric({label,value,note,to,money,icon='chart'}){
  return <Link className="card rems-dashboard-metric" to={to}><span className="rems-dashboard-label">{label}<NavIcon name={icon}/></span><strong>{format(value,money)}</strong><small>{note}</small></Link>;
}
function Details({title,values}){
  return <section className="card rems-dashboard-panel"><h2>{title}</h2><dl className="rems-dashboard-details">{values.map(([label,value,money,to])=><div key={label}><dt>{to?<Link to={to}>{label}</Link>:label}</dt><dd>{format(value,money)}</dd></div>)}</dl></section>;
}
function Chart({title,rows,category='month',series,money=true,empty='No matching activity.',onSelect}){
  const hasData=rows.some(r=>series.some(([key])=>r[key]));
  return <section className="card rems-dashboard-panel"><h3>{title}</h3>{hasData?<><div className="rems-dashboard-legend">{series.map(([key,label],i)=><span key={key}><i style={{background:chartColors[i]}}/>{label}</span>)}</div><div className="rems-dashboard-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} onClick={onSelect?e=>{if(e?.activeLabel)onSelect(e.activeLabel)}:undefined} margin={{top:4,left:8,right:10,bottom:4}}><CartesianGrid vertical={false} stroke="var(--bs-border-color)"/><XAxis dataKey={category} tick={{fill:'var(--bs-secondary-color)',fontSize:11}}/><YAxis allowDecimals={false} tick={{fill:'var(--bs-secondary-color)',fontSize:11}} tickFormatter={v=>money?'₱'+Intl.NumberFormat('en-PH',{notation:'compact'}).format(v/100):number(v)}/><Tooltip formatter={(v,k)=>[format(v,money),series.find(([key])=>key===k)?.[1]||k]} contentStyle={{background:'var(--bs-body-bg)',borderColor:'var(--bs-border-color)',color:'var(--bs-body-color)'}} itemStyle={{color:'var(--bs-body-color)'}}/>{series.map(([key],i)=><Bar key={key} dataKey={key} fill={chartColors[i]} maxBarSize={36} radius={[3,3,0,0]} isAnimationActive={false}/>)}</BarChart></ResponsiveContainer></div></>:<p className="text-secondary mb-0">{empty}</p>}</section>;
}
const periods=[['today','Today'],['weekly','This Week'],['monthly','This Month'],['yearly','This Year'],['custom','Custom']];
function InventoryChart({rows,onSelect}){
  const colors=['#118375','#ac7614','#3276c7','#9764c5','#677687'];
  return <section className="card rems-dashboard-panel"><h3>Property Availability Distribution</h3>{rows.some(row=>row.value>0)?<>
    <div className="rems-dashboard-chart"><ResponsiveContainer width="100%" height="100%"><PieChart>
      <Pie data={rows} dataKey="value" nameKey="label" innerRadius="50%" outerRadius="80%" isAnimationActive={false} onClick={row=>onSelect(row.key)}>
        {rows.map((item,index)=><Cell key={item.key} fill={colors[index]}/>)}
      </Pie><Tooltip contentStyle={{background:'var(--bs-body-bg)',color:'var(--bs-body-color)'}} itemStyle={{color:'var(--bs-body-color)'}}/>
    </PieChart></ResponsiveContainer></div>
    <div className="rems-dashboard-legend">{rows.map((row,index)=><span key={row.key}><i style={{background:colors[index]}}/>{row.label} · {number(row.value)}</span>)}</div>
  </>:<p className="text-secondary mb-0">No properties match this scope.</p>}</section>;
}
const cashLabels={COLLECTION:'Cash collections',INFLOW:'Cash added',BANK_WITHDRAWAL:'Bank cash withdrawals',COMMISSION_RECOVERY:'Commission recoveries',EXPENSE:'Cash expenses',COMMISSION_PAYOUT:'Commission releases',BUSINESS_PAYOUT:'Supplier, landowner and other business payouts',CLIENT_REFUND:'Client refunds',OUTFLOW:'Other cash releases',OWNER_TURNOVER:'Owner turnovers',BANK_DEPOSIT:'Bank deposits'};

export default function DashboardPage(){
  const navigate=useNavigate();
  const [filter,setFilter]=usePageState('dashboard.overview',{period:'monthly',from:'',to:'',project:'',phase:'',block:''});
  const [date,setDate]=useState(localDate),[version,setVersion]=useState(0),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const refresh=()=>setVersion(value=>value+1);
  useCashRefresh(refresh,(_,next)=>setDate(next));
  useReviewRefresh(refresh);
  const range=filter.period==='custom'?{from:filter.from,to:filter.to}:periodDates(filter.period,date);
  const {from,to}=range,{project,phase,block}=filter;
  const valid=!!from&&!!to&&from<=to;
  useEffect(()=>{
    if(!valid)return;
    const controller=new AbortController();
    setBusy(true);setError('');
    const timer=setTimeout(()=>{
      api.get('/finance/reports/dashboard/overview',{params:{from,to,project,phase,block},signal:controller.signal})
        .then(response=>setData(response.data.data))
        .catch(e=>{if(!controller.signal.aborted)setError(e.response?.data?.message||'Unable to load the dashboard.')})
        .finally(()=>{if(!controller.signal.aborted)setBusy(false)});
    },150);
    return()=>{clearTimeout(timer);controller.abort()};
  },[from,to,project,phase,block,version,valid]);
  const change=(key,value)=>setFilter(old=>({...old,[key]:value,...(key==='project'?{phase:'',block:''}:{})}));
  const f=data?.finance,r=data?.receivables,o=data?.obligations,c=data?.commissions;
  const scope=data?.filters||{};
  const location={project:scope.project,phase:scope.phase,block:scope.block};
  const monitor=(status,extra={})=>path('/payment-monitoring',{...location,asOf:scope.today,dashboard:1,status,...extra});
  const inventory=(status='',extra={})=>path('/property-inventory',{...location,status,...extra});
  const collection=(start,end)=>path('/payment-transactions',{project:scope.project,from:start,to:end});
  const commissions=status=>path('/commissions',{project:scope.project,status});
  const cashReview=cash+'&cashTab=reconciliation';
  const available=data?.inventory.AVAILABLE||0;
  const attention=[
    r&&['Clients due today',r.dueClients,'due',monitor('DUE_TODAY')],
    r&&['Overdue clients',r.overdueClients,'urgent',monitor('OVERDUE')],
    r&&['Critical forfeiture contracts',r.critical,'urgent',monitor('FORFEITURE_RISK')],
    o&&['Reviews awaiting action',o.approvals,'due','/approval-requests'],
    data?.requests&&['Requests awaiting scheduling',data.requests.scheduling,'due',path('/site-requests',{project:scope.project,alert:'scheduling'})],
    data?.reservations&&['Expired reservations',data.reservations.expired,'due',path('/reservations',{reservationStatus:'expired',project:scope.project})],
    data?.requests&&['Upcoming site visits',data.requests.visits,'due',path('/site-requests',{project:scope.project,alert:'upcoming'})],
    c&&['Commission records ready for release',c.releases,'due',commissions('RELEASABLE')],
    o&&['Refund cases with amounts due',o.refundDue,'due','/approval-requests?category=cancellation&refund=due'],
    o&&['Approved payouts awaiting release',o.payoutCount,'due','/payouts?status=OUTSTANDING'],
    f&&['Cash ledger issues',f.cash.reasons.length,'urgent',cashReview]
  ].filter(Boolean);
  const lotChart=Object.entries(statuses).map(([key,label])=>({key,label,value:data?.inventory[key]||0}));
  const matched=data&&scope.from===from&&scope.to===to&&scope.project===project&&scope.phase===phase&&scope.block===block;
  return <main className="rems-dashboard container-fluid p-3 p-lg-4">
    <header className="rems-dashboard-header"><div><h1><NavIcon name="grid"/> Management Dashboard</h1><p>Office operations and financial overview · Philippine time</p></div><button className="btn btn-outline-primary" type="button" onClick={refresh} disabled={busy||!valid}><NavIcon name="refresh"/> Refresh</button></header>
    <section className="card rems-dashboard-panel rems-dashboard-filters" aria-label="Dashboard filters">
      <div className="btn-group flex-wrap" role="group" aria-label="Reporting period">{periods.map(([key,label])=><button key={key} type="button" className={'btn '+(filter.period===key?'btn-primary':'btn-outline-secondary')} aria-pressed={filter.period===key} onClick={()=>change('period',key)}>{label}</button>)}</div>
      <div className="rems-dashboard-filter-fields">
        {filter.period==='custom'&&[['from','From'],['to','Through']].map(([key,label])=><label key={key}>{label}<input className="form-control" type="date" value={filter[key]} onChange={e=>change(key,e.target.value)}/></label>)}
        <label>Project<select className="form-select" value={project} onChange={e=>change('project',e.target.value)}><option value="">All projects</option>{data?.projectOptions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {['phase','block'].map(key=><label key={key}>{key==='phase'?'Phase':'Block'}<input className="form-control" type="number" min="1" max="999999" placeholder="All" value={filter[key]} onChange={e=>change(key,e.target.value)}/></label>)}
      </div>
    </section>
    {!valid&&<p role="status" className="alert alert-info">Choose a start and end date in order.</p>}
    {error&&<p role="alert" className="alert alert-danger">{error}</p>}
    {valid&&!error&&(!matched||busy)&&<p role="status" className="small text-secondary">Updating dashboard figures…</p>}
    {valid&&matched&&<><p className="small text-secondary">Period {scope.from} to {scope.to} · Current balances and inventory as of {scope.today}. Cash and financial obligations cover the whole office.</p>
      <h2 className="rems-dashboard-heading">Executive Overview</h2>
      <div className="rems-dashboard-kpis">
        {f&&<><Metric label="Current Cash on Hand" money value={f.cash.closing} note="Verified physical office cash" to={f.cash.closing==null?cashReview:cash} icon="wallet"/><Metric label="Today’s Collections" money value={f.todayCollections} note={scope.today} to={collection(scope.today,scope.today)} icon="receipt"/><Metric label="Monthly Collections" money value={f.monthCollections} note="Current month through today" to={collection(scope.today.slice(0,7)+'-01',scope.today)} icon="receipt"/></>}
        {r&&<><Metric label="Expected Collections" money value={r.unavailable?null:r.expected} note="Current active schedules in selected period" to={monitor('',{scheduleFrom:scope.from,scheduleTo:scope.to})}/><Metric label="Overdue Receivables" money value={r.unavailable?null:r.overdueCents} note="Outstanding principal past grace" to={monitor('OVERDUE')}/><Metric label="Clients Due Today" value={r.unavailable?null:r.dueClients} note="Unique clients with unpaid installments" to={monitor('DUE_TODAY')} icon="people"/></>}
        <Metric label="Available Properties" value={available} note="Current inventory" to={inventory('AVAILABLE')} icon="building"/>
        {o?<Metric label="Pending Approvals" value={o.approvals} note="Office review queue" to="/approval-requests" icon="check"/>:<Metric label="Active Contracts" value={data.activeContracts} note="Current contracts" to="/clients?workspace=accounts" icon="receipt"/>}
      </div>
      {!!attention.length&&<section className="card rems-dashboard-panel mt-3"><h2>Needs Attention Today</h2><div className="rems-dashboard-actions">{attention.filter(([,value])=>value>0).map(([label,value,tone,to])=><Link key={label} to={to}><span>{label}</span><span className={'badge '+(tone==='urgent'?'text-bg-danger':'text-bg-warning')}>{number(value)}</span></Link>)}</div>{!attention.some(([,n])=>n>0)&&<p className="text-secondary mb-0">No items awaiting attention in this scope.</p>}</section>}
      {r?.unavailable>0&&<p className="alert alert-warning mt-3">{r.unavailable} accounts need ledger review before receivables can be verified.</p>}
      {c?.unavailable>0&&<p className="alert alert-warning mt-3">{c.unavailable} commission accounts require reconciliation.</p>}
      {f?.cash.reasons.length>0&&<div className="alert alert-warning mt-3"><strong>Cash balance requires reconciliation.</strong><ul>{f.cash.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul><Link to={cashReview}>Inspect the dated cash ledger</Link></div>}
      <div className="rems-dashboard-grid mt-3">
        {f&&<Details title="Financial Overview · Today" values={[
          ['Posted noncash collections in scope',f.todayFunding?.NONCASH,true,collection(scope.today,scope.today)],['Unclassified collections in scope',f.todayFunding?.unclassified,true,collection(scope.today,scope.today)],['Opening cash',f.cash.opening,true,cash],...Object.entries(cashLabels).map(([key,label])=>[label,f.cash.events[key]||0,true,cash]),
          ['Current Cash on Hand',f.cash.closing,true,cash],['Approved outstanding payouts',o.payouts,true,'/payouts?status=OUTSTANDING'],
          ['Outstanding refunds',o.refunds,true,'/approval-requests?category=cancellation&refund=outstanding']
        ]}/>}
        {r&&<Details title="Clients & Receivables" values={[
          ['Active clients',data.activeClientMasterCount??r.activeClients,false,'/clients'],['Active contracts',data.activeContracts,false,'/clients?workspace=accounts'],
          ['Installments due today',r.dueToday,true,monitor('DUE_TODAY')],['Installments due through Sunday',r.dueWeek,true,monitor('DUE_WEEK')],
          ['Overdue clients',r.overdueClients,false,monitor('OVERDUE')],['Clients paid in advance',r.advanceClients,false,monitor('PAID_IN_ADVANCE')],
          ['Fully paid principal accounts',r.fullyPaid,false,'/settlements'],['Critical forfeiture contracts',r.critical,false,monitor('FORFEITURE_RISK')],
          ['Cancelled contracts',data.cancelled,false,'/clients?workspace=cancellations'],['Forfeited contracts',data.forfeited,false,'/forfeited-accounts']
        ]}/>}
        <Details title="Property Inventory & Sales" values={[
          ['Total properties',lotChart.reduce((n,p)=>n+p.value,0),false,inventory()],...Object.entries(statuses).map(([key,label])=>[label,data.inventory[key]||0,false,inventory(key==='UNAVAILABLE'?'INACTIVE_ARCHIVED':key)]),
          ['New original contracts in period',data.newContracts,false,inventory('',{from:scope.from,to:scope.to>scope.today?scope.today:scope.to})],['Cancellations in period',data.cancelledInPeriod,false,'/clients?workspace=cancellations'],...(f?[['Original contract value in period',data.contractSalesCents,true,inventory()]]:[])
        ]}/>
        {c&&<Details title="Commissions & Payouts" values={[
          ['Total earned',c.unavailable?null:c.earned,true,commissions('')],['Total released',c.unavailable?null:c.released,true,commissions('RELEASED')],['Earned but unreleased',c.unavailable?null:c.unreleased,true,commissions('UNRELEASED')],
          ['Currently releasable',c.unavailable?null:c.releasable,true,commissions('RELEASABLE')],['Records requiring review',c.review,false,commissions('ON_HOLD')]
        ]}/>}
        {data.requests&&<Details title="Requests & Approvals" values={[['Awaiting scheduling',data.requests.scheduling,false,path('/site-requests',{project:scope.project,alert:'scheduling'})],['Upcoming in 24 hours',data.requests.visits,false,path('/site-requests',{project:scope.project,alert:'upcoming'})],...(o?.approvalCategories||[]).filter(category=>category.pending).map(category=>[category.label,category.pending,false,'/approval-requests?category='+category.id])]}/>}
      </div>
      <h2 className="rems-dashboard-heading mt-4">Reports & Analytics</h2>
      <div className="rems-dashboard-grid">
        {f&&<><Chart title="Monthly Actual vs. Expected Collections" rows={data.months} series={r.unavailable?[['actual','Posted actual']]:[['actual','Posted actual'],['expected','Scheduled installments']]}/><Chart title="Physical Cash Inflows vs. Outflows · Office" rows={f.cash.periodVerified?data.months:[]} series={ [['cashIn','Cash in'],['cashOut','Cash out']]} empty={f.cash.periodVerified?'No cash activity in this period.':'Verified period cash is unavailable. Check the opening baseline and ledger.'}/></>}
        {r&&<div><Chart title="Receivables Aging · Days Past Grace" rows={r.unavailable?[]:r.aging} category="label" series={ [['amount','Overdue principal']]} empty={r.unavailable?'Some contracts require review before aging can be verified.':'No overdue installments.'} onSelect={label=>{const index=r.aging.findIndex(row=>row.label===label);if(index>=0)navigate(monitor('OVERDUE',{aging:index}))}}/><div className="rems-dashboard-drills">{r.aging.map((row,index)=><Link id={'aging-'+index} key={row.label} to={monitor('OVERDUE',{aging:index})}>{row.label} · {row.count} contracts</Link>)}</div></div>}
        <InventoryChart rows={lotChart} onSelect={key=>navigate(inventory(key==='UNAVAILABLE'?'INACTIVE_ARCHIVED':key))}/>
        <Chart title={f?"Monthly Original Contract Value":"Monthly Original Contracts"} rows={data.months} series={f?[['saleValue','Contract value']]:[['sales','New contracts']]} money={!!f}/>
        {c&&<Chart title="Earned vs. Released Commissions" rows={c.unavailable?[]:data.months} series={ [['earned','Earned'],['released','Released']]}/>}
        <Details title="Inventory by Project" values={data.projectOptions.filter(p=>data.projects[p.id]).map(p=>[p.name+' · '+data.projects[p.id].available+' available / '+data.projects[p.id].sold+' sold',data.projects[p.id].total,false,inventory('',{project:p.id})])}/>
        {!c?.unavailable&&c?.agents.length>0&&<Details title="Agent Sales & Earned Commission" values={c.agents.map(a=>[a.label+' · '+a.sales+' original sales in period',a.earned,true,path('/commissions',{agent:a.id,project:scope.project})])}/>}
      </div>
    </>}
  </main>;
}
