import {useState} from 'react';
import SearchInput from './SearchInput.jsx';
import api from '../services/api.js';
import {clientName,lotName} from '../utils/finance.js';
const load=async q=>{const {data}=await api.get('/finance/clients/search',{params:{q}});return data.data.map(c=>({key:c._id,label:`${clientName(c)} · ${c.clientId}`,detail:`${c.projects?.map(p=>p.projectName).join(', ')} · ${c.lots?.map(lotName).join('; ')||'No assigned property'}`,item:c}))};
export default function ClientLookup({onSelect,disabled=false}){const [query,setQuery]=useState('');return <SearchInput label="Find client" placeholder="Client ID, name, project or property" value={query} onChange={setQuery} load={load} onSelect={onSelect} disabled={disabled}/>}
