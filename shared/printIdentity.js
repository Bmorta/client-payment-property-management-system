// Keep application navigation/title intact; suppress only the default report brand.
export function printCompanyName(value){const name=String(value||'').trim();return name.replaceAll('&amp;','&').replace(/\s+/g,' ').toLowerCase()==='client payment & property management system'?'':name;}
