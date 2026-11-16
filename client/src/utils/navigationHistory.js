// Paths are local workspace destinations, never an authentication or external URL.
export function safeWorkspacePath(value){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return null;
 try{const u=new URL(value,'http://rems.local');if(u.origin!=='http://rems.local'||u.pathname==='/login')return null;const p=u.pathname;return /^(\/$|\/(clients(?:\/[^/]+\/accounts)?|projects(?:\/[^/]+\/lots)?|agents|commissions|property-inventory|reports|payment|payment-transactions|payment-monitoring|approval-requests|payouts|expenses|forfeited-accounts|reopen-properties|property-history|settlements|assumptions|site-requests|database-maintenance|historical-migration|companies|users|settings\/appearance)$)/.test(p)?u.pathname+u.search+u.hash:null}catch{return null}
}
export function destinationLabel(path){const p=safeWorkspacePath(path);if(!p)return 'Dashboard';if(p.startsWith('/clients/'))return 'Client Details';if(p.startsWith('/projects/'))return 'Manage Lots';return ({'/':'Dashboard','/clients':'Clients','/agents':'Agents','/commissions':'Commissions','/projects':'Projects','/property-inventory':'Property Inventory','/reports':'Reports','/payment':'Payments','/payment-transactions':'Payment Transactions','/payment-monitoring':'Payment Monitoring','/site-requests':'Requests & Site Visits','/approval-requests':'Approval Requests','/expenses':'Expenses','/payouts':'Payouts','/property-history':'Property History','/settlements':'Settlements','/reopen-properties':'Reopen Properties','/forfeited-accounts':'Forfeited Accounts','/assumptions':'Assumptions','/database-maintenance':'Database & Backups','/historical-migration':'Historical Import','/companies':'Company Settings','/users':'Users','/settings/appearance':'Appearance'})[p.split(/[?#]/)[0]]||'Workspace'}
export function recordNavigation(entries,previous,current,action){
 const path=safeWorkspacePath(current.path);if(!path)return entries;
 if(action==='POP'&&entries[current.key])return entries;
 let origin=entries[current.key]?.origin||null;
 if(previous&&previous.key!==current.key){const old=entries[previous.key];if(action==='REPLACE'||previous.path.split('?')[0]===path.split('?')[0])origin=old?.origin||null;else origin={key:previous.key,path:previous.path,index:previous.index};}
 if(origin?.key===current.key||origin?.path===path||!safeWorkspacePath(origin?.path))origin=null;
 const next={...entries,[current.key]:{...current,path,origin,visited:Date.now()}};return Object.fromEntries(Object.entries(next).sort((a,b)=>b[1].visited-a[1].visited).slice(0,80));
}
export function backDestination(entry,currentIndex,fallback='/'){
 const origin=entry?.origin,path=safeWorkspacePath(origin?.path)||safeWorkspacePath(fallback)||'/';
 const delta=origin&&Number.isInteger(origin.index)&&Number.isInteger(currentIndex)&&origin.index<currentIndex?origin.index-currentIndex:null;
 return {path,delta,label:'Back to '+destinationLabel(path)};
}
export function readSession(key,fallback){try{return JSON.parse(sessionStorage.getItem(key))??fallback}catch{return fallback}}
export function writeSession(key,value){try{const text=JSON.stringify(value);if(text.length<200000)sessionStorage.setItem(key,text)}catch{}}
