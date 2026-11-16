// Presentation only. Eligibility is still enforced by each original workflow/API.
export const statusLabel=value=>String(value||'Not recorded').replace(/^HISTORICAL_/,'').toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export function contractSearchStatus(account){
 if(account.tags?.length)return account.tags;
 const category=account.summary?.category||account.category;
 const lifecycle=category&&/CANCELLED|FORFEITED|TRANSFERRED|SUPERSEDED|ASSUMED/.test(category)?category:account.lifecycle||account.migration?.historicalStatus;
 return [...new Set([lifecycle,account.pendingCancellation?'CANCELLATION_REVIEW':null,account.summary?.settlement?.status,account.summary?.status].filter(Boolean))];
}
export function recordStatusBadges(record){
 if(!record)return [];
 if(isClientSearchRecord(record))return [{status:record.status,label:statusLabel(record.status)}];
 if(record.assignmentId)return contractSearchStatus(record).map(status=>({status,label:`Contract: ${statusLabel(status)}`}));
 if(record.agentId)return [{status:record.status,label:`Agent: ${statusLabel(record.status)}`}];
 if(record.propertyId)return [{status:record.status,label:`Lot: ${statusLabel(record.status)}`}];
 if(typeof record.isActive==='boolean')return [{status:record.isActive?'ACTIVE':'INACTIVE',label:record.isActive?'Active':'Inactive'}];
 return record.status?[{status:record.status,label:statusLabel(record.status)}]:[];
}
export const propertySearchLabel=p=>`${p?.project?.projectName?`${p.project.projectName} · `:''}${p?.propertyId||''} · Phase ${p?.phaseNumber??'—'} / Block ${p?.blockNumber??'—'} / Lot ${p?.lotNumber??'—'} · ${statusLabel(p?.status)}`;
export const agentSearchLabel=a=>`${a.fullName} · ${a.agentId||''} · ${statusLabel(a.status)}`;
export const contractSearchLabel=a=>`${a.assignmentId||''} · ${contractSearchStatus(a).map(statusLabel).join(' / ')||'Status not recorded'}`;
export function agentSelectionReason(agent,projectId){if(agent.status!=='ACTIVE')return 'Only active agents can be assigned.';if(projectId&&agent.assignedProjects?.length&&!agent.assignedProjects.some(p=>String(p._id||p)===String(projectId)))return 'Agent is not assigned to this project.';return ''}
export function clientSearchDetail(client){
 if(client.accounts?.length)return client.accounts.map(a=>{const project=client.projects?.find(p=>String(p._id)===String(a.project)),property=client.lots?.find(p=>String(p._id)===String(a.property));return [contractSearchLabel(a),project?.projectName,property?propertySearchLabel(property):''].filter(Boolean).join(' · ')}).join('; ');
 return [client.projects?.map(p=>p.projectName).join(', '),client.lots?.map(propertySearchLabel).join('; ')||'No assigned property'].filter(Boolean).join(' · ');
}

export const clientSuggestionLabel=c=>[c.fullName||[c.firstName,c.middleName,c.lastName,c.suffix].filter(Boolean).join(' '),c.clientId].filter(Boolean).join(' · ');

export const isClientSearchRecord=r=>!!r?.clientId&&!r?.paymentId&&!r?.assignmentId&&!r?.commissionId&&!r?.propertyId;
