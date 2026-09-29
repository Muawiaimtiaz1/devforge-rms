import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function ExpenseModal({ title, children, onClose, wide = false }) {
  const closeRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    closeRef.current?.focus()
    const escape = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('keydown', escape); previous?.focus?.() }
  }, [onClose])
  return <div className="expense-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className={'expense-modal ' + (wide ? 'wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
      <header><h3>{title}</h3><button ref={closeRef} type="button" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button></header>
      <div className="expense-modal-body">{children}</div>
    </section>
  </div>
}
