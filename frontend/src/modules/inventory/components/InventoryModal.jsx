import { useEffect, useRef } from 'react'

export default function InventoryModal({ children, onClose, size = 'medium', label }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    function close(event) { if (event.key === 'Escape') onClose() }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector('input:not(:disabled), select:not(:disabled), button')?.focus()
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('keydown', close); document.body.style.overflow = previousOverflow }
  }, [onClose])
  return <div className="inventory-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={dialogRef} className={`inventory-modal inventory-modal-${size}`} role="dialog" aria-modal="true" aria-label={label}>{children}</section></div>
}
