import { ArrowLeft, Grid3X3, LayoutGrid } from 'lucide-react'
import { useMemo, useState } from 'react'

const serviceRoles = ['waiter', 'order_taker']

export default function PosTableSelection({ tables, floors, user, selectedId, choose, back }) {
  const [view, setView] = useState('map')
  const groupByWaiter = !serviceRoles.includes(user?.role)
  const counts = tables.reduce((result, table) => {
    const status = String(table.status || 'available').toLowerCase()
    result[status] = (result[status] || 0) + 1
    return result
  }, {})
  const groups = useMemo(() => {
    if (groupByWaiter) {
      const grouped = new Map()
      tables.forEach(table => {
        const id = table.assigned_waiter_id ? String(table.assigned_waiter_id) : 'unassigned'
        const name = table.assigned_waiter_id ? table.assigned_waiter_name || table.assigned_waiter_username || 'Waiter #' + table.assigned_waiter_id : 'Unassigned'
        if (!grouped.has(id)) grouped.set(id, { id, name, rows: [] })
        grouped.get(id).rows.push(table)
      })
      return [...grouped.values()].sort((left, right) => left.id === 'unassigned' ? 1 : right.id === 'unassigned' ? -1 : left.name.localeCompare(right.name))
    }
    const floorGroups = floors.map(floor => ({ ...floor, rows: tables.filter(table => Number(table.floor_id) === Number(floor.id)) }))
    const other = { id: 'other', name: 'Other Tables', rows: tables.filter(table => !table.floor_id || !floors.some(floor => Number(floor.id) === Number(table.floor_id))) }
    return [...floorGroups, other].filter(group => group.rows.length)
  }, [floors, groupByWaiter, tables])

  const floorNames = useMemo(() => new Map(floors.map(floor => [Number(floor.id), floor.name])), [floors])
  const visibleGroups = view === 'cards' && !groupByWaiter ? [{ id:'all', name:'All Tables', rows:tables }] : groups

  return <main className={'table-choice table-' + view}>
    <header className="table-choice-head">
      <button className="back-icon" onClick={back} aria-label="Back to order types"><ArrowLeft size={19}/></button>
      <div><h1>Select a Table</h1><p>Choose an available or reserved table before opening the order.</p></div>
      <div className="table-view-toggle" aria-label="Table view">
        <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><Grid3X3 size={16}/> Map</button>
        <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}><LayoutGrid size={16}/> Cards</button>
      </div>
    </header>
    <div className="table-counts"><span className="available">{counts.available || 0} Available</span><span className="reserved">{counts.reserved || 0} Reserved</span><span className="occupied">{counts.occupied || 0} Occupied</span></div>
    {visibleGroups.map(group => <section key={group.id}>
      <header><b>{group.name}</b><small>{group.rows.length} tables · {groupByWaiter ? 'Waiter' : 'Floor'}</small></header>
      <div>{group.rows.map(table => <button className={(table.status || 'available') + (String(selectedId) === String(table.id) ? ' selected' : '')} disabled={table.status === 'occupied'} key={table.id} onClick={() => choose(table)}><small>{table.status || 'available'}</small><b>Table {table.table_number}</b><span>Floor: {floorNames.get(Number(table.floor_id)) || 'Other Tables'}</span><span>Up to {table.capacity || 4} guests</span></button>)}</div>
    </section>)}
    {!visibleGroups.length && <p className="table-empty">No tables are configured.</p>}
  </main>
}