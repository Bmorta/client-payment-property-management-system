import NavIcon from './NavIcon.jsx';
import {useEffect,useId} from 'react';
import {registerFeedback,removeFeedback,showFeedback} from '../utils/feedbackStore.js';

// Keep the local explanation available after dismissing the centered popup.
export default function FeedbackMessage({message,kind='error'}) {
  const source=useId();
  useEffect(()=>{registerFeedback(source,kind,message);return()=>removeFeedback(source)},[source,kind,message]);
  if(!message)return null;
  return <div role={kind==='error'?'alert':'status'} className={`rems-feedback alert alert-${kind==='error'?'danger':kind==='warning'?'warning':'success'}`}>
    <NavIcon name={kind==="error"?"error":kind==="warning"?"warning":"success"}/><span>{message}</span><button type="button" className="btn btn-link btn-sm" onClick={()=>showFeedback(kind,message)}>Show message</button>
  </div>;
}
