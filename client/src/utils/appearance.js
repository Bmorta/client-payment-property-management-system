export const THEMES=['light','dark','system'];
export const themeKey=id=>`rems:appearance:${id||'guest'}`;
export function readAppearance(id){try{const v=localStorage.getItem(themeKey(id));return THEMES.includes(v)?v:'system'}catch{return 'system'}}
export function tokenUser(){try{return JSON.parse(atob(localStorage.getItem('cpm_access_token').split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub}catch{return null}}
export function applyAppearance(preference){const dark=preference==='dark'||preference==='system'&&!!window.matchMedia?.('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.bsTheme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';return dark?'dark':'light'}
