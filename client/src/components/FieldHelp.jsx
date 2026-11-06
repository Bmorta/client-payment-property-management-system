import {useId,useLayoutEffect,useRef,useState,useEffect} from "react";
import {createPortal} from "react-dom";

export default function FieldHelp({label,children}){
 const id=useId(),button=useRef(null),tooltip=useRef(null),timer=useRef(null),pinned=useRef(false);
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:16,top:0});
 const cancel=()=>clearTimeout(timer.current);
 const hide=()=>{cancel();pinned.current=false;setOpen(false)};
 const leave=()=>{cancel();timer.current=setTimeout(()=>{if(!pinned.current&&document.activeElement!==button.current)setOpen(false)},160)};
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{
   const anchor=button.current?.getBoundingClientRect(),box=tooltip.current?.getBoundingClientRect();if(!anchor||!box)return;
   const left=Math.max(12,Math.min(anchor.left,window.innerWidth-box.width-12));
   const below=anchor.bottom+8,above=anchor.top-box.height-8;
   setPosition({left,top:below+box.height<=window.innerHeight-12?below:Math.max(12,above)});
  };
  place();window.addEventListener("resize",place);window.addEventListener("scroll",place,true);
  const outside=e=>{if(!button.current?.contains(e.target)&&!tooltip.current?.contains(e.target))hide()};
  const escape=e=>{if(e.key==="Escape"){e.stopPropagation();hide()}};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true);document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)};
 },[open]);
 return <span className="field-help"><button ref={button} type="button" className="field-help-button" aria-label={`About ${label}`} aria-expanded={open} aria-describedby={open?id:undefined}
  onMouseEnter={()=>{cancel();setOpen(true)}} onMouseLeave={leave} onFocus={()=>{cancel();setOpen(true)}} onBlur={leave}
  onClick={()=>{cancel();pinned.current=!pinned.current;setOpen(pinned.current)}}><span aria-hidden="true">i</span></button>
  {open&&createPortal(<div ref={tooltip} id={id} role="tooltip" className="field-help-tooltip" style={position} onMouseEnter={cancel} onMouseLeave={leave}><strong>{label}</strong><span>{children}</span></div>,document.body)}
 </span>;
}
