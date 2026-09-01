export default function InventoryActionButton({ children, tone = 'neutral', onClick, disabled = false, label }) {
  return <button type="button" className={`inventory-action inventory-action-${tone}`} onClick={onClick} disabled={disabled} aria-label={label}>{children}</button>
}
