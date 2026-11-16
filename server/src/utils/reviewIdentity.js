// Read only from explicit workflow evidence. Missing historical roles/dates are
// not reconstructed from today's account permissions or a record's updatedAt.
export const LEGACY_REVIEW_USER='Unknown / Legacy Record';
const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
export function reviewUser(value){if(!value)return {userId:null,fullName:LEGACY_REVIEW_USER,username:LEGACY_REVIEW_USER,role:LEGACY_REVIEW_USER};if(typeof value==='string'||typeof value.toHexString==='function')return {userId:String(value),fullName:LEGACY_REVIEW_USER,username:LEGACY_REVIEW_USER,role:LEGACY_REVIEW_USER};return {userId:value.userId||value._id?String(value.userId||value._id):null,fullName:value.fullName||value.name||value.representative||LEGACY_REVIEW_USER,username:value.username||LEGACY_REVIEW_USER,role:value.role||value.userRole||LEGACY_REVIEW_USER}}
export function reviewIdentity(request,decision){return {requestedBy:reviewUser(request?.actor||request),requestedAt:date(request?.requestedAt||request?.timestamp||request?.createdAt),reviewedBy:decision?reviewUser(decision.actor||decision.administrator||decision):null,reviewedAt:date(decision?.decidedAt||decision?.timestamp||decision?.approvedAt)}}
export const firstEvent=(history,actions)=>(history||[]).find(e=>actions.includes(e.action));
export const lastEvent=(history,actions)=>(history||[]).filter(e=>actions.includes(e.action)).at(-1);
export function originalReviewEvent(history,current){
 const events=history||[],isStart=e=>e?.status==='UNDER_REVIEW'||['MARK_REVIEW','START'].includes(e?.action),isEnd=e=>['FORFEITED','REJECTED','CANCELLED','WITHDRAWN','REACTIVATED'].includes(e?.status)||['FORFEIT','REJECT','CANCEL_REVIEW','WITHDRAW','REACTIVATE'].includes(e?.action);
 let index=events.lastIndexOf(current);if(index<0&&current?.requestId)index=events.findIndex(e=>e.requestId===current.requestId);const rows=index>=0?events.slice(0,index+1):events;
 const last=rows.at(-1),isCurrent=index>=0||last&&current&&last.status===current.status&&last.action===current.action&&String(last.timestamp)===String(current.timestamp);let boundary=-1;for(let i=0;i<rows.length-(isCurrent&&isEnd(last)?1:0);i++)if(isEnd(rows[i]))boundary=i;
 return rows.slice(boundary+1).find(isStart)||(isStart(current)?current:null);
}
