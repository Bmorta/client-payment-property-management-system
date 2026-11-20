import {useState} from 'react';
import {localDate,presetRange,validRange} from '../utils/finance.js';

const presets=[['today','Today'],['weekly','This Week'],['monthly','This Month'],['yearly','This Year']];
export default function DateRangeFilter({value,onChange,label='Reporting period',today=localDate(),throughToday=false,allRange=null,extraPresets=[]}){
 const same=(a,b)=>a.from===b.from&&a.to===b.to;
 const options=[...presets,...extraPresets];
 const getRange=k=>extraPresets.find(p=>p[0]===k)?.[2]?.(today)||presetRange(k,today,throughToday);
 const selected=allRange&&same(value,allRange)?'all':options.find(([k])=>same(value,getRange(k)))?.[0]||'custom';
 const bounds={from:value.from||'',to:value.to||''};
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(bounds),[error,setError]=useState('');
 const choose=k=>{setError('');if(k==='custom'){setDraft(bounds);setEditing(true);return}setEditing(false);onChange(k==='all'?allRange:getRange(k),k)};
 const apply=()=>{if(!validRange(draft,throughToday?today:undefined)){setError(throughToday?'Choose valid dates in order, through today.':'Choose valid dates in order.');return}setError('');onChange({from:draft.from,to:draft.to},'custom');setEditing(false)};
 return <div className="rems-date-range d-flex flex-column gap-2" role="group" aria-label={label}>
  <span className="small fw-semibold">{label}</span>
  <div className="d-flex flex-wrap gap-1">{[...(allRange?[['all','All Dates']]:[]),...options,['custom','Custom']].map(([k,title])=><button type="button" key={k} className={'btn btn-sm '+((editing?'custom':selected)===k?'btn-primary':'btn-outline-secondary')} aria-pressed={(editing?'custom':selected)===k} onClick={()=>choose(k)}>{title}</button>)}</div>
  {(editing||selected==='custom')&&<div className="d-flex flex-wrap align-items-end gap-2">
   {['from','to'].map(k=><label key={k} className="small">{k==='from'?'From Date':'To Date'}<input type="date" className="form-control" value={(editing?draft:bounds)[k]||''} max={throughToday?today:undefined} onChange={e=>{setEditing(true);setDraft({... (editing?draft:bounds),[k]:e.target.value});setError('')}}/></label>)}
   <button type="button" className="btn btn-primary btn-sm" onClick={()=>editing&&apply()}>Apply</button><button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>choose(allRange?'all':'today')}>{allRange?'Clear':'Reset'}</button>
  </div>}
  {error&&<span role="alert" className="text-danger small">{error}</span>}
  <span className="small text-secondary">Selected: {selected==='all'?'All dates':(value.from||'Any start')+' – '+(value.to||'Any end')}{throughToday?' · through today':''}</span>
 </div>
}
