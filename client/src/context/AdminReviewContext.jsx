import {createContext,useContext,useEffect,useRef,useState,useCallback} from 'react';
import {useAuth} from './AuthContext.jsx';
import api from '../services/api.js';
const Context=createContext(null);
export function AdminReviewProvider({children}){
 const {user}=useAuth(),[data,setData]=useState(null),[error,setError]=useState(''),[quick,setQuick]=useState(null),sequence=useRef(0),last=useRef(null);
 const refresh=useCallback(async(origin=null)=>{if(user?.role!=='ADMIN')return;const ticket=++sequence.current;try{const next=(await api.get('/admin-reviews')).data.data;if(ticket!==sequence.current)return;const previous=new Set((last.current?.rows||[]).filter(r=>r.pending).map(r=>r.id));if(origin){const candidates=next.rows.filter(r=>r.pending&&!previous.has(r.id)),row=candidates.find(r=>origin.url?.includes(r.accountId)||origin.entityId&&[r.caseId,r.accountId].includes(String(origin.entityId)));if(row)setQuick(row)}last.current=next;setData(next);setError('')}catch(e){if(ticket===sequence.current)setError('Review counts could not be refreshed. Open the Review Center and retry.')}},[user?._id,user?.role]);
 useEffect(()=>{last.current=null;setData(null);setQuick(null);refresh();const update=e=>refresh(e.detail?.url&&!e.detail.url.includes('preview')?e.detail:null),timer=setInterval(()=>refresh(),30000);window.addEventListener('cpm:financial-data-changed',update);window.addEventListener('cpm:notifications',update);return()=>{sequence.current++;clearInterval(timer);window.removeEventListener('cpm:financial-data-changed',update);window.removeEventListener('cpm:notifications',update)}},[refresh]);
 return <Context.Provider value={{data,error,refresh,quick,setQuick}}>{children}</Context.Provider>;
}
export const useAdminReviews=()=>useContext(Context);
