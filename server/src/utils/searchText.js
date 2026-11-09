const slash=String.fromCharCode(92);
const special='^$.*+?()[]{}|'+slash;
// User-entered search text is literal text, never a regular expression.
export const escapeSearch=value=>Array.from(String(value),c=>special.includes(c)?slash+c:c).join('');
