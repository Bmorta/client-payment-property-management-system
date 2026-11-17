// Stable item revisions distinguish genuinely new attention from polling/read changes.
const revision=v=>JSON.stringify(v);
export function attentionItems(accounts,raw,user){
 if(!['ADMIN','STAFF'].includes(user.role))return {};
 const modules={},put=(module,id,version)=>{(modules[module]??={})[id]=revision(version)};
 for(const a of accounts){const id=String(a._id);
  if(a.sourceModel==='SiteRequest'){
   const flags=a.flags||{},needs=['NEW','FOR_SCHEDULING','ON_HOLD'].includes(a.status)||Object.entries(flags).some(([k,v])=>v&&k!=='upcoming');
   if(needs||a.status!=='DELETED'&&a.history?.length)put('requests',id,[a.status,a.history?.at(-1)?.requestKey||a.history?.at(-1)?.timestamp||a.updatedAt,a.schedule,a.personnel?.map(String),Object.keys(flags).filter(k=>flags[k]).sort()]);
  }else{
   for(const r of a.correctionRequests||[])if(r.status==='PENDING'&&(user.role==='ADMIN'||String(r.requestedBy)===String(user._id)))put('payments',id+':'+r.requestId,[r.requestedAt,r.reason,r.status]);
   const records=(a.commissionSnapshot?.records||[]).filter(r=>r.releasableCents>0||r.historicalVerificationCents>0||r.recoveryDueCents>0);
   if(user.role==='ADMIN'&&records.length)put('commissions','account:'+id,records.map(r=>[r.commissionId,r.releasableCents,r.historicalVerificationCents,r.recoveryDueCents]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  }
 }
 for(const n of raw)if(n.active===true&&n.monitoringAlert&&['CRITICAL','FORFEITURE_REVIEW_REQUIRED'].includes(n.status)){
  const id=String(n.accountId),slot=(modules.clients??={}),values=slot[id]?JSON.parse(slot[id]):[];values.push([n.id,n.status]);slot[id]=revision([...new Map(values.map(v=>[v[0],v])).values()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
 }
 return modules;
}
const categoryModule={payments:'payments',commissions:'commissions',reopening:'reopening',migration:'migration',cash:'cash',payouts:'payouts',forfeiture:'forfeiture',cancellation:'cancellation',transfers:'transfers',assumptions:'assumptions'};
export function moduleAttentionItems(items={},reviewRows=[],role){
 const result=Object.fromEntries(Object.entries(items).map(([k,v])=>[k,{...v}]));
 if(role!=='ADMIN'){result.reviews=role==='STAFF'?{...result.payments}:{};delete result.commissions;return result;}
 result.reviews={};
 const commissionRows={};
 for(const r of [...new Map(reviewRows.filter(r=>r.pending).map(r=>[r.id,r])).values()]){
  const value=revision([r.id,r.status,r.requestedAt||null,r.reason||'',r.refundOutstandingCents??null]),key='review:'+r.id;
  result.reviews[key]=value;
  const module=categoryModule[r.category];if(!module)continue;
  const itemKey=r.category==='payments'&&r.requestId?r.accountId+':'+r.requestId:r.category==='commissions'&&r.accountId?'account:'+r.accountId:key;
  if(r.category==='commissions'){(commissionRows[itemKey]??=[]).push(value);continue;}
  // Same payment request may arrive in both permitted notification and review projections.
  if(r.category==='payments'&&r.requestId)(result[module]??={})[itemKey]=revision([r.requestedAt,r.reason,r.status]);else if(!result[module]?.[itemKey])(result[module]??={})[itemKey]=value;
 }
 for(const [key,values]of Object.entries(commissionRows)){
  const base=result.commissions?.[key]||null;(result.commissions??={})[key]=revision([base,values.sort()]);
 }
 return result;
}
export function unseenCounts(items={},seen={}){return Object.fromEntries(Object.entries(items).map(([module,records])=>[module,Object.entries(records).filter(([id,version])=>seen[module]?.[id]!==version).length]));}
export function markModuleSeen(seen,module,items){return {...seen,[module]:{...seen[module],...items[module]}};}
export const seenStorageKey=id=>'rems:sidebar-seen:v1:'+id;
export function sidebarModule(path,search=''){
 if(path==='/approval-requests')return 'reviews';if(path==='/site-requests')return 'requests';if(path==='/payment-transactions')return 'payments';if(path==='/commissions')return 'commissions';if(path==='/clients'&&!new URLSearchParams(search).has('workspace'))return 'clients';if(path==='/reopen-properties')return 'reopening';if(path==='/historical-migration')return 'migration';if(path==='/payouts')return 'payouts';if(path==='/reports'&&new URLSearchParams(search).get('focus')==='movements')return 'cash';if(path==='/forfeited-accounts')return 'forfeiture';if(path==='/assumptions')return 'assumptions';if(path==='/clients'&&new URLSearchParams(search).get('workspace')==='cancellations')return 'cancellation';if(path==='/clients'&&new URLSearchParams(search).get('workspace')==='transfers')return 'transfers';return null;
}
export function moduleLoadedBy(module,url){const path=String(url||'').split('?')[0];return ({reviews:/^\/admin-reviews$|^\/finance\/approval-requests$/,requests:/^\/site-requests$/,payments:/^\/finance\/payments$/,commissions:/^\/commissions\/(ledger|agreements|vouchers)|^\/commissions$/,clients:/^\/clients$/,reopening:/^\/finance\/forfeited-accounts$/,migration:/^\/migration(?:\/(batches|progress|config))?$/,payouts:/^\/office-payouts$/,cash:/^\/finance\/cash-office(?:\/reviews)?$/,forfeiture:/^\/finance\/forfeited-accounts$/,assumptions:/^\/finance\/assumptions$/,cancellation:/^\/finance\/accounts$|^\/clients$/,transfers:/^\/finance\/accounts$|^\/clients$/})[module]?.test(path)||false;}
