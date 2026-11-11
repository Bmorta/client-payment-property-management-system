import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import MapOverlay,{assertOverlayIdentity} from '../src/models/MapOverlay.js';
import {inspectRequiredIndexes} from '../../shared/databaseIndexes.js';
test('unused map overlays require no redundant project index or maintenance',async()=>{
 const db={collection:()=>({indexes:async()=>{throw Object.assign(new Error('No overlay collection yet'),{code:26})}})};
 const result=await inspectRequiredIndexes(db,{MapOverlay});assert.equal(result.ready,true);assert.deepEqual(result.missing,[]);
});
test('new overlay documents use the project ID and cannot introduce a second identity for that project',async()=>{
 const project=new mongoose.Types.ObjectId(),doc=new MapOverlay({project});await doc.validate();assert.equal(String(doc._id),String(project));
 await assert.rejects(()=>new MapOverlay({_id:new mongoose.Types.ObjectId(),project}).validate(),/unique overlay ID/);
});
test('upsert identity is enforced while existing legacy overlay identities remain editable',async()=>{
 const project=new mongoose.Types.ObjectId();assert.doesNotThrow(()=>assertOverlayIdentity({_id:project,project,version:0},{upsert:true}));
 assert.throws(()=>assertOverlayIdentity({_id:new mongoose.Types.ObjectId(),project},{upsert:true}),/unique overlay ID/);
 assert.throws(()=>assertOverlayIdentity({project},{upsert:true}),/unique overlay ID/);
 assert.doesNotThrow(()=>assertOverlayIdentity({_id:new mongoose.Types.ObjectId(),project},{upsert:false}));
});
