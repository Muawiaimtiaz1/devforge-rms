import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Clock3, Download, Eye, HandCoins, History, Pencil, Plus, Settings, Trash2, X } from 'lucide-react'
import { api, legacyUrl } from '../../api/client'
import { formatShopCurrency } from '../../currency'
import { AnalyticsTopbar } from '../analytics/AnalyticsTopbar'
import '../analytics/analytics.generated.css'
import './expenses.css'
import ExpenseModal from './components/ExpenseModal'
import ExpenseForm from './components/ExpenseForm'

const PAGE_SIZE = 5
const restaurantCategory = { name: 'Restaurant Expense', emoji: '🏬' }
const monthLabel = month => new Date(month + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

function PaymentRows({ rows, month, onPay }) {
  const [amounts, setAmounts] = useState(() => Object.fromEntries(rows.map(row => [row.brand_id, Number(row.due).toFixed(2)])))
  return <div className="expense-payment-list"><p>Month: <b>{month}</b></p>{rows.length ? rows.map(row => <div className="expense-payment-row" key={row.brand_id}><span><b>{row.brand_name}</b><small>Due: {formatShopCurrency(row.due)}</small></span><input aria-label={'Payment for ' + row.brand_name} type="number" min="0.01" max={row.due} step="0.01" value={amounts[row.brand_id] || ''} onChange={event => setAmounts(current => ({ ...current, [row.brand_id]: event.target.value }))} /><button onClick={() => onPay(row.brand_id, month, amounts[row.brand_id])}>Pay</button></div>) : <p className="expense-empty">All brands are fully paid for <b>{month}</b>.</p>}</div>
}

function BulkEditor({ rows, categories, onSave }) {
  const [items, setItems] = useState(() => rows.map(row => ({ ...row, amount: String(row.amount), date: String(row.date).slice(0, 10) })))
  const [saving, setSaving] = useState(false)
  return <div className="bulk-editor">{items.map((item, index) => <div className="bulk-row" key={item.id}><input value={item.title} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} /><select value={item.category} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, category: event.target.value } : row))}>{categories.map(category => <option key={category.name}>{category.name}</option>)}</select><input type="number" min="0.01" step="0.01" value={item.amount} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, amount: event.target.value } : row))} /><input type="date" value={item.date} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, date: event.target.value } : row))} /></div>)}<button className="expense-primary full" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(items.map(({ id, title, category, amount, date, note }) => ({ id, title, category, amount: Number(amount), date, note: note || '' }))) } finally { setSaving(false) } }}>{saving ? 'Saving...' : 'Save All Changes'}</button></div>
}

function MonthlyReport({ month, rows }) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0)
  return <div className="monthly-report"><h4>1. Operating Expenses</h4>{rows.length ? <table><thead><tr><th>Date</th><th>Title / Category</th><th>Amount</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{String(row.date).slice(0, 10)}</td><td><b>{row.title}</b><small>{row.category}</small></td><td>{formatShopCurrency(row.amount)}</td></tr>)}<tr className="report-total"><td colSpan="2">Total Expenses:</td><td>{formatShopCurrency(total)}</td></tr></tbody></table> : <p>No expenses found for this month.</p>}<a className="download-report" href={'/api/brands/pdf/monthly-report?month=' + month + '&download=true'}>Download Monthly Report PDF</a></div>
}

