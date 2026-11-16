import {useCallback,useEffect,useMemo,useState} from 'react';
import {useNavigationHistory} from '../context/NavigationHistoryContext.jsx';
import {readSession,writeSession} from '../utils/navigationHistory.js';
// Opt-in presentation state only. Never store credentials, drafts or financial rows.
export function usePageState(name,initial,entity=''){
 const nav=useNavigationHistory(),key=`${nav?.scope}:view:${nav?.entryKey}:${name}:${entity}`;
 const restored=useMemo(()=>readSession(key,typeof initial==='function'?initial():initial),[key]);
 const [snapshot,setSnapshot]=useState(()=>({key,value:restored})),value=snapshot.key===key?snapshot.value:restored;
 const set=useCallback(next=>setSnapshot(old=>{const base=old.key===key?old.value:restored,value=typeof next==='function'?next(base):next;writeSession(key,value);return {key,value}}),[key,restored]);
 useEffect(()=>{writeSession(key,value)},[key,value]);return [value,set];
}
