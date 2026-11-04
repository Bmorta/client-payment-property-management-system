// Older inventories may represent phases/blocks only through their lots.
// Merge both sources for display without creating or rewriting database records.
export function mergeStructure(structure, properties) {
  const phases = new Map();
  const blocks = new Map();
  for (const p of structure.phases) phases.set(p.phaseNumber, { ...p });
  for (const b of [...structure.blocks, ...properties]) {
    if (!phases.has(b.phaseNumber)) phases.set(b.phaseNumber, { phaseNumber: b.phaseNumber });
    const key = `${b.phaseNumber}/${b.blockNumber}`;
    if (!blocks.has(key)) blocks.set(key, { phaseNumber: b.phaseNumber, blockNumber: b.blockNumber });
  }
  for (const b of structure.blocks) blocks.set(`${b.phaseNumber}/${b.blockNumber}`, { ...b });
  return {
    phases: [...phases.values()].sort((a, b) => a.phaseNumber - b.phaseNumber),
    blocks: [...blocks.values()].sort((a, b) => a.phaseNumber - b.phaseNumber || a.blockNumber - b.blockNumber)
  };
}
export const nextNumber = numbers => Math.max(0, ...numbers) + 1;
