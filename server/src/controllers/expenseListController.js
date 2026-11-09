import mongoose from 'mongoose';
import Expense from '../models/Expense.js';
import {today,validDate} from '../utils/accounting.js';
import {intentFail as fail} from '../utils/paymentIntent.js';

export async function pagedExpenses(req,res,next){try{
 const from=req.query.from||'0001-01-01',to=req.query.to||today(),status=req.query.status||'ALL',page=Number(req.query.page||1),limit=Number(req.query.limit||25);
 if(!validDate(from)||!validDate(to)||from>to||!['ALL','POSTED','VOIDED'].includes(status)||!Number.isSafeInteger(page)||page<1||page>100000||![10,25,50,100].includes(limit))fail('Choose valid expense dates, status and pagination.');
 const filter={expenseDate:{$gte:from,$lte:to}};
 if(req.query.project){if(!mongoose.isValidObjectId(req.query.project))fail('Invalid project.');filter.project=new mongoose.Types.ObjectId(req.query.project)}
 if(status==='POSTED')filter.$and=[{$or:[{status:'POSTED'},{status:{$exists:false}}]}];else if(status==='VOIDED')filter.status='VOIDED';
 if(req.query.q){const q=new RegExp(String(req.query.q).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');filter.$or=['expenseId','description','payee','reference'].map(k=>({[k]:q}))}
 const [count,rows,sums]=await Promise.all([Expense.countDocuments(filter),Expense.find(filter).select('-revisions -originalValues').populate('project','projectName').sort({expenseDate:-1,createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit).lean(),Expense.aggregate([{$match:filter},{$group:{_id:null,postedAmountCents:{$sum:{$cond:[{$eq:[{$ifNull:['$status','POSTED']},'POSTED']},'$amountCents',0]}}}}])]);
 const postedAmountCents=sums[0]?.postedAmountCents||0;if(!Number.isSafeInteger(postedAmountCents))fail('Expense total exceeds supported centavo precision.',409);
 res.json({success:true,data:{rows,count,page,pageSize:limit,postedAmountCents,filters:{from,to,status,q:req.query.q||'',project:req.query.project||''}}});
}catch(e){next(e)}}
