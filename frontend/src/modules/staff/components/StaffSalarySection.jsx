function money(value) {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 2 }).format(Number(value || 0))
}

export default function StaffSalarySection({ salary, setSalary, enabled, setEnabled, editing, loading, current, history }) {
  function set(field, value) { setSalary((current) => ({ ...current, [field]: value })) }
  return <section className="staff-salary-section">
    <header><div><h3>Salary and leave deductions</h3><p>Salary changes are saved as dated versions. Approved attendance is applied when payroll is generated.</p></div>{editing && <label className="check-row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Record a raise or policy change</label>}</header>
    {loading ? <p className="salary-help">Loading salary history…</p> : <>
      {editing && current && <div className="salary-current"><span>Current salary</span><strong>{money(current.base_amount)} / {current.compensation_type === 'hourly' ? 'hour' : 'month'}</strong><small>Effective {current.effective_from_date}{current.effective_to_date ? ` to ${current.effective_to_date}` : ''}</small></div>}
      {enabled && <div className="salary-fields">
        <div className="form-grid"><label>Pay basis<select value={salary.compensation_type} onChange={(event) => set('compensation_type', event.target.value)}><option value="monthly">Monthly</option><option value="hourly">Hourly</option></select></label><label>Base salary / rate (PKR)<input required inputMode="decimal" pattern="\d{1,12}(\.\d{1,2})?" value={salary.base_amount} onChange={(event) => set('base_amount', event.target.value)} /></label></div>
        <div className="form-grid"><label>Effective from<input required type="date" value={salary.effective_from} onChange={(event) => set('effective_from', event.target.value)} /></label><label>Change reason<input required minLength="3" value={salary.change_reason} onChange={(event) => set('change_reason', event.target.value)} placeholder={editing ? 'Annual raise' : 'New employee salary'} /></label></div>
        {salary.compensation_type === 'monthly' && <><div className="form-grid"><label>Paid full leaves allowed<input type="number" min="0" max="366" value={salary.paid_full_leave_allowance} onChange={(event) => set('paid_full_leave_allowance', event.target.value)} /></label><label>Paid half leaves allowed<input type="number" min="0" max="732" value={salary.paid_half_leave_allowance} onChange={(event) => set('paid_half_leave_allowance', event.target.value)} /></label></div><label className="check-row"><input type="checkbox" checked={salary.deduct_excess_paid_leave} onChange={(event) => set('deduct_excess_paid_leave', event.target.checked)} /> Deduct paid full/half leave after the allowance is used</label><p className="salary-help">Daily rate = monthly salary ÷ scheduled working days in the approved attendance snapshot. Each excess half leave deducts half of that daily rate.</p></>}
        <div className="form-grid"><label className="check-row"><input type="checkbox" checked={salary.overtime_enabled} onChange={(event) => set('overtime_enabled', event.target.checked)} /> Pay overtime</label>{salary.overtime_enabled && <label>Overtime multiplier<input inputMode="decimal" value={salary.overtime_multiplier} onChange={(event) => set('overtime_multiplier', event.target.value)} /></label>}</div>
      </div>}
      {editing && history.length > 0 && <details className="salary-history"><summary>Salary history ({history.length})</summary><ol>{history.map((version) => <li key={version.id}><strong>{money(version.base_amount)}</strong><span>{version.compensation_type} · {version.effective_from_date}{version.effective_to_date ? ` — ${version.effective_to_date}` : ' — current'}</span><small>{version.change_reason}</small></li>)}</ol></details>}
    </>}
  </section>
}
