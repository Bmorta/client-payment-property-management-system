const fail=m=>{throw Object.assign(new Error(m),{statusCode:400})};
export const salesObjectId=v=>typeof v==='string'&&/^[a-f\d]{24}$/i.test(v);
export function targetKey(periodType,period,scope,subject=''){
 if(!['MONTH','YEAR'].includes(periodType)||typeof period!=='string'||!(periodType==='MONTH'?/^(20\d{2})-(0[1-9]|1[0-2])$/:/^20\d{2}$/).test(period))fail('Choose a valid calendar month or year.');
 if(!['COMPANY','PROJECT','AGENT'].includes(scope)||(scope==='COMPANY'?subject!=='':!salesObjectId(subject)))fail('Choose a valid target scope.');
 return ['target',periodType,period,scope,subject.toLowerCase()||'OFFICE'].join(':');
}
export function validatedTarget(body){
 const {periodType,period,scope,subject='',valueCents=0,units=0,active=true}=body;
 const key=targetKey(periodType,period,scope,subject);
 if(!Number.isSafeInteger(valueCents)||valueCents<0||!Number.isSafeInteger(units)||units<0||units>100000||(!valueCents&&!units)||typeof active!=='boolean')fail('Enter a positive monetary or contract-count target.');
 return {key,value:{periodType,period,scope,subject:subject.toLowerCase(),valueCents,units,active}};
}
export function validatedAttribution(shares){
 if(!Array.isArray(shares)||shares.length<1||shares.length>20)fail('Choose one primary and up to nineteen supporting agents.');
 const seen=new Set();let total=0,primary=0;
 const rows=shares.map(row=>{
  if(!row||!salesObjectId(row.agentId)||!['PRIMARY','SUPPORT'].includes(row.role)||!Number.isSafeInteger(row.shareBps)||row.shareBps<=0||row.shareBps>10000)fail('Use a valid agent, role and positive share percentage.');
  const agentId=row.agentId.toLowerCase();if(seen.has(agentId))fail('An agent cannot be listed twice.');seen.add(agentId);total+=row.shareBps;if(row.role==='PRIMARY')primary++;
  return {agentId,role:row.role,shareBps:row.shareBps};
 });
 if(primary!==1||total!==10000)fail('Exactly one primary agent is required and all shares must total 100%.');
 return rows.sort((a,b)=>a.role===b.role?a.agentId.localeCompare(b.agentId):a.role==='PRIMARY'?-1:1);
}
// Largest remainder in integer centavos. The deterministic tie break preserves
// the exact booking value even on shared sales with fractional centavos.
export function splitSalesValue(valueCents,shares){
 if(!Number.isSafeInteger(valueCents)||valueCents<0||!shares.length||shares.reduce((n,s)=>n+s.shareBps,0)!==10000)fail('Cannot apportion an invalid sales value or share total.');
 const parts=shares.map(s=>{const raw=BigInt(valueCents)*BigInt(s.shareBps);return {...s,valueCents:Number(raw/10000n),remainder:Number(raw%10000n)}});
 const left=valueCents-parts.reduce((n,s)=>n+s.valueCents,0);
 const order=parts.slice().sort((a,b)=>b.remainder-a.remainder||a.agentId.localeCompare(b.agentId));for(let i=0;i<left;i++)order[i].valueCents++;
 return parts.map(({remainder,...row})=>row);
}
