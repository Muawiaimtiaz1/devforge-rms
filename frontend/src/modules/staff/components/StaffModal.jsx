import { useEffect, useRef } from 'react'

export default function StaffModal({ title, children, onClose, wide = false }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const focusable = () => [...dialogRef.current.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    focusable()[0]?.focus()
    function handleKey(event) {
      if (event.key === 'Escape') return onClose()
      if (event.key !== 'Tab') return
      const items = focusable(); if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus?.() }
  }, [onClose])

  return <div className="staff-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className={`staff-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close">×</button></header>{children}</section></div>
}
