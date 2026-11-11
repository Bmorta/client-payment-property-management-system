const types=['text','draw','line','arrow','rect','circle','highlight','sticker'];
export const STICKERS={SOLD:{text:'SOLD',fill:'#c62828',stroke:'#ffffff'},RESERVED:{text:'RESERVED',fill:'#f9c846',stroke:'#111111'},AVAILABLE:{text:'AVAILABLE',fill:'#208348',stroke:'#ffffff'},ON_HOLD:{text:'ON HOLD',fill:'#64748b',stroke:'#ffffff'}};
export function validateOverlay(input){
 const fail=()=>{throw Object.assign(new Error('Invalid map annotations. Refresh the map and check shape positions, colors and text.'),{statusCode:400})};
 if(!Array.isArray(input)||input.length>200||JSON.stringify(input).length>750000)fail();const seen=new Set();
 return input.map(s=>{if(!s||typeof s.id!=='string'||s.id.length>80||seen.has(s.id)||!types.includes(s.type))fail();seen.add(s.id);
 const row={id:s.id,type:s.type};for(const [k,min,max]of [['x',-16000,16000],['y',-16000,16000],['w',1,16000],['h',1,16000],['fontSize',8,150],['strokeWidth',1,100],['rotation',-360,360],['opacity',0,1]]){const v=s[k]??(k==='opacity'?(s.type==='highlight' ? .35 : 1):k==='rotation'?0:k==='fontSize'?24:k==='strokeWidth'?3:NaN);if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail();row[k]=v}
 for(const k of ['stroke','fill']){const v=s[k]||'none';if(v!=='none'&&!/^#[0-9a-f]{6}$/i.test(v))fail();row[k]=v}
 row.text=String(s.text||'').slice(0,4000);row.align=['start','middle','end'].includes(s.align)?s.align:'start';row.layer=s.layer==='stickers'||s.type==='sticker'?'stickers':'annotations';
 if(s.linkedPropertyId){if(!/^[a-f0-9]{24}$/i.test(s.linkedPropertyId))fail();row.linkedPropertyId=s.linkedPropertyId;row.type='sticker';row.layer='stickers'}
 if(s.points){if(!Array.isArray(s.points)||s.points.length>8000)fail();row.points=s.points.map(p=>{if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>10))fail();return p})}return row});
}
export function resolveLinkedStickers(shapes,properties){return shapes.map(s=>{if(!s.linkedPropertyId)return s;const p=properties.find(p=>String(p._id)===s.linkedPropertyId),status=p&&['AVAILABLE','RESERVED','SOLD'].includes(p.status)?p.status:'ON_HOLD',style=STICKERS[status];return {...s,...style,linkedProperty:p?{_id:String(p._id),propertyId:p.propertyId,phaseNumber:p.phaseNumber,blockNumber:p.blockNumber,lotNumber:p.lotNumber,status:p.status}:null}})}
// Ignore read-only linked-lot metadata and normalize legacy defaults when
// deciding whether an editor draft actually differs from its saved version.
export function overlayDraftKey(shapes){try{return JSON.stringify(validateOverlay(shapes))}catch{return JSON.stringify(shapes)}}
