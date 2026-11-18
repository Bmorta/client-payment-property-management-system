import {clientSearchDetail} from '../../../shared/searchRecordStatus.js';
import {clientChoice} from '../utils/clientSelection.js';
import {useState} from 'react';
import SearchInput from './SearchInput.jsx';
import api from '../services/api.js';
import CashierPaymentStatus from './CashierPaymentStatus.jsx';
import {clientName} from '../utils/finance.js';
const search=cashier=>async q=>{const {data}=await api.get('/finance/clients/search',{params:{q,...(cashier?{cashier:1}:{})}});return data.data.map(c=>({key:c._id,label:`${clientName(c)} · ${c.clientId}`,detail:clientSearchDetail(c),item:c}))};
const load=search(false),loadCashier=search(true);
export default function ClientLookup({onSelect,disabled=false,label="Find client",cashier=false}){const [query,setQuery]=useState('');return <SearchInput label={label} placeholder="Client ID, name, project or property" value={query} onChange={setQuery} load={cashier?loadCashier:load} renderDetails={cashier?record=><CashierPaymentStatus payment={record?.paymentStatus}/>:undefined} onSelect={value=>onSelect?.(clientChoice(value))} disabled={disabled}/>}
