import { useEffect, useState } from "react";
import api from "../services/api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import CenterPopup from "../components/CenterPopup.jsx";
import StructureManager from "./StructureManager.jsx";

const STATUSES = ["AVAILABLE", "RESERVED", "SOLD"];
const newBlock = (blockNumber = 1, startLotNumber = 1) => ({
  blockNumber, startLotNumber, lotCount: 1, defaultArea: "", areasSqm: [""], statuses: ["AVAILABLE"]
});
const newPhase = (phaseNumber = 1) => ({ phaseNumber, blocks: [newBlock()] });
const areaValue = value => value === "" || value === null ? null : Number(value);

export default function PropertyInventory({ project, onClose }) {
  const [phases, setPhases] = useState([newPhase()]);
  const [properties, setProperties] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [filters, setFilters] = useState({ phase: "", block: "", lot: "", status: "" });
  const [showGenerator, setShowGenerator] = useState(true);
  const [selectedPhase, setSelectedPhase] = useState("1");
  const [selectedBlock, setSelectedBlock] = useState("1");

  const load = async () => {
    const { data } = await api.get(`/projects/${project._id}/properties`);
    setProperties(data.data);
    setSelectedPhase(String(data.data[0]?.phaseNumber ?? 1));
    setSelectedBlock(String(data.data[0]?.blockNumber ?? 1));
    setShowGenerator(data.data.length === 0);
    setDrafts(Object.fromEntries(data.data.map(p => [p._id, {
      areaSqm: p.areaSqm ?? "", status: p.status
    }])));
  };
  useEffect(() => {
    let cancelled = false;
    api.get(`/projects/${project._id}/properties`)
      .then(({ data }) => {
        if (cancelled) return;
        setProperties(data.data);
        setSelectedPhase(String(data.data[0]?.phaseNumber ?? 1));
        setSelectedBlock(String(data.data[0]?.blockNumber ?? 1));
        setShowGenerator(data.data.length === 0);
        setDrafts(Object.fromEntries(data.data.map(p => [p._id, {
          areaSqm: p.areaSqm ?? "", status: p.status
        }])));
      })
      .catch(e => { if (!cancelled) setError(e.response?.data?.message || "Unable to load lots."); });
    return () => { cancelled = true; };
  }, [project._id]);

  const startAddingLots = () => {
    const phaseNumber = Number(selectedPhase);
    const blockNumber = Number(selectedBlock);
    const existingInBlock = properties.filter(p => p.phaseNumber === phaseNumber && p.blockNumber === blockNumber);
    const start = existingInBlock.length ? Math.max(...existingInBlock.map(p => p.lotNumber)) + 1 : 1;
    setPhases([{ phaseNumber, blocks: [newBlock(blockNumber, start)] }]);
    setError(""); setMessage("");
    setShowGenerator(true);
  };

  const updatePhase = (pi, fn) => setPhases(old => old.map((p, i) => i === pi ? fn(p) : p));
  const updateBlock = (pi, bi, fn) => updatePhase(pi, p => ({
    ...p, blocks: p.blocks.map((b, i) => i === bi ? fn(b) : b)
  }));
  const setLotCount = (pi, bi, raw) => {
    const count = Number(raw);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) return;
    updateBlock(pi, bi, b => ({
      ...b, lotCount: count,
      areasSqm: Array.from({ length: count }, (_, i) => b.areasSqm[i] ?? ""),
      statuses: Array.from({ length: count }, (_, i) => b.statuses[i] ?? "AVAILABLE")
    }));
  };
  const applyDefault = (pi, bi) => {
    const block = phases[pi].blocks[bi];
    const value = Number(block.defaultArea);
    if (block.defaultArea === "" || !Number.isFinite(value) || value <= 0) {
      setError("Enter a valid default area greater than zero."); return;
    }
    setError("");
    updateBlock(pi, bi, b => ({ ...b, areasSqm: Array(b.lotCount).fill(String(value)) }));
  };

  const updateDraft = (id, field, value) => setDrafts(old => ({
    ...old, [id]: { ...old[id], [field]: value }
  }));

  const saveAll = async () => {
    setError(""); setMessage("");
    const total = phases.reduce((n, p) => n + p.blocks.reduce((sum, b) => sum + b.lotCount, 0), 0);
    const newLots = showGenerator && project.status !== "ARCHIVED" ? total : 0;
    if (newLots > 100) { setError("Generate at most 100 new lots per save."); return; }

    const invalidNew = newLots && phases.some(p => p.blocks.some(b =>
      b.areasSqm.some(a => a !== "" && (!Number.isFinite(Number(a)) || Number(a) <= 0))));
    const invalidExisting = properties.some(p => {
      const a = drafts[p._id]?.areaSqm;
      return a !== "" && a !== null && a !== undefined &&
        (!Number.isFinite(Number(a)) || Number(a) <= 0);
    });
    if (invalidNew || invalidExisting) {
      setError("Lot areas must be positive numbers or left blank."); return;
    }
    const changed = properties.filter(p =>
      String(drafts[p._id]?.areaSqm ?? "") !== String(p.areaSqm ?? "") ||
      drafts[p._id]?.status !== p.status
    );
    if (!newLots && !changed.length) { setMessage("No changes to save."); return; }

    setBusy(true);
    let savedNew = false;
    try {
      // Existing edits first, then new lots. A standalone MongoDB instance does
      // not guarantee atomicity across these two separate requests.
      if (changed.length) {
        for (let i = 0; i < changed.length; i += 100) {
          await api.patch(`/projects/${project._id}/properties/batch`, {
            updates: changed.slice(i, i + 100).map(p => ({
              _id: p._id,
              areaSqm: areaValue(drafts[p._id].areaSqm),
              status: drafts[p._id].status
            }))
          });
        }
      }
      if (newLots) {
        await api.post(`/projects/${project._id}/properties/generate`, {
          phases: phases.map(p => ({
            phaseNumber: p.phaseNumber,
            blocks: p.blocks.map(b => ({
              blockNumber: b.blockNumber, startLotNumber: b.startLotNumber, lotCount: b.lotCount,
              areasSqm: b.areasSqm.map(areaValue), statuses: b.statuses
            }))
          }))
        });
        savedNew = true;
        setShowGenerator(false);
      }
      await load();
      setMessage(`Saved successfully: ${changed.length} existing lots updated, ${savedNew ? newLots : 0} new lots created.`);
    } catch (e) {
      setError((e.response?.data?.message || "Unable to save all lots.") +
        " Some changes may have been saved. Refresh and review inventory before retrying.");
      // Avoid resetting user edits on a failed request.
    } finally { setBusy(false); }
  };

  const visibleProperties = properties.filter(p =>
    (!filters.phase || String(p.phaseNumber) === filters.phase) &&
    (!filters.block || String(p.blockNumber) === filters.block) &&
    (!filters.lot || String(p.lotNumber) === filters.lot) &&
    (!filters.status || p.status === filters.status)
  );
  const optionsFor = key => [...new Set(properties
    .filter(p => (key === "phase" || !filters.phase || String(p.phaseNumber) === filters.phase) &&
      (key !== "lot" || !filters.block || String(p.blockNumber) === filters.block))
    .map(p => String(p[key === "phase" ? "phaseNumber" : key === "block" ? "blockNumber" : "lotNumber"])))].sort((a,b) => Number(a)-Number(b));
  const notify = (text, isError = false) => {
    if (isError) { setMessage(""); setError(text); }
    else { setError(""); setMessage(text); }
  };
  const deleteExistingLot = (lot) => setConfirmAction({
    text: `Delete ${lot.propertyId} (Phase ${lot.phaseNumber}, Block ${lot.blockNumber}, Lot ${lot.lotNumber})? This cannot be undone.`,
    action: async () => {
      setConfirmAction(null);
      try {
        await api.delete(`/projects/${project._id}/properties/${lot._id}`);
        await load();
        notify("Lot deleted.");
      } catch (e) { notify(e.response?.data?.message || "Unable to delete lot.", true); }
    }
  });
  const totalDraft = phases.reduce((n, p) => n + p.blocks.reduce((sum, b) => sum + b.lotCount, 0), 0);
  const changedCount = properties.filter(p =>
    String(drafts[p._id]?.areaSqm ?? "") !== String(p.areaSqm ?? "") ||
    drafts[p._id]?.status !== p.status
  ).length;

  return <section className="card border-0 shadow-sm mt-4">
    <div className="card-body">
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h2 className="h5 fw-bold mb-1">Property Inventory — {project.projectName}</h2>
          <p className="text-secondary small mb-0">Apply a default lot area, adjust individual lots, then save together.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>Close</button>
      </div>
      <CenterPopup message={message} error={error} confirm={confirmAction?.text}
        onClose={() => { setMessage(""); setError(""); setConfirmAction(null); }}
        onConfirm={() => confirmAction?.action()} />
      <StructureManager project={project} onNotify={notify} onChanged={load}
        onConfirm={(text, action) => setConfirmAction({ text, action: () => { setConfirmAction(null); action(); } })} />

      {project.status !== "ARCHIVED" && <>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h3 className="h6 fw-bold mb-0">New lot configuration</h3>
          <button type="button" className="btn btn-sm btn-outline-secondary"
            onClick={() => showGenerator ? setShowGenerator(false) : startAddingLots()}>
            {showGenerator ? "Hide new lot form" : "Add more lots"}
          </button>
        </div>
        {!showGenerator && properties.length > 0 && <div className="row g-2 mb-3">
          <div className="col-sm-4"><label className="form-label">Phase to extend</label>
            <select className="form-select" value={selectedPhase} onChange={e => {
              setSelectedPhase(e.target.value); setSelectedBlock("1");
            }}>
              {[...new Set(properties.map(p => p.phaseNumber))].sort((a,b) => a-b).map(n =>
                <option key={n} value={n}>Phase {n}</option>)}
            </select>
          </div>
          <div className="col-sm-4"><label className="form-label">Block to extend</label>
            <select className="form-select" value={selectedBlock} onChange={e => setSelectedBlock(e.target.value)}>
              {[...new Set(properties.filter(p => p.phaseNumber === Number(selectedPhase)).map(p => p.blockNumber))]
                .sort((a,b) => a-b).map(n => <option key={n} value={n}>Block {n}</option>)}
            </select>
          </div>
        </div>}
        {showGenerator && phases.map((phase, pi) => <div className="border rounded p-3 mb-3" key={phase.phaseNumber}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong>Phase {phase.phaseNumber}</strong>
            {phases.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger"
              onClick={() => setPhases(old => old.filter((_, i) => i !== pi))}>Remove phase</button>}
          </div>
          {phase.blocks.map((block, bi) => <div className="border rounded p-3 mb-3" key={block.blockNumber}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong>Block {block.blockNumber}</strong>
              {phase.blocks.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger"
                onClick={() => updatePhase(pi, p => ({
                  ...p, blocks: p.blocks.filter((_, i) => i !== bi)
                }))}>Remove block</button>}
            </div>
            <p className="small text-secondary mb-2">New lots will be numbered starting at Lot {block.startLotNumber}.</p>
            <label className="form-label">Number of lots (1–100)</label>
            <input className="form-control mb-3" type="number" min="1" max="100"
              value={block.lotCount} onChange={e => setLotCount(pi, bi, e.target.value)} />
            <label className="form-label">Default area (sqm) — optional</label>
            <div className="d-flex gap-2 mb-3">
              <input className="form-control" type="number" min="0.01" step="any"
                placeholder="e.g. 120" value={block.defaultArea}
                onChange={e => updateBlock(pi, bi, b => ({ ...b, defaultArea: e.target.value }))} />
              <button type="button" className="btn btn-outline-primary flex-shrink-0"
                onClick={() => applyDefault(pi, bi)}>Apply to all</button>
            </div>
            <p className="small text-secondary">Individual lot areas and statuses (editable before saving)</p>
            <div className="row g-2">
              {block.areasSqm.map((area, li) => <div className="col-12 col-md-6 col-xl-4" key={li}>
                <div className="border rounded p-2">
                  <label className="form-label small fw-semibold">Lot {block.startLotNumber + li}</label>
                  <div className="d-flex gap-2">
                    <input aria-label={`Lot ${li + 1} area in sqm`} className="form-control form-control-sm"
                      type="number" min="0.01" step="any" placeholder="sqm" value={area}
                      onChange={e => updateBlock(pi, bi, b => ({
                        ...b, areasSqm: b.areasSqm.map((v, i) => i === li ? e.target.value : v)
                      }))} />
                    <select aria-label={`Lot ${li + 1} status`} className="form-select form-select-sm"
                      value={block.statuses[li]}
                      onChange={e => updateBlock(pi, bi, b => ({
                        ...b, statuses: b.statuses.map((v, i) => i === li ? e.target.value : v)
                      }))}>
                      {STATUSES.map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
                    </select>
                  </div>
                </div>
              </div>)}
            </div>
          </div>)}
          <button type="button" className="btn btn-outline-primary btn-sm"
            onClick={() => updatePhase(pi, p => ({
              ...p, blocks: [...p.blocks, newBlock(Math.max(...p.blocks.map(b => b.blockNumber)) + 1)]
            }))}>+ Add block</button>
        </div>)}
        {showGenerator && <button type="button" className="btn btn-outline-primary mb-4"
          onClick={() => setPhases(old => [...old, newPhase(Math.max(...old.map(p => p.phaseNumber)) + 1)])}>
          + Add phase
        </button>}
      </>}

      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <h3 className="h6 fw-bold mb-0">Existing lots ({visibleProperties.length} of {properties.length})</h3>
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditMode(v => !v)}>
          {editMode ? "Finish editing" : "Edit lot information"}
        </button>
      </div>
      <div className="row g-2 mb-3">
        {["phase", "block", "lot", "status"].map(key => <div className="col-6 col-lg-3" key={key}>
          <label className="form-label small">{key === "status" ? "Availability" : key[0].toUpperCase() + key.slice(1)}</label>
          <select className="form-select form-select-sm" value={filters[key]} onChange={e =>
            setFilters(old => ({ ...old, [key]: e.target.value, ...(key === "phase" ? {block:"",lot:""} : key === "block" ? {lot:""} : {}) }))}>
            <option value="">All {key === "status" ? "statuses" : key + "s"}</option>
            {(key === "status" ? STATUSES : optionsFor(key)).map(value =>
              <option key={value} value={value}>{key === "status" ? value : value}</option>)}
          </select>
        </div>)}
      </div>
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead><tr><th>Property ID</th><th>Phase</th><th>Block</th><th>Lot</th><th>Area (sqm)</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{properties.length === 0 ?
            <tr><td colSpan="7" className="text-center text-secondary py-3">No lots yet.</td></tr> :
            visibleProperties.map(p => <tr key={p._id}>
              <td>{p.propertyId}</td><td>{p.phaseNumber}</td><td>{p.blockNumber}</td><td>{p.lotNumber}</td>
              <td><input aria-label={`Area for ${p.propertyId}`} className="form-control form-control-sm"
                type="number" min="0.01" step="any" disabled={!editMode} value={drafts[p._id]?.areaSqm ?? ""}
                onChange={e => updateDraft(p._id, "areaSqm", e.target.value)} /></td>
              <td>{!editMode ? <StatusBadge status={p.status} /> : <select aria-label={`Status for ${p.propertyId}`} className="form-select form-select-sm"
                value={drafts[p._id]?.status ?? p.status}
                onChange={e => updateDraft(p._id, "status", e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
              </select>}</td>
              <td><button type="button" className="btn btn-sm btn-outline-danger" disabled={p.status !== "AVAILABLE"} onClick={() => deleteExistingLot(p)}>Delete</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {project.status !== "ARCHIVED" && <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
        <span className="text-secondary small">
          {showGenerator ? totalDraft + " new lots" : "No new lots"} · {changedCount} existing lots edited
        </span>
        <button type="button" className="btn btn-primary" disabled={busy || (!showGenerator && !editMode)} onClick={saveAll}>
          {busy ? "Saving..." : "Save All Lots"}
        </button>
      </div>}
      <p className="text-secondary small mt-2 mb-0">
        Changes are not saved until you click Save All Lots. Avoid re-submitting after a network error until you check the inventory.
      </p>
    </div>
  </section>;
}
