import mongoose from 'mongoose';
import MigrationConfig from '../models/MigrationConfig.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
export async function migrationPaymentGuard(req,res,next){try{
 const config=await MigrationConfig.findById('OFFICE').lean();
 if(config&&typeof req.body.paymentDate==='string'&&req.body.paymentDate<=config.cutoffDate)return res.status(409).json({success:false,message:'This date belongs to historical migration. Encode and verify it in Historical Data Migration instead of posting a live collection.'});
 if(req.body.accountId){if(!mongoose.isValidObjectId(req.body.accountId))return res.status(400).json({success:false,message:'Invalid account.'});const a=await PropertyAssignment.findById(req.body.accountId).select('migration lifecycle pendingCancellation creditAmendments').lean();if(a?.creditAmendments?.length&&req.body.paymentDate<a.creditAmendments.at(-1).effectiveDate)return res.status(409).json({success:false,message:'A payment cannot predate the approved credit amendment. Reconciliation is required.'});if(a?.pendingCancellation||['TRANSFERRED','CANCELLED','FORFEITED','SUPERSEDED'].includes(a?.lifecycle))return res.status(409).json({success:false,message:'This contract is transferred, cancelled or reserved for cancellation. Use an active contract or open its case history.'});if(a?.migration&&['CANCELLED','FORFEITED','TRANSFERRED','FULLY_PAID'].includes(a.migration.historicalStatus))return res.status(409).json({success:false,message:'The documented historical account status prevents new collections. Administrator review is required.'})}
 next();
}catch(e){next(e)}}
