import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../api/client'

const money = (currency, value) => `${currency || 'PKR'} ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const days = (value) => Number(value || 0).toFixed(2)

export default function SimpleSalaryPanel({ has }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [releasing, setReleasing] = useState(null)
  const load = useCallback(async () => {
    try { setRows(await api('/api/payroll/current-month-salaries')); setError('') }
    catch (requestError) { setError(requestError.message) }
  }, [])

  useEffect(() => {
    let active = true
    api('/api/payroll/current-month-salaries').then((result) => { if (active) setRows(result) }).catch((requestError) => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function release(row) {
    if (!row.can_release || !window.confirm(`Release ${money(row.currency, row.expected_salary)} salary to ${row.full_name}?`)) return
    try {
      setReleasing(row.id)
      await api(`/api/payroll/current-month-salaries/${row.id}/release`, { method: 'POST', body: { idempotency_key: crypto.randomUUID() } })
      await load()
    } catch (requestError) { setError(requestError.message) }
    finally { setReleasing(null) }
  }

  return <section className="simple-salary">
    <header className="embedded-panel-heading"><div><h2>Salary</h2><p>Current-month attendance and earned salary for each employee.</p></div></header>
    {error && <div className="form-error">{error}</div>}
    {loading ? <div className="staff-panel-loader">Loading salary…</div> : <div className="responsive-table"><table>
      <thead><tr><th>Employee</th><th>Employee ID</th><th>Present</th><th>Scheduled</th><th>Absent</th><th>Paid leave</th><th>Unpaid leave</th><th>Half-day leave</th><th>Half days</th><th>Less than half days</th><th>Per month salary</th><th>Deducted</th><th>Expected salary to date</th><th>Given</th><th>Action</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td><strong>{row.full_name}</strong></td><td>{row.employee_id}</td>
        {row.salary_configured ? <>
          <td>{days(Number(row.present_days) + Number(row.half_days) + Number(row.less_than_half_days))}</td><td>{days(row.scheduled_days)}</td><td>{days(row.absent_days)}</td><td>{days(row.paid_leave_days)}</td><td>{days(row.unpaid_leave_days)}</td><td>{days(row.half_leave_days)}</td><td>{days(row.half_days)}</td><td>{days(row.less_than_half_days)}</td>
          <td>{money(row.currency, row.current_salary)}</td><td>{money(row.currency, row.deduction_amount)}</td><td><strong>{money(row.currency, row.expected_salary)}</strong></td><td>{money(row.currency, row.released_amount)}</td>
          <td>{row.released ? <span className="paid-badge">Released</span> : has('payroll.finalize') && <button className="primary-button" disabled={releasing === row.id || !row.can_release} title={row.can_release ? 'Release current-month salary' : row.release_block_reason} onClick={() => release(row)}>{releasing === row.id ? 'Releasing…' : 'Release salary'}</button>}</td>
        </> : <td colSpan="13"><span className="status-pill reversed">Salary not configured</span></td>}
      </tr>)}</tbody>
    </table></div>}
  </section>
}
