import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../api/client'
import LeaveBalanceCards from './LeaveBalanceCards'
import LeaveRequestForm from './LeaveRequestForm'
import LeaveRequestList from './LeaveRequestList'
import LeavePolicyManager from './LeavePolicyManager'

export default function LeaveWorkspacePanel({ has }) {
  const [tab, setTab] = useState('requests'); const [types, setTypes] = useState([]); const [staff, setStaff] = useState([]); const [requests, setRequests] = useState([]); const [balanceStaffId, setBalanceStaffId] = useState(''); const [balances, setBalances] = useState(null); const [error, setError] = useState('')
  const canManage = has('leave.manage'); const canApprove = has('leave.approve')
  const load = useCallback(async () => { try { const [nextTypes, nextStaff, nextRequests] = await Promise.all([api('/api/leave/types'), api('/api/leave/staff-options'), api('/api/leave/requests?status=all')]); setTypes(nextTypes); setStaff(nextStaff); setRequests(nextRequests); setBalanceStaffId((current) => current || nextStaff[0]?.id || '') } catch (requestError) { setError(requestError.message) } }, [])
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  useEffect(() => { if (!balanceStaffId) return; const timer = window.setTimeout(() => api(`/api/leave/balances?staff_profile_id=${balanceStaffId}`).then(setBalances).catch((requestError) => setError(requestError.message)), 0); return () => window.clearTimeout(timer) }, [balanceStaffId, requests])
  const tabs = [['requests', canApprove ? 'Requests & approvals' : 'My leave'], ...(canManage ? [['policy', 'Policy & balances']] : [])]
  return <div className="leave-workspace"><header className="embedded-panel-heading"><div><p className="section-label">Absence management</p><h2>Leave</h2><p>Requests, balances, partial days, approvals, and immutable balance history.</p></div></header><nav>{tabs.map(([value,label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</nav>{error && <div className="form-error">{error}</div>}{tab === 'requests' && <><div className="leave-balance-filter">{canManage && <label>Balance for<select value={balanceStaffId} onChange={(e) => setBalanceStaffId(e.target.value)}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>}</div><LeaveBalanceCards data={balances} /><LeaveRequestForm types={types} staff={staff} canManage={canManage || canApprove} onCreated={load} /><LeaveRequestList requests={requests} canApprove={canApprove} onChanged={load} /></>}{tab === 'policy' && canManage && <LeavePolicyManager types={types} staff={staff} onChanged={load} />}</div>
}
