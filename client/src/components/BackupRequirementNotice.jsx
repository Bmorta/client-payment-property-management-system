import {useAuth} from '../context/AuthContext.jsx';
import {useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import CenterPopup from './CenterPopup.jsx';
import BackupWorkflowLink from './BackupWorkflowLink.jsx';
export default function BackupRequirementNotice(){const {user}=useAuth();const [notice,setNotice]=useState(null),location=useLocation();useEffect(()=>{const handler=e=>setNotice(e.detail);window.addEventListener('rems:backup-required',handler);return()=>window.removeEventListener('rems:backup-required',handler)},[]);useEffect(()=>setNotice(null),[location.pathname,location.search]);return <CenterPopup warning={notice?<>{notice.message}<span className="d-block mt-3">{user?.role==='ADMIN'?<BackupWorkflowLink/>:'An administrator must review Database & Backups.'}</span><span className="d-block mt-2">Your original form remains in this tab. After resolving the requirement, return here, refresh the preview and confirm again. No action will be replayed automatically.</span></>:''} onClose={()=>setNotice(null)}/>}
