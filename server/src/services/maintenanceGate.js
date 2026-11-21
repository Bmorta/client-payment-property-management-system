let paused=false,active=0;
let resetHold=null;
const resetHoldMs=30*60*1000;
export function resetPreparation(){if(resetHold&&resetHold.expiresAt<=Date.now())resetHold=null;return resetHold?{...resetHold}:null}
export function pauseForReset(actorId){const existing=resetPreparation();if(existing&&existing.actorId!==String(actorId))throw Object.assign(new Error('Another administrator is preparing a reset.'),{statusCode:409});resetHold={actorId:String(actorId),expiresAt:Date.now()+resetHoldMs};return resetPreparation()}
export function resumeAfterReset(actorId){const hold=resetPreparation();if(hold&&hold.actorId!==String(actorId))throw Object.assign(new Error('Only the administrator preparing the reset can cancel it.'),{statusCode:409});resetHold=null}
export const maintenanceActive=()=>paused||!!resetPreparation();
export async function trackedBackgroundWrite(work){if(maintenanceActive())return null;active++;try{return await work()}finally{active--}}
export function maintenanceWriteGate(req,res,next){if(req.method==='OPTIONS'||req.method==='GET'&&(req.path.startsWith('/api/maintenance/')||req.path==='/api/finance/notifications/stream'||req.path==='/api/auth/me'||req.path==='/api/health'||!req.path.startsWith('/api/')))return next();const resetRoute=req.path==='/api/maintenance/system-reset'||req.path==='/api/maintenance/system-reset/backup'||req.path==='/api/maintenance/system-reset/cancel'||/^\/api\/maintenance\/backups\/[^/]+\/recovery-test$/.test(req.path);if(paused||resetPreparation()&&!resetRoute)return res.status(503).json({success:false,message:'Administrator database maintenance is in progress. Saving is temporarily paused; nothing from this request was started. Keep your inputs and retry when maintenance finishes.'});if(req.path.startsWith('/api/maintenance/'))return next();active++;let finished=false;const completed=()=>{if(!finished){finished=true;active--}};
 // end() is reached after the controller/audit work settles even if the client
 // disconnected earlier. Socket close alone never proves a write has completed.
 const end=res.end;res.end=function(...args){try{return end.apply(this,args)}finally{completed()}};res.once('finish',completed);next()}

export async function withMaintenance(work){if(paused)throw Object.assign(new Error('Another maintenance operation is running.'),{statusCode:409});paused=true;try{const until=Date.now()+20000;while(active){if(Date.now()>until)throw Object.assign(new Error('A write is still in progress or its result is uncertain. Maintenance was not started. Review transactions and restart the backend before retrying.'),{statusCode:409});await new Promise(r=>setTimeout(r,100))}return await work()}finally{paused=false}}
