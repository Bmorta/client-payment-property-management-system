import {createPortal} from "react-dom";
import {useEffect,useRef,useId} from "react";
let popupSequence=10000;
import CloseButton from "./CloseButton.jsx";
export default function CenterPopup({ message, error, warning, confirm, onClose, onConfirm, confirmTitle = "Confirm deletion", confirmLabel = "Delete", cancelLabel = "Cancel" }) {
  const layer=useRef(0),wasOpen=useRef(false),id=useId();
  const open=Boolean(message||error||warning||confirm);
  const isConfirmation=Boolean(confirm&&!error&&!warning&&!message);
  const text=error||warning||message||confirm;
  if(open&&!wasOpen.current)layer.current=++popupSequence;
  wasOpen.current=open;
  useEffect(()=>{if(open)window.dispatchEvent(new window.Event("cpm:close-help"))},[open]);
  if (!message && !error && !warning && !confirm) return null;
  const popup=<div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
    style={{ zIndex: layer.current, background: "rgba(0,0,0,.45)", padding: 16 }} role="presentation">
    <div className="card shadow-lg border-0 w-100 feedback-dialog" style={{ maxWidth: 440 }} role="alertdialog"
      data-confirmation={isConfirmation?"true":"false"} data-informational={!isConfirmation?"true":"false"} aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} aria-modal="true" aria-label={isConfirmation ? "Confirm action" : error ? "Error" : warning ? "Warning" : "Notification"}>
      <div className="card-body p-4">
        <div className="section-heading"><h2 id={`${id}-title`} className="h5 fw-bold">{error ? "Action failed" : warning ? "Warning" : message ? "Success" : confirmTitle}</h2><CloseButton onClick={onClose}/></div>
        <p id={`${id}-message`} className="feedback-message">{text}</p>
        <div className="feedback-actions d-flex flex-wrap justify-content-end gap-2">
          {isConfirmation && <button type="button" className="btn btn-outline-secondary" onClick={onClose}>{cancelLabel}</button>}
          <button type="button" className={isConfirmation ? (confirmLabel === "Delete" ? "btn btn-danger" : "btn btn-primary") : "btn btn-primary"}
            onClick={isConfirmation ? onConfirm : onClose}>{isConfirmation ? confirmLabel : "OK"}</button>
        </div>
      </div>
    </div>
  </div>;
  return typeof document==='undefined'?popup:createPortal(popup,document.body);
}
