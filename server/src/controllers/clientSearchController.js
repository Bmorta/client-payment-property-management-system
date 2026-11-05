import Client from "../models/Client.js";
export async function searchClients(req,res,next) {
 try {
  const q=String(req.query.q || "").trim().slice(0,100), page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page,10)||1)), limit=20;
  const regex=q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const pipeline=[
   {$lookup:{from:"propertyassignments",localField:"_id",foreignField:"client",as:"accounts",pipeline:[{$project:{project:1,property:1}}]}},
   {$lookup:{from:"projects",localField:"accounts.project",foreignField:"_id",as:"projects",pipeline:[{$project:{projectName:1,projectCode:1}}]}},
   {$lookup:{from:"properties",localField:"accounts.property",foreignField:"_id",as:"lots",pipeline:[{$project:{propertyId:1,phaseNumber:1,blockNumber:1,lotNumber:1}}]}},
   {$addFields:{fullName:{$concat:["$firstName"," ","$lastName"]}}},
   ...(q?[{$match:{$or:["clientId","firstName","middleName","lastName","fullName","projects.projectName","projects.projectCode","lots.propertyId"].map(field=>({[field]:{$regex:regex,$options:"i"}})).concat(/^\d+$/.test(q)?[{"lots.lotNumber":Number(q)}]:[])}}]:[]),
   {$sort:{lastName:1,firstName:1,_id:1}},
   {$facet:{rows:[{$skip:(page-1)*limit},{$limit:limit},{$project:{clientId:1,firstName:1,middleName:1,lastName:1,suffix:1,status:1,projects:1,lots:1}}],total:[{$count:"count"}]}}
  ];
  const [result]=await Client.aggregate(pipeline);
  res.json({success:true,data:result?.rows||[],page,total:result?.total?.[0]?.count||0,pageSize:limit});
 } catch(e){next(e)}
}
