import StatusBadge from './StatusBadge.jsx';
import {recordStatusBadges} from '../../../shared/searchRecordStatus.js';
export default function SearchStatusBadges({record,badges}){const rows=badges||recordStatusBadges(record);return rows.length?<span className="search-status-badges">{rows.map((r,i)=><StatusBadge key={`${r.status}-${i}`} status={r.status} label={r.label}/>)}</span>:null}
