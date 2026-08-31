function display(event) {
  if (event.event_type === 'cross_shop_transfer') return `${event.from_shop_name || 'Previous restaurant'} → ${event.to_shop_name || 'New restaurant'}`
  const before = [event.from_department_name, event.from_designation_name].filter(Boolean).join(' / ') || 'Unassigned'
  const after = [event.to_department_name, event.to_designation_name].filter(Boolean).join(' / ') || 'Unassigned'
  return `${before} → ${after}`
}
export default function StaffAssignmentHistory({ events }) {
  return <section className="assignment-history"><h3>Assignment history</h3>{events.length ? <ol>{events.map((event) => <li key={event.id}><div><strong>{display(event)}</strong><time>{new Date(`${String(event.effective_date).slice(0, 10)}T00:00:00`).toLocaleDateString()}</time></div><p>{event.reason}</p>{(event.from_manager_name || event.to_manager_name) && <small>Manager: {event.from_manager_name || 'None'} → {event.to_manager_name || 'None'}</small>}</li>)}</ol> : <p>No assignment changes recorded yet.</p>}</section>
}
