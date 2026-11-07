import {printCompanyName} from "../../../shared/printIdentity.js";
export function reportLogoHtml(brand={}){
 const src=brand.companyLogo||'';
 return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src)?`<img src="${src}" alt="Company logo" style="display:block;max-width:180px;height:48px;object-fit:contain;object-position:left;margin-bottom:6px">`:'';
}

export function reportCompanyHeader(brand={}){const name=printCompanyName(brand.companyName),safe=name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return reportLogoHtml(brand)+(safe?`<h1>${safe}</h1>`:'');}
