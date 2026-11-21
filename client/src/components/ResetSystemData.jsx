import {useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext.jsx';
import api from '../services/api.js';
import CenterPopup from './CenterPopup.jsx';

const date=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'—';
export default function ResetSystemData({maintenance,onChanged}){
 const {user}=useAuth();
 const [plan,setPlan]=useState(null),[backupId,setBackupId]=useState(''),[single,setSingle]=useState(false),[database,setDatabase]=useState(''),[password,setPassword]=useState(''),[phrase,setPhrase]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[result,setResult]=useState(null);
 const lock=useRef(false);
 const backups=(maintenance?.backups||[]).filter(b=>b.purpose==='SYSTEM_RESET'&&String(b.actor?.userId)===String(user?._id));
 const job=backups.find(b=>b.id===backupId),blocked=busy||maintenance?.jobRunning;
 const run=async work=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{await work()}catch(e){setError(e.response?.data?.message||'Operation could not be confirmed. Review the reset backup and Activity Logs before retrying.')}finally{lock.current=false;setBusy(false)}
 };
 const inspect=(id='')=>run(async()=>{
  setPassword('');setPhrase('');setDatabase('');setResult(null);
  const response=await api.get('/maintenance/system-reset/preview',{params:id?{backupId:id}:{}});
  setPlan(response.data.data);
 });
 const beginBackup=()=>run(async()=>{
  const response=await api.post('/maintenance/system-reset/backup',{database:plan.database,token:plan.token,confirm:true,singleBackendConfirmed:single});
  setBackupId(response.data.data.id);setPlan(null);setPassword('');setDatabase('');setPhrase('');await onChanged?.();
 });
 const verifyRecovery=()=>run(async()=>{
  await api.post('/maintenance/backups/'+backupId+'/recovery-test',{confirm:true});
  setPlan(null);await onChanged?.();
 });
 const execute=()=>run(async()=>{
  const body={backupId,token:plan.token,database,password,confirmation:phrase,confirm:true,singleBackendConfirmed:single};
  setPassword('');setPhrase('');setDatabase('');
  const response=await api.post('/maintenance/system-reset',body);
  setResult(response.data.data);setPlan(null);setMessage(response.data.message);await onChanged?.();
 });
 const reviewed=plan?.backup?.id===backupId&&plan?.backup?.state==='RECOVERY_VERIFIED'&&job?.state==='RECOVERY_VERIFIED';
 const ready=reviewed&&plan?.canReset&&single&&database===plan.database&&phrase==='RESET REMS DATA'&&password.length>0&&!blocked;
 return <section className="card card-body border-danger mt-3" id="system-reset">
  <h2 className="h5">Reset System Data / Fresh Office Setup</h2>
  {maintenance?.resetPreparation&&<div className="alert alert-info"><strong>Reset preparation active.</strong> Automatic monitoring and ordinary database requests are paused between backup, recovery verification and reset approval. The pause expires at {date(maintenance.resetPreparation.expiresAt)} or when reset is completed or cancelled. Keep this page open. {String(maintenance.resetPreparation.actorId)===String(user?._id)&&<button type="button" className="btn btn-outline-secondary btn-sm ms-2" disabled={blocked} onClick={()=>run(async()=>{await api.post('/maintenance/system-reset/cancel',{confirm:true});setPlan(null);setBackupId('');setPassword('');setPhrase('');setDatabase('');setMessage('Reset preparation cancelled. No data deleted.');await onChanged?.()})}>Cancel reset preparation</button>}</div>}
  <div className="alert alert-danger"><strong>Permanent operational data removal.</strong> Use only for a deliberately approved fresh office setup. All existing operational transactions in the connected database are in scope, not only records marked as tests. Users, settings, ID counters, audit logs and backup files are retained.</div>
  <label className="form-check mb-3"><input className="form-check-input" type="checkbox" checked={single} onChange={e=>setSingle(e.target.checked)} disabled={busy}/><span className="form-check-label">I have stopped every other backend, direct database writer and external import process. This is the only backend writing to this database.</span></label>
  <div className="d-flex flex-wrap gap-2 mb-3"><button type="button" className="btn btn-outline-primary" disabled={blocked} onClick={()=>inspect()}>Inspect deletion scope</button>{plan&&!plan.backup&&<button type="button" className="btn btn-outline-primary" disabled={blocked||!single||!plan.canReset||!maintenance?.tools?.mongodump||!maintenance?.tools?.bsondump||!maintenance?.tools?.mongorestore} onClick={()=>setConfirm('backup')}>Create fresh reset backup</button>}</div>
  {plan&&<><p><strong>Connected database:</strong> {plan.database} · {plan.transactionsSupported?'Transactions supported':'Transaction support required'}</p>{!!plan.unknown.length&&<div className="alert alert-warning">Reset blocked. Unclassified collections or configuration: {plan.unknown.join(', ')}. Review these before continuing.</div>}
   <details open><summary className="fw-semibold">Operational documents to remove — {plan.total}</summary><div className="table-responsive"><table className="table table-sm"><thead><tr><th>Category</th><th>Collection</th><th>Documents</th></tr></thead><tbody>{plan.deletion.map(r=><tr key={r.name}><td>{r.group}</td><td>{r.name}</td><td>{r.count}</td></tr>)}</tbody></table></div><p className="small text-secondary">Contracts include embedded schedules, receipts, commissions, penalties and history; one contract document may contain many financial records.</p></details>
   <details className="mb-3"><summary className="fw-semibold">Records preserved</summary><div className="table-responsive"><table className="table table-sm"><thead><tr><th>Collection</th><th>Documents kept</th></tr></thead><tbody>{plan.preserve.map(r=><tr key={r.name}><td>{r.name}</td><td>{r.count}</td></tr>)}</tbody></table></div><p className="small">Preserved: installation/readiness records, database indexes, all user credentials, company branding, backup files and audit history (including historical operational references). Existing ID counters will continue; no sample data will be created.</p>{plan.updates.map(r=><p key={r.name} className="small">{r.description} ({r.count} document(s)).</p>)}</details>
  </>}
  {plan?.embedded?.length>0&&<details className="mb-3"><summary className="fw-semibold">Embedded financial records included in the deletion</summary><div className="table-responsive"><table className="table table-sm"><thead><tr><th>Record type</th><th>Rows</th></tr></thead><tbody>{plan.embedded.map(r=><tr key={r.label}><td>{r.label}</td><td>{r.count}</td></tr>)}</tbody></table></div><p className="small">These counts are contained within the document counts above. They are not added to the total.</p></details>}
  <div className="border rounded p-3 mt-2"><h3 className="h6">Reset backup and recovery verification</h3>
   {!(maintenance?.tools?.mongodump&&maintenance?.tools?.bsondump&&maintenance?.tools?.mongorestore)&&<p className="alert alert-warning">Install the MongoDB Database Tools on this server before creating a reset backup.</p>}
   <label className="form-label w-100">Reset-specific backup<select className="form-select" value={backupId} disabled={busy} onChange={e=>{setBackupId(e.target.value);setPlan(null);setPassword('');setPhrase('');setDatabase('')}}><option value="">Select your reset backup</option>{backupId&&!job&&<option value={backupId}>{backupId} — waiting for status</option>}{backups.map(b=><option value={b.id} key={b.id}>{b.id} · {b.state}</option>)}</select></label>
   {job&&<><p>Status: <strong>{job.state}</strong> · Created {date(job.createdAt)} · Recovery verified {date(job.recoveryVerifiedAt)}</p><p className="small text-break">Backup location: {job.dumpDir||'—'}</p>{job.error&&<p className="text-danger small">{job.error}</p>}<div className="d-flex flex-wrap gap-2"><button type="button" className="btn btn-outline-primary" disabled={blocked||!single||job.state!=='FILE_VERIFIED'||!maintenance?.tools?.mongorestore} onClick={()=>setConfirm('recovery')}>Verify recovery</button><button type="button" className="btn btn-outline-primary" disabled={blocked||job.state!=='RECOVERY_VERIFIED'} onClick={()=>inspect(backupId)}>Review verified backup and final scope</button></div></>}
  </div>
  {reviewed&&<form className="border border-danger rounded p-3 mt-3" onSubmit={e=>{e.preventDefault();if(ready)setConfirm('reset')}}><h3 className="h6">Final administrator authorization</h3><p>Verified recovery copy: {plan.backup.recoveryTarget}. Review the table above before approving deletion.</p>{plan.backup.used&&<p className="alert alert-warning">This backup has a completed or unresolved reset attempt. Review Activity Logs and create a fresh backup.</p>}{plan.backup.fresh===false&&<p className="alert alert-warning">{plan.backup.freshnessError}</p>}{plan.backup.fresh===true&&<p className="small">Backup matched the reviewed deletion scope. It will be checked again before the reset.</p>}
   <label className="form-label w-100">Type the exact database name: <strong>{plan.database}</strong><input className="form-control" autoComplete="off" value={database} onChange={e=>setDatabase(e.target.value)} required disabled={busy}/></label>
   <label className="form-label w-100">Current administrator password<input type="password" className="form-control" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></label>
   <label className="form-label w-100">Type RESET REMS DATA<input className="form-control" value={phrase} onChange={e=>setPhrase(e.target.value)} autoComplete="off" required disabled={busy}/></label>
   <button type="submit" className="btn btn-danger" disabled={!ready}>Reset System Data</button>
  </form>}
  {result&&<div className="alert alert-success mt-3"><strong>Reset completed:</strong> {result.totalDeleted} operational documents removed from {result.database}. {result.verification?.preservedUsers??'All'} user accounts preserved. Audit reference {result.operationId}. Backup {result.backup.id} remains available. Refresh office browser tabs and configure a new opening cash balance before cash operations.</div>}
  <CenterPopup error={error} message={message} confirm={confirm==='backup'?'Create a fresh full backup for the reviewed reset scope? No records will be deleted.':confirm==='recovery'?'Restore the backup into a separate isolated recovery database and verify all data and indexes? The current database will not be overwritten.':confirm==='reset'?`Permanently remove ${plan?.total} operational documents from ${plan?.database}? Your recovery-verified backup will be retained. This cannot be undone from the application.`:null} confirmTitle={confirm==='reset'?'Final system reset authorization':'Administrator confirmation'} confirmLabel={confirm==='reset'?'Delete':'Confirm'} onConfirm={()=>{const action=confirm;setConfirm(null);if(action==='backup')beginBackup();else if(action==='recovery')verifyRecovery();else if(action==='reset'&&ready)execute()}} onClose={()=>{if(confirm==='reset')setPassword('');setConfirm(null);setError('');setMessage('')}}/>
 </section>;
}
