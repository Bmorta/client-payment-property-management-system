import mongoose from 'mongoose';
import Company from '../models/Company.js';
import ReportBrandSnapshot from '../models/ReportBrandSnapshot.js';
export const genericBrand=()=>({companyName:process.env.COMPANY_NAME||'Client Payment & Property Management System',companyLogo:'',companyIdentity:null});
export async function reportIdentity(projectIds=[]){
 const ids=[...new Set([].concat(projectIds||[]).filter(Boolean).map(v=>String(v?._id||v)))];
 if(ids.some(v=>!mongoose.isValidObjectId(v)))throw Object.assign(new Error('Invalid report project.'),{statusCode:400});
 const linked=ids.length?await Company.find({status:{$ne:'DELETED'},projects:{$in:ids}}).lean():[];
 let ambiguous=linked.length>0;let chosen=linked.length===1&&ids.every(id=>linked[0].projects.some(p=>String(p)===id))?linked[0]:null;
 if(!chosen&&!linked.length){const active=await Company.find({status:'ACTIVE'}).limit(2).lean();if(active.length===1)chosen=active[0];else ambiguous=active.length>1}
 if(!chosen)return ambiguous?{...genericBrand(),companyName:'Multiple / Unassigned Companies',reportIdentityNote:'Select a single explicitly associated project for company branding.'}:genericBrand();
 const key=`${chosen._id}:${chosen.__v??0}`;
 // Concurrent previews reference the same immutable version without duplication.
 await ReportBrandSnapshot.updateOne({_id:key},{$setOnInsert:{company:chosen._id,version:chosen.__v??0,companyName:chosen.name,companyLogo:chosen.logoDataUrl||'',capturedAt:new Date()}},{upsert:true});
 return {companyName:chosen.name,companyLogo:chosen.logoDataUrl||'',companyIdentity:{companyId:chosen.companyId,id:String(chosen._id),version:chosen.__v??0,snapshotId:key}};
}
export function brandExcel(book,sheet,brand){
 if(brand?.companyLogo){const bytes=Buffer.from(brand.companyLogo.split(',')[1],'base64'),w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20),scale=Math.min(80/w,40/h),image=book.addImage({base64:brand.companyLogo,extension:'png'});sheet.addImage(image,{tl:{col:Math.max(0,sheet.columnCount-1),row:0},ext:{width:w*scale,height:h*scale},editAs:'oneCell'});sheet.getRow(1).height=Math.max(36,sheet.getRow(1).height||0)}
}
export function brandPdf(doc,brand){
 if(brand?.companyLogo){const top=doc.y;doc.image(Buffer.from(brand.companyLogo.split(',')[1],'base64'),doc.page.width-doc.page.margins.right-90,top,{fit:[85,42],align:'right'});doc.y=top+48;doc.x=doc.page.margins.left;}
}
