import {useId,useState} from 'react';
const choices={
 transfer:['Client-requested property transfer','Property upgrade','Property downgrade','Administrative correction','Contract amendment'],
 cancellation:['Client-initiated cancellation','Financial difficulty','Change of purchase decision','Administrative correction'],
 contract:['Client request','Contract amendment','Administrative correction'],
 commission:['Commission allocation correction','Agent assignment adjustment','Payment allocation reconciliation']
};
// Suggestions are applied only on explicit selection; the existing editable field remains authoritative.
export default function ReasonSuggestion({kind,context='',value,onChange,maxLength=500}){
 const id=useId(),[category,setCategory]=useState('');
 return <div className="mb-2"><label className="small d-block" htmlFor={id}>Suggested wording (optional)</label><div className="d-flex flex-wrap gap-2"><select id={id} className="form-select form-select-sm w-auto mw-100" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Choose a reason yourself</option>{(choices[kind]||[]).map(v=><option key={v}>{v}</option>)}</select><button type="button" className="btn btn-outline-secondary btn-sm" disabled={!category} onClick={()=>{if(!value||window.confirm('Replace the current explanation with this suggestion?'))onChange(`${category}${context?` — ${context}`:''}.`.slice(0,maxLength))}}>Use suggested wording</button></div><small className="text-secondary">Review and edit the explanation below. Add any facts that require your judgment.</small></div>;
}
