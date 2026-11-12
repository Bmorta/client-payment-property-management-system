import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveClientStatus} from '../src/services/clientLifecycleSync.js';

test('active contracts keep the master client active even when another contract is closed',()=>{
  assert.equal(deriveClientStatus({hasActive:true,hasTerminal:true}),'ACTIVE');
});

test('clients with only finalized contracts become inactive',()=>{
  assert.equal(deriveClientStatus({hasActive:false,hasTerminal:true}),'INACTIVE');
});

test('clients without contract history are not changed by lifecycle reconciliation',()=>{
  assert.equal(deriveClientStatus({hasActive:false,hasTerminal:false}),null);
});
