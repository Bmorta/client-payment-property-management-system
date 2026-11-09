import {useSyncExternalStore} from 'react';
import CenterPopup from './CenterPopup.jsx';
import {subscribeFeedback,feedbackSnapshot,dismissFeedback} from '../utils/feedbackStore.js';

export default function FeedbackHost(){
  const value=useSyncExternalStore(subscribeFeedback,feedbackSnapshot,()=>null);
  return <CenterPopup error={value?.kind==='error'?value.message:''} warning={value?.kind==='warning'?value.message:''} message={value?.kind==='success'?value.message:''}
    onClose={()=>dismissFeedback(value)}/>;
}
