import {clientSearchDetail} from '../../../shared/searchRecordStatus.js';
import {clientChoice} from '../utils/clientSelection.js';
import {useState} from 'react';
import SearchInput from './SearchInput.jsx';
import api from '../services/api.js';
import {clientName,lotName} from '../utils/finance.js';
const load=async q=>{const {data}=await api.get('/finance/clients/search',{params:{q}});return data.data.map(c=>({key:c._id,label:`${clientName(c)} · ${c.clientId}`,detail:clientSearchDetail(c),item:c}))};
export default function ClientLookup({onSelect,disabled=false,label="Find client"}){const [query,setQuery]=useState('');return <SearchInput label={label} placeholder="Client ID, name, project or property" value={query} onChange={setQuery} load={load} onSelect={value=>onSelect?.(clientChoice(value))} disabled={disabled}/>}
