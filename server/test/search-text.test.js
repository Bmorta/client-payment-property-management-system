import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeSearch} from '../src/utils/searchText.js';
test('search treats special characters literally rather than constructing user regular expressions',()=>{
 for(const value of ['.*','[receipt]','a+b','(cash)','C:\\office','₱100','a|b','^total$']){
  const pattern=new RegExp('^'+escapeSearch(value)+'$','i');assert.equal(pattern.test(value),true,value);assert.equal(pattern.test('unrelated text'),false,value);
 }
});
