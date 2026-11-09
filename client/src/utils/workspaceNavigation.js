const item=(to,label,icon,roles)=>({to,label,icon,roles});
export const workspaceGroups=[
 {id:'dashboard',label:'Dashboard',icon:'grid',items:[item('/','Dashboard','grid')]},
 {id:'property',label:'Property Management',icon:'building',items:[item('/projects','Projects & Lots','building'),item('/property-inventory','Property Inventory','building')]},
 {id:'clients',label:'Clients & Contracts',icon:'people',items:[item('/clients','Client List','people'),item('/clients?workspace=accounts','Contracts & Accounts','receipt')]},
 {id:'payments',label:'Payments & Collections',icon:'wallet',items:[item('/payment','Record Payment','wallet',['ADMIN','STAFF']),item('/payment-transactions','Payment Transactions','receipt'),item('/payment-monitoring','Payment Monitoring','bell')]},
 {id:'agents',label:'Agents & Commissions',icon:'percent',items:[item('/agents','Agents','agent'),item('/commissions','Agreements & Register','percent'),item('/commissions?status=UNRELEASED','Commission Releases','wallet')]},
 {id:'adjustments',label:'Contract Adjustments',icon:'history',items:[item('/clients?workspace=transfers','Lot Transfers','building'),item('/clients?workspace=cancellations','Cancellations, Credits & Refunds','history')]},
 {id:'financial',label:'Financial Management',icon:'expense',items:[item('/expenses','Expenses','expense'),item('/reports?view=cash&focus=movements','Cash Management & Turnovers','wallet')]},
 {id:'reports',label:'Reports',icon:'chart',items:[item('/reports?view=general','Operational Reports','chart'),item('/reports?view=cash','Financial Reports','chart')]},
 {id:'migration',label:'Historical Data Migration',icon:'receipt',items:[item('/historical-migration','Migration Workspace','receipt',['ADMIN','STAFF'])]},
 {id:'admin',label:'Administration',icon:'settings',items:[item('/companies','Company Settings','building'),item('/users?tab=users','Users','people',['ADMIN']),item('/users?tab=activity','Activity Logs','history',['ADMIN']),item('/approval-requests','Approval Requests','check',['ADMIN','STAFF'])]},
];
export function visibleGroups(role){return workspaceGroups.map(g=>({...g,items:g.items.filter(i=>!i.roles||i.roles.includes(role))})).filter(g=>g.items.length)}
export function activeDestination({pathname,search}){
 const q=new URLSearchParams(search);
 if(pathname==='/clients')return q.has('workspace')?`/clients?workspace=${q.get('workspace')}`:'/clients';
 if(pathname.startsWith('/clients/'))return '/clients?workspace=accounts';
 if(pathname.startsWith('/projects/'))return '/projects';
 if(pathname==='/reports')return q.get('focus')==='movements'?'/reports?view=cash&focus=movements':`/reports?view=${q.get('view')==='cash'?'cash':'general'}`;
 if(pathname==='/users')return `/users?tab=${q.get('tab')==='activity'?'activity':'users'}`;
 if(pathname==='/commissions')return q.get('status')==='UNRELEASED'?'/commissions?status=UNRELEASED':'/commissions';
 return pathname;
}
