import 'dotenv/config';
import mongoose from 'mongoose';
import PropertyAssignment from '../models/PropertyAssignment.js';
const apply=process.argv.includes('--apply'),backup=process.argv.find(v=>v.startsWith('--backup-reference='))?.split('=').slice(1).join('=');
try{
 if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required. Keep the existing database name.');
 await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false});
 const duplicates=await PropertyAssignment.aggregate([{$match:{lifecycle:{$ne:'TRANSFERRED'}}},{$group:{_id:'$property',count:{$sum:1}}},{$match:{count:{$gt:1}}}]);
 if(duplicates.length)throw new Error('Conflicting active property contracts found. Resolve them before changing indexes.');
 const indexes=await PropertyAssignment.collection.indexes(),legacy=indexes.filter(i=>i.unique&&Object.keys(i.key).length===1&&i.key.property===1&&!i.partialFilterExpression);console.log(JSON.stringify({mode:apply?'APPLY':'PREVIEW',legacyIndexes:legacy.map(i=>i.name),legacyAccounts:await PropertyAssignment.countDocuments({lifecycle:{$exists:false}}),conflicts:duplicates.length},null,2));
 if(apply){if(!backup)throw new Error('Stop the backend, verify backup/recovery, then provide --backup-reference=YOUR_VERIFIED_BACKUP.');await PropertyAssignment.updateMany({lifecycle:{$exists:false}},{$set:{lifecycle:'ACTIVE'}});await PropertyAssignment.collection.createIndex({property:1},{name:'active_property_contract',unique:true,partialFilterExpression:{lifecycle:'ACTIVE'}});for(const i of legacy)await PropertyAssignment.collection.dropIndex(i.name);console.log('Active-contract index upgraded. Contracts, receipts, allocations and payouts retained. Backup reference: '+backup);}
 else console.log('Preview only. No records or indexes changed.');
}catch(e){console.error(e.message);process.exitCode=1}finally{await mongoose.disconnect()}
