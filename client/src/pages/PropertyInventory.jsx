import { useEffect, useState } from "react";
import api from "../services/api.js";

const newBlock = (blockNumber = 1) => ({ blockNumber, lotCount: 1, areasSqm: [""] });
const newPhase = (phaseNumber = 1) => ({ phaseNumber, blocks: [newBlock()] });

export default function PropertyInventory({ project, onClose }) {
  const [phases, setPhases] = useState([newPhase()]);
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [areas, setAreas] = useState({});

  const load = async () => {
    try {
      const { data } = await api.get(`/projects/${project._id}/properties`);
      setProperties(data.data);
      setAreas(Object.fromEntries(data.data.map(p => [p._id, p.areaSqm ?? ""])));
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load properties.");
    }
  };
  useEffect(() => { load(); }, [project._id]);

  const updatePhase = (phaseIndex, fn) => setPhases(old => old.map((phase, i) => i === phaseIndex ? fn(phase) : phase));
  const updateBlock = (phaseIndex, blockIndex, fn) => updatePhase(phaseIndex, phase => ({
    ...phase, blocks: phase.blocks.map((block, i) => i === blockIndex ? fn(block) : block)
  }));
  const changeLotCount = (phaseIndex, blockIndex, value) => {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) return;
    updateBlock(phaseIndex, blockIndex, block => ({
      ...block, lotCount: count,
      areasSqm: Array.from({ length: count }, (_, i) => block.areasSqm[i] ?? "")
    }));
  };

  const generate = async () => {
    setError(""); setMessage("");
    const count = phases.reduce((sum, p) => sum + p.blocks.reduce((n, b) => n + b.lotCount, 0), 0);
    if (count > 100) { setError("Generate at most 100 lots at a time."); return; }
    const invalid = phases.some(p => p.blocks.some(b => b.areasSqm.some(a => a !== "" && (!Number.isFinite(Number(a)) || Number(a) <= 0))));
    if (invalid) { setError("Lot areas must be positive numbers."); return; }
    const payload = { phases: phases.map(p => ({
      phaseNumber: p.phaseNumber,
      blocks: p.blocks.map(b => ({
        blockNumber: b.blockNumber,
        lotCount: b.lotCount,
        areasSqm: b.areasSqm.map(a => a === "" ? null : Number(a))
      }))
    })) };
    try {
      setBusy(true);
      const { data } = await api.post(`/projects/${project._id}/properties/generate`, payload);
      setMessage(data.message);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Unable to generate lots. Refresh inventory before retrying.");
      await load();
    } finally { setBusy(false); }
  };

  const saveArea = async (propertyId) => {
    setError(""); setMessage("");
    const areaSqm = Number(areas[propertyId]);
    if (!Number.isFinite(areaSqm) || areaSqm <= 0) { setError("Enter an area greater than zero."); return; }
    try {
      setBusy(true);
      await api.patch(`/projects/${project._id}/properties/${propertyId}/area`, { areaSqm });
      setMessage("Lot area saved.");
      await load();
    } catch (e) { setError(e.response?.data?.message || "Unable to save lot area."); }
    finally { setBusy(false); }
  };

  return <section className="card border-0 shadow-sm mt-4">
    <div className="card-body">
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <div><h2 className="h5 fw-bold mb-1">Property Inventory — {project.projectName}</h2>
          <p className="text-secondary small mb-0">Create phases, blocks and lots; assign each lot its own area.</p></div>
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onClose}>Close</button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {project.status !== "ARCHIVED" && <>
        {phases.map((phase, pi) => <div className="border rounded p-3 mb-3" key={phase.phaseNumber}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong>Phase {phase.phaseNumber}</strong>
            {phases.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setPhases(old => old.filter((_, i) => i !== pi))}>Remove phase</button>}
          </div>
          {phase.blocks.map((block, bi) => <div className="border rounded p-3 mb-2" key={block.blockNumber}>
            <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
              <strong>Block {block.blockNumber}</strong>
              {phase.blocks.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => updatePhase(pi, p => ({ ...p, blocks: p.blocks.filter((_, i) => i !== bi) }))}>Remove block</button>}
            </div>
            <label className="form-label">Number of lots (1–100)</label>
            <input className="form-control mb-3" type="number" min="1" max="100" value={block.lotCount} onChange={e => changeLotCount(pi, bi, e.target.value)} />
            <div className="row g-2">
              {block.areasSqm.map((area, li) => <div className="col-6 col-md-3 col-xl-2" key={li}>
                <label className="form-label small">Lot {li + 1} (sqm)</label>
                <input className="form-control form-control-sm" type="number" min="0.01" step="any" placeholder="Optional" value={area} onChange={e => updateBlock(pi, bi, b => ({
                  ...b, areasSqm: b.areasSqm.map((v, i) => i === li ? e.target.value : v)
                }))} />
              </div>)}
            </div>
          </div>)}
          <button className="btn btn-outline-primary btn-sm mt-2" type="button" onClick={() => updatePhase(pi, p => ({
            ...p, blocks: [...p.blocks, newBlock(Math.max(...p.blocks.map(b => b.blockNumber)) + 1)]
          }))}>+ Add block</button>
        </div>)}
        <div className="d-flex flex-wrap gap-2 mb-4">
          <button className="btn btn-outline-primary" type="button" onClick={() => setPhases(old => [...old, newPhase(Math.max(...old.map(p => p.phaseNumber)) + 1)])}>+ Add phase</button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={generate}>{busy ? "Saving..." : "Generate lots"}</button>
        </div>
      </>}
      <h3 className="h6 fw-bold">Existing lots ({properties.length})</h3>
      <p className="small text-secondary">Generating an existing phase/block/lot combination is blocked. Add new blocks or phases to extend inventory.</p>
      <div className="table-responsive"><table className="table table-sm align-middle">
        <thead><tr><th>Property ID</th><th>Phase</th><th>Block</th><th>Lot</th><th>Status</th><th>Area (sqm)</th><th>Action</th></tr></thead>
        <tbody>{properties.length === 0 ? <tr><td colSpan="7" className="text-secondary text-center py-3">No lots yet.</td></tr> :
          properties.map(p => <tr key={p._id}><td>{p.propertyId}</td><td>{p.phaseNumber}</td><td>{p.blockNumber}</td><td>{p.lotNumber}</td><td>{p.status}</td>
            <td><input aria-label={`Area for ${p.propertyId}`} className="form-control form-control-sm" type="number" min="0.01" step="any" value={areas[p._id] ?? ""} onChange={e => setAreas(old => ({ ...old, [p._id]: e.target.value }))} /></td>
            <td><button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => saveArea(p._id)}>Save</button></td></tr>)}
        </tbody>
      </table></div>
    </div>
  </section>;
}
