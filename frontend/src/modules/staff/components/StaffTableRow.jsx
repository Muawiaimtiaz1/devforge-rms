import { STATUS_LABELS } from '../staff.constants'
import { initials, roleName } from '../staff.utils'

export default function StaffTableRow({ profile, canUpdate, canManageAccess, onView, onEdit, onAccess, onAssignment }) {
  const department = profile.department_name || profile.department || 'Unassigned'
  const designation = profile.designation_name || profile.designation || 'Staff member'
  return <tr>
    <td data-label="Staff"><div className="table-staff"><div className={`staff-avatar ${profile.employment_status !== 'active' ? 'blocked' : ''}`}>{profile.photo_url ? <img src={profile.photo_url} alt="" /> : initials(profile)}</div><div><strong>{profile.full_name}</strong><span>{profile.employee_id}{profile.username ? ` · @${profile.username}` : ''}</span></div></div></td>
    <td data-label="Organization"><div className="table-primary">{designation}</div><span className="table-secondary">{department}{profile.location_name ? ` · ${profile.location_name}` : ''}</span></td>
    <td data-label="Employment"><span className={`status-pill ${profile.employment_status}`}>{STATUS_LABELS[profile.employment_status]}</span><span className="table-secondary">{profile.classification_name || profile.employment_type?.replaceAll('_', ' ')}</span></td>
    <td data-label="Contact"><div className="table-primary">{profile.phone || 'No phone'}</div><span className="table-secondary">{profile.email || 'No email'}</span></td>
    <td data-label="Access"><span className="role-badge">{roleName(profile)}</span><span className={`account-dot ${profile.account_status || 'unlinked'}`}>{profile.account_status || 'No login'}</span></td>
    <td data-label="Actions"><div className="table-actions"><button className="table-action" onClick={onView}>Profile</button><button className="table-action" onClick={onAssignment}>Organization</button>{canManageAccess && <button className="table-action" onClick={onAccess}>Access</button>}{canUpdate && <button className="table-action primary" onClick={onEdit}>Edit</button>}</div></td>
  </tr>
}
