import MigrationConfig from '../models/MigrationConfig.js';
import ExcelJS from 'exceljs';
import {inflateRawSync} from 'node:zlib';
import MigrationBatch from '../models/MigrationBatch.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import {actor,newRow,duplicates} from '../services/migrationService.js';
import {assertVersion,normalizeMigrationRow,hash,fail,clean,migrationContext} from '../utils/migrationRules.js';
import {moneyCents} from '../utils/accounting.js';
const columns=['Contract Reference','Record Type','Original Date','Receipt Number','Issuing Series','Payment Type','Payment Method','Funding Account','Amount PHP','Reference Number','Remarks','Source Document Type','Document Reference','Installment','Assessment ID','Commission ID','Earned PHP','Release Date','Client ID','Contract Price PHP','Agreed DP PHP','Term Months','Contract Date','First Due Date'];
const types={clients:'CLIENT',contracts:'CONTRACT',payments:'PAYMENT','down-payments':'PAYMENT',penalties:'PENALTY_ASSESSMENT',commissions:'COMMISSION'};
const iso=value=>{if(value instanceof Date)return value.toISOString().slice(0,10);return String(value??'').trim()};
const cellText=value=>{if(value&&typeof value==='object'){if(value.formula||value.sharedFormula)fail('Formula cells are not accepted. Paste the original values.');if(value.richText)return value.richText.map(x=>x.text).join('');if(value.text)return value.text;}return value??''};
// Inspect ZIP metadata before ExcelJS expands it to reject archive bombs,
// macros/external connections and corrupt central-directory structures.
export function validateWorkbookArchive(bytes){
 if(bytes.length<22||bytes.length>4*1024*1024||bytes.readUInt32LE(0)!==0x04034b50)fail('Upload a valid .xlsx workbook up to 4 MB. Legacy .xls is not supported.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break}if(end<0)fail('Malformed Excel archive.');
 const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16);if(count>1000||count===0||offset>=end)fail('Excel archive is too large or malformed.');
 let pos=offset,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>end||bytes.readUInt32LE(pos)!==0x02014b50)fail('Malformed Excel archive directory.');const size=bytes.readUInt32LE(pos+24),packed=bytes.readUInt32LE(pos+20),n=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32),name=bytes.subarray(pos+46,pos+46+n).toString();total+=size;
  if(size>8*1024*1024||total>16*1024*1024||size>Math.max(1,packed)*1000||/vbaProject|externalLinks|connections\.xml|\.\.\//i.test(name))fail('Unsafe, externally linked or oversized workbook.');
  const local=bytes.readUInt32LE(pos+42),method=bytes.readUInt16LE(pos+10),flags=bytes.readUInt16LE(pos+8);
  if(flags&1||local+30>offset||bytes.readUInt32LE(local)!==0x04034b50||![0,8].includes(method))fail('Encrypted or malformed Excel archive.');
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),finish=start+packed;
  if(finish>offset)fail('Malformed Excel member.');
  let expanded;try{expanded=method===0?bytes.subarray(start,finish):inflateRawSync(bytes.subarray(start,finish),{maxOutputLength:8*1024*1024})}catch{fail('Unsafe or corrupt Excel compression.');}
  if(expanded.length!==size)fail('Excel member size does not match the archive.');
  pos+=46+n+extra+comment;
 }if(pos>end)fail('Malformed Excel archive.');
}
export async function template(req,res,next){try{
 const type=types[req.params.type];if(!type)fail('Unknown historical template.');const book=new ExcelJS.Workbook(),guide=book.addWorksheet('Instructions');
 ['Historical staging only: uploading never posts live financial records.','Use the registered Contract Reference (CTR-...) for the account selected in migration.','One account per upload; up to 500 rows. Split workbooks by client-property contract.','Receipt numbers, issuing series and references must be text to preserve leading zeros.','Dates: YYYY-MM-DD, original effective dates on/before cutoff. Amounts: PHP, up to two decimal places.','Types: PAYMENT, PENALTY_ASSESSMENT, PENALTY_WAIVER, COMMISSION, CLIENT, CONTRACT.','Payments: DOWN_PAYMENT / INSTALLMENT / PENALTY / OTHER. Methods: CASH, GCASH, MAYA, BANK_TRANSFER, BANK_DEPOSIT, CHECK, OTHER.','CLIENT/CONTRACT sheets verify source details against registered records. Create missing clients/contracts through existing audited forms first.','Commission Amount PHP is the actual payout for that release date (0 if earned but unreleased); Earned PHP is the documented total earned for that commission period.','For waivers, Assessment ID is HPA-<staged assessment row ID>. Penalty assessment rows require installment, amount, date, document and reason.','Each commission payout needs its own row/date and document. No automatic historical payouts are invented.','Duplicate suspects require administrator review. Reused receipt + issuing series cannot be overridden.'].forEach(x=>guide.addRow([x]));guide.getColumn(1).width=120;guide.eachRow(r=>r.alignment={wrapText:true});
 const sheet=book.addWorksheet('Records');sheet.addRow(columns);sheet.getRow(1).font={bold:true};sheet.columns.forEach(c=>c.width=24);for(const c of [1,3,4,5,10,13,15,16,18,19,23,24])sheet.getColumn(c).numFmt='@';sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter='A1:X1';sheet.getCell('B2').value=type;if(req.params.type==='down-payments')sheet.getCell('F2').value='DOWN_PAYMENT';else if(type==='PAYMENT')sheet.getCell('F2').value='INSTALLMENT';
 res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`historical-${req.params.type}.xlsx`).send(Buffer.from(await book.xlsx.writeBuffer()));
}catch(e){next(e)}}
export async function parseImport(req,batch){
 const name=clean(req.body.filename,120);if(!/\.xlsx$/i.test(name))fail('Use .xlsx; .xls and macro-enabled workbooks are unsupported.');const bytes=Buffer.from(String(req.body.base64||''),'base64');validateWorkbookArchive(bytes);
 const fileHash=hash(bytes),book=new ExcelJS.Workbook();try{await book.xlsx.load(bytes)}catch{fail('Excel file could not be parsed. No records were saved.')}
 const sheet=book.getWorksheet('Records');if(!sheet||sheet.rowCount>501)fail('Use the Records sheet with no more than 500 historical rows.');
 for(let c=1;c<=columns.length;c++)if(cellText(sheet.getRow(1).getCell(c).value)!==columns[c-1])fail(`Template column ${c} must be ${columns[c-1]}.`);
 const a=await PropertyAssignment.findById(batch.account).lean(),rows=[];
 for(let n=2;n<=sheet.rowCount;n++){
  const source=sheet.getRow(n);if(!source.hasValues)continue;let values=[],normalized=null,errors=[],hits=[];
  try{
   values=columns.map((_,c)=>cellText(source.getCell(c+1).value));
   // Empty template hint row is not a real historical transaction.
   if(!values[0]&&!values[2]&&!values[8]&&values.filter(Boolean).length<=2)continue;
   if(String(values[0]).trim()!==a.assignmentId)fail('Unmatched contract: this upload must contain only the selected client-property account.');
   if(String(values[1]).trim()==='PAYMENT'&&typeof values[3]!=='string')fail('Receipt Number must be stored as text in Excel to preserve original leading zeros.');
   const kind=String(values[1]).trim(),input={kind,contractReference:String(values[0]),date:iso(values[2]),receiptNumber:String(values[3]),series:String(values[4]),type:String(values[5]),method:String(values[6]),fundingAccount:String(values[7])||null,amount:values[8],reference:String(values[9]),remarks:String(values[10]),sourceDocumentType:String(values[11]),documentReference:String(values[12]),installment:values[13],assessmentId:String(values[14]),commissionId:String(values[15]),earned:values[16]||0,releaseDate:iso(values[17])};
   if(kind==='CLIENT')input.sourceValues={clientId:String(values[18])};
   if(kind==='CONTRACT')input.sourceValues={contractReference:String(values[0]),totalCents:moneyCents(values[19]),downPaymentCents:moneyCents(values[20]),months:Number(values[21]),contractDate:iso(values[22]),firstDueDate:iso(values[23])};
   normalized=normalizeMigrationRow(input,batch.cutoffDate,a);hits=await duplicates(normalized,a._id,batch._id);
   if(batch.rows.some(r=>r.fingerprint===normalized.fingerprint))hits.push({kind:'IDENTICAL_STAGED',source:'BATCH',reference:'Existing draft'});
   if(rows.some(r=>r.normalized?.fingerprint===normalized.fingerprint))hits.push({kind:'IDENTICAL_FILE',source:'FILE',reference:'Repeated source row'});
  }catch(e){errors.push(e.message)}rows.push({number:n,values,normalized,errors,duplicates:hits});
 }
 return {fileHash,filename:name,rows,totalRows:rows.length,validRows:rows.filter(r=>!r.errors.length&&!r.duplicates.length).length,invalidRows:rows.filter(r=>r.errors.length).length,suspectedDuplicates:rows.filter(r=>r.duplicates.length).length,totalPaymentCents:rows.filter(r=>r.normalized?.kind==='PAYMENT').reduce((n,r)=>n+r.normalized.amountCents,0),alreadyImported:batch.imports.some(i=>i.fileHash===fileHash)};
}
export async function importWorkbook(req,res,next){try{
 const stored=await MigrationBatch.findById(req.params.id).lean();if(!stored)fail('Migration not found.',404);const batch=migrationContext(stored,await MigrationConfig.findById('OFFICE').lean());
 if(req.user.role!=='ADMIN'&&String(batch.encoder)!==String(req.user._id))fail('Only the assigned encoder may import.',403);
 const parsed=await parseImport(req,batch);
 if(req.body.save!==true)return res.json({success:true,data:parsed});
 if(parsed.alreadyImported)return res.json({success:true,data:{alreadyImported:true},message:'This exact workbook was already staged; nothing duplicated.'});
 assertVersion(batch,req.body.version);if(!['NOT_STARTED','IN_PROGRESS','NEEDS_CORRECTION'].includes(batch.status))fail('Return the migration for correction before importing.',409);
 const accepted=req.body.rowNumbers;if(!Array.isArray(accepted)||!accepted.length||new Set(accepted).size!==accepted.length)fail('Select unique valid row numbers from the preview.');
 const selected=accepted.map(n=>parsed.rows.find(r=>r.number===n));if(selected.some(r=>!r||r.errors.length))fail('Selected import rows contain validation errors.');
 if(selected.some(r=>r.duplicates.some(d=>['IDENTICAL_STAGED','IDENTICAL_FILE','RECEIPT_SERIES'].includes(d.kind))))fail('Duplicate source records cannot be staged again. Correct or exclude them.');
 if(batch.rows.length+selected.length>500)fail('The account migration batch cannot exceed 500 records.');
 const rows=selected.map(r=>({...newRow(r.normalized,req.user,'EXCEL'),sourceFile:parsed.filename,sourceFileHash:parsed.fileHash,sourceRow:r.number,originalCells:r.values}));
 const result=await MigrationBatch.findOneAndUpdate({_id:batch._id,__v:batch.__v},{$set:{status:'IN_PROGRESS'},$push:{rows:{$each:rows},imports:{fileHash:parsed.fileHash,filename:parsed.filename,rowNumbers:accepted,...actor(req.user)},history:{...actor(req.user),event:'EXCEL_STAGED',fileHash:parsed.fileHash,rows:rows.map(r=>r.rowId),sourceRows:rows}},$inc:{__v:1}},{new:true}).lean();if(!result)fail('Migration changed. Refresh and retry.',409);
 res.json({success:true,data:result,message:`${rows.length} rows staged. No live financial records changed.`});
}catch(e){next(e)}}
