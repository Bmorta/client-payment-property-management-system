let paused=false,active=0;
export const maintenanceActive=()=>paused;
export async function trackedBackgroundWrite(work){if(paused)return null;active++;try{return await work()}finally{active--}}
export function maintenanceWriteGate(req,res,next){if(req.method==='OPTIONS'||req.path.startsWith('/api/maintenance/')||req.method==='GET'&&req.path==='/api/finance/notifications/stream')return next();if(paused)return res.status(503).json({success:false,message:'Administrator database maintenance is in progress. Saving is temporarily paused; nothing from this request was started. Keep your inputs and retry when maintenance finishes.'});active++;let finished=false;const completed=()=>{if(!finished){finished=true;active--}};
 // end() is reached after the controller/audit work settles even if the client
 // disconnected earlier. Socket close alone never proves a write has completed.
 const end=res.end;res.end=function(...args){try{return end.apply(this,args)}finally{completed()}};res.once('finish',completed);next()}

export async function withMaintenance(work){if(paused)throw Object.assign(new Error('Another maintenance operation is running.'),{statusCode:409});paused=true;try{const until=Date.now()+20000;while(active){if(Date.now()>until)throw Object.assign(new Error('A write is still in progress or its result is uncertain. Maintenance was not started. Review transactions and restart the backend before retrying.'),{statusCode:409});await new Promise(r=>setTimeout(r,100))}return await work()}finally{paused=false}}
