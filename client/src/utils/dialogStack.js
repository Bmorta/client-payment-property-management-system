export function dialogLayer(dialog) {
  let layer = 0;
  for (let node = dialog; node && node !== document.body; node = node.parentElement) {
    const z = Number(window.getComputedStyle(node).zIndex);
    if (Number.isFinite(z)) layer = Math.max(layer, z);
  }
  return layer;
}
export function visibleControl(element) {
  if (element.closest('[hidden],[inert],[aria-hidden="true"]') || element.matches(':disabled,input[type="hidden"]')) return false;
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return true;
}
export function dialogControls(dialog) {
  return [...dialog.querySelectorAll('button,input,select,textarea,a[href],iframe,[tabindex]')]
    .filter(element => element.tabIndex >= 0 && visibleControl(element));
}
export function topDialog() {
  return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')]
    .filter(d => !d.classList.contains('app-sidebar') && visibleControl(d))
    .sort((a,b) => dialogLayer(a) - dialogLayer(b)).at(-1);
}
