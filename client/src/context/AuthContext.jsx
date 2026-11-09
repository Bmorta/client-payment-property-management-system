import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import api from '../services/api.js';
const AuthContext=createContext(null);
export const AuthProvider=({children})=>{
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[sessionError,setSessionError]=useState(''),[sessionNotice,setSessionNotice]=useState('');
 const generation=useRef(0);
 const clearSession=useCallback((notice='')=>{generation.current++;localStorage.removeItem('cpm_access_token');setUser(null);setLoading(false);setSessionError('');setSessionNotice(typeof notice==='string'?notice:'')},[]);
 const retrySession=useCallback(async()=>{
  const token=localStorage.getItem('cpm_access_token'),attempt=++generation.current;setSessionError('');
  if(!token){setUser(null);setLoading(false);return}
  setLoading(true);
  try{const r=await api.get('/auth/me');if(attempt===generation.current&&token===localStorage.getItem('cpm_access_token'))setUser(r.data.data.user)}
  catch(error){if(attempt!==generation.current||token!==localStorage.getItem('cpm_access_token'))return;
   if(error.response?.status===401)clearSession('Your session expired or your account is no longer active. Sign in again.');
   else setSessionError('Unable to verify your session. Check the backend or connection, then retry. Your saved login has been retained.');
  }finally{if(attempt===generation.current)setLoading(false)}
 },[clearSession]);
 useEffect(()=>{
  const expired=e=>{if(e.detail?.token===localStorage.getItem('cpm_access_token'))clearSession('Your session expired or your account is no longer active. Sign in again. Submitted payments are not automatically retried; check transaction history before resubmitting.')};
  const storage=e=>{if(e.key!=='cpm_access_token'&&e.key!==null)return;setUser(null);if(localStorage.getItem('cpm_access_token'))retrySession();else clearSession('You were signed out in another tab.')};
  window.addEventListener('cpm:session-expired',expired);window.addEventListener('storage',storage);retrySession();
  return()=>{generation.current++;window.removeEventListener('cpm:session-expired',expired);window.removeEventListener('storage',storage)};
 },[clearSession,retrySession]);
 const login=useCallback(async(identifier,password)=>{const response=await api.post('/auth/login',{identifier,password});generation.current++;localStorage.setItem('cpm_access_token',response.data.data.token);setUser(response.data.data.user);setSessionError('');setSessionNotice('');setLoading(false);return response.data},[]);
 const logout=useCallback(async()=>{try{if(user)await api.post('/auth/logout',undefined,{timeout:5000})}catch{}finally{clearSession()}},[user,clearSession]);
 const value=useMemo(()=>({user,loading,login,logout,clearSession,retrySession,sessionError,sessionNotice}),[user,loading,login,logout,clearSession,retrySession,sessionError,sessionNotice]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export const useAuth=()=>{const context=useContext(AuthContext);if(!context)throw new Error('useAuth must be used inside AuthProvider.');return context};
