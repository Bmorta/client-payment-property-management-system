import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {filterInventory} from '../../shared/inventoryFilters.js';
import {inventoryWorkbook,exportProjectInventory} from '../src/controllers/inventoryExportController.js';
const rows=[{propertyId:'PROP-001',phaseNumber:1,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:1800,status:'AVAILABLE'},{propertyId:'PROP-002',phaseNumber:1,blockNumber:2,lotNumber:2,areaSqm:80,pricePerSqm:2000,status:'SOLD'}];
const project={projectName:'Example Project',projectId:'PRJ-001',projectCode:'EX'};
test('inventory export shares combined list filters and writes numeric areas and prices',async()=>{
 const filters={phase:'1',block:'1',status:'AVAILABLE',q:'prop-001'},matching=filterInventory(rows,filters);assert.equal(matching.length,1);
 const book=new ExcelJS.Workbook();await book.xlsx.load(await inventoryWorkbook(project,matching,filters));const s=book.getWorksheet('Property Inventory');assert.equal(s.getCell('B6').value,1);assert.equal(s.getCell('A8').value,'PROP-001');assert.equal(s.getCell('E8').value,100);assert.equal(s.getCell('F8').value,1800);assert.equal(s.getCell('G8').value,180000);assert.equal(s.rowCount,8);assert.equal(s.pageSetup.orientation,'landscape');assert.equal(s.views[0].ySplit,7);
});
test('inventory export handles empty results and preserves unknown prices versus zero',async()=>{
 const book=new ExcelJS.Workbook();await book.xlsx.load(await inventoryWorkbook(project,[],{status:'RESERVED'}));assert.equal(book.worksheets[0].getCell('B6').value,0);assert.equal(book.worksheets[0].rowCount,7);
 await book.xlsx.load(await inventoryWorkbook(project,[{...rows[0],pricePerSqm:null},{...rows[1],pricePerSqm:0}]));const s=book.worksheets[0];assert.equal(s.getCell('G8').value,null);assert.equal(s.getCell('G9').value,0);assert.equal(s.getCell('F9').value,0);
});
test('inventory export rejects malformed identifiers and filter shapes before database access',async()=>{
 for(const [params,query] of [[{projectId:'bad'},{}],[{projectId:'507f1f77bcf86cd799439011'},{status:'INVALID'}],[{projectId:'507f1f77bcf86cd799439011'},{q:['a']}],[{projectId:'507f1f77bcf86cd799439011'},{phase:'-1'}]]){
 let status;await exportProjectInventory({params,query},{status(n){status=n;return this},json(){}},e=>{throw e});assert.equal(status,400);
 }
});
