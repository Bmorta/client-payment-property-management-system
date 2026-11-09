import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Project from '../src/models/Project.js';
import Property from '../src/models/Property.js';
import ProjectMap from '../src/models/ProjectMap.js';
import {signAccessToken} from '../src/utils/jwt.js';
test('saved map upload, read-only print source, replacement, permissions and deletion retain project/lot records',{skip:!process.env.CPM_MAP_TEST_URI,timeout:30000},async()=>{
 await mongoose.connect(process.env.CPM_MAP_TEST_URI,{dbName:'map_print_'+randomUUID().replaceAll('-','')});process.env.JWT_SECRET||='isolated-map-print';const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
 const users={},tokens={};for(const role of ['ADMIN','STAFF','VIEWER']){users[role]=await User.create({username:role.toLowerCase(),firstName:role,lastName:'Map',email:role+'@map.test',passwordHash:'unused',role});tokens[role]=signAccessToken(users[role])}
 const project=await Project.create({projectId:'PRJ-MAP',projectCode:'MAP',projectName:'Map Project',location:'Davao',status:'ACTIVE',createdBy:users.ADMIN._id}),property=await Property.create({propertyId:'PROP-MAP',project:project._id,phaseNumber:1,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:2500,status:'AVAILABLE',createdBy:users.ADMIN._id});
 const path=`/projects/${project._id}/map`,request=(suffix='',method='GET',body,role='ADMIN')=>fetch(`http://127.0.0.1:${server.address().port}/api${path}${suffix}`,{method,signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),call=async(suffix,method,body,status=200,role='ADMIN')=>{const r=await request(suffix,method,body,role),j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j.data};
 assert.equal(await call('/info'),null);const dataBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhXkAAAAASUVORK5CYII=';
 await call('','PUT',{filename:'map.png',dataBase64,expectedVersion:0},403,'VIEWER');const uploaded=await call('','PUT',{filename:'map.png',dataBase64,expectedVersion:0});assert.equal(uploaded.version,1);
 const before=JSON.stringify(await ProjectMap.findOne({project:project._id}).select('+data').lean());for(const role of ['ADMIN','STAFF','VIEWER']){const response=await request('','GET',undefined,role);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await response.arrayBuffer()).toString('base64'),dataBase64)}assert.equal(JSON.stringify(await ProjectMap.findOne({project:project._id}).select('+data').lean()),before,'map viewing/print-source reads do not modify stored map');
 await call('','PUT',{filename:'replacement.png',dataBase64,expectedVersion:0},409);const replaced=await call('','PUT',{filename:'replacement.png',dataBase64,expectedVersion:1},200,'STAFF');assert.equal(replaced.version,2);
 await call('','DELETE',{expectedVersion:2,confirm:true},403,'VIEWER');await call('','DELETE',{expectedVersion:2,confirm:true});assert.equal((await call('/info')).deleted,true);assert.equal((await request()).status,404);
 assert.deepEqual((await Project.findById(project._id).lean()).projectName,'Map Project');const afterLot=await Property.findById(property._id).lean();assert.equal(afterLot.status,'AVAILABLE');assert.equal(afterLot.areaSqm,100);assert.equal(afterLot.pricePerSqm,2500);assert.equal(afterLot.project.toString(),project._id.toString());assert.equal((await ProjectMap.findOne({project:project._id}).lean()).history.length,3);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
