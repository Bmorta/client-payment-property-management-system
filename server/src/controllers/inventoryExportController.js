import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Project from '../models/Project.js';
import Property from '../models/Property.js';
import {lotPrice} from '../utils/lotPricing.js';
import {filterInventory} from '../../../shared/inventoryFilters.js';

export async function inventoryWorkbook(project,rows,filters={}){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Property Inventory');
 sheet.addRow(['Property Inventory']);sheet.addRow(['Project',project.projectName,'Project ID',project.projectId||'','Code',project.projectCode||'']);
 sheet.addRow(['Location',project.location||'']);sheet.addRow(['Generated (Asia/Manila)',new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'})]);
 sheet.addRow(['Filters',`Phase: ${filters.phase||'All'}; Block: ${filters.block||'All'}; Lot: ${filters.lot||'All'}; Status: ${filters.status||'All'}; Search: ${filters.q||'All'}`]);
 sheet.addRow(['Matching lots',rows.length]);
 const header=sheet.addRow(['Property ID','Phase','Block','Lot','Area (sqm)','Price per sqm PHP','Price per lot PHP','Status']);
 header.font={bold:true};header.eachCell(c=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE6EDF7'}});
 for(const p of rows)sheet.addRow([p.propertyId,p.phaseNumber,p.blockNumber,p.lotNumber,p.areaSqm??null,p.pricePerSqm??null,lotPrice(p.areaSqm,p.pricePerSqm),p.status==='FOR_ASSUME'?'For Assume':p.status]);
 sheet.columns.forEach((c,i)=>{c.width=[24,16,16,16,18,24,24,22][i]});
 for(const i of [6,7])sheet.getColumn(i).numFmt='"₱"#,##0.00;[Red]("₱"#,##0.00)';
 sheet.getRow(1).font={bold:true,size:16};sheet.getRow(5).height=32;sheet.getRow(5).alignment={wrapText:true,vertical:'top'};
 sheet.views=[{state:'frozen',ySplit:7}];sheet.autoFilter={from:'A7',to:`H${Math.max(7,sheet.rowCount)}`};
 sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:7'};
 return Buffer.from(await book.xlsx.writeBuffer());
}
export async function exportProjectInventory(req,res,next){try{
 if(!mongoose.isValidObjectId(req.params.projectId))return res.status(400).json({success:false,message:'Invalid project ID.'});
 const filters={};for(const key of ['phase','block','lot','status','q']){const v=req.query[key]??'';if(typeof v!=='string'||v.length>500)return res.status(400).json({success:false,message:'Invalid inventory filter.'});filters[key]=v}
 if(['phase','block','lot'].some(k=>filters[k]&&!/^[1-9]\d*$/.test(filters[k]))||filters.status&&!['AVAILABLE','RESERVED','SOLD','FOR_ASSUME','UNAVAILABLE'].includes(filters.status))return res.status(400).json({success:false,message:'Invalid inventory filter.'});
 const project=await Project.findById(req.params.projectId).lean();if(!project)return res.status(404).json({success:false,message:'Project not found.'});
 const properties=await Property.find({project:project._id}).sort({phaseNumber:1,blockNumber:1,lotNumber:1}).lean();
 const bytes=await inventoryWorkbook(project,filterInventory(properties,filters),filters);
 res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.attachment('property-inventory.xlsx');res.send(bytes);
 }catch(error){next(error)}}
