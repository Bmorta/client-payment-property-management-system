import {useNavigationHistory} from '../context/NavigationHistoryContext.jsx';
import {backDestination} from '../utils/navigationHistory.js';
export default function SmartBackButton({fallback='/',className='btn btn-outline-secondary btn-sm',onlyWithOrigin=false}){const nav=useNavigationHistory();if(!nav||onlyWithOrigin&&!nav.entry?.origin)return null;const target=backDestination(nav.entry,nav.currentIndex,fallback);if(target.path===nav.entry?.path)return null;return <button type="button" className={className} onClick={()=>nav.back(fallback)}>{target.label}</button>}
