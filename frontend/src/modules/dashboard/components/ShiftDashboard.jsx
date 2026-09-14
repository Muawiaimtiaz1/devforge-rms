import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import { money } from '../dashboard.utils'
import '../shift-dashboard.css'

const stamp = value => value ? new Date(value).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }) : 'In progress'
const amount = value => value == null ? '—' : 'Rs. ' + money(value)

export default function ShiftDashboard() {
  const [shifts, setShifts] = useState(null)
  const [selected, setSelected] = useState('')
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    api('/api/shifts/history').then(rows => {
      if (!active) return
      setShifts(rows)
      setSelected(current => rows.some(row => String(row.id) === current) ? current : String(rows[0]?.id || ''))
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [revision])
  useEffect(() => {
    let active = true
    setDetails(null)
    if (selected) {
      setError('')
      api('/api/shifts/' + encodeURIComponent(selected) + '/details').then(result => {
        if (active) setDetails(result)
      }).catch(err => { if (active) setError(err.message) })
    }
    return () => { active = false }
  }, [selected, revision])
  const filtered = (shifts || []).filter(s => [s.id, s.cashier_name, s.start_time, stamp(s.start_time), s.status].join(' ').toLowerCase().includes(search.toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / 10))
  const visiblePage = Math.min(page, pages)
  const summary = details?.summary || {}
  const shift = details?.shift
  // Printed closed-shift receipts use the saved expected balance.
  const expected = shift?.status === 'closed' ? Number(shift.expected_balance || 0) : summary.expected_balance
  const metrics = [
    ['Cash sales', summary.net_cash_sales], ['Card sales', summary.net_card_sales], ['Online sales', summary.net_online_sales],
    ['Tips collected', summary.total_tips], ['Cash tips', summary.cash_tips], ['Card tips', summary.card_tips], ['Online tips', summary.online_tips],
    ['Cash due collections', summary.debt_collections], ['Card due collections', summary.card_collections], ['Online due collections', summary.online_collections],
    ['Cash refunds', summary.total_cash_refunds], ['Card refunds', summary.total_card_refunds], ['Online refunds', summary.total_online_refunds],
    ['Business expenses', summary.total_expenses], ['Opening cash', summary.opening_balance],
    ['Verified cash drops', summary.cash_drops], ['Verified handovers', summary.cash_handovers],
    ['Pending verification', Number(summary.pending_cash_drops || 0) + Number(summary.pending_cash_handovers || 0)],
    ['Expected total (including opening)', summary.expected_total], ['Expected cash', expected],
    ['Expected card', summary.expected_card], ['Expected online', summary.expected_online],
    ['Actual cash', shift?.status === 'closed' ? shift.closing_balance : null],
    ['Over / short', shift?.status === 'closed' ? Number(shift.closing_balance || 0) - expected : null]
  ]
  return <section>
    <div className="dashboard-filters"><div><strong>Shift summaries</strong><p>Browse current and older shifts. Times shown in Asia/Karachi.</p></div><button onClick={() => setRevision(value => value + 1)}>Refresh</button></div>
    {error && <p className="dashboard-error" role="alert">{error}</p>}
    <section className="dashboard-card">
      <header><h2>Shift history</h2><input aria-label="Search shift history" placeholder="Shift number, cashier or date" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></header>
      <div className="dashboard-table-wrap"><table><thead><tr><th>Shift</th><th>Cashier</th><th>Started</th><th>Closed</th><th>Status</th><th>Summary</th></tr></thead><tbody>
        {filtered.slice((visiblePage - 1) * 10, visiblePage * 10).map(s => <tr key={s.id} className={String(s.id) === selected ? 'selected' : ''}><td>#{s.id}</td><td>{s.cashier_name || s.user_id}</td><td>{stamp(s.start_time)}</td><td>{stamp(s.end_time)}</td><td>{s.status}</td><td><button aria-pressed={String(s.id) === selected} onClick={() => setSelected(String(s.id))}>View summary</button></td></tr>)}
      </tbody></table></div>
      {!filtered.length && <p className="dashboard-empty">{shifts ? 'No matching shifts.' : 'Loading shifts…'}</p>}
      <footer className="shift-pagination"><button disabled={visiblePage <= 1} onClick={() => setPage(visiblePage - 1)}>Newer</button><span>Page {visiblePage} of {pages} · {filtered.length} shifts</span><button disabled={visiblePage >= pages} onClick={() => setPage(visiblePage + 1)}>Older</button></footer>
    </section>
    {selected && !details && !error && <p role="status">Loading shift #{selected}…</p>}
    {shift && <><header className="dashboard-heading"><h2>Shift #{shift.id} summary</h2><p>{shift.cashier_name || shift.user_id} · {stamp(shift.start_time)} to {stamp(shift.end_time)} · {details.sales?.length || 0} orders</p><p>Compare with register summary #{shift.id}. Tips belong to the shift where they were collected.</p></header><div className="dashboard-metrics">{metrics.map(([label, value]) => <article className="metric-card" key={label}><span>{label}</span><strong>{amount(value)}</strong></article>)}</div></>}
  </section>
}
