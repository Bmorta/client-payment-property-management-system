import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import api from '../services/api.js';
import FieldLabel from '../components/FieldLabel.jsx';
import PropertyInventory from './PropertyInventory.jsx';

export default function InventoryPage(){
 const [projects,setProjects]=useState([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;api.get('/projects').then(({data})=>{if(active)setProjects(data.data)}).catch(()=>{if(active)setError('Unable to load projects. Refresh this page to retry.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const project=projects.find(p=>p._id===selected);
 return <main className="container-fluid p-4"><h1 className="h3 fw-bold">Property Inventory</h1><p className="text-secondary">Select a project to view its saved lots and print a filtered inventory report.</p>{error&&<p role="alert" className="alert alert-danger">{error}</p>}{loading?<p role="status">Loading projects...</p>:!error&&<><FieldLabel className="form-label w-100">Project<select className="form-select" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select a project</option>{projects.map(p=><option key={p._id} value={p._id}>{p.projectId} · {p.projectName} ({p.status})</option>)}</select></FieldLabel>{!projects.length&&<p>No projects found.</p>}{project&&<><Link className="btn btn-outline-secondary btn-sm mt-3" to={`/projects/${project._id}/lots`}>Manage Lots</Link><PropertyInventory key={project._id} project={project} readOnly/></>}</>}</main>;
}
