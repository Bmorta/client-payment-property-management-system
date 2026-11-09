import {createContext,useContext,useLayoutEffect,useState} from 'react';
import {useAuth} from './AuthContext.jsx';
import {THEMES,readAppearance,themeKey,applyAppearance,tokenUser} from '../utils/appearance.js';
const Context=createContext(null);
export function AppearanceProvider({children}){const {user,loading}=useAuth(),id=user?._id||user?.id||(loading?tokenUser():null),[state,setState]=useState(()=>({id,preference:readAppearance(id)})),preference=state.id===id?state.preference:readAppearance(id);
 useLayoutEffect(()=>{applyAppearance(preference);const media=window.matchMedia?.('(prefers-color-scheme: dark)'),update=()=>applyAppearance(preference),storage=e=>{if(e.key===themeKey(id)||e.key===null)setState({id,preference:readAppearance(id)})};media?.addEventListener('change',update);window.addEventListener('storage',storage);return()=>{media?.removeEventListener('change',update);window.removeEventListener('storage',storage)}},[id,preference]);
 const setPreference=v=>{if(!THEMES.includes(v))return;try{localStorage.setItem(themeKey(id),v)}catch{}setState({id,preference:v});applyAppearance(v)};
 return <Context.Provider value={{preference,setPreference}}>{children}</Context.Provider>;
}
export const useAppearance=()=>useContext(Context);
