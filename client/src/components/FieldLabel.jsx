import {Children,cloneElement,isValidElement,useId} from "react";
import FieldHelp from "./FieldHelp.jsx";
import RequiredMark from "./RequiredMark.jsx";
import {fieldExplanation} from "../utils/fieldExplanation.js";

const controlTypes=new Set(["input","select","textarea"]);
const captionText=nodes=>Children.toArray(nodes).map(n=>typeof n==="string"||typeof n==="number"?String(n):isValidElement(n)&&n.type!==RequiredMark?captionText(n.props.children):"").join(" ").replace(/\s+/g," ").trim();
export default function FieldLabel({children,help,required:explicitRequired,compact=false,...props}){
 const generated=useId(),nodes=Children.toArray(children),controls=nodes.filter(n=>isValidElement(n)&&controlTypes.has(n.type)),caption=nodes.filter(n=>!controls.includes(n)&&!(isValidElement(n)&&n.type===RequiredMark));
 const title=captionText(caption)||"Field",control=controls[0],id=control?.props.id||props.htmlFor||generated;
 const required=control?!control.props.readOnly&&!!control.props.required:!!explicitRequired;
 const marked=nodes.some(n=>isValidElement(n)&&n.type===RequiredMark);
 const LabelTag=control||props.htmlFor?"label":"span";
 const label=<LabelTag {...props} className={compact?"visually-hidden":controls.length?"mb-0":props.className} htmlFor={LabelTag==="label"?id:undefined}>{caption}{!compact&&(required||(!control&&marked))&&<RequiredMark/>}</LabelTag>;
 const heading=<span className="field-label-row">{label}{compact&&required&&<RequiredMark/>}<FieldHelp label={title}>{help||fieldExplanation(title,control?.props)}</FieldHelp></span>;
 if(control?.props.type==="checkbox")return <div className={props.className}><span className="field-label-row"><label htmlFor={id}>{cloneElement(control,{id})}<span className={compact?"visually-hidden":undefined}>{caption}</span>{required&&<RequiredMark/>}</label><FieldHelp label={title}>{help||fieldExplanation(title,control.props)}</FieldHelp></span></div>;
 return controls.length?<div className={props.className}>{heading}{controls.map((node,i)=>cloneElement(node,{key:node.key||i,...(i===0?{id}: {})}))}</div>:heading;
}
export function RequiredNote(){return <p className="small text-secondary required-fields-note"><span className="required-mark" aria-hidden="true">*</span> Required</p>}
