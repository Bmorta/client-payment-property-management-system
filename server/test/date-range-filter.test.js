import test from 'node:test';
import assert from 'node:assert/strict';
import {localDate,presetRange,validRange} from '../../client/src/utils/finance.js';
import {matchesSiteRequestDates} from '../../shared/siteRequestDates.js';
import OfficePayout from '../src/models/OfficePayout.js';
import {listOfficePayouts} from '../src/controllers/officePayoutController.js';

test('Philippine midnight and Monday to Sunday calendar presets',()=>{
 assert.equal(localDate(new Date('2026-11-19T15:59:59Z')),'2026-11-19');
 assert.equal(localDate(new Date('2026-11-19T16:00:00Z')),'2026-11-20');
 const anchor='2026-11-20';
 assert.deepEqual(presetRange('today',anchor),{from:anchor,to:anchor});
 assert.deepEqual(presetRange('weekly',anchor),{from:'2026-11-16',to:'2026-11-22'});
 assert.deepEqual(presetRange('monthly',anchor),{from:'2026-11-01',to:'2026-11-30'});
 assert.deepEqual(presetRange('yearly',anchor),{from:'2026-01-01',to:'2026-12-31'});
 assert.deepEqual(presetRange('weekly','2027-01-01'),{from:'2026-12-28',to:'2027-01-03'});
 assert.deepEqual(presetRange('monthly','2028-02-01'),{from:'2028-02-01',to:'2028-02-29'});
});
test('request, scheduled and actual visit dates remain distinct in Philippine time',()=>{
 const row={requestDate:'2026-11-01',schedule:{start:'2026-11-10T16:30:00Z'},reports:[{actualStart:'2026-11-12T16:00:00Z'}]};
 for(const [dateBasis,day] of [['request','2026-11-01'],['scheduled','2026-11-11'],['actual','2026-11-13'],['activity','2026-11-11']]){
  assert.equal(matchesSiteRequestDates(row,{dateBasis,from:day,to:day}),true);
  assert.equal(matchesSiteRequestDates(row,{dateBasis,from:'2026-11-20',to:'2026-11-20'}),false);
 }
 assert.equal(matchesSiteRequestDates({requestDate:'2026-11-01'},{dateBasis:'scheduled',from:'2026-11-01',to:'2026-11-01'}),false);
});
test('actual payout date scope matches nonvoid releases and displays only in-period amounts',async t=>{
 const rows=[{amountCents:50000,paymentDate:'2026-10-01',releases:[{paymentDate:'2026-11-01',amountCents:10000},{paymentDate:'2026-11-15',amountCents:20000},{paymentDate:'2026-11-15',amountCents:5000,voided:true}]}];
 let match,pipeline;
 const chain={populate:()=>chain,sort:()=>chain,skip:()=>chain,limit:()=>chain,lean:async()=>rows};
 t.mock.method(OfficePayout,'find',f=>{match=f;return chain});
 t.mock.method(OfficePayout,'countDocuments',async()=>1);
 t.mock.method(OfficePayout,'aggregate',async p=>{pipeline=p;return [{totalCents:50000,paidCents:20000}]});
 let result;
 await listOfficePayouts({query:{dateBasis:'release',from:'2026-11-10',to:'2026-11-20'}},{json:r=>{result=r}},e=>{throw e});
 assert.deepEqual(match.releases.$elemMatch,{voided:{$ne:true},paymentDate:{$gte:'2026-11-10',$lte:'2026-11-20'}});
 assert.equal(match.paymentDate,undefined);
 assert.match(JSON.stringify(pipeline),/2026-11-10/);
 assert.equal(result.data.rows[0].periodReleasedCents,20000);
 assert.equal(result.data.rows[0].releasedCents,30000);
 assert.equal(result.data.paidCents,20000);
});
test('actual cash presets stop at today and reject invalid custom dates',()=>{
 assert.deepEqual(presetRange('yearly','2026-11-20',true),{from:'2026-01-01',to:'2026-11-20'});
 assert.equal(validRange({from:'2020-02-29',to:'2020-03-01'}),true);
 for(const range of [{from:'2026-02-30',to:'2026-03-04'},{from:'2026-11-20',to:'2026-11-19'},{from:'',to:'2026-11-20'},{from:'2026-11-01',to:'2026-11-30'}]){
  assert.equal(validRange(range,'2026-11-20'),false);
 }
});
