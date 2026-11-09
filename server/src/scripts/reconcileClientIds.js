// Read-only by default. Prefer Administration → Database & Backups.
import 'dotenv/config';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import {identifierPreview,applyIdentifierMaintenance} from '../services/identifierMaintenance.js';
if(!process.env.MONGODB_URI)throw Error('MONGODB_URI is required. Keep the existing database name.');
try{await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false});
 const mode='CLIENT_IDS',preview=await identifierPreview(mode);console.log(JSON.stringify(preview,null,2));
 if(!process.argv.includes('--apply'))console.log('Dry run only. No records or counters changed.');
 else {const backupId=process.argv.find(v=>v.startsWith('--backup-reference='))?.slice('--backup-reference='.length);const result=await applyIdentifierMaintenance({mode,backupId,token:preview.token,requestId:randomUUID(),confirm:true,singleBackendConfirmed:process.argv.includes('--single-backend-confirmed')},{username:'SYSTEM_MIGRATION',role:'ADMIN'});console.log(JSON.stringify(result,null,2));}
}catch(e){console.error(e.message);process.exitCode=1}finally{await mongoose.disconnect()}
