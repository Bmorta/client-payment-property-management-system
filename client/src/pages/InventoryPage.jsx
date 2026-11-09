import FeedbackMessage from "../components/FeedbackMessage.jsx";
import InventoryFinancialSummary from '../components/InventoryFinancialSummary.jsx';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import api from '../services/api.js';
import PropertyInventory from './PropertyInventory.jsx';

export default function InventoryPage(){
 const [summaryFilters,setSummaryFilters]=useState({});
 const [projects,setProjects]=useState([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;api.get('/projects').then(({data})=>{if(active)setProjects(data.data)}).catch(()=>{if(active)setError('Unable to load projects. Refresh this page to retry.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const project=projects.find(p=>p._id===selected);
 return <main className="container-fluid p-4"><h1 className="h3 fw-bold">Property Inventory</h1><p className="text-secondary">Review inventory, contractual sales, actual collections and commissions. Filter all projects or open a project’s saved lot inventory.</p><FeedbackMessage kind="error" message={error}/>{loading?<p role="status">Loading projects...</p>:!error&&<><InventoryFinancialSummary projects={projects} projectId={selected} onProject={setSelected} onFilters={setSummaryFilters}/>{!projects.length&&<p>No projects found.</p>}{project&&<><Link className="btn btn-outline-secondary btn-sm mt-3" to={`/projects/${project._id}/lots`}>Manage Lots</Link><PropertyInventory key={project._id} project={project} externalFilters={summaryFilters} readOnly/></>}</>}</main>;
}
