import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceGroups,visibleGroups,activeDestination} from '../../client/src/utils/workspaceNavigation.js';
test('REMS preserves module destinations without duplicate navigation entries',()=>{
 const all=workspaceGroups.flatMap(g=>g.items.map(i=>i.to));assert.equal(new Set(all).size,all.length);assert.equal(workspaceGroups.length,10);
 for(const path of ['/','/projects','/property-inventory','/clients','/agents','/commissions','/payment','/payment-transactions','/payment-monitoring','/expenses','/historical-migration','/companies','/approval-requests'])assert.ok(all.includes(path),path);
});
test('REMS permissions preserve company read access and staff request history',()=>{
 const links=role=>visibleGroups(role).flatMap(g=>g.items.map(i=>i.to));
 for(const role of ['ADMIN','STAFF','VIEWER'])assert.ok(links(role).includes('/companies'));
 assert.ok(links('STAFF').includes('/approval-requests'));assert.ok(!links('STAFF').some(p=>p.startsWith('/users')));
 for(const path of ['/payment','/historical-migration','/approval-requests'])assert.ok(!links('VIEWER').includes(path));
 assert.ok(links('ADMIN').includes('/users?tab=activity'));
});
test('REMS active destination distinguishes tabs and preserves legacy account and project URLs',()=>{
 for(const [url,expected] of [['/reports','/reports?view=general'],['/reports?view=cash','/reports?view=cash'],['/reports?view=cash&focus=movements','/reports?view=cash&focus=movements'],['/users','/users?tab=users'],['/users?tab=activity','/users?tab=activity'],['/clients?workspace=transfers','/clients?workspace=transfers'],['/clients/123/accounts?tab=penalty-history','/clients?workspace=accounts'],['/projects/123/lots','/projects'],['/commissions?account=123','/commissions'],['/commissions?status=UNRELEASED','/commissions?status=UNRELEASED']])assert.equal(activeDestination(new URL(url,'http://localhost')),expected);
});
