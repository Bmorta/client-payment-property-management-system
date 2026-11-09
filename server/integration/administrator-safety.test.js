import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import AdministrationGuard from '../src/models/AdministrationGuard.js';
import ActivityLog from '../src/models/ActivityLog.js';
import {signAccessToken} from '../src/utils/jwt.js';
import {updateUserSafely} from '../src/services/userUpdateService.js';

test('final administrator guard, authorization, audit and concurrent administrator changes',{skip:!process.env.CPM_ADMIN_TEST_URI},async()=>{
 await mongoose.connect(process.env.CPM_ADMIN_TEST_URI,{dbName:'cpm_admin_'+randomUUID().replaceAll('-','')});process.env.JWT_SECRET||='isolated-admin-test';
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  await Promise.all([User.init(),AdministrationGuard.init()]);
  const a=await User.create({username:'admina',firstName:'Admin',lastName:'A',email:'a@test.local',passwordHash:'unused',role:'ADMIN'}),token=signAccessToken(a);
  const patch=async(body,status)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/users/${a._id}`,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j;};
  await patch({role:'STAFF'},409);assert.equal((await User.findById(a._id)).role,'ADMIN');
  await patch({isActive:false},400);const profile=await patch({firstName:'Updated'},200);assert.equal(profile.data.firstName,'Updated');assert.equal(profile.data.passwordHash,undefined);
  assert.ok(await ActivityLog.exists({module:'Users',outcome:'FAILED'}));assert.ok(await ActivityLog.exists({module:'Users',outcome:'SUCCEEDED'}));
  const b=await User.create({username:'adminb',firstName:'Admin',lastName:'B',email:'b@test.local',passwordHash:'unused',role:'ADMIN'});
  if(process.env.CPM_INTENT_TRANSACTIONS!=='true'){
   await assert.rejects(()=>updateUserSafely(b._id,a._id,{role:'STAFF'}),e=>e.statusCode===409&&/replica-set/.test(e.message));
   assert.equal(await User.countDocuments({role:'ADMIN',isActive:true}),2);
  }else{
   await AdministrationGuard.create({_id:'active-administrators',revision:0});
   const result=await Promise.allSettled([updateUserSafely(a._id,b._id,{role:'STAFF'}),updateUserSafely(b._id,a._id,{role:'STAFF'})]);
   assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(await User.countDocuments({role:'ADMIN',isActive:true}),1);
   const last=await User.findOne({role:'ADMIN',isActive:true});await assert.rejects(()=>updateUserSafely(last._id,last._id,{role:'VIEWER'}),e=>e.statusCode===409);assert.equal((await User.findById(last._id)).role,'ADMIN');
  }
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
