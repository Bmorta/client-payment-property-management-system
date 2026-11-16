import {useEffect,useRef} from 'react';
// Reload current source records after an inline approval without resetting view controls.
export function useReviewRefresh(refresh){const latest=useRef(refresh);latest.current=refresh;useEffect(()=>{const update=()=>latest.current();window.addEventListener('cpm:review-completed',update);return()=>window.removeEventListener('cpm:review-completed',update)},[])}
