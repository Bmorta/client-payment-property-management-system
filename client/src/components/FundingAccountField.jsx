import FieldLabel from './FieldLabel.jsx';
export default function FundingAccountField({method,value,onChange,required=true}){
 if(method!=='OTHER')return null;
 return <FieldLabel className="form-label w-100" help="Other does not tell the system whether physical cash moved. Choose Cash only when notes/coins were received or paid; otherwise choose Noncash. Legacy unknown values keep cash on hand unavailable until classified.">Funding account for Other<select required={required} className="form-select" value={value||''} onChange={e=>onChange(e.target.value)}><option value="">{required?'Choose explicitly':'Unknown — preserve legacy classification'}</option><option value="CASH">Physical cash</option><option value="NONCASH">Noncash account or instrument</option></select></FieldLabel>;
}