export default function ExpensesPage() {
  const [session, setSession] = useState(null)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [expenses, setExpenses] = useState([])
  const [shares, setShares] = useState({ shares: [] })
  const [previousDues, setPreviousDues] = useState([])
  const [categories, setCategories] = useState([restaurantCategory])
  const [month, setMonth] = useState(() => new URLSearchParams(window.location.search).get('month') || new Date().toISOString().slice(0, 7))
  const [page, setPage] = useState(1)
  const [view, setView] = useState('list')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    document.title = 'Expenses — DevForge RMS'
    api('/api/auth/me').then(({ user }) => {
      if (user.role !== 'superadmin' && !user.permissions?.includes('expenses.view')) throw new Error('You do not have permission to view Expenses.')
      setSession(user)
    }).catch(requestError => {
      if (requestError.status === 401) window.location.replace(legacyUrl('/'))
      else setAuthError(requestError.message)
    }).finally(() => setAuthLoading(false))
  }, [])

  const load = useCallback(async () => {
    if (!session) return
    try {
      setLoading(true); setError('')
      const [all, shareResult, dues, categoryResult] = await Promise.all([api('/api/expenses'), api('/api/brands/expense-shares?month=' + month), api('/api/brands/all-months-dues'), api('/api/expense-categories')])
      setExpenses(Array.isArray(all) ? all : [])
      setShares(shareResult || { shares: [] })
      setPreviousDues(Array.isArray(dues) ? dues : [])
      const list = Array.isArray(categoryResult) ? categoryResult : []
      setCategories(list.some(category => category.name === restaurantCategory.name) ? list : [restaurantCategory, ...list])
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }, [session, month])

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  useEffect(() => { const url = new URL(window.location.href); url.searchParams.set('month', month); window.history.replaceState({}, '', url) }, [month])

  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.setTimeout(() => setToast(null), 3500) }, [])
  const filtered = useMemo(() => expenses.filter(expense => String(expense.date).startsWith(month)).sort((a, b) => String(b.date).localeCompare(String(a.date))), [expenses, month])
  const total = filtered.reduce((sum, expense) => sum + Number(expense.amount), 0)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const categoryFor = name => categories.find(category => category.name === name) || { emoji: '📦' }
  const mutate = async (path, options, message) => { await api(path, options); setModal(null); notify(message); await load() }


  async function saveExpense(payload, expense) {
    await mutate('/api/expenses' + (expense ? '/' + expense.id : ''), { method: expense ? 'PUT' : 'POST', body: payload }, expense ? 'Expense updated!' : 'Expense added!')
    setView('list')
  }
  async function deleteExpense(expense) {
    if (!window.confirm('Delete this expense?')) return
    try { await mutate('/api/expenses/' + expense.id, { method: 'DELETE' }, 'Expense removed') } catch (requestError) { notify(requestError.message, 'error') }
  }
  async function pay(brandId, paymentMonth, rawAmount) {
    const amount = Number(rawAmount)
    if (!(amount > 0)) return notify('Amount must be > 0', 'error')
    try { await api('/api/brands/expense-payments', { method: 'POST', body: { brand_id: brandId, amount, month: paymentMonth } }); notify('Payment recorded!'); await load(); setModal(null) } catch (requestError) { notify(requestError.message, 'error') }
  }
  async function openPayments(share) {
    try {
      const payments = await api('/api/brands/expense-payments?month=' + month)
      setModal({ kind: 'payments', share, payments: (payments || []).filter(payment => Number(payment.brand_id) === Number(share.brand_id)) })
    } catch (requestError) { notify(requestError.message, 'error') }
  }
  async function updatePayment(payment, amount) {
    try { await api('/api/brands/expense-payments/' + payment.id, { method: 'PUT', body: { amount: Number(amount) } }); notify('Payment updated!'); setModal(null); await load() } catch (requestError) { notify(requestError.message, 'error') }
  }
  async function addCategory(name) {
    if (!name.trim()) return
    await mutate('/api/expense-categories', { method: 'POST', body: { name: name.trim() } }, 'Category added!')
  }

  if (authLoading) return <main className="expenses-state"><div className="expenses-skeleton" /><div className="expenses-skeleton tall" /></main>
  if (authError) return <main className="expenses-state"><h1>Expenses unavailable</h1><p>{authError}</p><a href="/app/lobby">Back to modules</a></main>

  return <div className="analytics-page expenses-page"><AnalyticsTopbar user={session} /><main className="expenses-shell">
    {error && <div className="expense-error"><span>{error}</span><button onClick={load}>Retry</button></div>}
    {view === 'add' ? <><div className="expense-add-heading"><h2>Add New Expense</h2><button onClick={() => setView('list')}><ArrowLeft aria-hidden="true" /> Back to List</button></div><section className="expense-card expense-add-card"><ExpenseForm categories={categories} onCancel={() => setView('list')} onSave={payload => saveExpense(payload)} /></section></> : <>
      <header className="expenses-heading"><div><h2>Expenses Management - <em>{monthLabel(month)}</em></h2><p><i /> Month: <b>{month}</b> — Total: <strong>{formatShopCurrency(total)}</strong></p></div><div className="expenses-heading-actions"><button className="history" title="Expenses History" aria-label="Expenses History" onClick={() => setModal({ kind: 'history' })}><History aria-hidden="true" /></button><button className="pay" onClick={() => setModal({ kind: 'pay' })}><HandCoins aria-hidden="true" /> Pay Brand</button><button className="category" onClick={() => setModal({ kind: 'category' })}><Settings aria-hidden="true" /> Add Category</button><button className="add" onClick={() => setView('add')}><Plus aria-hidden="true" /> Add Expense</button></div></header>
      <label className="month-filter">Select month<input type="month" value={month} onChange={event => { setMonth(event.target.value); setPage(1) }} /></label>
      <section className="expense-card brand-shares"><header><div><h3>Brand Expense Shares</h3><span>{shares.month || month}</span></div><div className="icon-actions"><button title="Bulk Edit Month Expenses" aria-label="Bulk Edit Month Expenses" onClick={() => setModal({ kind: 'bulk' })}><Pencil aria-hidden="true" /></button><button title="View Monthly Report" aria-label="View Monthly Report" onClick={() => setModal({ kind: 'report' })}><Eye aria-hidden="true" /></button><a title="Download Monthly Report PDF" aria-label="Download Monthly Report PDF" href={'/api/brands/pdf/monthly-report?month=' + month + '&download=true'}><Download aria-hidden="true" /></a></div></header><div className="expense-stats"><article><small>Total Month Expenses</small><strong>{formatShopCurrency(shares.totalExpenses || 0)}</strong><span>Operating costs</span></article><article><small>Ownership Split</small><strong>{Number(shares.totalOwnershipPercent || 0).toFixed(2).replace(/\.00$/, '')}% configured</strong><span>{shares.brandCount || 0} share partners</span></article></div><div className="expense-table-wrap"><table><thead><tr><th>Brand</th><th>Share %</th><th>Target Share</th><th>Paid</th><th>Due</th></tr></thead><tbody>{(shares.shares || []).map(share => <tr key={share.brand_id}><td><b>{share.brand_name}</b></td><td>{Number(share.ownership_percent || 0).toFixed(2).replace(/\.00$/, '')}%</td><td>{formatShopCurrency(share.total_share)}</td><td><button className="paid-link" onClick={() => openPayments(share)}>{formatShopCurrency(share.paid)} <Pencil aria-hidden="true" /></button></td><td className="due">{formatShopCurrency(share.due)}</td></tr>)}</tbody></table></div></section>
      <section className="expense-card operating-expenses"><header><h3>Operating Expenses</h3></header><div className="expense-table-wrap"><table><thead><tr><th>Title</th><th>Category</th><th>Date</th><th>Added By</th><th>Amount</th><th /></tr></thead><tbody>{rows.length ? rows.map(expense => <tr key={expense.id}><td><b>{expense.title}</b>{expense.note && <small title={expense.note}>{expense.note}</small>}</td><td><span className="category-badge">{categoryFor(expense.category).emoji || '📦'} {expense.category}</span></td><td>{String(expense.date).slice(0, 10)}</td><td><span className="added-by">● {expense.added_by || 'Admin'}</span></td><td className="amount">{formatShopCurrency(expense.amount)}</td><td><div className="row-actions"><button className="edit" onClick={() => setModal({ kind: 'edit', expense })} aria-label={'Edit ' + expense.title}><Pencil aria-hidden="true" /></button><button className="delete" onClick={() => deleteExpense(expense)} aria-label={'Delete ' + expense.title}><Trash2 aria-hidden="true" /></button></div></td></tr>) : <tr><td colSpan="6" className="expense-empty">{loading ? 'Loading expenses...' : 'No expenses found for this month.'}</td></tr>}</tbody></table></div>{totalPages > 1 && <footer><span>Showing <b>{rows.length}</b> of <b>{filtered.length}</b> expenses</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page <b>{page}</b> of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button></div></footer>}</section>

      {previousDues.length > 0 && <section className="expense-card previous-dues"><header><div><b><Clock3 aria-hidden="true" /></b><h3>Previous Months Record/Dues</h3></div><button onClick={() => setModal({ kind: 'previous' })}>Details & Pay</button></header><div><span><p>There are outstanding dues from <b>{previousDues.length}</b> previous month(s).</p><small>Please settle these amounts to clear individual brand ledgers.</small></span><span className="outstanding"><small>Total Outstanding</small><strong>{formatShopCurrency(previousDues.reduce((sum, item) => sum + Number(item.totalDue), 0))}</strong></span></div></section>}
    </>}
  </main>
  {modal?.kind === 'edit' && <ExpenseModal title="Edit Expense" onClose={() => setModal(null)}><ExpenseForm expense={modal.expense} categories={categories} onCancel={() => setModal(null)} onSave={payload => saveExpense(payload, modal.expense)} /></ExpenseModal>}
  {modal?.kind === 'pay' && <ExpenseModal title="Pay Brand Expenses" wide onClose={() => setModal(null)}><PaymentRows rows={(shares.shares || []).filter(share => Number(share.due) > 0)} month={month} onPay={pay} /></ExpenseModal>}
  {modal?.kind === 'bulk' && <ExpenseModal title={'Bulk Edit Expenses — ' + month} wide onClose={() => setModal(null)}>{filtered.length ? <BulkEditor rows={filtered} categories={categories} onSave={items => mutate('/api/expenses/bulk', { method: 'PUT', body: { expenses: items } }, 'Expenses updated!')} /> : <p className="expense-empty">No expenses found for {month}.</p>}</ExpenseModal>}
  {modal?.kind === 'report' && <ExpenseModal title={'Expenses Report — ' + monthLabel(month)} wide onClose={() => setModal(null)}><MonthlyReport month={month} rows={filtered} /></ExpenseModal>}
  {modal?.kind === 'history' && <ExpenseModal title="Expenses History" wide onClose={() => setModal(null)}><div className="expense-history">{Object.entries(expenses.reduce((map, expense) => { const key = String(expense.date).slice(0, 7); if (!map[key]) map[key] = []; map[key].push(expense); return map }, {})).sort(([a], [b]) => b.localeCompare(a)).map(([historyMonth, items]) => <button key={historyMonth} onClick={() => { setMonth(historyMonth); setPage(1); setModal(null) }}><span><b>{monthLabel(historyMonth)}</b><small>{items.length} records</small></span><strong>{formatShopCurrency(items.reduce((sum, item) => sum + Number(item.amount), 0))}</strong></button>)}</div></ExpenseModal>}
  {modal?.kind === 'category' && <ExpenseModal title="Add Expense Category" onClose={() => setModal(null)}><form className="category-form" onSubmit={async event => { event.preventDefault(); await addCategory(event.currentTarget.elements.category.value) }}><label>Category name<input name="category" autoFocus required placeholder="e.g. Utilities" /></label><button className="expense-primary">Add Category</button></form></ExpenseModal>}
  {modal?.kind === 'previous' && <ExpenseModal title="Previous Months Outstanding Dues" wide onClose={() => setModal(null)}><div className="previous-list">{previousDues.map(item => <section key={item.month}><header><span><b>{monthLabel(item.month)}</b><small>{formatShopCurrency(item.totalExpenses)} Total</small></span><a href={'/api/brands/pdf/monthly-report?month=' + item.month + '&download=true'}><Download aria-hidden="true" /></a></header><PaymentRows rows={item.brandDues || []} month={item.month} onPay={pay} /></section>)}</div></ExpenseModal>}
  {modal?.kind === 'payments' && <ExpenseModal title={'Payments — ' + modal.share.brand_name} onClose={() => setModal(null)}><div className="payment-history">{modal.payments.length ? modal.payments.map(payment => <PaymentEditor key={payment.id} payment={payment} onSave={updatePayment} />) : <p className="expense-empty">No payments recorded for this month.</p>}</div></ExpenseModal>}
  {toast && <div className={'expense-toast ' + toast.type} role="status"><span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X aria-hidden="true" /></button></div>}
  </div>
}

function PaymentEditor({ payment, onSave }) {
  const [amount, setAmount] = useState(payment.amount)
  return <div className="payment-edit-row"><span><b>{String(payment.created_at || payment.date || '').slice(0, 10)}</b><small>{payment.recorded_by || payment.paid_by || 'Recorded payment'}</small></span><input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /><button onClick={() => onSave(payment, amount)}>Save</button></div>
}
