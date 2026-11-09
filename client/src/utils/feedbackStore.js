const sources = new Map(), dismissed = new Set(), listeners = new Set();
let sequence = 0, snapshot = null;
const keyFor = ({kind,message}) => JSON.stringify([kind,message]);
function emit() {
  const keys = new Set([...sources.values()].map(keyFor));
  for (const key of dismissed) if (!keys.has(key)) dismissed.delete(key);
  snapshot = [...sources.values()].filter(value => !dismissed.has(keyFor(value))).sort((a,b) => b.sequence-a.sequence)[0] || null;
  for (const listener of listeners) listener();
}
export function registerFeedback(source, kind, message) {
  const text = String(message || '').trim(), previous = sources.get(source);
  if (!text) sources.delete(source);
  else if (!previous || previous.message !== text || previous.kind !== kind)
    sources.set(source, {kind, message:text, sequence:++sequence});
  emit();
}
export function removeFeedback(source) {sources.delete(source);emit();}
export function dismissFeedback(value) {if (value) dismissed.add(keyFor(value));emit();}
export function showFeedback(kind,message) {dismissed.delete(keyFor({kind,message}));emit();}
export function subscribeFeedback(listener) {listeners.add(listener);return () => listeners.delete(listener);}
export const feedbackSnapshot = () => snapshot;
