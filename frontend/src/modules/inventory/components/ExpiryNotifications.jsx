import { useState } from 'react'
import { number } from '../inventory.utils'
import './inventory-alert-pills.css'

export default function ExpiryNotifications({ warnings }) {
  const [active, setActive] = useState(() => new URLSearchParams(window.location.search).get('alert') || '')
  const near = warnings.filter((item) => item.daysLeft >= 0)
  const expired = warnings.filter((item) => item.daysLeft < 0)
  function select(filter) {
    const next = active === filter ? '' : filter
    setActive(next)
    const url = new URL(window.location.href)
    if (next) url.searchParams.set('alert', next); else url.searchParams.delete('alert')
    url.searchParams.delete('report_date')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    window.dispatchEvent(new CustomEvent('inventory-alert-filter', { detail: next }))
  }
  const pill = (id, label, count, urgent = false) => <button type="button" className={`${active === id ? 'active ' : ''}${count ? 'has-alert ' : ''}${urgent ? 'urgent' : ''}`} aria-pressed={active === id} onClick={() => select(id)}>{label}{count !== undefined && <b>{count}</b>}</button>
  const visibleWarnings = active === 'expiry-near' ? near : active === 'expiry-expired' ? expired : warnings
  return <><div className="inventory-alert-pills" role="group" aria-label="Inventory alert filters">{pill('out-of-stock', 'Out of Stock')}{pill('low-stock', 'Near Out of Stock')}{pill('expiry-near', 'Near Expiry', near.length)}{pill('expiry-expired', 'Expired', expired.length, true)}{active && <button type="button" className="clear-filter" onClick={() => select(active)}>Clear filter ×</button>}</div>{visibleWarnings.length > 0 && <section className="expiry-notifications" role="status" aria-live="polite"><h2>Expiry notifications</h2>{visibleWarnings.map((item) => <p className={item.daysLeft < 0 ? 'expired' : ''} key={item.id}>{number(item.quantity)} {item.unit} of {item.name} {item.daysLeft < 0 ? `expired ${Math.abs(item.daysLeft)} day${Math.abs(item.daysLeft) === 1 ? '' : 's'} ago` : item.daysLeft === 0 ? 'expires today' : `is near expiry (${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'} left)`}.</p>)}</section>}</>
}
