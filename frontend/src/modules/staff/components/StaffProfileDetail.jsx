import { STATUS_LABELS } from '../staff.constants'
import { formatType, initials, roleName } from '../staff.utils'
import StaffModal from './StaffModal'

export default function StaffProfileDetail({ profile, canUpdate, canManageAccess, onClose, onEdit, onAccess, onAssignment }) {
  const fields = [
    ['Employee ID', profile.employee_id], ['Status', STATUS_LABELS[profile.employment_status]], ['Department', profile.department_name || profile.department || 'Not assigned'],
    ['Designation', profile.designation_name || profile.designation || 'Not assigned'], ['Manager', profile.manager_name || 'Not assigned'], ['Work location', profile.location_name || 'Not assigned'], ['Classification', profile.classification_name || formatType(profile.employment_type)],
    ['Joined', profile.joining_date ? new Date(`${String(profile.joining_date).slice(0, 10)}T00:00:00`).toLocaleDateString() : 'Not recorded'],
    ['Phone', profile.phone || 'Not recorded'], ['Email', profile.email || 'Not recorded'], ['Login', profile.username ? `@${profile.username}` : 'No account linked'],
    ['Role', roleName(profile)], ['Emergency contact', profile.emergency_contact_name || 'Not recorded'], ['Emergency phone', profile.emergency_contact_phone || 'Not recorded'],
  ]
  return <StaffModal title="Staff profile" onClose={onClose} wide><div className="staff-detail"><header><div className={`staff-avatar ${profile.employment_status !== 'active' ? 'blocked' : ''}`}>{profile.photo_url ? <img src={profile.photo_url} alt="" /> : initials(profile)}</div><div><p>{profile.employee_id}</p><h3>{profile.full_name}</h3><span>{profile.designation_name || profile.designation || 'Staff member'}</span></div></header><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{profile.address && <section><strong>Address</strong><p>{profile.address}</p></section>}{profile.notes && <section><strong>Notes</strong><p>{profile.notes}</p></section>}<footer><button className="secondary-button" onClick={onClose}>Close</button><button className="secondary-button" onClick={onAssignment}>Organization</button>{canManageAccess && <button className="secondary-button" onClick={onAccess}>Manage access</button>}{canUpdate && <button className="primary-button" onClick={onEdit}>Edit profile</button>}</footer></div></StaffModal>
}
