import {useEffect,useState} from 'react';
import {useAuth} from '../context/AuthContext.jsx';
const key=id=>'rems:daily-motivation:'+(id||'guest');
const read=id=>{try{return localStorage.getItem(key(id))!=='hidden'}catch{return true}};
export default function useDailyMotivation(){const {user}=useAuth(),id=user?._id||user?.id,[state,setState]=useState(()=>({id,visible:read(id)}));const visible=state.id===id?state.visible:read(id);useEffect(()=>{const sync=e=>{if(e.type!=='storage'||e.key===key(id)||e.key===null)setState({id,visible:read(id)})};window.addEventListener('rems:motivation-preference',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('rems:motivation-preference',sync);window.removeEventListener('storage',sync)}},[id]);return {visible,setVisible:visible=>{try{localStorage.setItem(key(id),visible?'shown':'hidden')}catch{}setState({id,visible});window.dispatchEvent(new Event('rems:motivation-preference'))}};}
