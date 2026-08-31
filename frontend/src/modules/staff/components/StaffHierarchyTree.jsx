function branchFor(parentId, byManager, visited = new Set()) {
  return (byManager.get(parentId) || []).map((person) => {
    if (visited.has(person.id)) return null
    const nextVisited = new Set(visited).add(person.id)
    return <li key={person.id}><div><strong>{person.full_name}</strong><span>{person.designation_name || 'Staff member'} · {person.department_name || 'Unassigned'}</span></div>{byManager.has(person.id) && <ul>{branchFor(person.id, byManager, nextVisited)}</ul>}</li>
  })
}

export default function StaffHierarchyTree({ people }) {
  const byManager = new Map()
  people.forEach((person) => {
    const manager = person.manager_staff_id && people.some((candidate) => candidate.id === person.manager_staff_id) ? person.manager_staff_id : null
    byManager.set(manager, [...(byManager.get(manager) || []), person])
  })
  return people.length ? <ul className="hierarchy-tree">{branchFor(null, byManager)}</ul> : <div className="empty-state">No staff available for the hierarchy.</div>
}
