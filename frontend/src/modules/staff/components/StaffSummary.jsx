import { STATUS_LABELS } from '../staff.constants'

export default function StaffSummary({ summary, selectedStatus, onStatusChange }) {
  return <section className="staff-stats" aria-label="Staff totals">{['total', 'active', 'inactive', 'suspended', 'terminated'].map((status) => <button key={status} className={selectedStatus === status || (status === 'total' && selectedStatus === 'all') ? 'active' : ''} onClick={() => onStatusChange(status === 'total' ? 'all' : status)}><span>{status === 'total' ? 'All staff' : STATUS_LABELS[status]}</span><strong>{summary[status] || 0}</strong></button>)}</section>
}
