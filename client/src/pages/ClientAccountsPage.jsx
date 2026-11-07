import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import api from '../services/api.js';
import ClientAccounts from '../components/ClientAccounts.jsx';
import {clientName} from '../utils/finance.js';
export default function ClientAccountsPage(){
 const {clientId}=useParams(),[client,setClient]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setClient(null);setError('');api.get(`/clients/${clientId}`).then(r=>{if(active)setClient(r.data.data)}).catch(()=>{if(active)setError('Unable to load this client. Return to the client list and retry.')});return()=>{active=false}},[clientId]);
 return <main className="container-fluid p-4"><div className="d-flex flex-wrap justify-content-between gap-3"><h1 className="h3">Client Properties / Accounts</h1><Link className="btn btn-outline-secondary" to={`/clients?selected=${clientId}`}>Back to Client List</Link></div>{error?<p role="alert">{error}</p>:!client?<p role="status">Loading client...</p>:<><section className="card mt-3"><div className="card-body"><h2 className="h5">{clientName(client)} · {client.clientId}</h2><p className="mb-0">{client.contactNumber||'No contact number'} · {client.email||'No email'}<br/>{client.address}</p></div></section><ClientAccounts client={client}/></>}</main>;
}
