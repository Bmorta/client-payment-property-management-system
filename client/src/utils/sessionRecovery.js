export function safeReturnPath(from){
 const pathname=typeof from==='string'?from:from?.pathname;
 if(typeof pathname!=='string'||!pathname.startsWith('/')||pathname.startsWith('//')||pathname.includes('\\')||/[\u0000-\u001f]/.test(pathname)||pathname.split(/[?#]/)[0]==='/login')return '/';
 if(typeof from==='string')return pathname;
 const search=typeof from.search==='string'&&from.search.startsWith('?')?from.search:'';
 const hash=typeof from.hash==='string'&&from.hash.startsWith('#')?from.hash:'';
 return pathname+search+hash;
}
export function expiredSessionToken(error,currentToken){
 if(error?.response?.status!==401||!currentToken||/\/auth\/login(?:\?|$)/.test(error.config?.url||''))return null;
 const headers=error.config?.headers,sent=headers?.get?.('Authorization')||headers?.Authorization||headers?.authorization;
 return sent===`Bearer ${currentToken}`?currentToken:null;
}
