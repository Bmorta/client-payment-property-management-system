import { useState } from "react";
import api from "../services/api.js";

export default function StructureManager({ project, structure, phaseNumber, blockNumber, properties, disabled, onBusy, onNotify, onChanged, onConfirm }) {
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const phase = structure.phases.find(p => p.phaseNumber === Number(phaseNumber));
  const block = structure.blocks.find(b => b.phaseNumber === Number(phaseNumber) && b.blockNumber === Number(blockNumber));
  const phaseHasChildren = structure.blocks.some(b => b.phaseNumber === Number(phaseNumber));
  const blockHasChildren = properties.some(p => p.phaseNumber === Number(phaseNumber) && p.blockNumber === Number(blockNumber));
  const base = `/projects/${project._id}`;

  const run = async fn => {
    setBusy(true); onBusy(true);
    try {
      const result = await fn();
      setEditing(null);
      await onChanged();
      onNotify(result.data.message || "Saved.");
    } catch (e) { onNotify(e.response?.data?.message || "Operation failed. Refresh inventory before retrying.", true); }
    finally { setBusy(false); onBusy(false); }
  };
  const save = e => {
    e.preventDefault();
    const number = Number(editing.number);
    if (!Number.isSafeInteger(number) || number < 1) return onNotify("Enter a positive whole number.", true);
    run(() => api.put(`${base}/${editing.type}s/${editing.id}`, { [`${editing.type}Number`]: number }));
  };
  const remove = (type, item) => onConfirm(
    `Delete empty ${type} ${item[`${type}Number`]}?`,
    () => run(() => api.delete(`${base}/${type}s/${item._id}`))
  );
  return <div className="border rounded p-3 mb-3">
    <h4 className="h6 fw-bold">Selected phase and block</h4>
    <div className="row g-3">
      {[["phase", phase, phaseHasChildren], ["block", block, blockHasChildren]].map(([type, item, hasChildren]) => item && <div className="col-12 col-lg-6" key={type}>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <strong>{type === "phase" ? "Phase" : "Block"} {item[`${type}Number`]}</strong>
          <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy || disabled || hasChildren || !item._id}
            onClick={() => setEditing({ type, id: item._id, number: item[`${type}Number`] })}>Edit {type}</button>
          <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy || disabled || hasChildren || !item._id}
            onClick={() => remove(type, item)}>Delete {type}</button>
        </div>
        {hasChildren && <p className="text-secondary small mb-0 mt-1">Remove its {type === "phase" ? "blocks and lots" : "lots"} before renumbering or deleting.</p>}
      </div>)}
    </div>
    {editing && <form className="d-flex flex-wrap gap-2 mt-3" onSubmit={save}>
      <label className="form-label align-self-center mb-0" htmlFor="structure-number">New {editing.type} number</label>
      <input id="structure-number" type="number" min="1" required className="form-control w-auto" value={editing.number}
        disabled={busy || disabled} onChange={e => setEditing({ ...editing, number: e.target.value })} />
      <button className="btn btn-primary" disabled={busy || disabled}>Save {editing.type}</button>
      <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
    </form>}
  </div>;
}
