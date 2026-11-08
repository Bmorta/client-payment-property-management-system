import CloseButton from "../components/CloseButton.jsx";
import {filterInventory} from "../../../shared/inventoryFilters.js";
import ListReportActions from "../components/ListReportActions.jsx";
import SearchInput from "../components/SearchInput.jsx";
import {default as FieldLabel,RequiredNote} from "../components/FieldLabel.jsx";
import { useEffect, useState } from "react";
import api from "../services/api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import CenterPopup from "../components/CenterPopup.jsx";
import StructureManager from "./StructureManager.jsx";
import { validPrice, lotPrice, money, deletableLot } from "../utils/lotPricing.js";
import { mergeStructure, nextNumber } from "../utils/propertyStructure.js";

const STATUSES = ["AVAILABLE", "RESERVED", "SOLD", "FOR_ASSUME"];
const statusLabel = status => status === "FOR_ASSUME" ? "For Assume" : status;
const newBlock = (blockNumber = 1, startLotNumber = 1) => ({
  blockNumber, startLotNumber, lotCount: 1, defaultArea: "", areasSqm: [""], defaultPrice: "", pricesPerSqm: [""], statuses: ["AVAILABLE"]
});
const areaValue = value => value === "" || value === null ? null : Number(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

export default function PropertyInventory({ project, onClose, readOnly = false, externalFilters=null }) {
  const [properties, setProperties] = useState([]);
  const [savedStructure, setSavedStructure] = useState({ phases: [], blocks: [] });
  const [drafts, setDrafts] = useState({});
  const [selectedLots, setSelectedLots] = useState([]);
  const [phases, setPhases] = useState([]);
  const [inventoryQuery,setInventoryQuery]=useState("");
  const [mode, setMode] = useState("");
  const [generator, setGenerator] = useState("");
  const [selectedPhase, setSelectedPhase] = useState("");
  const [selectedBlock, setSelectedBlock] = useState("");
  const [filters, setFilters] = useState({ phase: "", block: "", lot: "", status: "" });
  useEffect(()=>{if(externalFilters)setFilters(f=>({...f,...externalFilters}))},[JSON.stringify(externalFilters)]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const base = `/projects/${project._id}`;
  const archived = readOnly || project.status === "ARCHIVED";
  const structure = mergeStructure(savedStructure, properties);
  const blockOptions = structure.blocks.filter(b => String(b.phaseNumber) === selectedPhase);
  const changed = properties.filter(p =>
    String(drafts[p._id]?.lotNumber ?? p.lotNumber) !== String(p.lotNumber) || String(drafts[p._id]?.areaSqm ?? "") !== String(p.areaSqm ?? "") || String(drafts[p._id]?.pricePerSqm ?? "") !== String(p.pricePerSqm ?? "") || drafts[p._id]?.status !== p.status
  );
  const [lotEditing, setLotEditing] = useState(false);
  const editMode = mode === "modify" && lotEditing && !archived;
  const notify = (text, isError = false) => {
    setError(isError ? text : ""); setMessage(isError ? "" : text);
  };
  const applyData = (lots, saved) => {
    setProperties(lots); setSavedStructure(saved); setSelectedLots([]);
    setDrafts(Object.fromEntries(lots.map(p => [p._id, { lotNumber: p.lotNumber, areaSqm: p.areaSqm ?? "", pricePerSqm: p.pricePerSqm ?? "", status: p.status }])));
    const merged = mergeStructure(saved, lots);
    setSelectedPhase(old => merged.phases.some(p => String(p.phaseNumber) === old) ? old : String(merged.phases[0]?.phaseNumber ?? ""));
    setLoadFailed(false);
  };
  const load = async () => {
    const [lots, saved] = await Promise.all([api.get(`${base}/properties`), api.get(`${base}/structure`)]);
    applyData(lots.data.data, saved.data.data);
  };
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.get(`${base}/properties`), api.get(`${base}/structure`)])
      .then(([lots, saved]) => { if (!cancelled) applyData(lots.data.data, saved.data.data); })
      .catch(e => { if (!cancelled) { setLoadFailed(true); notify(e.response?.data?.message || "Unable to load inventory. Reload this page to retry.", true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project._id]);
  const blockKey = blockOptions.map(b => b.blockNumber).join(",");
  useEffect(() => {
    setSelectedBlock(old => blockOptions.some(b => String(b.blockNumber) === old) ? old : String(blockOptions[0]?.blockNumber ?? ""));
  }, [selectedPhase, blockKey]);

  const chooseMode = next => {
    if (busy || generator || changed.length) return notify("Save or cancel the current changes before switching options.", true);
    setMode(next); setLotEditing(next === "modify"); setSelectedLots([]);
    if (next === "modify") changeFilters({ phase: selectedPhase, block: selectedBlock, lot: "", status: "" });
    if (next === "add") {
      setGenerator("phase");
      setPhases([{ phaseNumber: nextNumber(structure.phases.map(p => p.phaseNumber)), blocks: [newBlock()] }]);
    }
  };
  const startAdding = type => {
    if (changed.length) return notify("Save or cancel your lot edits before adding lots.", true);
    const phaseNumber = Number(selectedPhase);
    const blockNumber = type === "block" ? nextNumber(blockOptions.map(b => b.blockNumber)) : Number(selectedBlock);
    if (!positiveInteger(phaseNumber) || !positiveInteger(blockNumber)) return;
    const start = type === "lots" ? nextNumber(properties.filter(p => p.phaseNumber === phaseNumber && p.blockNumber === blockNumber).map(p => p.lotNumber)) : 1;
    setGenerator(type);
    setPhases([{ phaseNumber, blocks: [newBlock(blockNumber, start)] }]);
  };
  const updatePhase = (pi, fn) => setPhases(old => old.map((p, i) => i === pi ? fn(p) : p));
  const updateBlock = (pi, bi, fn) => updatePhase(pi, p => ({ ...p, blocks: p.blocks.map((b, i) => i === bi ? fn(b) : b) }));
  const setLotCount = (pi, bi, raw) => {
    const count = Number(raw);
    if (!positiveInteger(count) || count > 100) return;
    updateBlock(pi, bi, b => ({ ...b, lotCount: count,
      pricesPerSqm: Array.from({ length: count }, (_, i) => b.pricesPerSqm[i] ?? ""),
      areasSqm: Array.from({ length: count }, (_, i) => b.areasSqm[i] ?? ""),
      statuses: Array.from({ length: count }, (_, i) => b.statuses[i] ?? "AVAILABLE") }));
  };
  const applyDefault = (pi, bi) => {
    const block = phases[pi].blocks[bi];
    if (!Number.isFinite(Number(block.defaultArea)) || Number(block.defaultArea) <= 0) return notify("Enter a valid default area greater than zero.", true);
    updateBlock(pi, bi, b => ({ ...b, areasSqm: Array(b.lotCount).fill(block.defaultArea) }));
  };
  const applyDefaultPrice = (pi, bi) => {
    const block = phases[pi].blocks[bi];
    if (!validPrice(block.defaultPrice) || block.defaultPrice === "") return notify("Enter a non-negative price per sqm with up to two decimal places.", true);
    updateBlock(pi, bi, b => ({ ...b, pricesPerSqm: Array(b.lotCount).fill(block.defaultPrice) }));
  };
  const cancelNew = () => { setGenerator(""); setPhases([]); if (mode === "add") setMode(""); };
  const totalDraft = phases.reduce((n, p) => n + p.blocks.reduce((sum, b) => sum + b.lotCount, 0), 0);
  const saveNew = async e => {
    e.preventDefault();
    if (busy || archived || loadFailed) return;
    if (totalDraft < 1 || totalDraft > 100) return notify("Save between 1 and 100 new lots at a time.", true);
    const phase = phases[0];
    if (!positiveInteger(phase.phaseNumber) || phase.blocks.some(b => !positiveInteger(b.blockNumber))) return notify("Phase and block numbers must be positive whole numbers.", true);
    if (generator === "phase" && structure.phases.some(p => p.phaseNumber === phase.phaseNumber)) return notify("That phase already exists. Use Modify Lot Properties to add blocks or lots to it.", true);
    if (new Set(phase.blocks.map(b => b.blockNumber)).size !== phase.blocks.length) return notify("Each block in this form must have a different number.", true);
    if (generator !== "lots" && phase.blocks.some(b => structure.blocks.some(saved => saved.phaseNumber === phase.phaseNumber && saved.blockNumber === b.blockNumber))) return notify("That block already exists. Choose Add lots to selected block instead.", true);
    if (phase.blocks.some(b => b.areasSqm.some(a => a !== "" && (!Number.isFinite(Number(a)) || Number(a) <= 0)))) return notify("Lot areas must be positive numbers or left blank.", true);
    if (phase.blocks.some(b => b.pricesPerSqm.some((price, i) => !validPrice(price) || (price !== "" && b.areasSqm[i] !== "" && lotPrice(b.areasSqm[i], price) === null)))) return notify("Enter valid prices per sqm (up to two decimal places) and supported lot totals.", true);
    if (phase.blocks.some(b => !positiveInteger(b.startLotNumber) || !Number.isSafeInteger(b.startLotNumber + b.lotCount - 1))) return notify("Enter a valid positive starting lot number.", true);
    if (phase.blocks.some(b => properties.some(p => p.phaseNumber === phase.phaseNumber && p.blockNumber === b.blockNumber && p.lotNumber >= b.startLotNumber && p.lotNumber < b.startLotNumber + b.lotCount))) return notify("One or more lot numbers already exist in this phase and block. Choose unused lot numbers.", true);
    setBusy(true); setError(""); setMessage("");
    try {
      await api.post(`${base}/properties/generate`, { phases: phases.map(p => ({ phaseNumber: p.phaseNumber, blocks: p.blocks.map(b => ({
        blockNumber: b.blockNumber, startLotNumber: b.startLotNumber, lotCount: b.lotCount,
        areasSqm: b.areasSqm.map(areaValue), pricesPerSqm: b.pricesPerSqm.map(areaValue), statuses: b.statuses
      })) })) });
      cancelNew();
      await load();
      setSelectedPhase(String(phase.phaseNumber));
      setSelectedBlock(String(phase.blocks[0].blockNumber));
      changeFilters({ phase: String(phase.phaseNumber), block: "", lot: "", status: "" });
      notify(`${totalDraft} new lots saved. The inventory now shows Phase ${phase.phaseNumber}.`);
    } catch (e) { notify((e.response?.data?.message || "Unable to save new lots.") + " Refresh and review inventory before retrying; some lots may have been saved.", true); }
    finally { setBusy(false); }
  };
  const saveEdits = async () => {
    if (busy || archived || !changed.length) return;
    if (changed.some(p => !positiveInteger(Number(drafts[p._id].lotNumber)))) return notify("Lot numbers must be positive whole numbers.", true);
    const locations = new Set();
    for (const p of properties) {
      const lotNumber = Number(drafts[p._id]?.lotNumber ?? p.lotNumber);
      const key = `${p.phaseNumber}/${p.blockNumber}/${lotNumber}`;
      if (locations.has(key)) return notify("Duplicate lot number within the same phase and block. Choose an unused number.", true);
      locations.add(key);
    }
    if (changed.some(p => Number(drafts[p._id].lotNumber) !== p.lotNumber && properties.some(other => other._id !== p._id && other.phaseNumber === p.phaseNumber && other.blockNumber === p.blockNumber && other.lotNumber === Number(drafts[p._id].lotNumber)))) return notify("That lot number is already used. Choose an unused number; save moves one at a time when reorganizing lot numbers.", true);
    if (changed.some(p => { const a = drafts[p._id].areaSqm; return a !== "" && (!Number.isFinite(Number(a)) || Number(a) <= 0); })) return notify("Lot areas must be positive numbers or left blank.", true);
    if (changed.some(p => { const d = drafts[p._id]; return !validPrice(d.pricePerSqm) || (d.pricePerSqm !== "" && d.areaSqm !== "" && lotPrice(d.areaSqm, d.pricePerSqm) === null); })) return notify("Enter valid prices per sqm (up to two decimal places) and supported lot totals.", true);
    setBusy(true);
    try {
      for (let i = 0; i < changed.length; i += 100) await api.patch(`${base}/properties/batch`, {
        updates: changed.slice(i, i + 100).map(p => ({ _id: p._id, lotNumber: Number(drafts[p._id].lotNumber), areaSqm: areaValue(drafts[p._id].areaSqm), pricePerSqm: areaValue(drafts[p._id].pricePerSqm), status: drafts[p._id].status }))
      });
      await load(); changeFilters(old => ({ ...old, lot: "" })); notify(`${changed.length} lot edits saved.`);
    } catch (e) { notify((e.response?.data?.message || "Unable to save lot edits.") + " Some changes may have been saved. Refresh and review inventory before retrying.", true); }
    finally { setBusy(false); }
  };
  const cancelEdits = () => setDrafts(Object.fromEntries(properties.map(p => [p._id, { lotNumber: p.lotNumber, areaSqm: p.areaSqm ?? "", pricePerSqm: p.pricePerSqm ?? "", status: p.status }])));
  const updateDraft = (id, field, value) => setDrafts(old => ({ ...old, [id]: { ...old[id], [field]: value } }));
  const deleteLots = lots => {
    if (busy || generator || changed.length || !lots.length || lots.some(p => !deletableLot(p))) return;
    setConfirmAction({ text: `Delete ${lots.length} selected lot(s): ${lots.slice(0, 5).map(p => p.propertyId).join(", ")}${lots.length > 5 ? ` and ${lots.length - 5} more` : ""}? Only available lots with no connected client can be deleted. This cannot be undone.`, action: async () => {
      setConfirmAction(null); setBusy(true);
      try {
        const { data } = await api.post(`${base}/properties/bulk-delete`, { ids: lots.map(p => p._id) });
        await load(); notify(data.message || "Lots deleted.");
      } catch (e) {
        const message = e.response?.data?.message || "Unable to delete lots. Refresh inventory before retrying.";
        try { await load(); } catch { /* Keep the last loaded inventory if refresh fails. */ }
        notify(message, true);
      } finally { setBusy(false); }
    } });
  };
  const visibleProperties = filterInventory(properties,{...filters,q:inventoryQuery});
  const eligibleVisible = visibleProperties.filter(deletableLot);
  const chosenLots = eligibleVisible.filter(p => selectedLots.includes(p._id));
  const toggleSelected = id => setSelectedLots(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]);
  const changeFilters = update => { setSelectedLots([]); setFilters(update); };
  const optionsFor = key => [...new Set(properties.filter(p =>
    (key === "phase" || !filters.phase || String(p.phaseNumber) === filters.phase) &&
    (key !== "lot" || !filters.block || String(p.blockNumber) === filters.block))
    .map(p => String(p[key === "phase" ? "phaseNumber" : key === "block" ? "blockNumber" : "lotNumber"])))].sort((a, b) => Number(a) - Number(b));

  return <section className="card border-0 shadow-sm mt-4"><div className="card-body">
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div><h2 className="h5 fw-bold mb-1">Property Inventory — {project.projectName}</h2>
        <p className="text-secondary small mb-0">{readOnly ? "Filter and print saved lot inventory for this project." : "View existing lots below. Choose an option to add or modify inventory."}</p></div>
      <ListReportActions module="inventory" filters={{project:project._id,...filters,q:inventoryQuery}} disabled={loading || loadFailed || busy || changed.length > 0 || !!generator} onRefresh={async()=>{if(busy||changed.length||generator)return notify('Save or cancel current lot changes before refreshing.',true);setLoading(true);try{await load()}catch{notify('Unable to refresh inventory.',true)}finally{setLoading(false)}}}/>
      {onClose && <CloseButton onClick={onClose}/>}
    </div>
    <CenterPopup message={message} error={error} confirm={confirmAction?.text}
      confirmTitle={confirmAction?.discard ? "Discard changes" : "Confirm deletion"} confirmLabel={confirmAction?.discard ? "Discard Changes" : "Delete"} cancelLabel={confirmAction?.discard ? "Keep Editing" : "Cancel"}
      onClose={() => { setMessage(""); setError(""); setConfirmAction(null); }} onConfirm={() => confirmAction?.action()} />
    {loading ? <p role="status">Loading inventory...</p> : loadFailed ? <p className="text-danger" role="alert">Inventory could not be loaded. Reload this page to retry.</p> : <>
      {archived ? <p className="alert alert-secondary">{readOnly ? "Read-only inventory. Use Manage Lots to make changes." : "This project is archived. Inventory is read-only."}</p> : <div className="border rounded p-3 mb-4">
        <h3 className="h6 fw-bold">New Lot Configuration</h3>
        <div className="d-flex flex-wrap gap-2 mb-3">
          <button type="button" className={`btn ${mode === "add" ? "btn-primary" : "btn-outline-primary"}`} disabled={busy || !!generator || changed.length > 0} onClick={() => chooseMode("add")}>Add a Phase</button>
          <button type="button" className={`btn ${mode === "modify" ? "btn-primary" : "btn-outline-primary"}`} disabled={busy || !!generator || changed.length > 0} onClick={() => chooseMode("modify")}>Modify Lot Properties</button>
        </div>
        {mode === "modify" && <>
          <p className="text-secondary small">Select a phase and block to add lots or manage empty structures. Edit lot numbers, areas, prices and availability in the inventory below. Lot numbers must be unique within each phase and block.</p>
          <div className="row g-3 mb-3">
            <div className="col-12 col-md-6"><FieldLabel className="form-label" htmlFor="manage-phase">Phase to modify
              <select id="manage-phase" className="form-select" value={selectedPhase} disabled={busy || !!generator} onChange={e => { setSelectedPhase(e.target.value); setSelectedBlock(""); changeFilters({ phase: e.target.value, block: "", lot: "", status: "" }); }}>
                {!structure.phases.length && <option value="">No phases yet</option>}
                {structure.phases.map(p => <option key={p.phaseNumber} value={p.phaseNumber}>Phase {p.phaseNumber}</option>)}
              </select></FieldLabel>
            </div>
            <div className="col-12 col-md-6"><FieldLabel className="form-label" htmlFor="manage-block">Block to modify
              <select id="manage-block" className="form-select" value={selectedBlock} disabled={busy || !!generator || !blockOptions.length} onChange={e => { setSelectedBlock(e.target.value); changeFilters({ phase: selectedPhase, block: e.target.value, lot: "", status: "" }); }}>
                {!blockOptions.length && <option value="">No blocks yet</option>}
                {blockOptions.map(b => <option key={b.blockNumber} value={b.blockNumber}>Block {b.blockNumber}</option>)}
              </select></FieldLabel>
            </div>
          </div>
          <StructureManager key={`${selectedPhase}/${selectedBlock}`} project={project} structure={structure} properties={properties}
            phaseNumber={selectedPhase} blockNumber={selectedBlock} disabled={busy || !!generator || changed.length > 0}
            onBusy={setBusy} onNotify={notify} onChanged={load} onConfirm={(text, action) => setConfirmAction({ text, action: () => { setConfirmAction(null); action(); } })} />
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button type="button" className="btn btn-outline-primary" disabled={busy || !!generator || changed.length > 0 || !selectedPhase} onClick={() => startAdding("block")}>Add block with lots</button>
            <button type="button" className="btn btn-outline-primary" disabled={busy || !!generator || changed.length > 0 || !selectedBlock} onClick={() => startAdding("lots")}>Add lots to selected block</button>
          </div>
          {!structure.phases.length && <p className="text-secondary">Choose Add a Phase to create your first phase with blocks and lots.</p>}
        </>}
        {generator && <form onSubmit={saveNew}><RequiredNote/>
          <fieldset disabled={busy}>
          <legend className="h6 fw-bold">{generator === "phase" ? "Configure new phase" : generator === "block" ? "Configure new blocks and lots" : "Configure additional lots"}</legend>
        {generator && phases.map((phase, pi) => <div className="border rounded p-3 mb-3" key={pi}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <FieldLabel className="form-label fw-bold mb-0">Phase number
              <input aria-label="Phase number" className="form-control mt-1" type="number" min="1" required disabled={generator !== "phase" || busy}
                value={phase.phaseNumber} onChange={e => updatePhase(pi, p => ({ ...p, phaseNumber: Number(e.target.value) }))} />
            </FieldLabel>
            {phases.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger"
              onClick={() => setPhases(old => old.filter((_, i) => i !== pi))}>Remove phase</button>}
          </div>
          {phase.blocks.map((block, bi) => <div className="border rounded p-3 mb-3" key={bi}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <FieldLabel className="form-label fw-bold mb-0">Block number
                <input aria-label={`Block number ${bi + 1}`} className="form-control mt-1" type="number" min="1" required disabled={generator === "lots" || busy}
                  value={block.blockNumber} onChange={e => updateBlock(pi, bi, b => ({ ...b, blockNumber: Number(e.target.value) }))} />
              </FieldLabel>
              {phase.blocks.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger"
                onClick={() => updatePhase(pi, p => ({
                  ...p, blocks: p.blocks.filter((_, i) => i !== bi)
                }))}>Remove block</button>}
            </div>
            <FieldLabel className="form-label">Starting lot number
              <input aria-label={`Starting lot number for block ${bi + 1}`} className="form-control" type="number" min="1" step="1" required value={block.startLotNumber}
                onChange={e => updateBlock(pi, bi, b => ({ ...b, startLotNumber: Number(e.target.value) }))} />
            </FieldLabel>
            <p className="small text-secondary mb-2">New lots will be numbered starting at Lot {block.startLotNumber}.</p>
            <FieldLabel className="form-label">Number of lots (1–100)
            <input className="form-control mb-3" type="number" required min="1" max="100"
              value={block.lotCount} onChange={e => setLotCount(pi, bi, e.target.value)} /></FieldLabel>
            <FieldLabel className="form-label">Default area (sqm) — optional</FieldLabel>
            <div className="d-flex gap-2 mb-3">
              <FieldLabel compact className="guided-control flex-grow-1">Default area (sqm)<input className="form-control" type="number" min="0.01" step="any"
                placeholder="e.g. 120" value={block.defaultArea}
                onChange={e => updateBlock(pi, bi, b => ({ ...b, defaultArea: e.target.value }))} /></FieldLabel>
              <button type="button" className="btn btn-outline-primary flex-shrink-0"
                onClick={() => applyDefault(pi, bi)}>Apply to all</button>
            </div>
            <FieldLabel className="form-label">Default price per sqm (₱) — optional</FieldLabel>
            <div className="d-flex gap-2 mb-3">
              <FieldLabel compact className="guided-control flex-grow-1">{`Default price per sqm for block ${bi + 1}`}<input aria-label={`Default price per sqm for block ${bi + 1}`} className="form-control" type="number" min="0" step="0.01" value={block.defaultPrice}
                onChange={e => updateBlock(pi, bi, b => ({ ...b, defaultPrice: e.target.value }))} /></FieldLabel>
              <button type="button" className="btn btn-outline-primary flex-shrink-0" onClick={() => applyDefaultPrice(pi, bi)}>Apply price to all</button>
            </div>
            <p className="small text-secondary">Individual lot areas, prices and availability (editable before saving)</p>
            <div className="row g-2">
              {block.areasSqm.map((area, li) => <div className="col-12 col-md-6 col-xl-4" key={li}>
                <div className="border rounded p-2">
                  <FieldLabel className="form-label small fw-semibold">Lot {block.startLotNumber + li}</FieldLabel>
                  <div className="d-flex gap-2">
                    <FieldLabel compact className="guided-control">{`Lot ${li + 1} area in sqm`}<input aria-label={`Lot ${li + 1} area in sqm`} className="form-control form-control-sm"
                      type="number" min="0.01" step="any" placeholder="sqm" value={area}
                      onChange={e => updateBlock(pi, bi, b => ({
                        ...b, areasSqm: b.areasSqm.map((v, i) => i === li ? e.target.value : v)
                      }))} /></FieldLabel>
                    <FieldLabel compact className="guided-control">{`Lot ${li + 1} status`}<select aria-label={`Lot ${li + 1} status`} className="form-select form-select-sm"
                      value={block.statuses[li]}
                      onChange={e => updateBlock(pi, bi, b => ({
                        ...b, statuses: b.statuses.map((v, i) => i === li ? e.target.value : v)
                      }))}>
                      {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </select></FieldLabel>
                  </div>
                  <FieldLabel className="form-label small mt-2">Price per sqm (₱)
                    <input aria-label={`Lot ${block.startLotNumber + li} price per sqm`} className="form-control form-control-sm" type="number" min="0" step="0.01" value={block.pricesPerSqm[li]}
                      onChange={e => updateBlock(pi, bi, b => ({ ...b, pricesPerSqm: b.pricesPerSqm.map((v, i) => i === li ? e.target.value : v) }))} />
                  </FieldLabel>
                  <div className="small">Price per lot: <output aria-label={`Lot ${block.startLotNumber + li} price per lot`}>{money(lotPrice(area, block.pricesPerSqm[li]))}</output></div>
                </div>
              </div>)}
            </div>
          </div>)}
          {generator !== "lots" && <button type="button" className="btn btn-outline-primary btn-sm"
            onClick={() => updatePhase(pi, p => ({
              ...p, blocks: [...p.blocks, newBlock(nextNumber([...p.blocks.map(b => b.blockNumber), ...structure.blocks.filter(b => b.phaseNumber === p.phaseNumber).map(b => b.blockNumber)]))]
            }))}>+ Add block</button>}
        </div>)}
          <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
            <button type="submit" className="btn btn-primary">{busy ? "Saving..." : generator === "phase" ? "Save Phase and Lots" : generator === "block" ? "Save Blocks and Lots" : "Save New Lots"}</button>
            <button type="button" className="btn btn-outline-secondary" onClick={cancelNew}>Cancel new configuration</button>
            <span className="small text-secondary">{totalDraft} new lots · maximum 100 per save</span>
          </div>
          </fieldset>
        </form>}
      </div>}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        {editMode&&<RequiredNote/>}<h3 className="h6 fw-bold mb-0">Existing lots ({visibleProperties.length} of {properties.length})</h3>
        {mode === "modify" && !lotEditing && !archived && <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => setLotEditing(true)}>Edit lot information</button>}
        {editMode && <div className="d-flex flex-wrap gap-2 align-items-center">
          <span className="small text-secondary">{changed.length} unsaved lot edits</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !!generator || !changed.length} onClick={saveEdits}>Save Lot Changes</button>
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => { const discard = () => {cancelEdits();setSelectedLots([]);setLotEditing(false);setConfirmAction(null)}; if(changed.length) setConfirmAction({discard:true,text:"Discard unsaved lot changes?",action:discard}); else discard(); }}>Cancel Editing / Go Back</button>
        </div>}
      </div>
      {changed.length > 0 && <p className="small text-secondary">Save or cancel lot edits before printing or exporting saved inventory.</p>}
      <SearchInput label="Search property inventory" value={inventoryQuery} onChange={v=>{setInventoryQuery(v);setSelectedLots([])}} items={properties.map(p=>({key:p._id,label:p.propertyId,detail:`Phase ${p.phaseNumber} Block ${p.blockNumber} Lot ${p.lotNumber} ${p.status}`}))}/>
      <div className="row g-2 mb-3">
        {["phase", "block", "lot", "status"].map(key => <div className="col-6 col-lg-3" key={key}>
          <FieldLabel htmlFor={`filter-${key}`} className="form-label small">{key === "status" ? "Availability" : key[0].toUpperCase() + key.slice(1)}
          <select id={`filter-${key}`} className="form-select form-select-sm" value={filters[key]} onChange={e => changeFilters(old => ({
            ...old, [key]: e.target.value, ...(key === "phase" ? { block: "", lot: "" } : key === "block" ? { lot: "" } : {})
          }))}>
            <option value="">All {key === "status" ? "statuses" : key + "s"}</option>
            {(key === "status" ? STATUSES : optionsFor(key)).map(value => <option key={value} value={value}>{key === "status" ? statusLabel(value) : value}</option>)}
          </select></FieldLabel>
        </div>)}
      </div>
      {editMode && <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy || !!generator || changed.length > 0 || !chosenLots.length || chosenLots.length > 100}
          onClick={() => deleteLots(chosenLots)}>Delete selected lots ({chosenLots.length})</button>
        <span className="small text-secondary">Select up to 100 available lots with no connected client. Selection clears when filters change.</span>
      </div>}
      <div className="table-responsive"><table className="table table-sm align-middle">
        <thead><tr>{editMode && <th><FieldLabel compact className="guided-control">Select all eligible visible lots<input aria-label="Select all eligible visible lots" type="checkbox" className="form-check-input"
          disabled={busy || !!generator || changed.length > 0 || !eligibleVisible.length}
          checked={eligibleVisible.length > 0 && chosenLots.length === Math.min(eligibleVisible.length, 100)}
          onChange={e => setSelectedLots(e.target.checked ? eligibleVisible.slice(0, 100).map(p => p._id) : [])} /></FieldLabel></th>}<th>Property ID</th><th>Phase</th><th>Block</th><th>Lot</th><th>Area (sqm)</th><th>Price per sqm</th><th>Price per lot</th><th>Status</th>{editMode && <th>Actions</th>}</tr></thead>
        <tbody>{!visibleProperties.length ? <tr><td colSpan={editMode ? 10 : 8} className="text-center text-secondary py-3">{properties.length ? "No lots match these filters." : "No lots yet. Add a phase to get started."}</td></tr> : visibleProperties.map(p => <tr key={p._id}>
          {editMode && <td><FieldLabel compact className="guided-control">{`Select ${p.propertyId} for deletion`}<input aria-label={`Select ${p.propertyId} for deletion`} className="form-check-input" type="checkbox"
            disabled={busy || !!generator || changed.length > 0 || !deletableLot(p) || (chosenLots.length >= 100 && !selectedLots.includes(p._id))}
            checked={selectedLots.includes(p._id)} onChange={() => toggleSelected(p._id)} /></FieldLabel></td>}
          <td>{p.propertyId}</td><td>{p.phaseNumber}</td><td>{p.blockNumber}</td><td>{editMode ? <FieldLabel compact className="guided-control">{`Lot number for ${p.propertyId}`}<input required aria-label={`Lot number for ${p.propertyId}`} className="form-control form-control-sm" type="number" min="1" step="1"
            disabled={busy || !!generator} value={drafts[p._id]?.lotNumber ?? p.lotNumber} onChange={e => updateDraft(p._id, "lotNumber", e.target.value)} /></FieldLabel> : p.lotNumber}</td>
          <td>{editMode ? <FieldLabel compact className="guided-control">{`Area for ${p.propertyId}`}<input aria-label={`Area for ${p.propertyId}`} className="form-control form-control-sm" type="number" min="0.01" step="any"
            disabled={busy || !!generator} value={drafts[p._id]?.areaSqm ?? ""} onChange={e => updateDraft(p._id, "areaSqm", e.target.value)} /></FieldLabel> : p.areaSqm ?? "—"}</td>
          <td>{editMode ? <FieldLabel compact className="guided-control">{`Price per sqm for ${p.propertyId}`}<input aria-label={`Price per sqm for ${p.propertyId}`} className="form-control form-control-sm" type="number" min="0" step="0.01"
            disabled={busy || !!generator} value={drafts[p._id]?.pricePerSqm ?? ""} onChange={e => updateDraft(p._id, "pricePerSqm", e.target.value)} /></FieldLabel> : money(p.pricePerSqm)}</td>
          <td><output aria-label={`Price per lot for ${p.propertyId}`}>{money(lotPrice(editMode ? drafts[p._id]?.areaSqm : p.areaSqm, editMode ? drafts[p._id]?.pricePerSqm : p.pricePerSqm))}</output></td>
          <td>{editMode ? <FieldLabel compact className="guided-control">{`Status for ${p.propertyId}`}<select aria-label={`Status for ${p.propertyId}`} className="form-select form-select-sm" disabled={busy || !!generator}
            value={drafts[p._id]?.status ?? p.status} onChange={e => updateDraft(p._id, "status", e.target.value)}>
            {STATUSES.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select></FieldLabel> : <StatusBadge status={p.status} />}</td>
          {editMode && <td><button type="button" className="btn btn-sm btn-outline-danger" disabled={busy || !!generator || changed.length > 0 || !deletableLot(p)}
            onClick={() => deleteLots([p])}>Delete lot</button>
            {!deletableLot(p) && <div className="small text-secondary">{p.client ? "Connected to a client" : "Not available for deletion"}</div>}</td>}
        </tr>)}</tbody>
      </table></div>
    </>}
  </div></section>;
}
