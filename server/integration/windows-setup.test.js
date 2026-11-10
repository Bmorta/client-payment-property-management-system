import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('installer helper preserves existing records and requires an empty database for initialization',{skip:!process.env.REMS_SETUP_TEST_URI},async()=>{
 const {run}=await import('../../installer/lib/setup-helper.mjs');
 const serverDirectory=fileURLToPath(new URL('..',import.meta.url)),directory=await fs.mkdtemp(path.join(os.tmpdir(),'rems-setup-test-')),envFile=path.join(directory,'server.env');
 const original=new URL(process.env.REMS_SETUP_TEST_URI);original.pathname='/rems_setup_test_'+randomUUID().replaceAll('-','');const uri=original.toString(),client=new mongoose.mongo.MongoClient(uri);
 try{await client.connect();await fs.writeFile(envFile,`# preserved\nMONGODB_URI=${uri}\nJWT_SECRET=fixture-only-secret\nPORT=5000\n`);const db=client.db(),hello=await db.admin().command({hello:1});
 if(hello.setName){const initialized=await run({operation:'indexes',serverDirectory,envFile});assert.ok(initialized.models>10);const verified=await run({operation:'verify',serverDirectory,envFile});assert.equal(verified.transactionsSupported,true);assert.equal(verified.indexes.ready,true);assert.equal((await db.listCollections().toArray()).some(c=>c.name.startsWith('rems_setup_probe_')),false)}
 else await assert.rejects(()=>run({operation:'verify',serverDirectory,envFile}),/standalone/);
 await db.collection('payments_fixture').insertOne({_id:'preserved-receipt',amountCents:694500,receiptNumber:'OR-KEEP'});const before=JSON.stringify(await db.collection('payments_fixture').find().toArray()),collections=(await db.listCollections().toArray()).length;
 const inspected=await run({operation:'inspect',serverDirectory,envFile});assert.equal(inspected.transactionsSupported,!!hello.setName);await assert.rejects(()=>run({operation:'indexes',serverDirectory,envFile}),/Existing database/);assert.equal(JSON.stringify(await db.collection('payments_fixture').find().toArray()),before);assert.equal((await db.listCollections().toArray()).length,collections);assert.match(await fs.readFile(envFile,'utf8'),/JWT_SECRET=fixture-only-secret/);
 }finally{await client.db().dropDatabase();await client.close();await mongoose.disconnect();await fs.rm(directory,{recursive:true,force:true})}
});
