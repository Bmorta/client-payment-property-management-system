import { useEffect, useState } from "react";
import api from "../services/api.js";

export default function StructureManager({ project, onNotify, onChanged, onConfirm }) {
  const [phases, setPhases] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [phaseNumber, setPhaseNumber] = useState(1);
  const [blockPhase, setBlockPhase] = useState(1);
  const [blockNumber, setBlockNumber] = useState(1);
  const [busy, setBusy] = useState(false);
  const base = `/projects/${project._id}`;
  const refresh = async () => {
    const { data } = await api.get(`${base}/structure`);
    setPhases(data.data.phases); setBlocks(data.data.blocks);
  };
  useEffect(() => { refresh().catch(e => onNotify(e.response?.data?.message || "Could not load phases and blocks.", true)); }, [project._id]);
  const run = async (fn) => {
    setBusy(true);
    try {
      const result = await fn();
      await refresh(); await onChanged();
      onNotify(result.data.message || "Saved.");
    } catch (e) { onNotify(e.response?.data?.message || "Operation failed.", true); }
    finally { setBusy(false); }
  };
  const edit = (type, item, field) => {
    const value = window.prompt(`New ${type} number`, String(item[field]));
    if (value === null) return;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) return onNotify("Enter a positive whole number.", true);
    run(() => api.put(`${base}/${type}s/${item._id}`, { [field]: number }));
  };
  const remove = (type, item) => onConfirm(
    `Delete ${type} ${type === "phase" ? item.phaseNumber : item.blockNumber}? Only empty phases and blocks can be deleted.`,
    () => run(() => api.delete(`${base}/${type}s/${item._id}`))
  );
  if (project.status === "ARCHIVED") return null;
  return <div className="card border-0 shadow-sm mb-3"><div className="card-body">
    <h3 className="h6 fw-bold">Manage phases and blocks</h3>
    <div className="row g-3 mb-3">
      <div className="col-md-6">
        <label className="form-label">New phase number</label>
        <div className="d-flex gap-2">
          <input type="number" min="1" className="form-control" value={phaseNumber} onChange={e => setPhaseNumber(Number(e.target.value))}/>
          <button type="button" className="btn btn-primary flex-shrink-0" disabled={busy}
            onClick={() => run(() => api.post(`${base}/phases`, { phaseNumber }))}>Save Phase</button>
        </div>
      </div>
      <div className="col-md-6">
        <label className="form-label">New block (phase / block number)</label>
        <div className="d-flex gap-2">
          <select className="form-select" aria-label="Phase for new block" value={blockPhase}
            onChange={e => setBlockPhase(Number(e.target.value))}>
            <option value={1}>Phase 1</option>
            {[...new Set([...phases.map(p=>p.phaseNumber),...blocks.map(b=>b.phaseNumber)])].filter(n=>n!==1).sort((a,b)=>a-b).map(n=><option key={n} value={n}>Phase {n}</option>)}
          </select>
          <input aria-label="New block number" type="number" min="1" className="form-control" value={blockNumber} onChange={e => setBlockNumber(Number(e.target.value))}/>
          <button type="button" className="btn btn-primary flex-shrink-0" disabled={busy}
            onClick={() => run(() => api.post(`${base}/blocks`, { phaseNumber: blockPhase, blockNumber }))}>Save Block</button>
        </div>
      </div>
    </div>
    <div className="row g-3">
      <div className="col-md-6"><h4 className="h6">Saved phases</h4>
        {phases.length === 0 && <p className="text-secondary small">No independently saved phases yet.</p>}
        {phases.map(p=><div key={p._id} className="d-flex align-items-center justify-content-between border rounded p-2 mb-1">
          <span>Phase {p.phaseNumber}</span><div className="d-flex gap-1">
            <button className="btn btn-sm btn-outline-primary" onClick={()=>edit("phase",p,"phaseNumber")}>Edit</button>
            <button className="btn btn-sm btn-outline-danger" onClick={()=>remove("phase",p)}>Delete</button>
          </div>
        </div>)}
      </div>
      <div className="col-md-6"><h4 className="h6">Saved blocks</h4>
        {blocks.length === 0 && <p className="text-secondary small">No independently saved blocks yet.</p>}
        {blocks.map(b=><div key={b._id} className="d-flex align-items-center justify-content-between border rounded p-2 mb-1">
          <span>Phase {b.phaseNumber} / Block {b.blockNumber}</span><div className="d-flex gap-1">
            <button className="btn btn-sm btn-outline-primary" onClick={()=>edit("block",b,"blockNumber")}>Edit</button>
            <button className="btn btn-sm btn-outline-danger" onClick={()=>remove("block",b)}>Delete</button>
          </div>
        </div>)}
      </div>
    </div>
    <p className="text-secondary small mt-2 mb-0">Previously generated phases and blocks are represented by their lots; new structure records are managed separately. Number changes are blocked when children exist.</p>
  </div></div>;
}
