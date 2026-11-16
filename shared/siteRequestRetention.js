export function requestDeletionPolicy(request,accounts=[]){
 const same=(a,b)=>a&&b&&String(a?._id||a)===String(b?._id||b);
 const linked=accounts.filter(a=>same(a._id,request.account)||same(a.property,request.property)&&same(a.client,request.client));
 const active=linked.filter(a=>{const lifecycle=a.lifecycle;const terminal=['TRANSFERRED','ASSUMED','CANCELLED','FORFEITED','SUPERSEDED'].includes(lifecycle);return !terminal&&(!lifecycle||['ACTIVE','CANCELLATION_PENDING'].includes(lifecycle)||!!a.pendingCancellation)});
 const reasons=[];
 if(active.length)reasons.push('The linked property has an active contract. Use Disregard instead.');
 if(request.account&&!linked.some(a=>same(a._id,request.account)))reasons.push('The linked contract could not be verified. An administrator must reconcile the relationship first.');
 if(request.type?.mode==='CLIENT_PROPERTY'&&!request.account&&!request.property)reasons.push('This historical property request has no verifiable contract or property link. Use Disregard while it is reconciled.');
 const retained=[];
 if(request.schedule)retained.push('Confirmed schedules');
 if(request.reports?.length||request.status==='COMPLETED')retained.push('Completed visits and visit reports');
 if(request.attachments?.length)retained.push('Attachments and possible signed documents');
 retained.push('Request details, approvals or financial references in history, and audit records');
 return {allowed:!reasons.length&&request.status!=='DELETED',mode:'SOFT_DELETE',reasons,retained,explanation:reasons.join(' ')||'Delete archives this request. All evidence, connected records and audit history are retained; no financial or contract data is removed.'};
}
export function requestListFilter(query={}){
 const closed=['COMPLETED','CANCELLED','REJECTED','DISREGARDED','DELETED'];
 if(query.scope==='ALL'&&!query.status)return {status:{$nin:['DISREGARDED','DELETED']}};
 if(query.status)return {status:query.status};
 if(query.history==='1')return {status:{$in:closed}};
 if(query.scope==='COMPLETED')return {status:'COMPLETED'};
 if(query.scope==='DISREGARDED')return {status:'DISREGARDED'};
 if(query.scope==='DELETED')return {status:'DELETED'};
 return {status:{$nin:closed}};
}
