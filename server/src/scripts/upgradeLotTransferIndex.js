import {assertEligibleBackup} from '../services/databaseMaintenance.js';
import 'dotenv/config';
import mongoose from 'mongoose';
import {inspectActiveContracts,applyActiveContractUpgrade} from '../services/activeContractUpgrade.js';
const apply=process.argv.includes('--apply'),backup=process.argv.find(v=>v.startsWith('--backup-reference='))?.split('=').slice(1).join('=');
try{
 if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required. Keep the existing database name.');
 await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false});
 const preview=await inspectActiveContracts(mongoose.connection.db);
 console.log(JSON.stringify({mode:apply?'APPLY':'PREVIEW',legacyIndexes:preview.legacyIndexes,legacyAccounts:preview.legacyAccounts,conflicts:preview.conflicts.length,conflictDetails:preview.conflicts,invalidLifecycles:preview.invalidLifecycles,activeIndexPresent:preview.activeIndexPresent},null,2));
 if(preview.conflicts.length||preview.invalidLifecycles||preview.namedIndexConflict)throw new Error('Conflicting contracts/indexes found. Review the details before upgrading.');
 if(apply){if(!backup)throw new Error('Select a recovery-verified managed backup from Database & Backups, stop other writers, then provide --backup-reference=BKP-... --single-backend-confirmed.');if(!process.argv.includes('--single-backend-confirmed'))throw Error('Stop all other database writers and confirm --single-backend-confirmed, or use Database & Backups.');await assertEligibleBackup(backup,{operation:'active-contract-index'});await applyActiveContractUpgrade(mongoose.connection.db,{backupReference:backup});console.log('Active-contract index upgraded. Contracts, receipts, allocations and payouts retained. Backup reference: '+backup);}
 else console.log('Preview only. No records or indexes changed.');
}catch(e){console.error(e.message);process.exitCode=1}finally{await mongoose.disconnect()}
