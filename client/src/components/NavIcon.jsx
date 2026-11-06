const shapes={
 grid:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
 building:<><path d="M3 21h18M6 21V4h12v17M9 8h1m4 0h1M9 12h1m4 0h1M10 21v-5h4v5"/></>,
 people:<><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/></>,
 agent:<><circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2M10 14l2 4 2-4m-2 4v3"/></>,
 wallet:<><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-6 4h6v4h-6zM5 5V3h13"/></>,
 receipt:<><path d="M5 3l3 2 4-2 4 2 3-2v18l-3-2-4 2-4-2-3 2zM8 9h8m-8 4h8m-8 4h4"/></>,
 percent:<><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M4 20 20 4"/></>,
 expense:<><path d="M3 7h18v13H3zM6 7V4h12v3m-9 6h6m-3-3v6"/></>,
 chart:<><path d="M3 3v18h18M7 16v-5m5 5V6m5 10V9"/></>,
 bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-12 9h12m-8 3a2 2 0 0 0 4 0"/></>,
 check:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 11 3 3 5-6M8 18h8"/></>,
 settings:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
 menu:<path d="M4 6h16M4 12h16M4 18h16"/>, close:<path d="m6 6 12 12M18 6 6 18"/>, logout:<><path d="M9 3H4v18h5m5-14 5 5-5 5m-5-5h10"/></>,
};
export default function NavIcon({name,className=""}){return <svg className={`nav-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]||shapes.grid}</svg>}
