import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {makeListReport,reportCsv,reportWorkbook,reportModules} from '../src/utils/listReport.js';
import {canExportList,listReport} from '../src/controllers/listReportController.js';
test('list report filters match project/client/user search fields and omit secrets',()=>{
 const users=[{username:'admin',firstName:'Ana',lastName:'Buyer',email:'a@local',role:'ADMIN',isActive:true,passwordHash:'NEVER_EXPORT',token:'SECRET'}];
 const r=makeListReport('users',users,{q:' ana buyer '});assert.equal(r.count,1);assert.equal(r.rows[0][1],'Ana Buyer');assert.ok(!JSON.stringify(r).includes('NEVER_EXPORT'));assert.ok(!JSON.stringify(r).includes('SECRET'));
 assert.equal(makeListReport('projects',[{projectId:'PRJ-1',projectName:'Estate',projectCode:'TAG',location:'Davao'}],{q:'davao'}).count,1);
 assert.equal(makeListReport('clients',[{clientId:'CL-1',firstName:'Ana',lastName:'Buyer',email:'buyer@test'}],{q:'buyer@test'}).count,1);
 assert.throws(()=>makeListReport('__proto__',[]));
});
test('reports cover all supplied matching rows, preserve numeric commissions and escape CSV formulas',async()=>{
 const rows=Array.from({length:45},(_,i)=>({commissionId:`COM-${i}`,percentageBps:300,earnedCents:18000,unreleasedCents:18000,clientInfo:{firstName:'Ana'},status:'UNRELEASED'}));
 const r=makeListReport('commissions',rows);assert.equal(r.count,45);const book=new ExcelJS.Workbook();await book.xlsx.load(await reportWorkbook(r));const s=book.worksheets[0];assert.equal(s.rowCount,51);assert.equal(s.getCell('K7').value,180);assert.equal(s.getCell('I7').value,3);assert.equal(s.views[0].ySplit,6);
 const unsafe=makeListReport('projects',[{projectId:'00001',projectName:'=HYPERLINK("bad")'}]);assert.ok(reportCsv(unsafe).includes("'=HYPERLINK"));await book.xlsx.load(await reportWorkbook(unsafe));assert.equal(book.worksheets[0].getCell('A7').value,'00001');assert.equal(typeof book.worksheets[0].getCell('B7').value,'string');
});
test('admin permission and preview requirements are enforced before database access',async()=>{
 for(const module of ['users','activity-logs']){assert.equal(canExportList(module,{role:'STAFF'}),false);assert.equal(canExportList(module,{role:'ADMIN'}),true)}
 for(const [module,user,query,expected] of [['users',{role:'STAFF'},{},403],['activity-logs',{role:'VIEWER'},{},403],['projects',{role:'STAFF'},{format:'xlsx'},400],['projects',{role:'STAFF'},{q:['bad']},400],['__proto__',{role:'ADMIN'},{},404]]){
 let status;await listReport({params:{module},user,query},{status(n){status=n;return this},json(){}},e=>{throw e});assert.equal(status,expected);
 }
 assert.equal(Object.keys(reportModules).length,6);
});
