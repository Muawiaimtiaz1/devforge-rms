export default function InventoryToast({ toast, onDismiss }) {
  if (!toast) return null
  return <div className={`inventory-toast ${toast.type || 'success'}`} role="status"><span>{toast.message}</span><button type="button" onClick={onDismiss} aria-label="Dismiss notification">×</button></div>
}
