import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import app from '../src/app.js';
import User from '../src/models/User.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import NotificationRead from '../src/models/NotificationRead.js';
import {buildSchedule} from '../../shared/paymentSchedule.js';
import {signAccessToken} from '../src/utils/jwt.js';

test('notification history and scoped reads preserve financial preview tokens and account documents',{skip:!process.env.CPM_NOTIFICATION_TEST_URI},async()=>{
 await mongoose.connect(process.env.CPM_NOTIFICATION_TEST_URI,{dbName:'cpm_notif_'+randomUUID().replaceAll('-','')});process.env.JWT_SECRET||='notification-isolation-test';const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  await Promise.all([PropertyAssignment.init(),NotificationRead.init()]);const tokens={},users={};for(const role of ['ADMIN','STAFF','VIEWER']){users[role]=await User.create({username:role.toLowerCase(),firstName:role,lastName:'Notifications',email:role+'@test.local',passwordHash:'unused',role});tokens[role]=signAccessToken(users[role]);}
  const api=async(path,method='GET',body,role='ADMIN',status=200)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j.data;};
  const create=async(n,notifications)=>PropertyAssignment.create({assignmentId:'CTR-NOTIF-'+n,client:new mongoose.Types.ObjectId(),project:new mongoose.Types.ObjectId(),property:new mongoose.Types.ObjectId(),createdBy:users.ADMIN._id,contract:{totalCents:1200000,downPaymentCents:0,months:2,contractDate:'2026-08-01',firstDueDate:'2026-08-05',schedule:buildSchedule(1200000,2,'2026-08-05',0,'2026-08-01')},notifications});
  const notifications=Array.from({length:130},(_,i)=>({id:'n-'+i,message:'Notice '+String(i).padStart(3,'0'),recipient:'ADMIN',createdAt:new Date(Date.UTC(2026,10,2,0,0,i)),readBy:i===0?[String(users.ADMIN._id)]:[]}));notifications.push({id:'shared',message:'Account A alert',recipient:'ADMIN',createdAt:new Date('2026-11-03')});const a=await create(1,notifications),b=await create(2,[{id:'shared',message:'Account B alert',recipient:'ADMIN',createdAt:new Date('2026-11-03')}]);
  const before=await PropertyAssignment.findById(a._id).lean(),body={requestId:randomUUID(),accountId:String(a._id)},preview=await api('/finance/penalties/recalculate/preview','POST',body);
  let list=await api('/finance/notifications?page=1&limit=25');assert.equal(list.total,132);assert.equal(list.rows.length,25);assert.equal(list.unread,131);assert.equal((await api('/finance/notifications?page=6&limit=25')).rows.length,7);assert.equal((await api('/finance/notifications?q=Notice%20000')).rows[0].read,true,'legacy readBy retained');
  assert.equal((await api('/finance/notifications','GET',null,'VIEWER')).total,0);await api('/finance/notifications/shared/read','POST',{accountId:String(a._id)},'STAFF',404);await api('/finance/notifications/shared/read','POST',{},'ADMIN',400);
  const read=await api('/finance/notifications/shared/read','POST',{accountId:String(a._id)});assert.equal(read.unread,130);assert.equal(read.rows.find(n=>String(n.accountId)===String(b._id)&&n.id==='shared').read,false);assert.equal(await NotificationRead.countDocuments(),1);await api('/finance/notifications/shared/read','POST',{accountId:String(a._id)});assert.equal(await NotificationRead.countDocuments(),1);
  assert.deepEqual(await PropertyAssignment.findById(a._id).lean(),before,'reading must not mutate any account field or financial version');const afterPreview=await api('/finance/penalties/recalculate/preview','POST',body);assert.equal(afterPreview.token,preview.token,'reading must not invalidate the financial approval preview');
  assert.equal((await api('/finance/notifications/read-all','POST',{})).unread,0);assert.equal(await NotificationRead.countDocuments(),131);assert.deepEqual(await PropertyAssignment.findById(a._id).lean(),before);await api('/finance/notifications?limit=3','GET',null,'ADMIN',400);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
