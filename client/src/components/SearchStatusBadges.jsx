import StatusBadge from './StatusBadge.jsx';
import {recordStatusBadges,isClientSearchRecord} from '../../../shared/searchRecordStatus.js';
export default function SearchStatusBadges({record,badges}){const rows=isClientSearchRecord(record)?recordStatusBadges(record):badges||recordStatusBadges(record);return rows.length?<span className="search-status-badges">{rows.map((r,i)=><StatusBadge key={`${r.status}-${i}`} status={r.status} label={r.label}/>)}</span>:null}
