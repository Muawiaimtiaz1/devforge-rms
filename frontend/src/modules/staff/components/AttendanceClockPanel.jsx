import { useEffect, useState } from 'react'
import { api } from '../../../api/client'

const NEXT = { none: ['clock_in'], clock_in: ['break_start', 'clock_out'], break_start: ['break_end'], break_end: ['break_start', 'clock_out'], clock_out: ['clock_in'] }
const LABELS = { clock_in: 'Clock in', break_start: 'Start break', break_end: 'End break', clock_out: 'Clock out' }
export default function AttendanceClockPanel() {
  const [state, setState] = useState(null); const [error, setError] = useState(''); const [saving, setSaving] = useState(false)
  async function load() { try { setState(await api('/api/attendance/clock/state')) } catch (requestError) { setError(requestError.message) } }
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [])
  async function record(eventType) {
    setSaving(true); setError('')
    try { await api('/api/attendance/clock', { method: 'POST', body: { event_type: eventType, source_type: 'web', device_id: window.navigator.userAgent.slice(0, 160), idempotency_key: window.crypto.randomUUID() } }); await load() } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }
  const latest = state?.latest_event?.event_type || 'none'
  return <section className="attendance-clock"><header><div><h3>Time clock</h3><p>{state?.staff ? `${state.staff.full_name} · ` : ''}{state?.latest_event ? `Last action: ${LABELS[latest]} at ${new Date(state.latest_event.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No clock events recorded yet.'}</p></div><span className={`clock-state ${latest}`}>{latest === 'none' ? 'Not clocked in' : LABELS[latest]}</span></header>{error && <div className="form-error">{error}</div>}<div className="clock-actions">{NEXT[latest].map((action) => <button key={action} className={action === 'clock_out' ? 'danger-button' : 'primary-button'} onClick={() => record(action)} disabled={saving}>{LABELS[action]}</button>)}</div></section>
}
