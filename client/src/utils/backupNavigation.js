export function safeWorkflowReturn(value){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\r\n]/.test(value))return null;
 try{const u=new URL(value,'https://rems.invalid');if(u.origin!=='https://rems.invalid'||u.pathname==='/database-maintenance'||u.pathname==='/login')return null;return u.pathname+u.search+u.hash}catch{return null}
}
export function backupWorkflowUrl(value){const back=safeWorkflowReturn(value);return '/database-maintenance'+(back?'?returnTo='+encodeURIComponent(back):'')}
