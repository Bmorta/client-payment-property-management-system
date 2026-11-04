export default function CenterPopup({ message, error, confirm, onClose, onConfirm }) {
  if (!message && !error && !confirm) return null;
  return <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
    style={{ zIndex: 2000, background: "rgba(0,0,0,.45)", padding: 16 }} role="presentation">
    <div className="card shadow-lg border-0 w-100" style={{ maxWidth: 440 }} role="alertdialog"
      aria-modal="true" aria-label={confirm ? "Confirm action" : error ? "Error" : "Notification"}>
      <div className="card-body p-4">
        <h2 className="h5 fw-bold">{confirm ? "Confirm deletion" : error ? "Action failed" : "Success"}</h2>
        <p>{confirm || error || message}</p>
        <div className="d-flex justify-content-end gap-2">
          {confirm && <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>}
          <button type="button" className={confirm ? "btn btn-danger" : "btn btn-primary"}
            onClick={confirm ? onConfirm : onClose}>{confirm ? "Delete" : "OK"}</button>
        </div>
      </div>
    </div>
  </div>;
}
