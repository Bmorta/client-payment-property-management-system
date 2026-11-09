import {useLocation} from 'react-router-dom';
import {backupWorkflowUrl} from '../utils/backupNavigation.js';
export default function BackupWorkflowLink({returnTo}){const l=useLocation();return <a className="btn btn-outline-primary btn-sm" target="_blank" rel="noopener noreferrer" href={backupWorkflowUrl(returnTo||l.pathname+l.search+l.hash)}>Open Database &amp; Backups in a new tab</a>}
