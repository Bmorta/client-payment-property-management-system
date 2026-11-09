import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import mongoose from 'mongoose';
import {backupRequirement} from './backupRequirement.js';
// Private server-side restore point. No download endpoint exposes these files.
export async function createRestorePoint({session,collections,label='financial-change'}={}){
 const root=path.resolve(process.env.FINANCIAL_BACKUP_DIR||'backups'),id=`${Date.now()}-${randomUUID()}`,dir=path.join(root,id);await fs.mkdir(dir,{recursive:true,mode:0o700}).catch(()=>{throw backupRequirement('Cannot create a safe restore point. Open Database & Backups to review financial restore-point storage permissions.')});const names=collections||await mongoose.connection.db.listCollections({},{nameOnly:true}).toArray().then(rows=>rows.map(r=>r.name).filter(n=>!n.startsWith('system.'))),manifest={id,label,createdAt:new Date().toISOString(),database:mongoose.connection.name,binding:createHash('sha256').update(process.env.MONGODB_URI||'').digest('hex'),files:[]};
 try{for(const name of names){const docs=await mongoose.connection.db.collection(name).find({},{session}).toArray(),bytes=Buffer.from(mongoose.mongo.BSON.EJSON.stringify(docs,{relaxed:false}));if(bytes.length>100*1024*1024)throw new Error('Restore point exceeds the configured per-collection limit. Ask the administrator to configure a managed database backup.');const file=Buffer.from(name).toString('hex')+'.json';await fs.writeFile(path.join(dir,file),bytes,{mode:0o600});const read=await fs.readFile(path.join(dir,file)),sha=createHash('sha256').update(bytes).digest('hex');if(createHash('sha256').update(read).digest('hex')!==sha||mongoose.mongo.BSON.EJSON.parse(read.toString(),{relaxed:false}).length!==docs.length)throw new Error('Restore point verification failed. No financial changes were applied.');manifest.files.push({collection:name,file,count:docs.length,sha256:sha})}manifest.verifiedAt=new Date().toISOString();await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});return {id,directory:dir,verified:true,collections:manifest.files.length}}
 catch(e){await fs.rm(dir,{recursive:true,force:true});throw backupRequirement('Unable to create a verified restore point. Open Database & Backups. '+e.message)}
}

export async function listFinancialRestorePoints(){
 const root=path.resolve(process.env.FINANCIAL_BACKUP_DIR||'backups');let dirs=[];
 try{dirs=await fs.readdir(root,{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return {directory:root,rows:[]};throw backupRequirement('Financial restore-point directory cannot be read. Check server folder permissions.')}
 const rows=[];for(const d of dirs.filter(d=>d.isDirectory()&&/^\d+-[a-f0-9-]{36}$/.test(d.name)).sort((a,b)=>b.name.localeCompare(a.name)).slice(0,50)){try{const m=JSON.parse(await fs.readFile(path.join(root,d.name,'manifest.json'),'utf8'));if(m.database!==mongoose.connection.name)continue;rows.push({id:d.name,label:m.label,createdAt:m.createdAt,verifiedAt:m.verifiedAt||null,collections:m.files?.length||0,status:m.binding===createHash('sha256').update(process.env.MONGODB_URI||'').digest('hex')&&m.verifiedAt?'VERIFIED_AT_CREATION':'LEGACY_REVIEW_REQUIRED'})}catch{rows.push({id:d.name,status:'MANIFEST_REVIEW_REQUIRED'})}}
 return {directory:root,rows};
}
