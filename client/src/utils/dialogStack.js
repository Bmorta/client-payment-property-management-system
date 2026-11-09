export function dialogLayer(dialog) {
  let layer = 0;
  for (let node = dialog; node && node !== document.body; node = node.parentElement) {
    const z = Number(window.getComputedStyle(node).zIndex);
    if (Number.isFinite(z)) layer = Math.max(layer, z);
  }
  return layer;
}
export function topDialog() {
  return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')]
    .filter(d => !d.classList.contains("app-sidebar") && !d.hidden && d.getAttribute('aria-hidden') !== 'true' && window.getComputedStyle(d).display !== 'none')
    .sort((a,b) => dialogLayer(a) - dialogLayer(b)).at(-1);
}
