import StaffTableRow from './StaffTableRow'

export default function StaffTable({ profiles, canUpdate, canManageAccess, onView, onEdit, onAccess, onAssignment }) {
  if (!profiles.length) return <div className="empty-state">No staff profiles match these filters.</div>
  return <div className="staff-table-shell"><table className="staff-table">
    <thead><tr><th>Staff member</th><th>Organization</th><th>Employment</th><th>Contact</th><th>Access</th><th><span className="sr-only">Actions</span></th></tr></thead>
    <tbody>{profiles.map((profile) => <StaffTableRow key={profile.id} profile={profile} canUpdate={canUpdate} canManageAccess={canManageAccess} onView={() => onView(profile)} onEdit={() => onEdit(profile)} onAccess={() => onAccess(profile)} onAssignment={() => onAssignment(profile)} />)}</tbody>
  </table></div>
}
